"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { ClusterPoint, ClusterSummary, SilhouetteEntry } from "@/lib/api";
import { el, cssv, slotColor, fmt, commas, showTip, hideTip } from "@/lib/chart-utils";

const M4 = { top: 14, right: 20, bottom: 34, left: 38 };
const W4 = 920;
const H4 = 380;
const plotW4 = W4 - M4.left - M4.right;
const plotH4 = H4 - M4.top - M4.bottom;

export default function SegmentationSection({
  points,
  summary,
  silhouette,
}: {
  points: ClusterPoint[];
  summary: ClusterSummary[];
  silhouette?: { by_k: SilhouetteEntry[]; best_k: number };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [legend, setLegend] = useState<{ label: string; color: string }[]>([]);

  const labelOf = useCallback((id: number) => summary.find((s) => s.id === id)?.label ?? `Segment ${id}`, [summary]);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = "";
    const counts: Record<number, number> = {};
    points.forEach((p) => { counts[p.cluster] = (counts[p.cluster] || 0) + 1; });
    const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => +k);
    const colorFor = (id: number) => { const i = top3.indexOf(id); return i >= 0 ? slotColor(i) : cssv("--other"); };

    const xMax = Math.ceil(Math.max(...points.map((p) => p.displ)) * 10) / 10 + 0.3;
    const yMin = Math.floor(Math.min(...points.map((p) => p.mpg)) / 10) * 10 - 5;
    const yMax = Math.ceil(Math.max(...points.map((p) => p.mpg)) / 10) * 10 + 4;
    const xScale = (v: number) => M4.left + (v / xMax) * plotW4;
    const yScale = (v: number) => M4.top + plotH4 - ((v - yMin) / (yMax - yMin)) * plotH4;

    const g = el("g", {});
    for (let i = 0; i <= 5; i++) {
      const v = yMin + ((yMax - yMin) * i) / 5, y = yScale(v);
      g.appendChild(el("line", { class: "gridline", x1: M4.left, x2: W4 - M4.right, y1: y, y2: y }));
      const t = el("text", { class: "axis-text", x: M4.left - 8, y: y + 3, "text-anchor": "end" });
      t.textContent = String(Math.round(v));
      g.appendChild(t);
    }
    for (let v = 1; v <= xMax; v += 1) {
      const t = el("text", { class: "axis-text", x: xScale(v), y: H4 - M4.bottom + 18, "text-anchor": "middle" });
      t.textContent = `${v.toFixed(0)}L`;
      g.appendChild(t);
    }
    svg.appendChild(g);

    points.forEach((p) => {
      const cx = xScale(p.displ), cy = yScale(p.mpg), color = colorFor(p.cluster);
      const hit = el("circle", { cx, cy, r: 12, fill: "transparent" });
      const dot = el("circle", { cx, cy, r: 3, fill: color, opacity: 0.85 });
      hit.addEventListener("pointerenter", (evt) => {
        dot.setAttribute("r", "5");
        dot.setAttribute("stroke", cssv("--surface"));
        dot.setAttribute("stroke-width", "2");
        const rectBox = svg.getBoundingClientRect();
        showTip(
          evt.clientX - rectBox.left,
          evt.clientY - rectBox.top,
          `<div class="t-year">${p.make.toUpperCase()}</div><div class="t-row"><span class="t-key" style="background:${color}"></span><span class="t-name">${labelOf(p.cluster)}</span></div><div class="t-row"><span class="t-name">Displacement</span><span class="t-val">${fmt(p.displ, 1)} L</span></div><div class="t-row"><span class="t-name">Combined</span><span class="t-val">${fmt(p.mpg, 0)} MPG</span></div>`
        );
      });
      hit.addEventListener("pointerleave", () => {
        dot.removeAttribute("stroke");
        dot.setAttribute("r", "3");
        hideTip();
      });
      svg.appendChild(dot);
      svg.appendChild(hit);
    });

    const otherLabels = summary.filter((s) => !top3.includes(s.id)).map((s) => s.label);
    const newLegend = top3.map((id, i) => ({ label: labelOf(id), color: slotColor(i) }));
    if (otherLabels.length) newLegend.push({ label: otherLabels.join(" / "), color: cssv("--other") });
    setLegend(newLegend);
  }, [points, summary, labelOf]);

  useEffect(() => {
    draw();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    return () => mq.removeEventListener("change", draw);
  }, [draw]);

  const sortedSummary = [...summary].sort((a, b) => b.avg_mpg - a.avg_mpg);
  const maxSil = silhouette ? Math.max(...silhouette.by_k.map((d) => d.silhouette)) : 0;
  const bestEntry = silhouette?.by_k.find((d) => d.k === silhouette.best_k);
  const usedEntry = silhouette?.by_k.find((d) => d.k === 5);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">07 &mdash; SEGMENTATION</div>
          <h2>The market, clustered with no labels given</h2>
          <p className="desc">
            K-means (our own implementation &mdash; this host blocks scikit-learn&apos;s compiled clustering module) run on
            standardized combined MPG, displacement, cylinder count and tailpipe CO&sub2;, 1,200 vehicles from the last 5 model
            years. The algorithm was never told make, price, or class &mdash; these groupings emerged from the specs alone,
            shown here at <b style={{ color: "var(--ink)" }}>k=5</b>.
          </p>
        </div>
      </div>
      <div className="chart-wrap">
        <svg className="chart" ref={svgRef} viewBox={`0 0 ${W4} ${H4}`} />
      </div>
      <div className="legend-note">
        {legend.map((l) => (
          <span key={l.label}>
            <i style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
      <div className="table-scroll">
        <table className="board">
          <thead>
            <tr>
              <th>Segment</th>
              <th className="num">Vehicles</th>
              <th className="num">Avg. displacement</th>
              <th className="num">Avg. combined MPG</th>
            </tr>
          </thead>
          <tbody>
            {sortedSummary.map((s) => (
              <tr key={s.id}>
                <td>{s.label}</td>
                <td className="num">{commas(s.n)}</td>
                <td className="num">{s.avg_displ > 0 ? `${s.avg_displ.toFixed(1)} L` : "— (electric)"}</td>
                <td className="num">{s.avg_mpg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {silhouette && bestEntry && usedEntry && (
        <>
          <div style={{ marginTop: 16 }}>
            <div className="shap-title">Silhouette score by k (higher = more separated clusters)</div>
            {silhouette.by_k.map((d) => {
              const isUsed = d.k === 5;
              const isBest = d.k === silhouette.best_k;
              return (
                <div className="imp-row" key={d.k}>
                  <div className="imp-label">
                    k={d.k}
                    {isUsed ? " (shown above)" : ""}
                    {isBest ? " (statistical best)" : ""}
                  </div>
                  <div className="imp-track">
                    <div
                      className="imp-fill"
                      style={{ width: `${((d.silhouette / maxSil) * 100).toFixed(0)}%`, background: isBest ? "var(--accent)" : "var(--blue)" }}
                    />
                  </div>
                  <div className="imp-val">{d.silhouette.toFixed(3)}</div>
                </div>
              );
            })}
          </div>
          <p className="note">
            Honest methodology note: silhouette score says <b style={{ color: "var(--ink)" }}>k={silhouette.best_k}</b> is the
            statistically cleanest split (score {bestEntry.silhouette.toFixed(2)}) &mdash; we checked, and it&apos;s just
            electric vs. everything else (0L/92 MPG vs. 3.0L/23 MPG, verified directly). That&apos;s true but not very useful.
            We kept <b style={{ color: "var(--ink)" }}>k=5</b> (score {usedEntry.silhouette.toFixed(2)}) because five
            genuinely distinct, actionable market segments beat one trivially-correct binary split &mdash; interpretability
            over the silhouette-optimal answer, and we&apos;re telling you that trade-off rather than only showing the
            flattering number.
          </p>
        </>
      )}
    </div>
  );
}
