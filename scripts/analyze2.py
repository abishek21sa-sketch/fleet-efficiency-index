import pandas as pd
import numpy as np
import json, time
from sklearn.linear_model import Ridge
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, RandomForestClassifier
from sklearn.neural_network import MLPRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import r2_score, mean_absolute_error, accuracy_score, confusion_matrix

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

MAJOR_BRANDS = ['Tesla','Ford','Chevrolet','Cadillac','GMC','Buick','Dodge','Chrysler','Jeep','Ram',
                'BMW','Mercedes-Benz','Audi','Porsche','Volkswagen',
                'Toyota','Honda','Nissan','Mazda','Subaru','Lexus','Acura','Infiniti',
                'Hyundai','Kia','Genesis','Volvo','Rivian','Lucid','Mitsubishi']
df['is_major'] = df['make'].isin(MAJOR_BRANDS)

# =========================================================
# 1. REGRESSION BAKE-OFF: Ridge vs Tree vs Forest vs GBM vs MLP
# =========================================================
model_df = df[df['fuelType1'].isin(['Regular Gasoline', 'Premium Gasoline', 'Midgrade Gasoline', 'Diesel'])].copy()
model_df = model_df.dropna(subset=['displ', 'cylinders', 'comb08'])
model_df = model_df[(model_df['comb08'] > 5) & (model_df['comb08'] < 90)]

features_num = ['displ', 'cylinders', 'year']
features_cat = ['drive_s', 'vclass_s', 'trany_s', 'fuelType1']
X = model_df[features_num + features_cat]
y = model_df['comb08']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

pre = ColumnTransformer([
    ('num', 'passthrough', features_num),
    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), features_cat)
])
pre.fit(X_train)
Xtr = pre.transform(X_train)
Xte = pre.transform(X_test)
cat_names = pre.named_transformers_['cat'].get_feature_names_out(features_cat)
feat_names = features_num + list(cat_names)

bakeoff = []
trained = {}

def run_model(name, model, portable):
    t0 = time.time()
    model.fit(Xtr, y_train)
    dt = time.time() - t0
    pred = model.predict(Xte)
    r2 = r2_score(y_test, pred)
    mae = mean_absolute_error(y_test, pred)
    bakeoff.append({'name': name, 'r2': round(r2, 4), 'mae': round(mae, 2),
                     'train_s': round(dt, 2), 'portable': portable})
    trained[name] = model
    print(f"{name:22s} R2={r2:.4f}  MAE={mae:.2f}  train={dt:.2f}s")

run_model('Ridge Regression', Ridge(alpha=1.0), True)
run_model('Decision Tree (d=6)', DecisionTreeRegressor(max_depth=6, min_samples_leaf=20, random_state=42), True)
run_model('Random Forest', RandomForestRegressor(n_estimators=120, max_depth=14, n_jobs=-1, random_state=42), False)
run_model('Gradient Boosting', GradientBoostingRegressor(n_estimators=150, max_depth=3, random_state=42), False)
num_scaler = StandardScaler().fit(Xtr[:, :len(features_num)])
Xtr_scaled = Xtr.copy(); Xtr_scaled[:, :len(features_num)] = num_scaler.transform(Xtr[:, :len(features_num)])
Xte_scaled = Xte.copy(); Xte_scaled[:, :len(features_num)] = num_scaler.transform(Xte[:, :len(features_num)])
_Xtr_bak, _Xte_bak = Xtr, Xte
Xtr, Xte = Xtr_scaled, Xte_scaled
run_model('Neural Net (MLP)', MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=600, random_state=42, early_stopping=True), False)
Xtr, Xte = _Xtr_bak, _Xte_bak

# refit the two portable models on ALL data for deployment
ridge_full = Ridge(alpha=1.0)
Xall = pre.transform(X)
ridge_full.fit(Xall, y)
tree_full = DecisionTreeRegressor(max_depth=6, min_samples_leaf=20, random_state=42)
tree_full.fit(Xall, y)

ridge_coefs = dict(zip(feat_names, ridge_full.coef_.tolist()))
ridge_export = {
    'intercept': float(ridge_full.intercept_),
    'coefs': {k: round(v, 5) for k, v in ridge_coefs.items()}
}

def export_tree(tree, names):
    t = tree.tree_
    def rec(node):
        if t.children_left[node] == t.children_right[node]:
            return {'leaf': round(float(t.value[node][0][0]), 2)}
        return {'f': names[t.feature[node]], 'th': round(float(t.threshold[node]), 4),
                'l': rec(int(t.children_left[node])), 'r': rec(int(t.children_right[node]))}
    return rec(0)

tree_export = export_tree(tree_full, feat_names)

# feature importance from Random Forest, aggregated to human groups
rf = trained['Random Forest']
importances = dict(zip(feat_names, rf.feature_importances_.tolist()))
groups = {'Engine displacement': ['displ'], 'Cylinder count': ['cylinders'], 'Model year': ['year']}
for f in features_cat:
    label = {'drive_s': 'Drivetrain', 'vclass_s': 'Vehicle class', 'trany_s': 'Transmission', 'fuelType1': 'Fuel grade'}[f]
    groups[label] = [k for k in feat_names if k.startswith(f + '_')]
feat_importance = []
for label, keys in groups.items():
    feat_importance.append({'label': label, 'importance': round(sum(importances.get(k, 0) for k in keys), 4)})
feat_importance.sort(key=lambda d: -d['importance'])
total_imp = sum(f['importance'] for f in feat_importance)
for f in feat_importance:
    f['pct'] = round(f['importance'] / total_imp * 100, 1)

# =========================================================
# 2. UNSUPERVISED: manual K-Means (sklearn.cluster is blocked on this host)
# =========================================================
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

K = 5
centers, labels = kmeans(Xs, K)
clu_src['cluster'] = labels

def name_cluster(row):
    mpg, displ = row['comb08'], row['displ_f']
    if displ == 0 or mpg >= 65: return 'Electrified'
    if mpg >= 30: return 'Compact & Efficient'
    if displ >= 4.2 or mpg < 20: return 'Trucks & Heavy-Duty'
    if displ >= 2.9: return 'Performance & Luxury'
    return 'Mainstream Midsize'

cluster_summary = []
for j in range(K):
    sub = clu_src[clu_src['cluster'] == j]
    label = name_cluster(sub[['comb08', 'displ_f']].mean())
    cluster_summary.append({'id': int(j), 'label': label, 'n': int(len(sub)),
                             'avg_mpg': round(sub['comb08'].mean(), 1), 'avg_displ': round(sub['displ_f'].mean(), 1)})

cluster_points = clu_src[['make', 'displ_f', 'comb08', 'cluster']].rename(
    columns={'displ_f': 'displ', 'comb08': 'mpg'}).round(1).to_dict('records')

# =========================================================
# 3. CLASSIFICATION: powertrain family from body/engine specs
# =========================================================
def powertrain_family(r):
    if r['fuelType1'] == 'Electricity': return 'EV'
    if r['fuelType1'] == 'Diesel': return 'Diesel'
    if r['atvType'] in ('Hybrid', 'Plug-in Hybrid'): return 'Hybrid'
    return 'Gasoline'

cls_src = df.copy()
cls_src['target'] = cls_src.apply(powertrain_family, axis=1)
cls_src['displ_f'] = cls_src['displ'].fillna(0)
cls_src['cyl_f'] = cls_src['cylinders'].fillna(0)
cls_src = cls_src.dropna(subset=['vclass_s', 'drive_s', 'year'])

cls_feat_num = ['displ_f', 'cyl_f', 'year']
cls_feat_cat = ['vclass_s', 'drive_s']
Xcl = cls_src[cls_feat_num + cls_feat_cat]
ycl = cls_src['target']
Xcl_tr, Xcl_te, ycl_tr, ycl_te = train_test_split(Xcl, ycl, test_size=0.2, random_state=42, stratify=ycl)

pre_cl = ColumnTransformer([
    ('num', 'passthrough', cls_feat_num),
    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cls_feat_cat)
])
clf = RandomForestClassifier(n_estimators=150, max_depth=16, n_jobs=-1, random_state=42, class_weight='balanced')
clf_pipe = Pipeline([('pre', pre_cl), ('clf', clf)])
clf_pipe.fit(Xcl_tr, ycl_tr)
ycl_pred = clf_pipe.predict(Xcl_te)
acc = accuracy_score(ycl_te, ycl_pred)
classes = sorted(ycl.unique().tolist())
cm = confusion_matrix(ycl_te, ycl_pred, labels=classes)
print(f"Powertrain classifier accuracy: {acc:.4f}  n_test={len(ycl_te)}  classes={classes}")

classifier_export = {
    'accuracy': round(float(acc), 4),
    'classes': classes,
    'confusion_matrix': cm.tolist(),
    'n_train': int(len(Xcl_tr)),
    'n_test': int(len(Xcl_te))
}

# =========================================================
# Merge into existing data/data_export.json
# =========================================================
with open('data/data_export.json') as f:
    out = json.load(f)

out['model']['tree_json'] = tree_export
out['model']['ridge_full'] = ridge_export  # refit on all data (slightly different from original)
out['bakeoff'] = bakeoff
out['feature_importance'] = feat_importance
out['clusters'] = {'summary': cluster_summary, 'points': cluster_points, 'k': K}
out['classifier'] = classifier_export

with open('data/data_export.json', 'w') as f:
    json.dump(out, f)

print(f"\nMerged. New data/data_export.json size: {len(json.dumps(out))/1024:.0f} KB")
