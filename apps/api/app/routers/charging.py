"""Proxies OpenChargeMap so the API key never reaches the browser. Results are
cached in memory per (state, limit) — station locations don't change minute to
minute, and OpenChargeMap's free tier has a real rate limit worth respecting.
"""
import time
import requests
from fastapi import APIRouter, HTTPException, Query

from app.core.config import OPENCHARGEMAP_API_KEY
from app.schemas.charging import ChargingStation, ChargingStationsResponse

router = APIRouter(prefix="/api", tags=["charging"])

OCM_BASE = "https://api.openchargemap.io/v3/poi/"
CACHE_TTL_S = 3600
_cache: dict[tuple[str, int], tuple[float, ChargingStationsResponse]] = {}


def _reshape(raw: dict) -> ChargingStation | None:
    addr = raw.get("AddressInfo") or {}
    if addr.get("Latitude") is None or addr.get("Longitude") is None:
        return None
    connections = raw.get("Connections") or []
    conn_types = sorted({
        c["ConnectionType"]["Title"]
        for c in connections
        if c.get("ConnectionType") and c["ConnectionType"].get("Title")
    })
    powers = [c["PowerKW"] for c in connections if c.get("PowerKW")]
    operator = (raw.get("OperatorInfo") or {}).get("Title")
    return ChargingStation(
        id=raw["ID"],
        name=addr.get("Title") or "Unnamed station",
        operator=operator,
        address=addr.get("AddressLine1") or "",
        city=addr.get("Town"),
        state=(addr.get("StateOrProvince") or "").strip() or None,
        lat=addr["Latitude"],
        lon=addr["Longitude"],
        num_points=raw.get("NumberOfPoints") or len(connections) or 1,
        connection_types=conn_types,
        max_power_kw=max(powers) if powers else None,
        usage_cost=raw.get("UsageCost"),
    )


@router.get("/charging-stations", response_model=ChargingStationsResponse)
def get_charging_stations(
    state: str = Query(..., min_length=2, max_length=2, description="Two-letter US state code, e.g. CA"),
    limit: int = Query(150, ge=1, le=500),
):
    if not OPENCHARGEMAP_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OPENCHARGEMAP_API_KEY is not configured. Get a free key at "
                   "https://openchargemap.org/site/loginprovider/register and set it "
                   "as an environment variable to enable this endpoint.",
        )

    cache_key = (state.upper(), limit)
    now = time.time()
    cached = _cache.get(cache_key)
    if cached and now - cached[0] < CACHE_TTL_S:
        return cached[1]

    try:
        r = requests.get(
            OCM_BASE,
            params={
                "output": "json",
                "countrycode": "US",
                "stateorprovince": state.upper(),
                "maxresults": limit,
                "compact": "false",
                "verbose": "false",
            },
            headers={"X-API-Key": OPENCHARGEMAP_API_KEY},
            timeout=10,
        )
        r.raise_for_status()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"OpenChargeMap request failed: {e}")

    raw_list = r.json()
    stations = [s for s in (_reshape(item) for item in raw_list) if s is not None]
    result = ChargingStationsResponse(stations=stations, count=len(stations))
    _cache[cache_key] = (now, result)
    return result
