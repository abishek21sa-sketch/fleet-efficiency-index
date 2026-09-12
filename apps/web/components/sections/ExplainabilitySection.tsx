import type { FeatureImportanceRow } from "@/lib/api";

export default function ExplainabilitySection({
  featureImportance,
  shapImportance,
}: {
  featureImportance: FeatureImportanceRow[];
  shapImportance?: FeatureImportanceRow[];
}) {
  const importanceData = shapImportance || featureImportance;
  const max = Math.max(...importanceData.map((f) => f.pct));

  let compareNote: string | null = null;
  if (shapImportance && featureImportance) {
    const shapTop = shapImportance[0];
    const oldMatch = featureImportance.find((f) => f.label === shapTop.label);
    if (oldMatch && Math.abs(oldMatch.pct - shapTop.pct) > 10) {
      compareNote = `Worth flagging: the Random Forest's built-in (impurity-based) importance put ${shapTop.label.toLowerCase()} at ${oldMatch.pct}% — SHAP puts it at ${shapTop.pct}%.`;
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">06 &mdash; EXPLAINABILITY</div>
          <h2>What actually drives fuel economy</h2>
          <p className="desc">
            SHAP values from the Random Forest (mean |SHAP| across a 1,500-vehicle sample, aggregated back from one-hot categories
            to their parent field) &mdash; a game-theoretic attribution that doesn&apos;t share impurity-based feature
            importance&apos;s bias toward high-cardinality fields.
          </p>
        </div>
      </div>
      <div>
        {importanceData.map((f) => (
          <div className="imp-row" key={f.label}>
            <div className="imp-label">{f.label}</div>
            <div className="imp-track">
              <div className="imp-fill" style={{ width: `${((f.pct / max) * 100).toFixed(0)}%` }} />
            </div>
            <div className="imp-val">{f.pct.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      {compareNote && (
        <p className="note">
          {compareNote} That&apos;s not noise, it&apos;s a known bias: impurity-based importance systematically over-credits
          continuous/high-cardinality features like displacement over categorical ones. SHAP&apos;s game-theoretic attribution
          (Shapley values from cooperative game theory) doesn&apos;t share that bias, which is the actual reason to prefer it
          here, not just that it sounds more rigorous.
        </p>
      )}
    </div>
  );
}
