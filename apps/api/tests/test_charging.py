"""No OPENCHARGEMAP_API_KEY is available in this environment (a free signup
the deployer has to do, not something a test suite provisions), so these
tests only cover the graceful-degradation path - the actual OpenChargeMap
response reshaping isn't exercised here. See apps/api/README.md."""


def test_charging_stations_returns_503_without_api_key(client, monkeypatch):
    import app.routers.charging as charging_module
    monkeypatch.setattr(charging_module, "OPENCHARGEMAP_API_KEY", None)
    r = client.get("/api/charging-stations?state=CA")
    assert r.status_code == 503
    assert "OPENCHARGEMAP_API_KEY" in r.json()["detail"]


def test_charging_stations_validates_state_code_length(client):
    r = client.get("/api/charging-stations?state=California")
    assert r.status_code == 422


def test_charging_stations_requires_state_param(client):
    r = client.get("/api/charging-stations")
    assert r.status_code == 422
