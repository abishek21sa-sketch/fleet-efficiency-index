from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS
from app.ml import registry
from app.routers import predict, dashboard


@asynccontextmanager
async def lifespan(app: FastAPI):
    registry.load_all()
    yield


app = FastAPI(
    title="Fleet Efficiency Index API",
    description="Serves all 7 trained models live (the static site only ships 2 of them, "
                 "portable ones, client-side) plus the pre-aggregated dashboard data.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(predict.router)
app.include_router(dashboard.router)


@app.get("/api/models")
def list_models():
    """Registry introspection — also doubles as a boot-time health check
    that every artifact loaded correctly (a platform where cold starts
    should fail loudly, not silently serve missing models)."""
    meta = registry.get_meta()
    bakeoff = {}
    try:
        dash = dashboard._load(dashboard._DATA_EXPORT, "dashboard")
        bakeoff = {m["name"]: m for m in dash.get("bakeoff", [])}
    except FileNotFoundError:
        pass

    name_map = {
        "ridge": "Ridge Regression",
        "decision_tree": "Decision Tree (d=6)",
        "random_forest": "Random Forest",
        "gradient_boosting": "Gradient Boosting",
        "mlp": "Neural Net (MLP)",
    }
    regressors = []
    for key in registry.REGRESSION_MODELS:
        loaded = registry.get_regressor(key) is not None
        stats = bakeoff.get(name_map.get(key, ""), {})
        regressors.append({
            "key": key,
            "loaded": loaded,
            "r2_mean": stats.get("r2_mean"),
            "mae_mean": stats.get("mae_mean"),
        })

    return {
        "status": "ok" if registry.is_loaded() else "not_loaded",
        "regressors": regressors,
        "classifier_loaded": registry.get_classifier() is not None,
        "kmeans_loaded": registry.get_kmeans() is not None,
        "feature_schema": {
            "regression": {"num": meta["features_num"], "cat": meta["features_cat"], "categories": meta["categories"]},
            "powertrain": {"num": meta["classifier_features_num"], "cat": meta["classifier_features_cat"],
                           "categories": meta["classifier_categories"], "classes": meta["classifier_classes"]},
        },
    }


@app.get("/")
def root():
    return {"service": "fleet-efficiency-index-api", "docs": "/docs"}
