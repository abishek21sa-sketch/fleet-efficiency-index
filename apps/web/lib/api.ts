const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export interface DashboardData {
  meta: {
    total_records: number;
    year_min: number;
    year_max: number;
    n_makes: number;
  };
  industry_trend: { year: number; ev_pct: number; count: number }[];
  bakeoff: { name: string; r2_mean: number; mae_mean: number; portable: boolean }[];
  [key: string]: unknown;
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} returned ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getDashboardData() {
  return getJson<DashboardData>("/api/dashboard-data", { next: { revalidate: 3600 } });
}

export interface RegressionSpec {
  displ: number;
  cylinders: number;
  year: number;
  drive_s: string;
  vclass_s: string;
  trany_s: string;
  fuelType1: string;
}

export type RegressionModelKey = "ridge" | "decision_tree" | "random_forest" | "gradient_boosting" | "mlp";

export function predictRegression(modelKey: RegressionModelKey, spec: RegressionSpec) {
  return getJson<{ model: string; predicted_combined_mpg: number }>(
    `/api/predict/regression/${modelKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec), cache: "no-store" }
  );
}
