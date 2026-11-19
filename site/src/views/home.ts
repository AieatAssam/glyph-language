import { html, type Raw } from "../lib/dom.ts";
import { load, page, short, hash, num, type Ctx, type Any } from "../lib/data.ts";
import { lineChart } from "../lib/chart.ts";

export function render(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const h: Any = await load("home.json");
    const fit: Any[] = (h.fitness ?? []).filter((f: Any) => f.dev !== null || f.heldout !== null);
    const chart = lineChart(
      [
        { name: "dev", cls: "s1", pts: fit.map((f: Any, i: number) => [i, f.dev]) },
        { name: "held-out", cls: "s2", pts: fit.map((f: Any, i: number) => [i, f.heldout]) },
      ],
      { labels: fit.map((f: Any) => f.date ?? ""), ref: h.reference_fitness, refName: "baseline" },
    );
    const stages = (h.stages ?? []).map(
      (s: Any) => html`<li><span>${s.stage}. ${s.name}</span> <span class="tag">${s.status}</span></li>`,
    );
    const decisions = (h.decisions ?? []).map(
      (d: Any) => html`<li><strong>${d.title}</strong><div class="muted">${d.file}</div></li>`,
    );
    const rfcs = (h.recent_rfcs ?? []).map(
      (r: Any) => html`<li><a href="${hash("rfcs/" + r.number)}">RFC ${r.number}: ${r.title}</a> <span class="tag">${r.status}</span></li>`,
    );
    const d = h.digest;
    return html`
      <section class="hero">
        <p class="eyebrow">Glyph language</p>
        <h1>The spec, the compiler, and the decisions behind them, read from the repo.</h1>
        <pre class="code" aria-label="current repository state"><code>${[
          `spec         ${h.spec_version ?? "unversioned"}`,
          `compiler     ${h.active ?? "none active"}`,
          `audit chain  ${h.chain?.ok ? "ok" : "BROKEN"}, ${h.chain?.count ?? 0} events`,
          `head         ${short(h.chain?.head)}`,
        ].join("\n")}</code></pre>
        <p class="actions"><a class="button" href="${hash("playground")}">Open the playground</a> <a class="button ghost" href="${hash("spec")}">Read the spec</a></p>
      </section>
      <section class="grid3" aria-label="counts">
        <div class="stat"><span>${h.counts?.events ?? 0}</span>audit events</div>
        <div class="stat"><span>${h.counts?.rfcs ?? 0}</span>RFCs</div>
        <div class="stat"><span>${h.counts?.agents ?? 0}</span>agents seen</div>
      </section>
      <section>
        <h2>Benchmark fitness</h2>
        ${chart}
        <p class="muted">Reference fitness: ${num(h.reference_fitness)}. Higher is better.</p>
      </section>
      <section class="two">
        <div>
          <h2>Bootstrap</h2>
          <ol class="plain">${stages}</ol>
          <p><a href="${hash("bootstrap")}">Bootstrap details</a></p>
        </div>
        <div>
          <h2>Recent decisions</h2>
          <ul class="plain">${decisions}</ul>
          <h2>Latest digest</h2>
          ${d ? html`<p><a href="${hash("digests")}"><strong>${d.title}</strong></a> <span class="muted">${d.date}</span></p>` : html`<p class="muted">No digest yet.</p>`}
        </div>
      </section>
      <section>
        <h2>Recent RFCs</h2>
        <ul class="plain">${rfcs}</ul>
        <p><a href="${hash("rfcs")}">All RFCs</a></p>
      </section>
    `;
  });
}
