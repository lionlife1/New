import { svg } from "./dom";

/** Deterministic wobble so the strokes look hand-drawn but don't jump on re-render. */
const jitter = (i: number, salt: number) => (((i * 9301 + salt * 49297) % 233280) / 233280 - 0.5);

/** Count drawn as tally marks: four uprights and a slash per group of five. */
export function tally(count: number, opts: { max?: number; label?: string } = {}): SVGElement {
  const max = opts.max ?? 20;
  const shown = Math.min(count, max);
  const groups = Math.ceil(shown / 5);
  const gw = 24;
  const width = Math.max(groups * gw, 14);
  const el = svg("svg", {
    class: "tally",
    width,
    height: 18,
    viewBox: `0 0 ${width} 18`,
    role: "img",
    "aria-label": opts.label ?? `${count} ${count === 1 ? "note" : "notes"}`,
  });
  if (count === 0) {
    el.appendChild(svg("line", { x1: 2, y1: 9, x2: 12, y2: 9, class: "tally-none" }));
    return el;
  }
  for (let i = 0; i < shown; i++) {
    const g = Math.floor(i / 5);
    const k = i % 5;
    const x0 = g * gw;
    if (k < 4) {
      const x = x0 + 3 + k * 4.5;
      el.appendChild(svg("line", { x1: x + jitter(i, 1), y1: 2 + jitter(i, 2), x2: x + jitter(i, 3) * 1.4, y2: 16 + jitter(i, 4) }));
    } else {
      el.appendChild(svg("line", { x1: x0 + 0.5, y1: 13 + jitter(i, 5), x2: x0 + 19, y2: 5 + jitter(i, 6), class: "tally-slash" }));
    }
  }
  return el;
}
