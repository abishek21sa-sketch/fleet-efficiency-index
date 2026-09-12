import pytest

REGRESSION_MODELS = ["ridge", "decision_tree", "random_forest", "gradient_boosting", "mlp"]


@pytest.mark.parametrize("model_key", REGRESSION_MODELS)
def test_regression_predicts_plausible_mpg_for_mainstream_sedan(client, valid_regression_spec, model_key):
    r = client.post(f"/api/predict/regression/{model_key}", json=valid_regression_spec)
    assert r.status_code == 200
    body = r.json()
    assert body["model"] == model_key
    # A 2.0L 4-cyl FWD midsize automatic sedan should land somewhere in
    # plausible real-world combined-MPG territory - this catches a model
    # that's technically "loaded" but predicting nonsense (e.g. a broken
    # feature encoding silently producing a wildly wrong number).
    assert 15 < body["predicted_combined_mpg"] < 60


def test_regression_predicts_low_mpg_for_heavy_truck(client, valid_regression_spec):
    truck_spec = {**valid_regression_spec, "displ": 5.7, "cylinders": 8, "drive_s": "4WD", "vclass_s": "Pickup (Standard)"}
    r = client.post("/api/predict/regression/random_forest", json=truck_spec)
    assert r.status_code == 200
    # Directional sanity check, not an exact-value pin: a big V8 4WD truck
    # must predict meaningfully lower than the mainstream sedan case above.
    assert r.json()["predicted_combined_mpg"] < 25


def test_regression_rejects_unknown_model_key(client, valid_regression_spec):
    r = client.post("/api/predict/regression/not_a_real_model", json=valid_regression_spec)
    assert r.status_code == 422  # FastAPI's Literal validation rejects it before the handler runs


def test_regression_rejects_invalid_category(client, valid_regression_spec):
    bad_spec = {**valid_regression_spec, "drive_s": "SIDEWAYS"}
    r = client.post("/api/predict/regression/ridge", json=bad_spec)
    assert r.status_code == 422
    assert "drive_s" in r.json()["detail"]


def test_regression_rejects_out_of_range_displacement(client, valid_regression_spec):
    bad_spec = {**valid_regression_spec, "displ": 50.0}
    r = client.post("/api/predict/regression/ridge", json=bad_spec)
    assert r.status_code == 422


def test_powertrain_classifies_zero_displacement_as_ev(client):
    ev_spec = {"displ": 0, "cylinders": 0, "year": 2024, "vclass_s": "Midsize Car", "drive_s": "AWD"}
    r = client.post("/api/predict/powertrain", json=ev_spec)
    assert r.status_code == 200
    body = r.json()
    assert body["predicted_class"] == "EV"
    assert body["probabilities"]["EV"] > 0.9
    assert abs(sum(body["probabilities"].values()) - 1.0) < 1e-6


def test_cluster_assigns_electric_profile_to_electrified_segment(client):
    r = client.post("/api/predict/cluster", json={"comb08": 95, "displ": 0, "cylinders": 0, "co2_gpm": 0})
    assert r.status_code == 200
    assert r.json()["cluster_name"] == "Electrified"


def test_cluster_assigns_gas_truck_profile_to_heavy_duty_segment(client):
    r = client.post("/api/predict/cluster", json={"comb08": 16, "displ": 5.7, "cylinders": 8, "co2_gpm": 550})
    assert r.status_code == 200
    assert r.json()["cluster_name"] == "Trucks & Heavy-Duty"
