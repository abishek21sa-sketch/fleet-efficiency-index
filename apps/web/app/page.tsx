import { getDashboardData, getSafetyData } from "@/lib/api";
import TrendSection from "@/components/sections/TrendSection";
import ElectrificationSection from "@/components/sections/ElectrificationSection";
import FrontierSection from "@/components/sections/FrontierSection";
import LeaderboardSection from "@/components/sections/LeaderboardSection";
import BakeoffSection from "@/components/sections/BakeoffSection";
import ExplainabilitySection from "@/components/sections/ExplainabilitySection";
import SegmentationSection from "@/components/sections/SegmentationSection";
import ClassificationSection from "@/components/sections/ClassificationSection";
import SafetySection from "@/components/sections/SafetySection";
import RecallsSection from "@/components/sections/RecallsSection";
import ChargingSection from "@/components/sections/ChargingSection";
import PredictorSection from "@/components/sections/PredictorSection";
import type { SafetyData } from "@/lib/api";

// Forces per-request rendering instead of build-time static generation.
// Without this, `next build` tries to fetch /api/dashboard-data at BUILD
// time to pre-render the page - which requires the FastAPI backend to be
// reachable during the Vercel build (fragile: couples build success to
// Render's uptime at that exact moment) and fails outright in CI, where no
// backend is running at all. Dynamic rendering defers the fetch to request
// time, where the `next: { revalidate: 3600 }' on the fetch itself still
// caches the response for an hour - same caching behavior, just resolved
// per-request instead of at build.
export const dynamic = "force-dynamic";

function commas(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function Home() {
  const data = await getDashboardData();
  let safety: SafetyData | null = null;
  try {
    safety = await getSafetyData();
  } catch {
    // Safety data is a supplementary NHTSA cross-reference — if it's
    // unavailable, the two sections that depend on it just don't render
    // rather than failing the whole page (same graceful-degradation the
    // static site's `if(!SAFETY_DATA) return;` guards did).
  }
  const meta = data.meta;
  const latest = data.industry_trend[data.industry_trend.length - 1];
  const bestR2 = Math.max(...data.bakeoff.map((b) => b.r2_mean));

  const kpis: [string, string, string][] = [
    ["Vehicles analyzed", commas(meta.total_records), ""],
    ["Model years covered", String(meta.year_max - meta.year_min + 1), "yrs"],
    ["Makes tracked", String(meta.n_makes), ""],
    [`EV share, ${latest.year}`, latest.ev_pct.toFixed(1), "%"],
    ["ML models trained", String(data.bakeoff.length + 2), ""],
    ["Best model R²", bestR2.toFixed(2), ""],
  ];

  return (
    <div className="wrap">
      <div className="masthead">
        <span className="tick tl" />
        <span className="tick tr" />
        <span className="tick bl" />
        <span className="tick br" />
        <div className="eyebrow">
          <span className="dot" />
          EPA &middot; NHTSA DATA &middot; MODEL YEARS 1984&ndash;2026 &middot; SAE / EPA TEST-CYCLE STANDARDS
        </div>
        <h1>Fleet Efficiency Index</h1>
        <p className="sub">
          A full-scale data-analysis &amp; machine-learning pipeline over every EPA-tested vehicle sold in the United
          States &mdash; Tesla to Cadillac, Audi to Ram &mdash; spanning four decades of the fleet, cross-referenced
          against NHTSA safety ratings and recall history. This rebuild serves all 7 trained models live from a real
          backend, not just the 2 portable enough to run client-side.
        </p>
        <div className="kpi-row">
          {kpis.map(([lbl, val, unit]) => (
            <div className="kpi" key={lbl}>
              <div className="lbl">{lbl}</div>
              <div className="val num">
                {val}
                {unit && <small>{unit}</small>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <TrendSection trends={data.trends} />
      <ElectrificationSection industryTrend={data.industry_trend} forecast={data.ev_forecast} />
      <FrontierSection scatter={data.scatter} />
      <LeaderboardSection leaderboard={data.leaderboard} />
      <BakeoffSection bakeoff={data.bakeoff} tuning={data.tuning} />
      <ExplainabilitySection featureImportance={data.feature_importance} shapImportance={data.shap_importance} />
      <SegmentationSection points={data.clusters.points} summary={data.clusters.summary} silhouette={data.silhouette} />
      <ClassificationSection classifier={data.classifier} />
      <SafetySection leaderboard={data.leaderboard} safety={safety} />
      <RecallsSection safety={safety} />
      <ChargingSection />
      <PredictorSection model={data.model} bakeoff={data.bakeoff} />

      <footer>
        <span>
          Sources:{" "}
          <a href="https://www.fueleconomy.gov/feg/download.shtml" target="_blank" rel="noopener">
            EPA / DOE fueleconomy.gov
          </a>{" "}
          (50K+ vehicle records, 146 makes) &middot;{" "}
          <a href="https://www.nhtsa.gov/nhtsa-datasets-and-apis" target="_blank" rel="noopener">
            NHTSA
          </a>{" "}
          safety ratings &amp; recalls &middot; 7 ML models trained, 5 running live via this app&apos;s own API.
        </span>
        <span className="mono">FLEET EFFICIENCY INDEX &middot; NEXT.JS + FASTAPI REBUILD</span>
      </footer>
    </div>
  );
}
