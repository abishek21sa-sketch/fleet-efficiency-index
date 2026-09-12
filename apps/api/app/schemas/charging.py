from pydantic import BaseModel


class ChargingStation(BaseModel):
    id: int
    name: str
    operator: str | None
    address: str
    city: str | None
    state: str | None
    lat: float
    lon: float
    num_points: int
    connection_types: list[str]
    max_power_kw: float | None
    usage_cost: str | None


class ChargingStationsResponse(BaseModel):
    stations: list[ChargingStation]
    count: int
    source: str = "OpenChargeMap (openchargemap.org)"
