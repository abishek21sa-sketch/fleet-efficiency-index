import pandas as pd
from fastapi import APIRouter, HTTPException

from app.ml import registry
from app.ml.kmeans import nearest_cluster
from app.schemas.predict import (
    RegressionModelKey, RegressionSpec, RegressionResult,
    PowertrainSpec, PowertrainResult,
    ClusterSpec, ClusterResult,
)

router = APIRouter(prefix="/api/predict", tags=["predict"])


def _validate_categories(spec: dict, categories: dict[str, list[str]]) -> None:
    for field, valid in categories.items():
        if field in spec and spec[field] not in valid:
            raise HTTPException(
                status_code=422,
                detail=f"'{spec[field]}' is not a valid value for {field}. Valid options: {valid}",
            )


@router.post("/regression/{model_key}", response_model=RegressionResult)
def predict_regression(model_key: RegressionModelKey, spec: RegressionSpec):
    meta = registry.get_meta()
    _validate_categories(spec.model_dump(), meta["categories"])

    pipeline = registry.get_regressor(model_key)
    if pipeline is None:
        raise HTTPException(status_code=404, detail=f"Unknown model '{model_key}'")

    row = pd.DataFrame([spec.model_dump()])
    pred = float(pipeline.predict(row)[0])
    return RegressionResult(model=model_key, predicted_combined_mpg=round(pred, 1))


@router.post("/powertrain", response_model=PowertrainResult)
def predict_powertrain(spec: PowertrainSpec):
    meta = registry.get_meta()
    _validate_categories(spec.model_dump(), meta["classifier_categories"])

    clf = registry.get_classifier()
    row = pd.DataFrame([{
        "displ_f": spec.displ,
        "cyl_f": spec.cylinders,
        "year": spec.year,
        "vclass_s": spec.vclass_s,
        "drive_s": spec.drive_s,
    }])
    pred = clf.predict(row)[0]
    proba = clf.predict_proba(row)[0]
    classes = clf.named_steps["est"].classes_
    return PowertrainResult(
        predicted_class=pred,
        probabilities={cls: round(float(p), 4) for cls, p in zip(classes, proba)},
    )


@router.post("/cluster", response_model=ClusterResult)
def predict_cluster(spec: ClusterSpec):
    km = registry.get_kmeans()
    point = [spec.comb08, spec.displ, spec.cylinders, spec.co2_gpm]
    cluster_id = nearest_cluster(point, km["centers"], km["mu"], km["sigma"])
    return ClusterResult(
        cluster_id=cluster_id,
        cluster_name=km["cluster_names"][str(cluster_id)],
    )
