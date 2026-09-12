import { getDashboardData } from "@/lib/api";
import TrendSection from "@/components/sections/TrendSection";

function commas(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function Home() {
  const data = await getDashboardData();
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

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="section-index">STATUS</div>
            <h2>Phase 2 rebuild in progress</h2>
            <p className="desc">
              Section 01 (above) is fully ported and live against the FastAPI backend. The remaining 10 sections
              (electrification forecast, efficiency frontier, leaderboard, model bake-off, SHAP explainability,
              segmentation, classification, safety, recalls, and the multi-model predictor) are being ported next,
              in the same order as the static site.
            </p>
          </div>
        </div>
        <p className="note">
          The complete dashboard is live now as a static site: see the repo README for the link. This Next.js app
          will replace it once the chart port is complete.
        </p>
      </div>
    </div>
  );
}
