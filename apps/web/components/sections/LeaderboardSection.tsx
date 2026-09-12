import type { LeaderboardRow } from "@/lib/api";
import { fmt } from "@/lib/chart-utils";

export default function LeaderboardSection({ leaderboard }: { leaderboard: LeaderboardRow[] }) {
  const maxMpg = Math.max(...leaderboard.map((r) => r.avg_mpg));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">04 &mdash; LEADERBOARD</div>
          <h2>Brand ranking, last 3 model years</h2>
          <p className="desc">Average combined MPG / MPGe across every trim tested, most recent 3 model years.</p>
        </div>
      </div>
      <div className="table-scroll">
        <table className="board">
          <thead>
            <tr>
              <th>#</th>
              <th>Make</th>
              <th className="num">Models tested</th>
              <th className="num">EV share</th>
              <th className="num">Avg. combined</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((r, i) => (
              <tr key={r.make}>
                <td className="rank">{i + 1}</td>
                <td>{r.make}</td>
                <td className="num">{r.model_count}</td>
                <td className="num">
                  {r.ev_pct > 0 ? (
                    <span className="ev-pill">{fmt(r.ev_pct, 0)}% EV</span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>&mdash;</span>
                  )}
                </td>
                <td className="num">
                  <div className="bar-cell">
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${((r.avg_mpg / maxMpg) * 100).toFixed(0)}%` }} />
                    </div>
                    <span>{fmt(r.avg_mpg, 1)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
