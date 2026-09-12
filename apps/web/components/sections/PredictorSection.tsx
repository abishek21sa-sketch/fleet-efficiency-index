"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { ModelData, BakeoffRow } from "@/lib/api";
import { predictRegression, predictPowertrain, predictCluster, type RegressionModelKey } from "@/lib/api";
import { fmt } from "@/lib/chart-utils";

interface Spec {
  displ: number;
  cylinders: number;
  year: number;
  drive_s: string;
  vclass_s: string;
  trany_s: string;
  fuelType1: string;
}

const CAT_GROUP_LABEL: Record<string, string> = {
  drive_s: "Drivetrain",
  vclass_s: "Vehicle class",
  trany_s: "Transmission",
  fuelType1: "Fuel grade",
};
const FEAT_LABEL: Record<string, string> = { displ: "Engine displacement", cylinders: "Cylinder count", year: "Model year" };

function buildFeatVec(spec: Spec, model: ModelData): Record<string, number> {
  const vec: Record<string, number> = {};
  model.features_num.forEach((f) => { vec[f] = spec[f as keyof Spec] as number; });
  model.features_cat.forEach((f) => {
    model.categories[f].forEach((cat) => {
      vec[`${f}_${cat}`] = spec[f as keyof Spec] === cat ? 1 : 0;
    });
  });
  return vec;
}

function predictRidgeLocal(vec: Record<string, number>, ridge: ModelData["ridge_full"]): number {
  let y = ridge.intercept;
  for (const k in vec) y += (ridge.coefs[k] || 0) * vec[k];
  return y;
}

function predictTreeLocal(node: ModelData["tree_json"], vec: Record<string, number>): number {
  let n = node;
  while (n.leaf === undefined) {
    n = (vec[n.f!] <= n.th!) ? n.l! : n.r!;
  }
  return n.leaf;
}

const API_MODELS: { key: RegressionModelKey; name: string }[] = [
  { key: "random_forest", name: "Random Forest" },
  { key: "gradient_boosting", name: "Gradient Boosting" },
  { key: "mlp", name: "Neural Net" },
];

export default function PredictorSection({ model, bakeoff }: { model: ModelData; bakeoff: BakeoffRow[] }) {
  const [spec, setSpec] = useState<Spec>({
    displ: 2.0, cylinders: 4, year: 2024, drive_s: "FWD", vclass_s: "Midsize Car", trany_s: "Automatic", fuelType1: "Regular Gasoline",
  });
  const [apiResults, setApiResults] = useState<Record<string, number | null>>({});
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [classifier, setClassifier] = useState<{ predicted_class: string; probabilities: Record<string, number> } | null>(null);
  const [cluster, setCluster] = useState<{ cluster_id: number; cluster_name: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vec = useMemo(() => buildFeatVec(spec, model), [spec, model]);
  const ridgeVal = useMemo(() => Math.max(8, predictRidgeLocal(vec, model.ridge_full)), [vec, model]);
  const treeVal = useMemo(() => Math.max(8, predictTreeLocal(model.tree_json, vec)), [vec, model]);

  const contributions = useMemo(() => {
    if (!model.ridge_full.feature_baseline) return [];
    const rows: { label: string; value: number }[] = [];
    model.features_num.forEach((k) => {
      const value = (model.ridge_full.coefs[k] || 0) * (vec[k] - (model.ridge_full.feature_baseline![k] || 0));
      rows.push({ label: FEAT_LABEL[k], value });
    });
    model.features_cat.forEach((f) => {
      const groupSum = model.categories[f].reduce((sum, cat) => {
        const k = `${f}_${cat}`;
        return sum + (model.ridge_full.coefs[k] || 0) * (vec[k] - (model.ridge_full.feature_baseline![k] || 0));
      }, 0);
      rows.push({ label: `${CAT_GROUP_LABEL[f]}: ${spec[f as keyof Spec]}`, value: groupSum });
    });
    return rows.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }, [vec, model, spec]);

  // Debounced live-API calls: instant client-side math (ridge/tree above) needs no
  // debounce, but firing 5 network requests on every slider-drag tick would hammer
  // the backend, so the API-backed predictions settle 300ms after input stops.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setApiLoading(true);
      setApiError(false);
      Promise.all(API_MODELS.map((m) => predictRegression(m.key, spec)))
        .then((results) => {
          const next: Record<string, number> = {};
          results.forEach((r, i) => { next[API_MODELS[i].key] = r.predicted_combined_mpg; });
          setApiResults(next);
        })
        .catch(() => setApiError(true))
        .finally(() => setApiLoading(false));

      predictPowertrain({ displ: spec.displ, cylinders: spec.cylinders, year: spec.year, vclass_s: spec.vclass_s, drive_s: spec.drive_s })
        .then(setClassifier)
        .catch(() => setClassifier(null));

      // Physics-based CO2 estimate (EPA constant: ~8,887 g CO2/gal gasoline,
      // ~10,180 g CO2/gal diesel) from the best available MPG prediction - the
      // cluster model was trained on real vehicles where CO2 correlates with
      // fuel burned, and defaulting it to 0 would misread every efficient gas
      // car as looking electric (K-means' Electrified segment is 0-displacement
      // AND 0-CO2), not just low-displacement.
      const gPerGal = spec.fuelType1 === "Diesel" ? 10180 : 8887;
      const bestMpg = apiResults.random_forest ?? ridgeVal;
      predictCluster({ comb08: bestMpg, displ: spec.displ, cylinders: spec.cylinders, co2_gpm: gPerGal / bestMpg })
        .then(setCluster)
        .catch(() => setCluster(null));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // apiResults.random_forest and ridgeVal are intentionally excluded: ridgeVal is
    // a pure function of spec (already a dep) via useMemo above, and including
    // apiResults.random_forest - an output of this same effect - would refire the
    // cluster call every time the RF response lands instead of once per spec change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const ridgeBake = bakeoff.find((m) => m.name === "Ridge Regression");
  const diff = treeVal - ridgeVal;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">11 &mdash; PREDICTOR</div>
          <h2>Combined-MPG predictor</h2>
          <p className="desc">
            Ridge and a decision tree run instantly, client-side (ported to plain JS, no network round-trip). Random Forest,
            Gradient Boosting, and the Neural Net call the live FastAPI backend &mdash; along with the powertrain classifier and
            the nearest market segment.
          </p>
        </div>
      </div>
      <div className="predictor">
        <div>
          <div className="field-grid">
            <div className="field">
              <label>Vehicle class</label>
              <select value={spec.vclass_s} onChange={(e) => setSpec({ ...spec, vclass_s: e.target.value })}>
                {model.categories.vclass_s.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Drivetrain</label>
              <select value={spec.drive_s} onChange={(e) => setSpec({ ...spec, drive_s: e.target.value })}>
                {model.categories.drive_s.filter((v) => v !== "Unknown").map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Transmission</label>
              <select value={spec.trany_s} onChange={(e) => setSpec({ ...spec, trany_s: e.target.value })}>
                {model.categories.trany_s.filter((v) => v !== "Unknown").map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Fuel grade</label>
              <select value={spec.fuelType1} onChange={(e) => setSpec({ ...spec, fuelType1: e.target.value })}>
                {model.categories.fuelType1.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>
              Engine displacement <span className="fv">{spec.displ.toFixed(1)} L</span>
            </label>
            <input type="range" min={0.9} max={8.0} step={0.1} value={spec.displ} onChange={(e) => setSpec({ ...spec, displ: +e.target.value })} />
          </div>
          <div className="field">
            <label>
              Cylinders <span className="fv">{spec.cylinders}</span>
            </label>
            <input type="range" min={3} max={16} step={1} value={spec.cylinders} onChange={(e) => setSpec({ ...spec, cylinders: +e.target.value })} />
          </div>
          <div className="field">
            <label>
              Model year <span className="fv">{spec.year}</span>
            </label>
            <input type="range" min={1984} max={2026} step={1} value={spec.year} onChange={(e) => setSpec({ ...spec, year: +e.target.value })} />
          </div>
        </div>

        <div className="readout">
          <div className="lbl">Predicted combined fuel economy</div>
          <div className="dual-hero">
            <div className="slot a">
              <div className="mname">Ridge regression</div>
              <div className="mval">{ridgeVal.toFixed(1)}<small>MPG</small></div>
            </div>
            <div className="slot b">
              <div className="mname">Decision tree</div>
              <div className="mval">{treeVal.toFixed(1)}<small>MPG</small></div>
            </div>
          </div>
          <div className="delta-note">
            Tree {diff >= 0 ? "+" : ""}{diff.toFixed(1)} MPG vs. ridge &mdash; the tree can capture step-changes (e.g. class or
            drivetrain cutoffs) a straight line smooths over.
          </div>

          <div className="model-grid">
            {API_MODELS.map((m) => (
              <div className="model-card" key={m.key}>
                <div className="mname">{m.name}</div>
                <div className="mval">
                  {apiResults[m.key] != null ? fmt(apiResults[m.key], 1) : apiLoading ? "…" : "--"}
                  <small>MPG</small>
                </div>
                <div className="mbadge">Live API</div>
              </div>
            ))}
          </div>
          {apiError && (
            <div className="delta-note" style={{ color: "var(--s8)" }}>
              Couldn&apos;t reach the backend for the live models &mdash; is the API running?
            </div>
          )}

          {(classifier || cluster) && (
            <div style={{ width: "100%" }}>
              {classifier && (
                <div className="info-row">
                  <span>Predicted powertrain family</span>
                  <b>
                    {classifier.predicted_class} ({(classifier.probabilities[classifier.predicted_class] * 100).toFixed(0)}%)
                  </b>
                </div>
              )}
              {cluster && (
                <div className="info-row">
                  <span>Nearest market segment</span>
                  <b>{cluster.cluster_name}</b>
                </div>
              )}
            </div>
          )}

          <div className="shap-panel">
            <div className="shap-title">Why this ridge prediction &mdash; linear SHAP breakdown</div>
            <div>
              {contributions.map((c) => {
                const pos = c.value >= 0;
                const maxAbs = Math.max(...contributions.map((x) => Math.abs(x.value)), 0.1);
                const widthPct = Math.min(100, (Math.abs(c.value) / maxAbs) * 100);
                return (
                  <div className="shap-row" key={c.label}>
                    <div className="shap-label">{c.label}</div>
                    <div className="shap-track">
                      <div className={`shap-bar ${pos ? "pos" : "neg"}`} style={{ width: `${widthPct / 2}%` }} />
                    </div>
                    <div className={`shap-val ${pos ? "pos" : "neg"}`}>
                      {pos ? "+" : ""}
                      {c.value.toFixed(1)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="spec-echo">
            {spec.vclass_s} &middot; {spec.drive_s} &middot; {spec.trany_s}
            <br />
            {spec.displ.toFixed(1)}L / {spec.cylinders}-cyl &middot; {spec.fuelType1} &middot; MY{spec.year}
          </div>
          <div className="model-stats">
            <div>
              <b>{ridgeBake ? ridgeBake.r2_mean.toFixed(2) : "--"}</b>Ridge R&sup2;
            </div>
            <div>
              <b>&plusmn;{ridgeBake ? ridgeBake.mae_mean.toFixed(1) : "--"}</b>Ridge MAE
            </div>
            <div>
              <b>{model.n_samples.toLocaleString("en-US")}</b>training rows
            </div>
          </div>
        </div>
      </div>
      <div className="how">
        <b>How it works &mdash;</b> ridge and the tree run the exact dot-product / branch traversal client-side, ported from the
        same scikit-learn Pipelines. Random Forest, Gradient Boosting, and the Neural Net are too large to port to JS
        (Random Forest alone is ~14MB of trees) &mdash; those three, plus the powertrain classifier and the K-means segment
        assignment, call the FastAPI backend live, which loads the actual pickled sklearn Pipelines once at startup and
        predicts directly from the spec sheet you&apos;re editing.
      </div>
    </div>
  );
}
