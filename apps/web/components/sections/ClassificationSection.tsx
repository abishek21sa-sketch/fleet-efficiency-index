import type { ClassifierData } from "@/lib/api";
import { commas } from "@/lib/chart-utils";

export default function ClassificationSection({ classifier }: { classifier: ClassifierData }) {
  const n = classifier.classes.length;
  const rowTotals = classifier.confusion_matrix.map((row) => row.reduce((a, b) => a + b, 0));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">08 &mdash; CLASSIFICATION</div>
          <h2>Guessing the powertrain from the body</h2>
          <p className="desc">
            A Random Forest classifier predicting powertrain family &mdash; gasoline, diesel, hybrid, or fully electric &mdash;
            from body style, drivetrain, engine displacement and model year alone. Confusion matrix on {commas(classifier.n_test)}{" "}
            held-out vehicles, rows normalized to the actual class.
          </p>
        </div>
      </div>
      <div className="cm-wrap">
        <div className="cm-axis-label">ACTUAL</div>
        <div>
          <div className="cm-top-label" style={{ gridColumn: "unset", marginBottom: 4 }}>
            PREDICTED &rarr;
          </div>
          <div className="cm-col-labels" style={{ gridTemplateColumns: `repeat(${n},1fr)` }}>
            {classifier.classes.map((cl) => (
              <span key={cl}>{cl}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 3, gridTemplateRows: `repeat(${n},1fr)` }}>
          {classifier.classes.map((cl) => (
            <div className="cm-row-label" key={cl}>
              {cl}
            </div>
          ))}
        </div>
        <div className="cm-grid" style={{ gridTemplateColumns: `repeat(${n},1fr)` }}>
          {classifier.confusion_matrix.map((row, i) =>
            row.map((val, j) => {
              const pct = rowTotals[i] ? val / rowTotals[i] : 0;
              const mix = Math.round(pct * 85 + (val > 0 ? 8 : 0));
              return (
                <div
                  className="cm-cell"
                  key={`${i}-${j}`}
                  title={`${classifier.classes[i]} predicted as ${classifier.classes[j]}: ${val} (${(pct * 100).toFixed(1)}% of actual ${classifier.classes[i]})`}
                  style={{
                    background: `color-mix(in srgb, var(--blue) ${mix}%, var(--surface-2))`,
                    color: pct > 0.45 ? "var(--page)" : "var(--ink)",
                  }}
                >
                  {commas(val)}
                </div>
              );
            })
          )}
        </div>
      </div>
      <p className="note">
        Overall accuracy <b className="mono" style={{ color: "var(--ink)" }}>{(classifier.accuracy * 100).toFixed(1)}%</b> across 4
        classes (25% = chance). Diagonal cells are correct calls; off-diagonal cells show where the model confuses one powertrain
        family for another &mdash; gasoline and hybrid share the most overlap, which tracks: a hybrid&apos;s engine displacement
        often looks identical to its gasoline-only sibling.
      </p>
    </div>
  );
}
