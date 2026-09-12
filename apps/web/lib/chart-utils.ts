// Shared helpers for the hand-rolled SVG charts, ported near-verbatim from
// template.html. These charts are wholesale-redrawn on data/theme/resize
// change (not incrementally diffed), so a thin imperative wrapper — a React
// component holding an SVG ref, a useEffect that calls a draw function — is
// the right pattern here, the same one D3-in-React uses. Rewriting this
// ~500 lines of tuned hover/crosshair/label-collision logic as declarative
// JSX would risk subtly breaking behavior for no functional gain.

export const SLOTS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];

export function cssv(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function slotColor(i: number): string {
  return cssv(SLOTS[i % SLOTS.length]);
}

export function fmt(n: number | null | undefined, d = 1): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toFixed(d);
}

export function commas(n: number): string {
  return Number(n).toLocaleString("en-US");
}

const NS = "http://www.w3.org/2000/svg";

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

export function svgPoint(svg: SVGSVGElement, evt: PointerEvent | MouseEvent): DOMPoint {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  return ctm ? pt.matrixTransform(ctm.inverse()) : pt;
}

// A single tooltip div (rendered once by <Tooltip/> in the page shell) is
// shared by every chart, mirroring the original single #tooltip element -
// avoids a Context provider for something this simple.
let tooltipEl: HTMLDivElement | null = null;

export function mountTooltip(node: HTMLDivElement | null): void {
  tooltipEl = node;
}

export function showTip(x: number, y: number, html: string): void {
  if (!tooltipEl) return;
  tooltipEl.innerHTML = html;
  tooltipEl.style.left = `${x}px`;
  tooltipEl.style.top = `${y - 12}px`;
  tooltipEl.style.opacity = "1";
}

export function hideTip(): void {
  if (!tooltipEl) return;
  tooltipEl.style.opacity = "0";
}
