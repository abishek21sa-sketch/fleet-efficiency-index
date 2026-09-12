import type { BakeoffRow, TuningEntry } from "@/lib/api";

export default function BakeoffSection({
  bakeoff,
  tuning,
}: {
  bakeoff: BakeoffRow[];
  tuning?: Record<string, TuningEntry>;
}) {
  const maxR2 = Math.max(...bakeoff.map((m) => m.r2_mean));
  const sorted = [...bakeoff].sort((a, b) => b.r2_mean - a.r2_mean);
  const tuningRows: [string, TuningEntry][] = tuning
    ? [
        ["Random Forest", tuning.random_forest],
        ["Gradient Boosting", tuning.gradient_boosting],
      ].filter(([, t]) => t) as [string, TuningEntry][]
    : [];

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">05 &mdash; BAKE-OFF</div>
          <h2>Five algorithms, one target</h2>
          <p className="desc">
            5-fold cross-validation (48,324 vehicles, mean &plusmn; std across folds &mdash; not a single lucky split), five
            regression algorithms predicting combined MPG. Two are simple enough to run live in your browser &mdash; the rest
            trade portability for accuracy.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="board">
          <thead>
            <tr>
              <th>Model</th>
              <th></th>
              <th className="num">R&sup2; (mean &plusmn; std)</th>
              <th className="num">MAE (mean &plusmn; std)</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => (
              <tr key={m.name}>
                <td>{m.name}</td>
                <td>
                  {m.portable && (
                    <span className="ev-pill" style={{ background: "color-mix(in srgb, var(--s1) 16%, transparent)", color: "var(--s1)" }}>
                      LIVE BELOW
                    </span>
                  )}
                </td>
                <td className="num">
                  <div className="bar-cell">
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${((m.r2_mean / maxR2) * 100).toFixed(0)}%` }} />
                    </div>
                    <span>
                      {m.r2_mean.toFixed(3)} &plusmn; {m.r2_std.toFixed(3)}
                    </span>
                  </div>
                </td>
                <td className="num">
                  {m.mae_mean.toFixed(2)} &plusmn; {m.mae_std.toFixed(2)} MPG
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        R&sup2; measures share of MPG variance explained (1.0 = perfect); mean absolute error is in MPG. 5-fold CV means each
        model was trained and tested 5 times on different slices of the data &mdash; the &plusmn; spread tells you how much the
        score would move on a different sample, which a single 80/20 split can&apos;t show. Ensemble methods (Random Forest,
        Gradient Boosting) win on accuracy by capturing non-linear interactions a straight line can&apos;t &mdash; the trade-off
        is that their decision logic can&apos;t be reduced to a formula you can run without the library.
      </p>
      {tuningRows.length > 0 && (
        <div>
          <div className="shap-title" style={{ marginTop: 6 }}>
            RandomizedSearchCV tuning (15 iters, 3-fold, vs. the untuned CV score above)
          </div>
          {tuningRows.map(([name, t]) => {
            const delta = t.tuned_r2 - t.untuned_r2;
            const paramStr = Object.entries(t.best_params).map(([k, v]) => `${k}=${v}`).join(", ");
            return (
              <div className="imp-row" style={{ gridTemplateColumns: "150px 1fr auto" }} key={name}>
                <div className="imp-label">{name}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                  {paramStr}
                </div>
                <div className="imp-val" style={{ color: delta >= 0 ? "var(--blue)" : "var(--s8)" }}>
                  {t.untuned_r2.toFixed(3)} &rarr; {t.tuned_r2.toFixed(3)} ({delta >= 0 ? "+" : ""}
                  {delta.toFixed(3)})
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
