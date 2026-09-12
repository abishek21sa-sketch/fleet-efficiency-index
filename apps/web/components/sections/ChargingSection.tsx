"use client";

import { useState, useEffect } from "react";
import { fetchChargingStations, type ChargingResult } from "@/lib/charging";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export default function ChargingSection() {
  const [state, setState] = useState("CA");
  // Tagging the result with the state it was fetched for lets `loading` be
  // derived during render (comparing against the current `state`) instead of
  // an effect calling setState synchronously to flip a separate flag - avoids
  // react-hooks/set-state-in-effect and is the more idiomatic pattern besides.
  const [result, setResult] = useState<{ forState: string; fetched: ChargingResult } | null>(null);
  const loading = result?.forState !== state;

  useEffect(() => {
    let cancelled = false;
    fetchChargingStations(state).then((r) => {
      if (!cancelled) setResult({ forState: state, fetched: r });
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">11 &mdash; CHARGING</div>
          <h2>EV charging infrastructure, by state</h2>
          <p className="desc">
            Live from OpenChargeMap &mdash; a free, global, community-maintained charging-station database. The API key stays
            server-side (a key embedded in a static site&apos;s public JS would be scrapable); this is one of the reasons the
            full-stack rebuild exists.
          </p>
        </div>
      </div>

      <div className="field" style={{ maxWidth: 220 }}>
        <label>State</label>
        <select value={state} onChange={(e) => setState(e.target.value)}>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading && <p className="note">Loading&hellip;</p>}

      {!loading && result?.fetched.status === "not_configured" && (
        <div className="how">
          <b>Not configured yet &mdash;</b> {result.fetched.message} Once set, this section shows real charging-station data with
          no other code changes needed.
        </div>
      )}

      {!loading && result?.fetched.status === "error" && (
        <p className="note" style={{ color: "var(--s8)" }}>
          Couldn&apos;t load charging stations: {result.fetched.message}
        </p>
      )}

      {!loading && result?.fetched.status === "ok" && (
        <>
          <div className="table-scroll">
            <table className="board">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Operator</th>
                  <th>City</th>
                  <th className="num">Points</th>
                  <th>Connector types</th>
                  <th className="num">Max kW</th>
                </tr>
              </thead>
              <tbody>
                {result.fetched.data.stations.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.operator || <span style={{ color: "var(--muted)" }}>&mdash;</span>}</td>
                    <td>{s.city || "—"}</td>
                    <td className="num">{s.num_points}</td>
                    <td style={{ fontSize: 12 }}>{s.connection_types.join(", ") || "—"}</td>
                    <td className="num">{s.max_power_kw != null ? s.max_power_kw.toFixed(0) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            {result.fetched.data.count} stations returned for {state} (capped at 150 per request). Source: {result.fetched.data.source}.
          </p>
        </>
      )}
    </div>
  );
}
