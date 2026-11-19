import { html, md, Raw } from "../lib/dom.ts";
import { load, page, when, pct, hash, type Ctx, type Any } from "../lib/data.ts";

const STATUS_ORDER = ["discussion", "proposed", "voting", "accepted", "implemented", "rejected", "withdrawn"];

export function rfcs(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const r: Any = await load("rfcs.json");
    const board: Record<string, number[]> = r.board ?? {};
    const byNum = new Map<string, Any>((r.items ?? []).map((i: Any) => [String(i.number), i]));
    const columns = [...STATUS_ORDER.filter((s) => s in board), ...Object.keys(board).filter((s) => !STATUS_ORDER.includes(s))];
    const cols = columns.map(
      (s) => html`<section class="col"><h2>${s} <span class="muted">${board[s].length}</span></h2>
        <ul class="plain">${board[s].map((n) => {
          const it = byNum.get(String(n));
          return html`<li><a href="${hash("rfcs/" + n)}">RFC ${n}</a>${it ? html`: ${it.title}` : html``}</li>`;
        })}</ul></section>`,
    );
    return html`
      <h1>RFCs</h1>
      <p class="muted">Proposals grouped by status. Votes and benchmarks are on each RFC.</p>
      ${columns.length ? html`<div class="board">${cols}</div>` : html`<p class="muted">No RFCs yet.</p>`}
    `;
  });
}

export function rfc(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const raw = c.args[0];
    const key = /^\d+$/.test(raw) ? String(Number(raw)) : raw;
    const d: Any = await load(`rfc/${key}.json`);
    const votes = (d.votes ?? []).map((v: Any) => html`<li>${v.agent} (${v.role ?? "no role"}): ${v.vote}</li>`);
    const comments = (d.comments ?? []).map((x: Any) => html`<li><strong>${x.author ?? ""}</strong> <span class="muted">${when(x.ts)}</span><div>${new Raw(md(x.body ?? ""))}</div></li>`);
    const prs = (d.prs ?? []).map((p: Any) => html`<li>${p.title ?? `PR ${p.number ?? ""}`} <span class="tag">${p.state ?? ""}</span></li>`);
    return html`
      <p><a href="${hash("rfcs")}">All RFCs</a></p>
      <h1>RFC ${d.number}: ${d.title}</h1>
      <p><span class="tag">${d.status}</span> ${d.class ? html`<span class="tag">${d.class}</span>` : html``} <span class="muted">by ${d.author ?? "unknown"}${d.author_role ? ` (${d.author_role})` : ""}</span></p>
      ${d.hypothesis ? html`<p><strong>Hypothesis.</strong> ${d.hypothesis}</p>` : html``}
      <section class="rfc-body">${new Raw(md(d.text ?? ""))}</section>
      ${d.decision ? html`<section><h2>Decision</h2>${new Raw(md(d.decision))}</section>` : html``}
      ${d.outcome ? html`<section><h2>Outcome</h2><pre class="code"><code>${JSON.stringify(d.outcome, null, 2)}</code></pre></section>` : html``}
      <section><h2>Votes</h2><p class="muted">${JSON.stringify(d.tally ?? {})}</p><ul class="plain">${votes}</ul></section>
      ${prs.length ? html`<section><h2>Pull requests</h2><ul class="plain">${prs}</ul></section>` : html``}
      ${comments.length ? html`<section><h2>Comments</h2><ul class="plain">${comments}</ul></section>` : html``}
    `;
  });
}

export function agents(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const a: Any = await load("agents.json");
    const ids: string[] = a.matrix?.ids ?? [];
    const cards = (a.agents ?? []).map(
      (g: Any) => html`<article class="card">
        <h2>${g.id}</h2>
        <p><span class="tag">${g.role ?? "no role"}</span> <span class="tag">${g.model ?? "model n/a"}</span> ${g.effort ? html`<span class="tag">${g.effort}</span>` : html``}</p>
        <p class="muted">Acceptance ${pct(g.acceptance_rate)} · authored ${(g.rfcs_authored ?? []).length} RFC(s) · votes ${g.vote_counts?.approve ?? 0} approve, ${g.vote_counts?.reject ?? 0} reject, ${g.vote_counts?.abstain ?? 0} abstain</p>
        ${g.persona ? html`<p>${g.persona}</p>` : html``}
        ${g.memory ? html`<details><summary>Memory</summary><div class="prose">${new Raw(md(g.memory))}</div></details>` : html``}
      </article>`,
    );
    const matrix = ids.length
      ? html`<div class="diff-wrap"><table class="matrix"><thead><tr><th scope="col">Agreement</th>${ids.map((i) => html`<th scope="col">${i}</th>`)}</tr></thead>
        <tbody>${ids.map((r, i) => html`<tr><th scope="row">${r}</th>${(a.matrix.agreement[i] ?? []).map((v: number | null) => html`<td>${pct(v)}</td>`)}</tr>`)}</tbody></table></div>`
      : html`<p class="muted">No shared votes yet.</p>`;
    return html`
      <h1>Agents</h1>
      <p class="muted">Each agent's role, the RFCs it authored, and how often its votes agree with others. Acceptance is the share of its decided RFCs that passed.</p>
      <div class="cards">${cards}</div>
      <h2>Vote agreement</h2>
      ${matrix}
    `;
  });
}

export function bootstrap(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const b: Any = await load("bootstrap.json");
    const stages = (b.stages ?? []).map(
      (s: Any) => html`<tr><td>${s.stage}</td><td>${s.name}</td><td>${s.emits}</td><td><span class="tag">${s.status}</span></td></tr>`,
    );
    const cut = (b.cutover ?? []).map((x: Any) => html`<li>${when(x.ts)} ${x.to ?? ""} ${x.note ?? ""}</li>`);
    const rel = (b.release ?? []).map((x: Any) => html`<li>${when(x.ts)} ${x.version ?? x.tag ?? ""}</li>`);
    const bins = (b.binaries ?? []).map((x: Any) => html`<li><code>${x.path}</code> <span class="muted">${x.size} bytes</span></li>`);
    return html`
      <h1>Bootstrap</h1>
      <p>Active compiler: <strong>${b.active ?? "none"}</strong>. Fixed point: <strong>${b.fixed_point ? "proven" : "not yet"}</strong>.</p>
      <div class="diff-wrap"><table>
        <thead><tr><th scope="col">Stage</th><th scope="col">Name</th><th scope="col">Emits</th><th scope="col">Status</th></tr></thead>
        <tbody>${stages}</tbody>
      </table></div>
      ${cut.length ? html`<h2>Cutover</h2><ul class="plain">${cut}</ul>` : html``}
      ${rel.length ? html`<h2>Releases</h2><ul class="plain">${rel}</ul>` : html``}
      <h2>Committed binaries</h2>
      ${bins.length ? html`<ul class="plain">${bins}</ul>` : html`<p class="muted">None.</p>`}
    `;
  });
}

export function digests(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const d: Any = await load("digests.json");
    const items = (d.items ?? []).map(
      (x: Any) => html`<article class="card wide"><h2>${x.title}</h2><p class="muted">${x.date}</p><div class="prose">${new Raw(md(x.body ?? ""))}</div></article>`,
    );
    return html`<h1>Digest archive</h1>${items.length ? items : html`<p class="muted">No digests yet.</p>`}`;
  });
}
