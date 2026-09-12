# Fleet Efficiency Index — API

FastAPI backend serving all 7 trained models live (the static site at the repo
root only ships 2 portable ones — Ridge and a depth-6 Decision Tree — client-side
in plain JS). This is Phase 2's backend: Random Forest, Gradient Boosting, MLP,
the powertrain classifier, and K-means clustering all become reachable over
HTTP, in addition to the two that already run in the browser.

## Run locally

```bash
cd apps/api
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Then open http://127.0.0.1:8000/docs for interactive Swagger UI, or:

```bash
curl http://127.0.0.1:8000/api/models   # health check — confirms all artifacts loaded
curl -X POST http://127.0.0.1:8000/api/predict/regression/random_forest \
  -H "Content-Type: application/json" \
  -d '{"displ":2.0,"cylinders":4,"year":2024,"drive_s":"FWD","vclass_s":"Midsize Car","trany_s":"Automatic","fuelType1":"Regular Gasoline"}'
```

## Regenerating the model artifacts

The artifacts in `app/ml/artifacts/` are committed (they're the point — Render's
free tier has no persistent disk, so the API loads them from the repo, not by
training on boot). To regenerate them after a data or model change:

```bash
# from the repo root, with vehicles.csv already downloaded
python scripts/export_models.py
```

This fits fresh sklearn `Pipeline`s (preprocessing baked in, so the API can call
`pipeline.predict(df)` on raw spec fields directly) for all 5 regressors and the
classifier, and re-derives the K-means centers. Commit the resulting files in
`app/ml/artifacts/` along with your code change.

## Endpoints

| Endpoint | What it does |
|---|---|
| `GET /api/models` | Registry health check — which artifacts loaded, their CV scores, valid feature values |
| `POST /api/predict/regression/{model_key}` | `model_key` = ridge / decision_tree / random_forest / gradient_boosting / mlp |
| `POST /api/predict/powertrain` | Gas/diesel/hybrid/EV classification from body specs |
| `POST /api/predict/cluster` | Nearest K-means segment for a fully-specified vehicle (mpg + specs, not a hypothetical partial spec — see the schema docstring for why) |
| `GET /api/dashboard-data` | The same pre-aggregated data the static site embeds inline, served as real endpoints instead |
| `GET /api/safety-data` | NHTSA safety/recall data by brand |
| `GET /api/charging-stations?state=XX` | EV charging stations for a US state, proxied from OpenChargeMap (needs `OPENCHARGEMAP_API_KEY`, see below — returns 503 with a setup message if unset) |

## Enabling the charging-stations endpoint

1. Get a free key (~1 minute, no cost) at https://openchargemap.org/site/loginprovider/register
2. Set it as an environment variable: `OPENCHARGEMAP_API_KEY=your-key-here`
3. Restart the server

**Not yet verified against live data** — this was built from OpenChargeMap's documented
response schema, but no key was available to test the actual reshaping logic
(`_reshape()` in `app/routers/charging.py`) against a real API response. Once you have
a key, hit `curl "http://127.0.0.1:8000/api/charging-stations?state=CA"` and confirm
the station data looks right before trusting it in the frontend.

## Deployment (Render)

- Root directory: `apps/api`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Env vars: `CORS_ORIGINS` (comma-separated list including the deployed Vercel frontend URL), `OPENCHARGEMAP_API_KEY` (optional — charging-stations endpoint returns 503 without it)
- No database, no persistent disk needed — the model artifacts and `data/*.json` are read from the repo checkout at boot
