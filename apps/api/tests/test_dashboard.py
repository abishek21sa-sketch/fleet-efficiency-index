import json
import math


def _find_nans(obj, path="root"):
    """Recursively hunt for float NaN anywhere in a decoded JSON structure -
    used to confirm the dashboard-data endpoint's sanitization actually
    covers the whole tree, not just the one Lucid/avg_co2 case it was
    written for."""
    if isinstance(obj, float) and math.isnan(obj):
        return [path]
    if isinstance(obj, dict):
        found = []
        for k, v in obj.items():
            found += _find_nans(v, f"{path}.{k}")
        return found
    if isinstance(obj, list):
        found = []
        for i, v in enumerate(obj):
            found += _find_nans(v, f"{path}[{i}]")
        return found
    return []


def test_dashboard_data_is_valid_standard_json_with_no_nan(client):
    r = client.get("/api/dashboard-data")
    assert r.status_code == 200
    # Parse the raw bytes with the stdlib's strict-by-default decoder rather
    # than r.json() (httpx's JSON decoder is also lenient about NaN) - this
    # is the same check a real fetch().json() in a browser would fail if the
    # sanitization regressed.
    body = json.loads(r.content, parse_constant=lambda c: (_ for _ in ()).throw(ValueError(f"non-standard JSON constant: {c}")))
    assert _find_nans(body) == []
    assert body["meta"]["n_makes"] > 100
    assert "Lucid" in body["trends"]


def test_dashboard_data_shape_matches_frontend_expectations(client):
    body = client.get("/api/dashboard-data").json()
    for key in ["trends", "industry_trend", "leaderboard", "scatter", "model", "meta", "bakeoff", "classifier", "clusters"]:
        assert key in body, f"missing top-level key: {key}"
    assert len(body["bakeoff"]) == 5
    assert body["model"]["tree_json"] is not None
    assert body["model"]["ridge_full"]["feature_baseline"] is not None


def test_safety_data_is_valid_json(client):
    r = client.get("/api/safety-data")
    assert r.status_code == 200
    body = r.json()
    assert "brands" in body
    assert len(body["brands"]) > 0
