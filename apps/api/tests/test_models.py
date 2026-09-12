"""Registry health check - catches a stale/corrupt/missing artifact at test
time rather than in Render's slower deploy-then-fail loop."""


def test_models_endpoint_reports_all_artifacts_loaded(client):
    r = client.get("/api/models")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["classifier_loaded"] is True
    assert body["kmeans_loaded"] is True

    regressors = {reg["key"]: reg for reg in body["regressors"]}
    expected_keys = {"ridge", "decision_tree", "random_forest", "gradient_boosting", "mlp"}
    assert set(regressors.keys()) == expected_keys
    for key, reg in regressors.items():
        assert reg["loaded"] is True, f"{key} did not load"


def test_models_endpoint_reports_plausible_cv_scores(client):
    r = client.get("/api/models")
    regressors = {reg["key"]: reg for reg in r.json()["regressors"]}
    # R2 in (0, 1) and roughly ordered the way the bake-off found: Random
    # Forest should beat Ridge by a wide margin on this dataset. A model
    # trained on garbage data or the wrong features would fail this loudly
    # rather than silently serving degraded predictions.
    assert 0.5 < regressors["ridge"]["r2_mean"] < 0.85
    assert 0.8 < regressors["random_forest"]["r2_mean"] < 1.0
    assert regressors["random_forest"]["r2_mean"] > regressors["ridge"]["r2_mean"]


def test_root_and_docs_are_reachable(client):
    assert client.get("/").status_code == 200
    assert client.get("/docs").status_code == 200
