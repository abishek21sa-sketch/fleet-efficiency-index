const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export interface ChargingStation {
  id: number;
  name: string;
  operator: string | null;
  address: string;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
  num_points: number;
  connection_types: string[];
  max_power_kw: number | null;
  usage_cost: string | null;
}

export interface ChargingStationsResponse {
  stations: ChargingStation[];
  count: number;
  source: string;
}

export type ChargingResult =
  | { status: "ok"; data: ChargingStationsResponse }
  | { status: "not_configured"; message: string }
  | { status: "error"; message: string };

export async function fetchChargingStations(state: string): Promise<ChargingResult> {
  try {
    const res = await fetch(`${API_BASE}/api/charging-stations?state=${state}&limit=150`, { cache: "no-store" });
    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      return { status: "not_configured", message: body.detail || "Charging-station data isn't configured yet." };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { status: "error", message: `Request failed (${res.status}): ${body}` };
    }
    return { status: "ok", data: await res.json() };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Network error" };
  }
}
