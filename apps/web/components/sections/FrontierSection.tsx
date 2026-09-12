"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import type { ScatterPoint } from "@/lib/api";
import { el, cssv, slotColor, fmt } from "@/lib/chart-utils";
import { showTip, hideTip } from "@/lib/chart-utils";

const M3 = { top: 14, right: 20, bottom: 34, left: 38 };
const W3 = 920;
const H3 = 380;
const plotW3 = W3 - M3.left - M3.right;
const plotH3 = H3 - M3.top - M3.bottom;

export default function FrontierSection({ scatter }: { scatter: ScatterPoint[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [legend, setLegend] = useState<{ label: string; color: string }[]>([]);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = "";
    const data = scatter;
    const counts: Record<string, number> = {};
    data.forEach((p) => { counts[p.vclass] = (counts[p.vclass] || 0) + 1; });
    const top3 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    const colorFor = (v: string) => { const i = top3.indexOf(v); return i >= 0 ? slotColor(i) : cssv("--other"); };
    const labelFor = (v: string) => (top3.includes(v) ? v : "Other classes");

    const xMax = Math.ceil(Math.max(...data.map((p) => p.displ)) * 10) / 10 + 0.3;
    const yMin = Math.floor(Math.min(...data.map((p) => p.mpg)) / 10) * 10 - 5;
    const yMax = Math.ceil(Math.max(...data.map((p) => p.mpg)) / 10) * 10 + 2;
    const xScale = (v: number) => M3.left + (v / xMax) * plotW3;
    const yScale = (v: number) => M3.top + plotH3 - ((v - yMin) / (yMax - yMin)) * plotH3;

    const g = el("g", {});
    for (let i = 0; i <= 5; i++) {
      const v = yMin + ((yMax - yMin) * i) / 5, y = yScale(v);
      g.appendChild(el("line", { class: "gridline", x1: M3.left, x2: W3 - M3.right, y1: y, y2: y }));
      const t = el("text", { class: "axis-text", x: M3.left - 8, y: y + 3, "text-anchor": "end" });
      t.textContent = String(Math.round(v));
      g.appendChild(t);
    }
    for (let v = 1; v <= xMax; v += 1) {
      const x = xScale(v);
      const t = el("text", { class: "axis-text", x, y: H3 - M3.bottom + 18, "text-anchor": "middle" });
      t.textContent = `${v.toFixed(0)}L`;
      g.appendChild(t);
    }
    svg.appendChild(g);

    data.forEach((p) => {
      const cx = xScale(p.displ), cy = yScale(p.mpg), color = colorFor(p.vclass);
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
          `<div class="t-year">${p.make.toUpperCase()}</div><div class="t-row"><span class="t-key" style="background:${color}"></span><span class="t-name">${labelFor(p.vclass)}</span></div><div class="t-row"><span class="t-name">Displacement</span><span class="t-val">${fmt(p.displ, 1)} L / ${p.cylinders | 0}cyl</span></div><div class="t-row"><span class="t-name">Combined</span><span class="t-val">${fmt(p.mpg, 0)} MPG</span></div>`
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

    setLegend([
      ...top3.map((v, i) => ({ label: v, color: slotColor(i) })),
      { label: "Other classes", color: cssv("--other") },
    ]);
  }, [scatter]);

  useEffect(() => {
    draw();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", draw);
    return () => mq.removeEventListener("change", draw);
  }, [draw]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="section-index">03 &mdash; FRONTIER</div>
          <h2>Engine size vs. combined MPG</h2>
          <p className="desc">
            1,500 sampled vehicles from the last 5 model years. Larger engines trade away efficiency &mdash; except where hybrid
            drivetrains bend the curve.
          </p>
        </div>
      </div>
      <div className="chart-wrap">
        <svg className="chart" ref={svgRef} viewBox={`0 0 ${W3} ${H3}`} />
      </div>
      <div className="legend-note">
        {legend.map((l) => (
          <span key={l.label}>
            <i style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
