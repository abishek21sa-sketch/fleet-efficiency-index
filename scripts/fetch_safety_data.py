import pandas as pd
import requests
import time
import json
import re

MAJOR_BRANDS = ['Tesla','Ford','Chevrolet','Cadillac','GMC','Buick','Dodge','Chrysler','Jeep','Ram',
                'BMW','Mercedes-Benz','Audi','Porsche','Volkswagen',
                'Toyota','Honda','Nissan','Mazda','Subaru','Lexus','Acura','Infiniti',
                'Hyundai','Kia','Genesis','Volvo','Rivian','Lucid','Mitsubishi']

NHTSA_MAKE_ALIAS = {'Mercedes-Benz': 'Mercedes-Benz'}  # NHTSA generally matches EPA make strings directly

TRIM_STRIP = re.compile(
    r'\b(4WD|AWD|FWD|RWD|2WD|4x4|4x2|Hybrid|Plug-in Hybrid|PHEV|EV|Electric|'
    r'Convertible|Coupe|Sedan|Wagon|Hatchback|SUV|Pickup|Crew Cab|Extended Cab|'
    r'Regular Cab|Mud Terrain Tires?|Sport|Base|Limited|Premium|Type-S|'
    r'Performance)\b.*$', re.IGNORECASE)

# A handful of confirmed EPA-vs-NHTSA full-size-pickup naming mismatches.
# NHTSA requires the payload-class number (e.g. "Sierra 1500") that EPA's
# `model` field omits. Not exhaustive — Ford's F-150 and Ram's 1500 use
# structurally different NHTSA naming (cab-style suffixes, e.g. "F-150
# (SUPER CREW) GAS") that can't be derived from EPA's string at all, so
# those are left to miss; the hit-rate this script prints at the end makes
# that coverage gap visible rather than silently hiding it.
TRUCK_ALIAS_PREFIX = {
    'Silverado': 'Silverado 1500',
    'Sierra': 'Sierra 1500',
}

def base_name_candidates(raw_model):
    raw = raw_model.strip()
    candidates = [raw]
    for prefix, alias in TRUCK_ALIAS_PREFIX.items():
        if raw.startswith(prefix):
            candidates.append(alias)
    stripped = TRIM_STRIP.sub('', raw).strip()
    if stripped and stripped != raw:
        candidates.append(stripped)
    first_word = raw.split(' ')[0]
    if len(first_word) > 2 and first_word not in candidates:
        candidates.append(first_word)
    if len(raw.split(' ')) > 1:
        two_words = ' '.join(raw.split(' ')[:2])
        if two_words not in candidates:
            candidates.append(two_words)
    seen = set()
    out = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out

def get_json(url, retries=2):
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=8)
            if r.status_code == 200:
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(0.3)
    return None

def fetch_safety_rating(make, model, year):
    for cand in base_name_candidates(model):
        url = f"https://api.nhtsa.gov/SafetyRatings/modelyear/{year}/make/{make}/model/{requests.utils.quote(cand)}"
        data = get_json(url)
        time.sleep(0.12)
        if data and data.get('Count', 0) > 0:
            vid = data['Results'][0]['VehicleId']
            detail = get_json(f"https://api.nhtsa.gov/SafetyRatings/VehicleId/{vid}")
            time.sleep(0.12)
            if detail and detail.get('Results'):
                res = detail['Results'][0]
                def num(v):
                    try:
                        return float(v)
                    except (TypeError, ValueError):
                        return None
                return {
                    'model_matched': cand,
                    'overall': num(res.get('OverallRating')),
                    'front': num(res.get('OverallFrontCrashRating')),
                    'side': num(res.get('OverallSideCrashRating')),
                    'rollover': num(res.get('RolloverRating')),
                }
    return None

def fetch_recall_count(make, model, year):
    for cand in base_name_candidates(model):
        url = f"https://api.nhtsa.gov/recalls/recallsByVehicle?make={requests.utils.quote(make)}&model={requests.utils.quote(cand)}&modelYear={year}"
        data = get_json(url)
        time.sleep(0.12)
        if data is not None:
            count = data.get('Count', 0)
            if count > 0 or cand == base_name_candidates(model)[-1]:
                return count
    return 0

def main():
    df = pd.read_csv('vehicles.csv', low_memory=False)
    df = df[df['year'] <= 2026]
    max_year = int(df['year'].max())
    recent = df[(df['make'].isin(MAJOR_BRANDS)) & (df['year'] >= max_year - 4)]

    brand_results = {}
    total_calls = 0
    hits = 0

    for make in MAJOR_BRANDS:
        sub = recent[recent['make'] == make]
        if sub.empty:
            continue
        top_models = sub['model'].value_counts().head(3).index.tolist()
        years = sorted(sub['year'].unique())[-2:]  # 2 most recent years present

        safety_samples = []
        recall_total = 0
        recall_models_checked = 0

        for model in top_models:
            for year in years:
                nhtsa_make = NHTSA_MAKE_ALIAS.get(make, make)
                total_calls += 1
                rating = fetch_safety_rating(nhtsa_make, model, int(year))
                if rating and rating['overall'] is not None:
                    safety_samples.append(rating['overall'])
                    hits += 1
                recall_count = fetch_recall_count(nhtsa_make, model, int(year))
                recall_total += recall_count
                recall_models_checked += 1

        brand_results[make] = {
            'avg_safety_rating': round(sum(safety_samples) / len(safety_samples), 2) if safety_samples else None,
            'safety_samples_n': len(safety_samples),
            'total_recalls_sampled': recall_total,
            'models_sampled': top_models,
            'years_sampled': [int(y) for y in years],
        }
        print(f"{make:15s} safety_n={len(safety_samples):2d}  avg={brand_results[make]['avg_safety_rating']}  recalls={recall_total}")

    print(f"\nTotal safety lookups attempted: {total_calls}, hits: {hits} ({hits/max(total_calls,1)*100:.0f}%)")

    with open('data/safety_export.json', 'w') as f:
        json.dump({'brands': brand_results, 'max_year': max_year}, f, indent=2)
    print("Wrote data/safety_export.json")

if __name__ == '__main__':
    main()
