"""Loads every model artifact once at app startup (FastAPI lifespan hook in
main.py calls load_all()) and holds them in memory for the life of the
process. Never reload from disk per-request.
"""
import json
import os
import joblib

from app.core.config import ARTIFACT_DIR

REGRESSION_MODELS = ["ridge", "decision_tree", "random_forest", "gradient_boosting", "mlp"]

_state: dict = {
    "regressors": {},
    "classifier": None,
    "kmeans": None,
    "meta": None,
    "loaded": False,
}


def load_all() -> None:
    for name in REGRESSION_MODELS:
        path = os.path.join(ARTIFACT_DIR, f"{name}.joblib")
        _state["regressors"][name] = joblib.load(path)

    _state["classifier"] = joblib.load(os.path.join(ARTIFACT_DIR, "powertrain_classifier.joblib"))

    with open(os.path.join(ARTIFACT_DIR, "kmeans.json")) as f:
        _state["kmeans"] = json.load(f)

    with open(os.path.join(ARTIFACT_DIR, "meta.json")) as f:
        _state["meta"] = json.load(f)

    _state["loaded"] = True


def is_loaded() -> bool:
    return _state["loaded"]


def get_regressor(name: str):
    if name not in _state["regressors"]:
        return None
    return _state["regressors"][name]


def get_classifier():
    return _state["classifier"]


def get_kmeans():
    return _state["kmeans"]


def get_meta():
    return _state["meta"]
