import { html, setHTML, type Raw } from "../lib/dom.ts";
import { load, page, num, type Ctx, type Any } from "../lib/data.ts";
import { lineChart } from "../lib/chart.ts";

export function render(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const b: Any = await load("bench.json");
    const series: Any[] = b.series ?? [];
    const labels = series.map((s) => s.date || `#${s.seq}`);
    const chart = lineChart(
      [
        { name: "dev", cls: "s1", pts: series.map((s, i) => [i, s.dev_fitness]) },
        { name: "held-out", cls: "s2", pts: series.map((s, i) => [i, s.heldout_fitness]) },
      ],
      { labels, ref: b.reference_fitness, refName: "Python baseline" },
    );
    const latest = [...series].reverse().find((s) => s.scope !== "baseline");
    const metricRows = latest
      ? Object.keys({ ...latest.dev, ...latest.heldout })
          .filter((k) => k !== "diagnostics")
          .map((k) => html`<tr><th scope="row">${k}</th><td>${fmt(latest.dev?.[k])}</td><td>${fmt(latest.heldout?.[k])}</td></tr>`)
      : [];
    const diags = (b.diagnostics ?? []) as Any[];
    const diagView = diags.length
      ? typeof diags[0] === "object"
        ? table(diags)
        : html`<ul class="plain">${diags.map((d) => html`<li>${String(d)}</li>`)}</ul>`
      : html`<p class="muted">No diagnostics on the latest run.</p>`;
    const overfit = (b.overfit_warnings ?? []).map(
      (o: Any) => html`<li><span class="muted">${(o.ts ?? "").slice(0, 16)}</span> <code>${JSON.stringify(o.data ?? {})}</code></li>`,
    );
    const nights = (b.dates ?? []).slice().reverse().map(
      (d: string) => html`<li><button type="button" class="linkish" data-night="${d}">${d}</button></li>`,
    );
    w.push(() => wireNights(c.el));
    return html`
      <h1>Benchmark</h1>
      <p class="muted">Fitness over time for dev and held-out sets. The dashed line is the Python baseline. Higher is better.</p>
      ${chart}
      <p class="muted">Baseline fitness: ${num(b.reference_fitness)}. Baseline files: ${(b.baseline_files ?? []).join(", ") || "none"}.</p>
      ${latest ? html`<h2>Latest run</h2><p class="muted">${latest.date} · scope ${latest.scope ?? "n/a"} · dev ${num(latest.dev_fitness)} · held-out ${num(latest.heldout_fitness)}</p>
        <div class="diff-wrap"><table><thead><tr><th scope="col">Metric</th><th scope="col">Dev</th><th scope="col">Held-out</th></tr></thead><tbody>${metricRows}</tbody></table></div>` : html``}
      <h2>Diagnostics</h2>
      ${diagView}
      ${overfit.length ? html`<h2>Overfit warnings</h2><ul class="plain">${overfit}</ul>` : html``}
      <h2>Nightly attempts</h2>
      <p class="muted">Choose a night to load its files.</p>
      ${nights.length ? html`<ul class="plain">${nights}</ul>` : html`<p class="muted">No nightly attempts yet.</p>`}
      <div id="night" aria-live="polite"></div>
    `;
  });
}

function fmt(v: unknown): string {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
  if (v === null || v === undefined) return "n/a";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function table(rows: Any[]): Raw {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return html`<div class="diff-wrap"><table>
    <thead><tr>${keys.map((k) => html`<th scope="col">${k}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${keys.map((k) => html`<td>${fmt(r[k])}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

function wireNights(root: HTMLElement): void {
  if (root.dataset.nightsWired) return;
  root.dataset.nightsWired = "1";
  root.addEventListener("click", async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-night]");
    if (!btn) return;
    const out = root.querySelector<HTMLElement>("#night")!;
    out.innerHTML = '<p class="muted" role="status">Loading…</p>';
    try {
      const n: Any = await load(`bench/${btn.dataset.night}.json`);
      const files = (n.files ?? []).map(
        (f: Any) => html`<details><summary><code>${f.name}</code> <span class="muted">${f.size} bytes</span></summary>
          ${f.text === null ? html`<p class="muted">Too large to show.</p>` : html`<pre class="code"><code>${f.text}</code></pre>`}
        </details>`,
      );
      setHTML(out, html`<h2>${n.date}</h2>${files.length ? files : html`<p class="muted">No files.</p>`}`);
    } catch (e) {
      out.innerHTML = `<p class="error" role="alert">${e instanceof Error ? e.message : String(e)}</p>`;
    }
  });
}

