const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export interface TrendPoint {
  year: number;
  avg_mpg: number;
  ev_pct: number;
  count: number;
  avg_co2: number | null;
}

export interface IndustryTrendPoint {
  year: number;
  ev_pct: number;
  count: number;
}

export interface LeaderboardRow {
  make: string;
  avg_mpg: number;
  model_count: number;
  ev_pct: number;
}

export interface ScatterPoint {
  make: string;
  displ: number;
  mpg: number;
  vclass: string;
  cylinders: number;
}

export interface BakeoffRow {
  name: string;
  r2_mean: number;
  r2_std: number;
  mae_mean: number;
  mae_std: number;
  cv_time_s?: number;
  portable: boolean;
}

export interface FeatureImportanceRow {
  label: string;
  importance: number;
  pct: number;
}

export interface RidgeModel {
  intercept: number;
  coefs: Record<string, number>;
  feature_baseline?: Record<string, number>;
  baseline_prediction?: number;
}

export interface TreeNode {
  leaf?: number;
  f?: string;
  th?: number;
  l?: TreeNode;
  r?: TreeNode;
}

export interface ModelData {
  intercept: number;
  coefs: Record<string, number>;
  features_num: string[];
  features_cat: string[];
  categories: Record<string, string[]>;
  r2: number;
  mae: number;
  n_samples: number;
  tree_json: TreeNode;
  ridge_full: RidgeModel;
}

export interface ClusterPoint {
  make: string;
  displ: number;
  mpg: number;
  cluster: number;
}

export interface ClusterSummary {
  id: number;
  label: string;
  n: number;
  avg_mpg: number;
  avg_displ: number;
}

export interface ClassifierData {
  accuracy: number;
  classes: string[];
  confusion_matrix: number[][];
  n_train: number;
  n_test: number;
}

export interface TuningEntry {
  untuned_r2: number;
  tuned_r2: number;
  best_params: Record<string, string | number>;
}

export interface ForecastPoint {
  year: number;
  point: number;
  low: number;
  high: number;
}

export interface SilhouetteEntry {
  k: number;
  silhouette: number;
}

export interface DashboardData {
  meta: {
    total_records: number;
    year_min: number;
    year_max: number;
    n_makes: number;
    major_brands: string[];
    vclasses: string[];
    drives: string[];
    tranies: string[];
    fueltypes: string[];
  };
  trends: Record<string, TrendPoint[]>;
  industry_trend: IndustryTrendPoint[];
  leaderboard: LeaderboardRow[];
  scatter: ScatterPoint[];
  model: ModelData;
  feature_importance: FeatureImportanceRow[];
  shap_importance?: FeatureImportanceRow[];
  clusters: { summary: ClusterSummary[]; points: ClusterPoint[]; k: number };
  classifier: ClassifierData;
  bakeoff: BakeoffRow[];
  tuning?: Record<string, TuningEntry>;
  ev_forecast?: ForecastPoint[];
  silhouette?: { by_k: SilhouetteEntry[]; best_k: number };
}

export interface SafetyBrandEntry {
  avg_safety_rating: number | null;
  safety_samples_n: number;
  total_recalls_sampled: number;
  models_sampled: string[];
  years_sampled: number[];
}

export interface SafetyData {
  brands: Record<string, SafetyBrandEntry>;
  max_year: number;
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

export function getSafetyData() {
  return getJson<SafetyData>("/api/safety-data", { next: { revalidate: 3600 } });
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

export function predictPowertrain(spec: { displ: number; cylinders: number; year: number; vclass_s: string; drive_s: string }) {
  return getJson<{ predicted_class: string; probabilities: Record<string, number> }>(
    "/api/predict/powertrain",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec), cache: "no-store" }
  );
}

export function predictCluster(spec: { comb08: number; displ: number; cylinders: number; co2_gpm: number }) {
  return getJson<{ cluster_id: number; cluster_name: string }>(
    "/api/predict/cluster",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec), cache: "no-store" }
  );
}
