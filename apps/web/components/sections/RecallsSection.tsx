import type { SafetyData } from "@/lib/api";

export default function RecallsSection({ safety }: { safety: SafetyData | null }) {
  if (!safety) return null;

  const rows = Object.entries(safety.brands)
    .map(([make, b]) => ({ make, ...b }))
    .sort((a, b) => b.total_recalls_sampled - a.total_recalls_sampled);
  const maxRecalls = Math.max(...rows.map((r) => r.total_recalls_sampled), 1);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">10 &mdash; RECALLS</div>
          <h2>Recall frequency by brand</h2>
          <p className="desc">
            Total NHTSA recall count across each brand&apos;s most-tested recent models. Not normalized by vehicles sold &mdash;
            a proxy for recall activity, not a per-vehicle recall rate.
          </p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="board">
          <thead>
            <tr>
              <th>#</th>
              <th>Make</th>
              <th className="num">Models sampled</th>
              <th className="num">Model years</th>
              <th className="num">Recalls (sampled)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.make} title={`Sampled: ${r.models_sampled.join(", ")} (model years ${r.years_sampled.join("–")})`}>
                <td className="rank">{i + 1}</td>
                <td>{r.make}</td>
                <td className="num">{r.models_sampled.length}</td>
                <td className="num">{r.years_sampled.join("–")}</td>
                <td className="num">
                  <div className="bar-cell">
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${((r.total_recalls_sampled / maxRecalls) * 100).toFixed(0)}%`, background: "var(--accent)" }}
                      />
                    </div>
                    <span>{r.total_recalls_sampled}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Source: <span className="mono">api.nhtsa.gov/recalls</span> and <span className="mono">api.nhtsa.gov/SafetyRatings</span>,
        both free, no API key. Sampled to each brand&apos;s 3 most-tested models across its 2 most recent EPA model years (not the
        full 50K-row dataset) to stay light on a free government API &mdash; see the methodology note above for match-rate
        honesty.
      </p>
    </div>
  );
}
