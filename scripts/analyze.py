import pandas as pd
import numpy as np
import json
from sklearn.linear_model import Ridge
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import r2_score, mean_absolute_error

df = pd.read_csv('vehicles.csv', low_memory=False)  # run from repo root; download per README

MAJOR_BRANDS = ['Tesla','Ford','Chevrolet','Cadillac','GMC','Buick','Dodge','Chrysler','Jeep','Ram',
                'BMW','Mercedes-Benz','Audi','Porsche','Volkswagen',
                'Toyota','Honda','Nissan','Mazda','Subaru','Lexus','Acura','Infiniti',
                'Hyundai','Kia','Genesis','Volvo','Rivian','Lucid','Mitsubishi']

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
    if 'all-wheel' in d and '4-wheel or' in d: return 'AWD'
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
df['is_major'] = df['make'].isin(MAJOR_BRANDS)

# ---------- 1. Brand x Year trend data (avg combined MPG, EV%, count) ----------
brand_year = (df[df['is_major']]
              .groupby(['make', 'year'])
              .agg(avg_mpg=('comb08', 'mean'),
                   avg_co2=('co2TailpipeGpm', lambda x: x[x > 0].mean() if (x > 0).any() else None),
                   count=('make', 'size'),
                   ev_count=('is_ev', 'sum'))
              .reset_index())
brand_year['ev_pct'] = (brand_year['ev_count'] / brand_year['count'] * 100).round(1)
brand_year['avg_mpg'] = brand_year['avg_mpg'].round(1)
brand_year['avg_co2'] = brand_year['avg_co2'].round(0)

trends = {}
for make, g in brand_year.groupby('make'):
    trends[make] = g[['year', 'avg_mpg', 'ev_pct', 'count', 'avg_co2']].to_dict('records')

# ---------- 2. Overall EV adoption trend (industry-wide, all makes) ----------
industry_year = (df.groupby('year')
                  .agg(count=('make', 'size'), ev_count=('is_ev', 'sum'))
                  .reset_index())
industry_year['ev_pct'] = (industry_year['ev_count'] / industry_year['count'] * 100).round(2)
industry_trend = industry_year[['year', 'ev_pct', 'count']].to_dict('records')

# ---------- 3. Brand leaderboard (most recent 3 model years) ----------
recent = df[(df['year'] >= df['year'].max() - 2) & (df['is_major'])]
leaderboard = (recent.groupby('make')
               .agg(avg_mpg=('comb08', 'mean'),
                    model_count=('model', 'nunique'),
                    ev_pct=('is_ev', lambda x: round(x.mean() * 100, 1)))
               .reset_index())
leaderboard['avg_mpg'] = leaderboard['avg_mpg'].round(1)
leaderboard = leaderboard.sort_values('avg_mpg', ascending=False).to_dict('records')

# ---------- 4. Scatter: displacement vs MPG efficiency frontier (sampled) ----------
scatter_src = df[(df['is_major']) & (df['displ'] > 0) & (df['year'] >= df['year'].max() - 5)].copy()
scatter_src = scatter_src.sample(n=min(1500, len(scatter_src)), random_state=42)
scatter = scatter_src[['make', 'displ', 'comb08', 'vclass_s', 'cylinders']].rename(
    columns={'comb08': 'mpg', 'vclass_s': 'vclass'}).round(1).to_dict('records')

# ---------- 5. ML Model: predict combined MPG from specs (gas/diesel vehicles) ----------
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
pipe = Pipeline([('pre', pre), ('reg', Ridge(alpha=1.0))])
pipe.fit(X_train, y_train)
pred = pipe.predict(X_test)
r2 = r2_score(y_test, pred)
mae = mean_absolute_error(y_test, pred)
print(f"Model R2: {r2:.4f}  MAE: {mae:.2f} MPG  (n_train={len(X_train)}, n_test={len(X_test)})")

# Refit on ALL data for the deployed model (more data = better)
pipe.fit(X, y)

# Export coefficients for a plain linear model reproducible in JS:
# comb08 = intercept + b_displ*displ + b_cyl*cylinders + b_year*year + sum(onehot coefs)
ohe = pipe.named_steps['pre'].named_transformers_['cat']
reg = pipe.named_steps['reg']
cat_names = ohe.get_feature_names_out(features_cat)  # e.g. drive_s_AWD
all_coef_names = features_num + list(cat_names)
coefs = dict(zip(all_coef_names, reg.coef_.tolist()))

model_export = {
    'intercept': float(reg.intercept_),
    'coefs': {k: round(v, 5) for k, v in coefs.items()},
    'features_num': features_num,
    'features_cat': features_cat,
    'categories': {feat: ohe.categories_[i].tolist() for i, feat in enumerate(features_cat)},
    'r2': round(r2, 4),
    'mae': round(mae, 2),
    'n_samples': int(len(X))
}

# ---------- Write outputs ----------
output = {
    'trends': trends,
    'industry_trend': industry_trend,
    'leaderboard': leaderboard,
    'scatter': scatter,
    'model': model_export,
    'meta': {
        'total_records': int(len(df)),
        'year_min': int(df['year'].min()),
        'year_max': int(df['year'].max()),
        'n_makes': int(df['make'].nunique()),
        'major_brands': MAJOR_BRANDS,
        'vclasses': sorted(model_df['vclass_s'].unique().tolist()),
        'drives': sorted(model_df['drive_s'].unique().tolist()),
        'tranies': sorted(model_df['trany_s'].unique().tolist()),
        'fueltypes': sorted(model_df['fuelType1'].unique().tolist())
    }
}

with open('data/data_export.json', 'w') as f:
    json.dump(output, f)

print(f"Exported data/data_export.json ({len(json.dumps(output))/1024:.0f} KB)")
print(f"Makes in trends: {list(trends.keys())}")
