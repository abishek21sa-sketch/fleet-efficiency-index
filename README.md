# Fleet Efficiency Index

A data-analysis and machine-learning pipeline over every EPA-tested vehicle sold in the United States since 1984 — Tesla to Cadillac, Audi to Ram, 146 makes, 50,242 records. Seven models trained end to end: a five-algorithm regression bake-off, unsupervised market segmentation, a powertrain classifier, and two models ported to run live in the browser.

**Live demo:** https://claude.ai/code/artifact/967e605a-9faa-4419-b52f-65190085e02d

## What's in it

| Section | What it shows |
|---|---|
| Brand efficiency trend | Combined MPG/MPGe per model year, by manufacturer (interactive brand picker) |
| Electrification | Industry-wide share of EPA test entries that are fully electric, 1984–2026 |
| Efficiency frontier | Engine displacement vs. combined MPG, 1,500 sampled vehicles |
| Brand leaderboard | Ranked average efficiency, last 3 model years |
| **Model bake-off** | Ridge, Decision Tree, Random Forest, Gradient Boosting, and a Neural Net (MLP) trained on the same 48K-row train/test split |
| **Feature importance** | Random Forest importances, aggregated back to spec-sheet fields |
| **Market segmentation** | K-means (k=5), unsupervised — vehicle archetypes discovered from specs alone, no brand/price/class given |
| **Powertrain classifier** | Random Forest predicting gas/diesel/hybrid/EV from body specs, with a confusion matrix |
| **Live predictor** | Ridge regression + a depth-limited decision tree, both re-implemented in vanilla JS and run client-side against your spec sheet |

## Model results

| Model | R² (test) | MAE | Runs in-browser |
|---|---|---|---|
| Ridge Regression | 0.708 | ±2.02 MPG | ✅ |
| Decision Tree (depth 6) | 0.763 | ±1.84 MPG | ✅ |
| Gradient Boosting | 0.828 | ±1.50 MPG | — |
| Neural Net (MLP) | 0.839 | ±1.42 MPG | — |
| **Random Forest** | **0.876** | **±1.17 MPG** | — |

Powertrain classifier (gas/diesel/hybrid/EV from body specs): **86.3% accuracy**, 4-class, 25% baseline.

Feature importance (Random Forest): engine displacement (68.8%), model year (15.3%), vehicle class (4.8%) dominate the prediction.

K-means clustering surfaced 5 segments with zero labels given: *Electrified*, *Compact & Efficient*, *Mainstream Midsize*, *Performance & Luxury*, *Trucks & Heavy-Duty*.

## Stack

- **Data**: [EPA / DOE fueleconomy.gov](https://www.fueleconomy.gov/feg/download.shtml) public vehicle test dataset (public domain)
- **Analysis / ML**: Python, pandas, scikit-learn (`Ridge`, `DecisionTreeRegressor`, `RandomForestRegressor`, `GradientBoostingRegressor`, `MLPRegressor`, `RandomForestClassifier`)
- **Clustering**: hand-implemented K-means (numpy, k-means++ init) — this environment's scikit-learn build has `sklearn.cluster` blocked by a system policy, so it's a from-scratch Lloyd's-algorithm implementation instead
- **Frontend**: single-file HTML/CSS/vanilla JS, no framework, no build step. Charts are hand-rolled inline SVG (no charting library). Trained model parameters (ridge coefficients, decision tree splits) are exported to JSON and re-implemented as plain JS so inference runs entirely client-side

## Reproducing the analysis

```bash
# 1. Download the EPA dataset into the repo root
curl -sL -o vehicles.csv https://www.fueleconomy.gov/feg/epadata/vehicles.csv

# 2. Install dependencies
pip install pandas numpy scikit-learn

# 3. Run the pipeline (from repo root)
python scripts/analyze.py    # base analysis + ridge regression export
python scripts/analyze2.py   # model bake-off, clustering, classifier, decision tree export

# 4. Open index.html in a browser — it reads data/data_export.json inline
```

`vehicles.csv` (~21MB) isn't committed; it's a straight download from the EPA's public dataset.

## License

Code: MIT. Data: public domain (U.S. government work, EPA/DOE).
