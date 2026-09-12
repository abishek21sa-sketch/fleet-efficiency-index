"use client";

import { useEffect, useRef, useCallback } from "react";
import type { IndustryTrendPoint, ForecastPoint } from "@/lib/api";
import { el, cssv, fmt, commas, svgPoint, showTip, hideTip } from "@/lib/chart-utils";

const M2 = { top: 14, right: 70, bottom: 26, left: 38 };
const W2 = 920;
const H2 = 300;
const plotW2 = W2 - M2.left - M2.right;
const plotH2 = H2 - M2.top - M2.bottom;

export default function ElectrificationSection({
  industryTrend,
  forecast,
}: {
  industryTrend: IndustryTrendPoint[];
  forecast?: ForecastPoint[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = "";
    const pts = industryTrend;
    const fc = forecast || [];
    const xMin = pts[0].year;
    const xMaxHist = pts[pts.length - 1].year;
    const xMax = fc.length ? fc[fc.length - 1].year : xMaxHist;
    const yDataMax = Math.max(...pts.map((p) => p.ev_pct), ...fc.map((f) => f.high));
    const yMax = Math.ceil(yDataMax / 5) * 5 + 5;
    const xScale = (y: number) => M2.left + ((y - xMin) / (xMax - xMin)) * plotW2;
    const yScale = (v: number) => M2.top + plotH2 - (v / yMax) * plotH2;

    const g = el("g", {});
    for (let i = 0; i <= 4; i++) {
      const v = (yMax * i) / 4, y = yScale(v);
      g.appendChild(el("line", { class: "gridline", x1: M2.left, x2: W2 - M2.right, y1: y, y2: y }));
      const t = el("text", { class: "axis-text", x: M2.left - 8, y: y + 3, "text-anchor": "end" });
      t.textContent = `${Math.round(v)}%`;
      g.appendChild(t);
    }
    for (let yr = Math.ceil(xMin / 5) * 5; yr <= xMax; yr += 5) {
      const t = el("text", { class: "axis-text", x: xScale(yr), y: H2 - M2.bottom + 18, "text-anchor": "middle" });
      t.textContent = String(yr);
      g.appendChild(t);
    }
    svg.appendChild(g);

    const areaD = `M${xScale(xMin)} ${yScale(0)} ` + pts.map((p) => `L${xScale(p.year)} ${yScale(p.ev_pct)}`).join(" ") + ` L${xScale(xMaxHist)} ${yScale(0)} Z`;
    const c = cssv("--blue");
    svg.appendChild(el("path", { d: areaD, fill: c, opacity: 0.1 }));
    const lineD = pts.map((p, j) => (j === 0 ? "M" : "L") + xScale(p.year) + " " + yScale(p.ev_pct)).join(" ");
    svg.appendChild(el("path", { d: lineD, fill: "none", stroke: c, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }));

    if (fc.length) {
      const last = pts[pts.length - 1];
      const bandPts = [{ year: last.year, low: last.ev_pct, high: last.ev_pct }, ...fc];
      const bandD =
        `M${xScale(bandPts[0].year)} ${yScale(bandPts[0].low)} ` +
        bandPts.map((f) => `L${xScale(f.year)} ${yScale(f.low)}`).join(" ") +
        bandPts.slice().reverse().map((f) => `L${xScale(f.year)} ${yScale(f.high)}`).join(" ") + " Z";
      svg.appendChild(el("path", { d: bandD, fill: c, opacity: 0.12 }));
      const fLineD = [{ year: last.year, point: last.ev_pct }, ...fc].map((f, j) => (j === 0 ? "M" : "L") + xScale(f.year) + " " + yScale(f.point)).join(" ");
      svg.appendChild(el("path", { d: fLineD, fill: "none", stroke: c, "stroke-width": 2, opacity: 0.55, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      const fLast = fc[fc.length - 1];
      svg.appendChild(el("circle", { cx: xScale(fLast.year), cy: yScale(fLast.point), r: 4, fill: c, opacity: 0.55, stroke: cssv("--surface"), "stroke-width": 2 }));
      const flbl = el("text", { class: "end-label", x: xScale(fLast.year) + 9, y: yScale(fLast.point) - 4 });
      flbl.textContent = `${fmt(fLast.point, 0)}% by ${fLast.year} (forecast)`;
      svg.appendChild(flbl);
      const hlbl = el("text", { class: "end-sub", x: xScale(fLast.year) + 9, y: yScale(fLast.point) + 11 });
      hlbl.textContent = `[${fmt(fLast.low, 0)}–${fmt(fLast.high, 0)}%]`;
      svg.appendChild(hlbl);
    } else {
      const last = pts[pts.length - 1];
      svg.appendChild(el("circle", { cx: xScale(last.year), cy: yScale(last.ev_pct), r: 4, fill: c, stroke: cssv("--surface"), "stroke-width": 2 }));
      const lbl = el("text", { class: "end-label", x: xScale(last.year) + 9, y: yScale(last.ev_pct) - 4 });
      lbl.textContent = `${fmt(last.ev_pct, 1)}% in ${last.year}`;
      svg.appendChild(lbl);
    }

    const crosshair = el("line", { class: "crosshair", x1: 0, x2: 0, y1: M2.top, y2: H2 - M2.bottom });
    svg.appendChild(crosshair);
    const hitRect = el("rect", { x: M2.left, y: M2.top, width: plotW2, height: plotH2, fill: "transparent" });
    hitRect.addEventListener("pointermove", (evt) => {
      const p = svgPoint(svg, evt);
      const year = Math.round(xMin + ((p.x - M2.left) / plotW2) * (xMax - xMin));
      const pt = pts.find((pp) => pp.year === year);
      const fcPt = fc.find((pp) => pp.year === year);
      if (!pt && !fcPt) return;
      crosshair.setAttribute("x1", String(xScale(year)));
      crosshair.setAttribute("x2", String(xScale(year)));
      crosshair.style.opacity = "1";
      const rectBox = svg.getBoundingClientRect();
      const body = pt
        ? `<div class="t-row"><span class="t-key" style="background:${c}"></span><span class="t-name">EV share</span><span class="t-val">${fmt(pt.ev_pct, 2)}%</span></div><div class="t-row"><span class="t-key" style="background:transparent"></span><span class="t-name">Vehicles tested</span><span class="t-val">${commas(pt.count)}</span></div>`
        : `<div class="t-row"><span class="t-key" style="background:${c}"></span><span class="t-name">Forecast (logistic fit)</span><span class="t-val">${fmt(fcPt!.point, 1)}%</span></div><div class="t-row"><span class="t-name" style="opacity:.65">10th&ndash;90th pct.</span><span class="t-val" style="font-weight:400">${fmt(fcPt!.low, 1)}&ndash;${fmt(fcPt!.high, 1)}%</span></div>`;
      showTip(evt.clientX - rectBox.left, evt.clientY - rectBox.top, `<div class="t-year">MODEL YEAR ${year}${fcPt ? " (PROJECTED)" : ""}</div>${body}`);
    });
    hitRect.addEventListener("pointerleave", () => {
      crosshair.style.opacity = "0";
      hideTip();
    });
    svg.appendChild(hitRect);
  }, [industryTrend, forecast]);

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
          <div className="section-index">02 &mdash; ELECTRIFICATION</div>
          <h2>Share of new EPA test entries that are electric</h2>
          <p className="desc">
            Industry-wide, all 146 makes in the dataset &mdash; the fraction of each model year&apos;s tested vehicles that run on
            electricity alone, with a 2027&ndash;2030 logistic-curve forecast (shaded band = 10th&ndash;90th percentile across 300
            bootstrap refits).
          </p>
        </div>
      </div>
      <div className="chart-wrap">
        <svg className="chart" ref={svgRef} viewBox={`0 0 ${W2} ${H2}`} />
      </div>
      <p className="note">
        Fit: a 3-parameter logistic curve (ceiling &times; growth rate &times; inflection point) on the historical series, refit 300
        times against resampled residuals for the band. Early-stage S-curves are genuinely hard to project &mdash; the eventual
        ceiling is sensitive to exactly where the curve is right now, and a few more high-growth years could push the whole curve
        higher. Read the point forecast as &quot;our model&apos;s best guess,&quot; not a confident industry prediction.
      </p>
    </div>
  );
}
