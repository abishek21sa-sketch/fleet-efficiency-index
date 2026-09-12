"""Fit the 5 regression models + powertrain classifier as self-contained sklearn
Pipelines (ColumnTransformer baked in, so the API can call pipeline.predict(df)
directly on raw spec fields) and pickle them for FastAPI to serve.

Only Ridge and the depth-6 Decision Tree were ever exported to JSON for the
static site's client-side predictor (scripts/analyze2.py). Random Forest,
Gradient Boosting, MLP, and the classifier were trained for the bake-off
table but the fitted objects were discarded. This script re-fits all of them
as deployable artifacts, fixing one real issue in the process: the MLP's
numeric-feature scaling was previously done as a manual array swap outside
the Pipeline (fine for a one-off benchmark, not fine for an artifact that
has to be self-contained) — here it's a proper Pipeline step.

Run from repo root after vehicles.csv is downloaded: python scripts/export_models.py
"""
import pandas as pd
import numpy as np
import joblib
import json
import os

from sklearn.linear_model import Ridge
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor, RandomForestClassifier
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

ARTIFACT_DIR = os.path.join('apps', 'api', 'app', 'ml', 'artifacts')
os.makedirs(ARTIFACT_DIR, exist_ok=True)

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
# 1. REGRESSION PIPELINES (all 5, self-contained: preprocessing + estimator)
# =========================================================
model_df = df[df['fuelType1'].isin(['Regular Gasoline', 'Premium Gasoline', 'Midgrade Gasoline', 'Diesel'])].copy()
model_df = model_df.dropna(subset=['displ', 'cylinders', 'comb08'])
model_df = model_df[(model_df['comb08'] > 5) & (model_df['comb08'] < 90)]

features_num = ['displ', 'cylinders', 'year']
features_cat = ['drive_s', 'vclass_s', 'trany_s', 'fuelType1']
X = model_df[features_num + features_cat]
y = model_df['comb08']

def make_pre():
    return ColumnTransformer([
        ('num', 'passthrough', features_num),
        ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), features_cat)
    ])

reg_specs = {
    'ridge': Ridge(alpha=1.0),
    'decision_tree': DecisionTreeRegressor(max_depth=6, min_samples_leaf=20, random_state=42),
    'random_forest': RandomForestRegressor(n_estimators=120, max_depth=14, n_jobs=-1, random_state=42),
    'gradient_boosting': GradientBoostingRegressor(n_estimators=150, max_depth=3, random_state=42),
}

sizes = {}
for name, estimator in reg_specs.items():
    pipe = Pipeline([('pre', make_pre()), ('est', estimator)])
    pipe.fit(X, y)
    path = os.path.join(ARTIFACT_DIR, f'{name}.joblib')
    joblib.dump(pipe, path, compress=3)
    sizes[name] = os.path.getsize(path)
    print(f"{name:20s} fitted, {sizes[name]/1024:.0f} KB")

# MLP: scaling is now a real Pipeline step, not a manual array swap
mlp_pipe = Pipeline([
    ('pre', make_pre()),
    ('scale', StandardScaler()),
    ('est', MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=600, random_state=42, early_stopping=True))
])
mlp_pipe.fit(X, y)
path = os.path.join(ARTIFACT_DIR, 'mlp.joblib')
joblib.dump(mlp_pipe, path, compress=3)
sizes['mlp'] = os.path.getsize(path)
print(f"{'mlp':20s} fitted, {sizes['mlp']/1024:.0f} KB")

# =========================================================
# 2. POWERTRAIN CLASSIFIER PIPELINE
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

clf_pre = ColumnTransformer([
    ('num', 'passthrough', cls_feat_num),
    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), cls_feat_cat)
])
clf_pipe = Pipeline([
    ('pre', clf_pre),
    ('est', RandomForestClassifier(n_estimators=150, max_depth=16, n_jobs=-1, random_state=42, class_weight='balanced'))
])
clf_pipe.fit(Xcl, ycl)
path = os.path.join(ARTIFACT_DIR, 'powertrain_classifier.joblib')
joblib.dump(clf_pipe, path, compress=3)
sizes['powertrain_classifier'] = os.path.getsize(path)
print(f"{'powertrain_classifier':20s} fitted, {sizes['powertrain_classifier']/1024:.0f} KB")

# =========================================================
# 3. K-MEANS (not a sklearn object — numpy dict, shared predict logic lives
#    in apps/api/app/ml/kmeans.py so training and serving use the same code)
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

centers, labels = kmeans(Xs, 5, n_init=8)
clu_src['cluster'] = labels

def name_cluster(row):
    mpg, displ = row['comb08'], row['displ_f']
    if displ == 0 or mpg >= 65: return 'Electrified'
    if mpg >= 30: return 'Compact & Efficient'
    if displ >= 4.2 or mpg < 20: return 'Trucks & Heavy-Duty'
    if displ >= 2.9: return 'Performance & Luxury'
    return 'Mainstream Midsize'

cluster_names = {}
for j in range(5):
    sub = clu_src[clu_src['cluster'] == j]
    cluster_names[int(j)] = name_cluster(sub[['comb08', 'displ_f']].mean())

kmeans_artifact = {
    'centers': centers.tolist(),
    'mu': mu.tolist(),
    'sigma': sigma.tolist(),
    'feature_order': feat_cols,
    'cluster_names': cluster_names,
}
kmeans_path = os.path.join(ARTIFACT_DIR, 'kmeans.json')
with open(kmeans_path, 'w') as f:
    json.dump(kmeans_artifact, f)
sizes['kmeans'] = os.path.getsize(kmeans_path)
print(f"{'kmeans':20s} exported, {sizes['kmeans']/1024:.0f} KB")

# =========================================================
# 4. Metadata (categories, feature schemas) — mirrors data_export.json's
#    model.categories, but co-located with the artifacts the API loads
# =========================================================
meta = {
    'features_num': features_num,
    'features_cat': features_cat,
    'categories': {f: sorted(model_df[f].dropna().unique().tolist()) for f in features_cat},
    'classifier_features_num': cls_feat_num,
    'classifier_features_cat': cls_feat_cat,
    'classifier_categories': {f: sorted(cls_src[f].dropna().unique().tolist()) for f in cls_feat_cat},
    'classifier_classes': sorted(ycl.unique().tolist()),
}
with open(os.path.join(ARTIFACT_DIR, 'meta.json'), 'w') as f:
    json.dump(meta, f, indent=2)

total_kb = sum(sizes.values()) / 1024
print(f"\nTotal artifact size: {total_kb:.0f} KB ({'well under' if total_kb < 50000 else 'CHECK'} GitHub's 50MB/file warning)")
print("All artifacts written to", ARTIFACT_DIR)
