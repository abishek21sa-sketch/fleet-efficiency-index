from typing import Literal
from pydantic import BaseModel, Field

RegressionModelKey = Literal["ridge", "decision_tree", "random_forest", "gradient_boosting", "mlp"]


class RegressionSpec(BaseModel):
    """Spec sheet shared by all 5 regression models — they were trained on
    an identical feature set, so one request schema covers all of them."""
    displ: float = Field(..., ge=0.5, le=10.0, description="Engine displacement, liters")
    cylinders: int = Field(..., ge=2, le=16)
    year: int = Field(..., ge=1984, le=2030)
    drive_s: str
    vclass_s: str
    trany_s: str
    fuelType1: str


class RegressionResult(BaseModel):
    model: RegressionModelKey
    predicted_combined_mpg: float


class PowertrainSpec(BaseModel):
    displ: float = Field(..., ge=0.0, le=10.0, description="0 for EVs (no engine)")
    cylinders: int = Field(..., ge=0, le=16, description="0 for EVs")
    year: int = Field(..., ge=1984, le=2030)
    vclass_s: str
    drive_s: str


class PowertrainResult(BaseModel):
    predicted_class: str
    probabilities: dict[str, float]


class ClusterSpec(BaseModel):
    """Takes a fully-specified real vehicle (mpg included), not a
    hypothetical partial spec — the K-means model clustered on observed
    combined MPG and CO2 alongside engine specs, and those are outcomes
    elsewhere in this app, not inputs a shopper picks in advance. This
    endpoint answers "which segment does this vehicle belong to," not
    "what if a car existed with these specs.\""""
    comb08: float = Field(..., description="Combined MPG (or MPGe for EVs)")
    displ: float = Field(0.0, description="0 for EVs")
    cylinders: float = Field(0.0, description="0 for EVs")
    co2_gpm: float = Field(0.0, description="Tailpipe CO2, g/mile; 0 for EVs")


class ClusterResult(BaseModel):
    cluster_id: int
    cluster_name: str
