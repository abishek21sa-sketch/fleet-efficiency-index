"use client";

import { useEffect, useRef, useCallback } from "react";
import type { LeaderboardRow, SafetyData } from "@/lib/api";
import { el, cssv, fmt, showTip, hideTip } from "@/lib/chart-utils";

const M5 = { top: 20, right: 24, bottom: 34, left: 38 };
const W5 = 920;
const H5 = 380;
const plotW5 = W5 - M5.left - M5.right;
const plotH5 = H5 - M5.top - M5.bottom;

export default function SafetySection({ leaderboard, safety }: { leaderboard: LeaderboardRow[]; safety: SafetyData | null }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || !safety) return;
    svg.innerHTML = "";
    const brandMpg: Record<string, number> = {};
    leaderboard.forEach((r) => { brandMpg[r.make] = r.avg_mpg; });
    const points = Object.entries(safety.brands)
      .filter(([make, b]) => b.avg_safety_rating != null && brandMpg[make] != null && brandMpg[make] < 70)
      .map(([make, b]) => ({ make, mpg: brandMpg[make], rating: b.avg_safety_rating as number, models: b.models_sampled }))
      .sort((a, b) => a.mpg - b.mpg);

    if (points.length === 0) return;
    const xMax = Math.ceil(Math.max(...points.map((p) => p.mpg)) / 5) * 5 + 3;
    const xMin = Math.floor(Math.min(...points.map((p) => p.mpg)) / 5) * 5 - 3;
    const yMin = 3.5, yMax = 5.3;
    const xScale = (v: number) => M5.left + ((v - xMin) / (xMax - xMin)) * plotW5;
    const yScale = (v: number) => M5.top + plotH5 - ((v - yMin) / (yMax - yMin)) * plotH5;

    const g = el("g", {});
    [4, 4.5, 5].forEach((v) => {
      const y = yScale(v);
      g.appendChild(el("line", { class: "gridline", x1: M5.left, x2: W5 - M5.right, y1: y, y2: y }));
      const t = el("text", { class: "axis-text", x: M5.left - 8, y: y + 3, "text-anchor": "end" });
      t.textContent = `${v.toFixed(1)}★`;
      g.appendChild(t);
    });
    for (let v = Math.ceil(xMin / 10) * 10; v <= xMax; v += 10) {
      const t = el("text", { class: "axis-text", x: xScale(v), y: H5 - M5.bottom + 18, "text-anchor": "middle" });
      t.textContent = `${v} MPG`;
      g.appendChild(t);
    }
    svg.appendChild(g);

    const blue = cssv("--blue");
    points.forEach((p, i) => {
      const cx = xScale(p.mpg), cy = yScale(p.rating);
      const hit = el("circle", { cx, cy, r: 14, fill: "transparent" });
      const dot = el("circle", { cx, cy, r: 4, fill: blue, stroke: cssv("--surface"), "stroke-width": 2 });
      const labelUp = i % 2 === 0;
      const ly = labelUp ? cy - 12 : cy + 18;
      const lbl = el("text", { class: "end-label", x: cx, y: ly, "text-anchor": "middle" });
      lbl.textContent = p.make;
      hit.addEventListener("pointerenter", (evt) => {
        dot.setAttribute("r", "6");
        const rectBox = svg.getBoundingClientRect();
        showTip(
          evt.clientX - rectBox.left,
          evt.clientY - rectBox.top,
          `<div class="t-year">${p.make.toUpperCase()}</div><div class="t-row"><span class="t-name">NHTSA overall rating</span><span class="t-val">${p.rating.toFixed(1)} / 5</span></div><div class="t-row"><span class="t-name">Avg. combined</span><span class="t-val">${fmt(p.mpg, 1)} MPG</span></div><div class="t-row"><span class="t-name" style="opacity:.65">Sampled</span><span class="t-val" style="font-weight:400">${p.models.join(", ")}</span></div>`
        );
      });
      hit.addEventListener("pointerleave", () => {
        dot.setAttribute("r", "4");
        hideTip();
      });
      svg.appendChild(dot);
      svg.appendChild(lbl);
      svg.appendChild(hit);
    });
  }, [leaderboard, safety]);

  useEffect(() => {
    draw();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    return () => mq.removeEventListener("change", draw);
  }, [draw]);

  if (!safety) return null;

  const nBrandsTotal = Object.keys(safety.brands).length;
  const nHit = Object.values(safety.brands).filter((b) => b.safety_samples_n > 0).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">09 &mdash; SAFETY</div>
          <h2>Safety vs. efficiency, by brand</h2>
          <p className="desc">
            NHTSA overall 5-star safety rating against combined MPG, one point per major brand. Tests whether efficient vehicles
            trade away crash safety &mdash; a fair worry for older, lighter economy cars, less so for the modern fleet.
          </p>
        </div>
      </div>
      <div className="chart-wrap">
        <svg className="chart" ref={svgRef} viewBox={`0 0 ${W5} ${H5}`} />
      </div>
      <p className="note">
        Methodology: safety ratings matched for {nHit} of {nBrandsTotal} major brands (NHTSA doesn&apos;t star-rate every trim,
        and EPA&apos;s most-tested trims for some performance-focused brands are niche variants NHTSA never rated &mdash; e.g.
        BMW&apos;s EPA sample happened to be the M2/Z4/M850i, not the mainstream 3 Series/X5). Read this as a spot-check, not a
        full census: nearly every matched brand clears 5 stars, which is itself the finding &mdash; modern crash safety and fuel
        efficiency aren&apos;t in tension the way 1980s economy cars suggested.
      </p>
    </div>
  );
}
