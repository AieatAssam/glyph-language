import { Raw } from "./dom.ts";

export interface Line {
  name: string;
  cls: string; // CSS class giving stroke colour (s1..s4)
  pts: Array<[number, number | null]>; // [label index, value]
}

// Inline SVG line chart. Values are numbers; null breaks the line.
export function lineChart(lines: Line[], o: { labels: string[]; ref?: number | null; refName?: string; height?: number; yFmt?: (v: number) => string }): Raw {
  const W = 640;
  const H = o.height ?? 220;
  const L = 44;
  const R = 12;
  const T = 12;
  const B = 26;
  const vals: number[] = [];
  for (const ln of lines) for (const [, v] of ln.pts) if (v !== null && Number.isFinite(v)) vals.push(v);
  if (o.ref !== null && o.ref !== undefined && Number.isFinite(o.ref)) vals.push(o.ref);
  if (!vals.length || !o.labels.length) return new Raw('<p class="muted">No data yet.</p>');
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const n = Math.max(o.labels.length - 1, 1);
  const x = (i: number) => L + (i / n) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const fmt = o.yFmt ?? ((v: number) => (Math.round(v * 10) / 10).toString());
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="line chart">`;
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4;
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  const ticks = [0, Math.floor(n / 2), n];
  for (const i of [...new Set(ticks)]) {
    if (i < o.labels.length)
      svg += `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n ? "end" : "middle"}">${o.labels[i].replace(/[<&]/g, "")}</text>`;
  }
  if (o.ref !== null && o.ref !== undefined && Number.isFinite(o.ref)) {
    svg += `<line class="ref" x1="${L}" x2="${W - R}" y1="${y(o.ref)}" y2="${y(o.ref)}"/>`;
    svg += `<text class="tick" x="${W - R}" y="${y(o.ref) - 4}" text-anchor="end">${(o.refName ?? "reference").replace(/[<&]/g, "")} ${fmt(o.ref)}</text>`;
  }
  for (const ln of lines) {
    let d = "";
    for (const [i, v] of ln.pts) {
      if (v === null || !Number.isFinite(v)) continue;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    }
    if (d) svg += `<path class="line ${ln.cls}" d="${d}"/>`;
    for (const [i, v] of ln.pts)
      if (v !== null && Number.isFinite(v)) svg += `<circle class="dot ${ln.cls}" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.5"/>`;
  }
  svg += "</svg>";
  const legend = lines.map((ln) => `<span class="key ${ln.cls}">${ln.name.replace(/[<&]/g, "")}</span>`).join(" ");
  return new Raw(`${svg}<div class="legend">${legend}</div>`);
}
