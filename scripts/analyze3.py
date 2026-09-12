import pandas as pd
import numpy as np
import json
import time
from sklearn.linear_model import Ridge
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.model_selection import train_test_split, KFold, cross_val_score, RandomizedSearchCV
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import silhouette_score
from scipy.optimize import curve_fit
import shap

df = pd.read_csv('vehicles.csv', low_memory=False)
df = df[df['year'] <= 2026].copy()

def simplify_vclass(v):
    if pd.isna(v): return 'Other'
    v = v.lower()
    if 'two seater' in v: return 'Sports/Two-Seater'
    if 'standard pickup' in v: return 'Pickup (Standard)'
    if 'small pickup' in v: return 'Pickup (Small)'
    if 'standard sport utility' in v or 'sport utility vehicle - 4wd' in v: return 'SUV (Standard)'
    if 'small sport utility' in v or 'sport utility vehicle - 2wd' in v: return 'SUV (Small)'
    if 'minivan' in v or v.startswith('vans'): return 'Van/Minivan'
    if 'large car' in v: return 'Large Car'
    if 'midsize' in v: return 'Midsize Car'
    if 'special purpose' in v: return 'Special Purpose'
    return 'Compact/Subcompact Car'

def simplify_drive(d):
    if pd.isna(d): return 'Unknown'
    d = d.lower()
    if 'front' in d: return 'FWD'
    if 'rear' in d: return 'RWD'
    if 'all-wheel' in d: return 'AWD'
    if '4-wheel' in d: return '4WD'
    return '2WD'

def simplify_trany(t):
    if pd.isna(t): return 'Unknown'
    return 'Automatic' if 'auto' in t.lower() else 'Manual'

df['vclass_s'] = df['VClass'].apply(simplify_vclass)
df['drive_s'] = df['drive'].apply(simplify_drive)
df['trany_s'] = df['trany'].apply(simplify_trany)
df['is_ev'] = df['fuelType1'] == 'Electricity'

model_df = df[df['fuelType1'].isin(['Regular Gasoline', 'Premium Gasoline', 'Midgrade Gasoline', 'Diesel'])].copy()
model_df = model_df.dropna(subset=['displ', 'cylinders', 'comb08'])
model_df = model_df[(model_df['comb08'] > 5) & (model_df['comb08'] < 90)]

features_num = ['displ', 'cylinders', 'year']
features_cat = ['drive_s', 'vclass_s', 'trany_s', 'fuelType1']
X = model_df[features_num + features_cat]
y = model_df['comb08']

pre = ColumnTransformer([
    ('num', 'passthrough', features_num),
    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), features_cat)
])
pre.fit(X)
Xall = pre.transform(X)
cat_names = pre.named_transformers_['cat'].get_feature_names_out(features_cat)
feat_names = features_num + list(cat_names)

# =========================================================
# 1. K-FOLD CROSS-VALIDATION (replaces the single 80/20 split for headline metrics)
# =========================================================
kf = KFold(n_splits=5, shuffle=True, random_state=42)

def cv_scores(model, X_, y_):
    r2 = cross_val_score(model, X_, y_, cv=kf, scoring='r2', n_jobs=-1)
    mae = -cross_val_score(model, X_, y_, cv=kf, scoring='neg_mean_absolute_error', n_jobs=-1)
    return r2, mae

cv_results = []

def run_cv(name, model, X_, y_, portable):
    t0 = time.time()
    r2, mae = cv_scores(model, X_, y_)
    dt = time.time() - t0
    cv_results.append({
        'name': name, 'r2_mean': round(r2.mean(), 4), 'r2_std': round(r2.std(), 4),
        'mae_mean': round(mae.mean(), 2), 'mae_std': round(mae.std(), 2),
        'cv_time_s': round(dt, 1), 'portable': portable
    })
    print(f"{name:22s} R2={r2.mean():.4f}+/-{r2.std():.4f}  MAE={mae.mean():.2f}+/-{mae.std():.2f}  ({dt:.1f}s)")

# scale numeric cols for MLP only, done once outside the CV loop is wrong (leakage across folds);
# use a Pipeline instead so scaling is refit per-fold.
mlp_pipe = Pipeline([
    ('scale_num', ColumnTransformer([('num', StandardScaler(), list(range(len(features_num))))],
                                      remainder='passthrough')),
    ('mlp', MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=600, random_state=42, early_stopping=True))
])

run_cv('Ridge Regression', Ridge(alpha=1.0), Xall, y, True)
run_cv('Decision Tree (d=6)', DecisionTreeRegressor(max_depth=6, min_samples_leaf=20, random_state=42), Xall, y, True)
run_cv('Random Forest', RandomForestRegressor(n_estimators=120, max_depth=14, n_jobs=-1, random_state=42), Xall, y, False)
run_cv('Gradient Boosting', GradientBoostingRegressor(n_estimators=150, max_depth=3, random_state=42), Xall, y, False)
run_cv('Neural Net (MLP)', mlp_pipe, Xall, y, False)

# =========================================================
# 2. HYPERPARAMETER TUNING: RandomizedSearchCV for RF and GBM
# =========================================================
X_train, X_test, y_train, y_test = train_test_split(Xall, y, test_size=0.2, random_state=42)

rf_param_dist = {
    'n_estimators': [80, 120, 180, 250],
    'max_depth': [8, 12, 16, 20, None],
    'min_samples_leaf': [1, 2, 4, 8],
    'max_features': ['sqrt', 0.5, 0.8],
}
rf_search = RandomizedSearchCV(RandomForestRegressor(random_state=42, n_jobs=-1), rf_param_dist,
                                n_iter=15, cv=3, scoring='r2', random_state=42, n_jobs=-1)
t0 = time.time()
rf_search.fit(X_train, y_train)
rf_tuned_r2 = rf_search.score(X_test, y_test)
print(f"RF tuned best_params={rf_search.best_params_}  test R2={rf_tuned_r2:.4f}  ({time.time()-t0:.0f}s)")

gbm_param_dist = {
    'n_estimators': [100, 150, 250, 350],
    'max_depth': [2, 3, 4, 5],
    'learning_rate': [0.02, 0.05, 0.1, 0.2],
    'min_samples_leaf': [1, 5, 15],
}
gbm_search = RandomizedSearchCV(GradientBoostingRegressor(random_state=42), gbm_param_dist,
                                 n_iter=15, cv=3, scoring='r2', random_state=42, n_jobs=-1)
t0 = time.time()
gbm_search.fit(X_train, y_train)
gbm_tuned_r2 = gbm_search.score(X_test, y_test)
print(f"GBM tuned best_params={gbm_search.best_params_}  test R2={gbm_tuned_r2:.4f}  ({time.time()-t0:.0f}s)")

tuning_results = {
    'random_forest': {
        'untuned_r2': next(c['r2_mean'] for c in cv_results if c['name'] == 'Random Forest'),
        'tuned_r2': round(float(rf_tuned_r2), 4),
        'best_params': {k: (v if not isinstance(v, (np.integer, np.floating)) else v.item())
                         for k, v in rf_search.best_params_.items()},
    },
    'gradient_boosting': {
        'untuned_r2': next(c['r2_mean'] for c in cv_results if c['name'] == 'Gradient Boosting'),
        'tuned_r2': round(float(gbm_tuned_r2), 4),
        'best_params': {k: (v if not isinstance(v, (np.integer, np.floating)) else v.item())
                         for k, v in gbm_search.best_params_.items()},
    }
}

# =========================================================
# 3. SHAP EXPLAINABILITY (replaces impurity-based feature_importances_)
# =========================================================
rf_final = RandomForestRegressor(n_estimators=120, max_depth=14, n_jobs=-1, random_state=42)
rf_final.fit(Xall, y)

shap_sample_idx = np.random.RandomState(42).choice(len(Xall), size=min(1500, len(Xall)), replace=False)
X_shap_sample = Xall[shap_sample_idx]
explainer = shap.TreeExplainer(rf_final)
shap_values = explainer.shap_values(X_shap_sample)
mean_abs_shap = np.abs(shap_values).mean(axis=0)

shap_by_feature = dict(zip(feat_names, mean_abs_shap.tolist()))
groups = {'Engine displacement': ['displ'], 'Cylinder count': ['cylinders'], 'Model year': ['year']}
for f in features_cat:
    label = {'drive_s': 'Drivetrain', 'vclass_s': 'Vehicle class', 'trany_s': 'Transmission', 'fuelType1': 'Fuel grade'}[f]
    groups[label] = [k for k in feat_names if k.startswith(f + '_')]
shap_importance = []
for label, keys in groups.items():
    shap_importance.append({'label': label, 'importance': round(sum(shap_by_feature.get(k, 0) for k in keys), 4)})
shap_importance.sort(key=lambda d: -d['importance'])
total_shap = sum(f['importance'] for f in shap_importance)
for f in shap_importance:
    f['pct'] = round(f['importance'] / total_shap * 100, 1)

print("\nSHAP-based feature importance (Random Forest, mean |SHAP|, 1500-row sample):")
for f in shap_importance:
    print(f"  {f['label']:22s} {f['pct']:5.1f}%")

# =========================================================
# 4. LINEAR SHAP FOR THE LIVE RIDGE PREDICTOR (exact, portable to JS)
# =========================================================
# For a linear model, SHAP value_i = coef_i * (x_i - mean(x_i)) exactly (Lundberg & Lee 2017).
# Export coefficients (already in data_export.json) + per-feature training-set means so the
# browser can compute a live per-prediction contribution breakdown with a single multiply.
ridge_full = Ridge(alpha=1.0)
ridge_full.fit(Xall, y)
feature_baseline = {name: round(float(Xall[:, i].mean()), 5) for i, name in enumerate(feat_names)}
ridge_baseline_prediction = round(float(ridge_full.predict(Xall).mean()), 2)

# =========================================================
# 5. TIME-SERIES FORECAST: logistic growth curve for EV adoption %
# =========================================================
industry_year = (df.groupby('year')
                  .agg(count=('make', 'size'), ev_count=('is_ev', 'sum'))
                  .reset_index())
industry_year['ev_pct'] = (industry_year['ev_count'] / industry_year['count'] * 100)
industry_year = industry_year[industry_year['year'] <= 2026]

years_arr = industry_year['year'].to_numpy(dtype=float)
pct_arr = industry_year['ev_pct'].to_numpy(dtype=float)
x0_ref = years_arr.min()
x_fit = years_arr - x0_ref

def logistic(x, L, k, x0):
    return L / (1 + np.exp(-k * (x - x0)))

p0 = [60.0, 0.3, x_fit.max()]
try:
    popt, _ = curve_fit(logistic, x_fit, pct_arr, p0=p0, maxfev=10000,
                         bounds=([20, 0.05, 0], [100, 2.0, 60]))
except RuntimeError:
    popt = p0

future_years = list(range(2027, 2031))
future_x = np.array([y - x0_ref for y in future_years])
point_forecast = logistic(future_x, *popt)

rng = np.random.RandomState(42)
residuals = pct_arr - logistic(x_fit, *popt)
resid_std = residuals.std()
boot_forecasts = []
for _ in range(300):
    noisy_y = pct_arr + rng.normal(0, resid_std, size=len(pct_arr))
    try:
        p_boot, _ = curve_fit(logistic, x_fit, noisy_y, p0=popt, maxfev=5000,
                               bounds=([20, 0.05, 0], [100, 2.0, 60]))
        boot_forecasts.append(logistic(future_x, *p_boot))
    except RuntimeError:
        continue
boot_arr = np.array(boot_forecasts)
lower = np.percentile(boot_arr, 10, axis=0) if len(boot_arr) else point_forecast
upper = np.percentile(boot_arr, 90, axis=0) if len(boot_arr) else point_forecast

forecast_export = [
    {'year': int(fy), 'point': round(float(pf), 1), 'low': round(float(lo), 1), 'high': round(float(hi), 1)}
    for fy, pf, lo, hi in zip(future_years, point_forecast, lower, upper)
]
print(f"\nEV adoption forecast (logistic fit, L={popt[0]:.1f} k={popt[1]:.3f}):")
for f in forecast_export:
    print(f"  {f['year']}: {f['point']}%  [{f['low']}, {f['high']}]")

# =========================================================
# 6. SILHOUETTE-JUSTIFIED CLUSTER COUNT (reuses the hand-rolled K-Means, sklearn.cluster is blocked)
# =========================================================
MAJOR_BRANDS = ['Tesla','Ford','Chevrolet','Cadillac','GMC','Buick','Dodge','Chrysler','Jeep','Ram',
                'BMW','Mercedes-Benz','Audi','Porsche','Volkswagen',
                'Toyota','Honda','Nissan','Mazda','Subaru','Lexus','Acura','Infiniti',
                'Hyundai','Kia','Genesis','Volvo','Rivian','Lucid','Mitsubishi']
df['is_major'] = df['make'].isin(MAJOR_BRANDS)
clu_src = df[(df['is_major']) & (df['year'] >= df['year'].max() - 5)].copy()
clu_src['displ_f'] = clu_src['displ'].fillna(0)
clu_src['cyl_f'] = clu_src['cylinders'].fillna(0)
clu_src['co2_f'] = clu_src['co2TailpipeGpm'].fillna(0).clip(lower=0)
clu_src = clu_src[(clu_src['comb08'] > 0)]
clu_src = clu_src.sample(n=min(1200, len(clu_src)), random_state=7).reset_index(drop=True)
feat_cols = ['comb08', 'displ_f', 'cyl_f', 'co2_f']
Xc = clu_src[feat_cols].to_numpy(dtype=float)
mu, sigma = Xc.mean(0), Xc.std(0)
sigma[sigma == 0] = 1
Xs = (Xc - mu) / sigma

def kmeanspp_init(X, k, rng):
    n = len(X)
    centers = [X[rng.integers(n)]]
    for _ in range(1, k):
        d2 = np.min(((X[:, None, :] - np.array(centers)[None, :, :]) ** 2).sum(-1), axis=1)
        probs = d2 / d2.sum()
        idx = rng.choice(n, p=probs)
        centers.append(X[idx])
    return np.array(centers)

def kmeans(X, k, n_init=8, max_iter=100, seed=42):
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(n_init):
        centers = kmeanspp_init(X, k, rng)
        for _ in range(max_iter):
            d = ((X[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
            labels = d.argmin(1)
            new_centers = np.array([X[labels == j].mean(0) if (labels == j).any() else centers[j] for j in range(k)])
            if np.allclose(new_centers, centers):
                centers = new_centers
                break
            centers = new_centers
        d = ((X[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        labels = d.argmin(1)
        inertia = d[np.arange(len(X)), labels].sum()
        if best is None or inertia < best[0]:
            best = (inertia, centers, labels)
    return best[1], best[2]

silhouette_by_k = []
for k in range(2, 9):
    centers, labels = kmeans(Xs, k, n_init=5)
    if len(set(labels)) < 2:
        continue
    score = silhouette_score(Xs, labels)
    silhouette_by_k.append({'k': k, 'silhouette': round(float(score), 4)})
    print(f"k={k}: silhouette={score:.4f}")

best_k_entry = max(silhouette_by_k, key=lambda d: d['silhouette'])
print(f"\nBest k by silhouette: {best_k_entry['k']} (score={best_k_entry['silhouette']})")

# =========================================================
# Merge everything into data_export.json
# =========================================================
with open('data/data_export.json') as f:
    out = json.load(f)

out['bakeoff'] = cv_results  # replaces single-split bakeoff with CV mean+/-std
out['tuning'] = tuning_results
out['shap_importance'] = shap_importance
out['model']['ridge_full']['feature_baseline'] = feature_baseline
out['model']['ridge_full']['baseline_prediction'] = ridge_baseline_prediction
out['ev_forecast'] = forecast_export
out['silhouette'] = {'by_k': silhouette_by_k, 'best_k': best_k_entry['k']}

with open('data/data_export.json', 'w') as f:
    json.dump(out, f)

print(f"\nMerged CV/tuning/SHAP/forecast/silhouette into data/data_export.json ({len(json.dumps(out))/1024:.0f} KB)")
