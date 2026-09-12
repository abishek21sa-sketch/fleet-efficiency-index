# Fleet Efficiency Index

A data-analysis and machine-learning pipeline over every EPA-tested vehicle sold in the United States since 1984 — Tesla to Cadillac, Audi to Ram, 146 makes, ~50,000 records — cross-referenced against NHTSA safety ratings and recall history. Seven models trained end to end: a five-algorithm regression bake-off (5-fold cross-validated, with hyperparameter tuning), SHAP-based explainability, unsupervised market segmentation, a powertrain classifier, and two models ported to run live in the browser with a per-prediction explanation.

**Live site:** https://abishek21sa-sketch.github.io/fleet-efficiency-index/

## What's in it

| Section | What it shows |
|---|---|
| Brand efficiency trend | Combined MPG/MPGe per model year, by manufacturer (interactive brand picker) |
| Electrification | Industry-wide EV share, 1984–2026, with a 2027–2030 logistic-curve forecast and bootstrap confidence band |
| Efficiency frontier | Engine displacement vs. combined MPG, 1,500 sampled vehicles |
| Brand leaderboard | Ranked average efficiency, last 3 model years |
| **Model bake-off** | Ridge, Decision Tree, Random Forest, Gradient Boosting, and a Neural Net (MLP) — 5-fold cross-validated, plus `RandomizedSearchCV` tuning for RF/GBM |
| **Explainability** | SHAP values from the Random Forest, aggregated back to spec-sheet fields — and an explicit comparison against the (biased) impurity-based importances most people ship instead |
| **Market segmentation** | K-means, unsupervised — vehicle archetypes discovered from specs alone, no brand/price/class given. Silhouette-scored across k=2–8, with an honest note on why we kept an interpretable k over the statistically "best" one |
| **Powertrain classifier** | Random Forest predicting gas/diesel/hybrid/EV from body specs, with a confusion matrix |
| **Safety vs. efficiency** | NHTSA overall safety rating against combined MPG, by brand |
| **Recall frequency** | NHTSA recall counts by brand, sampled from each brand's most-tested recent models |
| **Live predictor** | Ridge regression + a depth-limited decision tree, both re-implemented in vanilla JS and run client-side — plus a live linear-SHAP breakdown showing exactly which spec fields pushed the prediction up or down |

## Model results (5-fold cross-validation)

| Model | R² (mean ± std) | MAE (mean ± std) | Runs in-browser |
|---|---|---|---|
| Ridge Regression | 0.702 ± 0.004 | 2.03 ± 0.03 MPG | ✅ |
| Decision Tree (depth 6) | 0.763 ± 0.003 | 1.85 ± 0.02 MPG | ✅ |
| Gradient Boosting | 0.821 ± 0.004 | 1.52 ± 0.02 MPG | — |
| Neural Net (MLP) | 0.837 ± 0.002 | 1.44 ± 0.01 MPG | — |
| **Random Forest** | **0.872 ± 0.005** | **1.17 ± 0.01 MPG** | — |

Hyperparameter tuning (`RandomizedSearchCV`, 15 iters, 3-fold): Random Forest barely moves (0.872 → 0.876 — it was already near its ceiling with defaults), Gradient Boosting jumps meaningfully (0.821 → 0.871) with more/shallower trees and a lower learning rate.

Powertrain classifier (gas/diesel/hybrid/EV from body specs): **86.3% accuracy**, 4-class, 25% baseline.

SHAP explainability surfaced a real methodological finding: impurity-based feature importance puts engine displacement at **68.8%** of the prediction; SHAP puts it at **41.8%**, with model year and drivetrain getting substantially more credit. That's not noise — impurity-based importance is documented to over-credit continuous/high-cardinality features, and SHAP's game-theoretic attribution doesn't share that bias.

K-means clustering surfaced 5 segments with zero labels given: *Electrified*, *Compact & Efficient*, *Mainstream Midsize*, *Performance & Luxury*, *Trucks & Heavy-Duty*. Silhouette score actually favors k=2 (0.70) — verified that's just electric vs. everything else — over k=5 (0.55). Kept k=5 anyway: five actionable segments beat one trivially-correct binary split, and the site says so rather than hiding the trade-off.

## Stack

- **Data**: [EPA / DOE fueleconomy.gov](https://www.fueleconomy.gov/feg/download.shtml) public vehicle test dataset (public domain) + [NHTSA](https://www.nhtsa.gov/nhtsa-datasets-and-apis) Safety Ratings and Recalls APIs (free, no key)
- **Analysis / ML**: Python, pandas, scikit-learn (`Ridge`, `DecisionTreeRegressor`, `RandomForestRegressor`, `GradientBoostingRegressor`, `MLPRegressor`, `RandomForestClassifier`, `RandomizedSearchCV`), `shap` for explainability, `scipy.optimize.curve_fit` for the EV-adoption forecast
- **Clustering**: hand-implemented K-means (numpy, k-means++ init) — this environment's scikit-learn build has `sklearn.cluster` blocked by a system policy, so it's a from-scratch Lloyd's-algorithm implementation instead
- **Frontend**: single-file HTML/CSS/vanilla JS, no framework, no build step. Charts are hand-rolled inline SVG (no charting library). Trained model parameters (ridge coefficients, decision tree splits, feature baselines for linear SHAP) are exported to JSON and re-implemented as plain JS so inference — and per-prediction explanation — runs entirely client-side
- **Build**: `template.html` is the editable source; `scripts/build.py` splices `data/*.json` into it to produce the deployed `index.html`. Don't hand-edit `index.html` directly — edit the template and rebuild

## Reproducing the analysis

```bash
# 1. Download the EPA dataset into the repo root
curl -sL -o vehicles.csv https://www.fueleconomy.gov/feg/epadata/vehicles.csv

# 2. Install dependencies
pip install pandas numpy scikit-learn scipy shap requests

# 3. Run the pipeline (from repo root, in order)
python scripts/analyze.py           # base analysis + ridge regression export
python scripts/analyze2.py          # model bake-off, clustering, classifier, decision tree export
python scripts/analyze3.py          # cross-validation, tuning, SHAP, EV forecast, silhouette scoring
python scripts/fetch_safety_data.py # NHTSA safety ratings + recalls (network calls, ~2 min)

# 4. Rebuild the deployed page from the template
python scripts/build.py             # writes index.html from template.html + data/*.json
```

`vehicles.csv` (~21MB) isn't committed; it's a straight download from the EPA's public dataset.

## Roadmap

Phase 2 (full-stack rebuild — FastAPI backend serving all 7 models live, Next.js frontend, EV-charging-station data via OpenChargeMap, deployed to Vercel + Render) is scoped but not yet started. This static site stays live as the current build either way.

## License

Code: MIT. Data: public domain (U.S. government work, EPA/DOE/NHTSA).
