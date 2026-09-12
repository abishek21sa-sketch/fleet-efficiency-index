"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { DashboardData } from "@/lib/api";
import { el, cssv, slotColor, fmt, svgPoint, showTip, hideTip } from "@/lib/chart-utils";

const M1 = { top: 16, right: 118, bottom: 28, left: 38 };
const W1 = 920;
const H1 = 380;
const plotW1 = W1 - M1.left - M1.right;
const plotH1 = H1 - M1.top - M1.bottom;

const DEFAULT_BRANDS = ["Tesla", "Ford", "Chevrolet", "BMW", "Toyota"];
const BRAND_ORDER = [
  "Tesla", "Ford", "Chevrolet", "Cadillac", "GMC", "BMW", "Mercedes-Benz", "Audi", "Porsche",
  "Toyota", "Honda", "Lexus", "Nissan", "Mazda", "Subaru", "Hyundai", "Kia", "Genesis", "Volkswagen", "Volvo",
  "Rivian", "Lucid", "Chrysler", "Dodge", "Jeep", "Ram", "Buick", "Acura", "Infiniti", "Mitsubishi",
];

export default function TrendSection({ trends }: { trends: DashboardData["trends"] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const allBrands = Object.keys(trends);
  const [selected, setSelected] = useState<string[]>(DEFAULT_BRANDS.filter((b) => allBrands.includes(b)));
  const brandOrder = BRAND_ORDER.filter((b) => allBrands.includes(b));

  const toggleBrand = useCallback((b: string) => {
    setSelected((prev) => {
      const i = prev.indexOf(b);
      if (i >= 0) return prev.filter((x) => x !== b);
      if (prev.length < 6) return [...prev, b];
      return prev;
    });
  }, []);

  const draw = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = "";
    if (selected.length === 0) return;

    const series = selected.map((b) => ({ brand: b, pts: trends[b].filter((p) => p.avg_mpg != null) }));
    let yMin = 1e9, yMax = -1e9, xMin = 1e9, xMax = -1e9;
    series.forEach((s) =>
      s.pts.forEach((p) => {
        yMin = Math.min(yMin, p.avg_mpg);
        yMax = Math.max(yMax, p.avg_mpg);
        xMin = Math.min(xMin, p.year);
        xMax = Math.max(xMax, p.year);
      })
    );
    yMin = Math.floor(Math.max(0, yMin - 8) / 10) * 10;
    yMax = Math.ceil((yMax + 8) / 10) * 10;
    const xScale = (y: number) => M1.left + ((y - xMin) / (xMax - xMin)) * plotW1;
    const yScale = (v: number) => M1.top + plotH1 - ((v - yMin) / (yMax - yMin)) * plotH1;

    const g = el("g", {});
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const v = yMin + ((yMax - yMin) * i) / steps;
      const y = yScale(v);
      g.appendChild(el("line", { class: "gridline", x1: M1.left, x2: W1 - M1.right, y1: y, y2: y }));
      const t = el("text", { class: "axis-text", x: M1.left - 8, y: y + 3, "text-anchor": "end" });
      t.textContent = String(Math.round(v));
      g.appendChild(t);
    }
    for (let yr = Math.ceil(xMin / 5) * 5; yr <= xMax; yr += 5) {
      const x = xScale(yr);
      const t = el("text", { class: "axis-text", x, y: H1 - M1.bottom + 18, "text-anchor": "middle" });
      t.textContent = String(yr);
      g.appendChild(t);
    }
    svg.appendChild(g);

    const crosshair = el("line", { class: "crosshair", x1: 0, x2: 0, y1: M1.top, y2: H1 - M1.bottom });
    svg.appendChild(crosshair);

    interface LabelInfo { brand: string; color: string; lx: number; ly: number; center: number; isEv: boolean; val: number }
    const labelInfo: LabelInfo[] = [];
    series.forEach((s, i) => {
      const color = slotColor(i);
      const d = s.pts.map((p, j) => (j === 0 ? "M" : "L") + xScale(p.year) + " " + yScale(p.avg_mpg)).join(" ");
      svg.appendChild(el("path", { d, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      const last = s.pts[s.pts.length - 1];
      const lx = xScale(last.year), ly = yScale(last.avg_mpg);
      svg.appendChild(el("circle", { cx: lx, cy: ly, r: 4, fill: color, stroke: cssv("--surface"), "stroke-width": 2 }));
      labelInfo.push({ brand: s.brand, color, lx, ly, center: ly, isEv: last.ev_pct === 100, val: last.avg_mpg });
    });

    labelInfo.sort((a, b) => a.center - b.center);
    const minGap = 25, minY = M1.top + 10, maxY = H1 - M1.bottom - 10;
    for (let i = 1; i < labelInfo.length; i++) {
      if (labelInfo[i].center - labelInfo[i - 1].center < minGap) labelInfo[i].center = labelInfo[i - 1].center + minGap;
    }
    const overflow = labelInfo.length ? labelInfo[labelInfo.length - 1].center - maxY : 0;
    if (overflow > 0) labelInfo.forEach((l) => (l.center -= overflow));
    if (labelInfo.length && labelInfo[0].center < minY) labelInfo.forEach((l) => (l.center += minY - labelInfo[0].center));
    labelInfo.forEach((l) => {
      const displaced = Math.abs(l.center - l.ly) > 3;
      const lx2 = l.lx + (displaced ? 12 : 9);
      if (displaced) svg.appendChild(el("line", { x1: l.lx + 3, y1: l.ly, x2: lx2 - 3, y2: l.center, stroke: l.color, "stroke-width": 1, opacity: 0.45 }));
      const lbl = el("text", { class: "end-label", x: lx2, y: l.center - 4 });
      lbl.textContent = l.brand;
      svg.appendChild(lbl);
      const sub = el("text", { class: "end-sub", x: lx2, y: l.center + 9 });
      sub.textContent = fmt(l.val, 0) + (l.isEv ? " MPGe" : " MPG");
      svg.appendChild(sub);
    });

    const hitRect = el("rect", { x: M1.left, y: M1.top, width: plotW1, height: plotH1, fill: "transparent" });
    hitRect.addEventListener("pointermove", (evt) => {
      const p = svgPoint(svg, evt);
      const year = Math.round(xMin + ((p.x - M1.left) / plotW1) * (xMax - xMin));
      crosshair.setAttribute("x1", String(xScale(year)));
      crosshair.setAttribute("x2", String(xScale(year)));
      crosshair.style.opacity = "1";
      let rows = "";
      series.forEach((s, i) => {
        const pt = s.pts.find((pp) => pp.year === year);
        const color = slotColor(i);
        if (pt) rows += `<div class="t-row"><span class="t-key" style="background:${color}"></span><span class="t-name">${s.brand}</span><span class="t-val">${fmt(pt.avg_mpg, 1)}${pt.ev_pct === 100 ? " MPGe" : ""}</span></div>`;
      });
      const rectBox = svg.getBoundingClientRect();
      showTip(evt.clientX - rectBox.left, evt.clientY - rectBox.top, `<div class="t-year">MODEL YEAR ${year}</div>${rows}`);
    });
    hitRect.addEventListener("pointerleave", () => {
      crosshair.style.opacity = "0";
      hideTip();
    });
    svg.appendChild(hitRect);
  }, [selected, trends]);

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
          <div className="section-index">01 &mdash; TREND</div>
          <h2>Brand efficiency over time</h2>
          <p className="desc">Average EPA combined fuel economy per model year, by manufacturer. Pick up to six brands to compare.</p>
        </div>
      </div>
      <div className="chips">
        {brandOrder.map((b) => (
          <BrandChip key={b} label={b} slot={selected.indexOf(b)} onToggle={() => toggleBrand(b)} />
        ))}
      </div>
      <div className="chart-wrap">
        <svg className="chart" ref={svgRef} viewBox={`0 0 ${W1} ${H1}`} />
      </div>
      <p className="note">
        Figures for fully-electric brands (Tesla, Rivian, Lucid) are EPA <b className="mono" style={{ color: "var(--ink-2)" }}>MPGe</b> &mdash; an
        energy-equivalence scale, not directly comparable gallon-for-gallon to gasoline MPG for other brands. Shown together deliberately: the gap
        is the story.
      </p>
    </div>
  );
}

// Sets its own inline color from the live categorical slot palette (CSS custom
// properties aren't resolvable at SSR time) — mirrors the original vanilla-JS
// chip, which set `chip.style.color = slotColor(idx)` so the border
// (border-color: currentColor) and swatch both pick up the series color.
function BrandChip({ label, slot, onToggle }: { label: string; slot: number; onToggle: () => void }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const swatchRef = useRef<HTMLSpanElement>(null);
  const active = slot >= 0;

  useEffect(() => {
    const color = active ? slotColor(slot) : null;
    if (btnRef.current) btnRef.current.style.color = color ?? "";
    if (swatchRef.current) swatchRef.current.style.background = color ?? "var(--muted)";
  }, [active, slot]);

  return (
    <button ref={btnRef} type="button" className="chip" aria-pressed={active} onClick={onToggle}>
      <span className="sw" ref={swatchRef} />
      {label}
    </button>
  );
}
