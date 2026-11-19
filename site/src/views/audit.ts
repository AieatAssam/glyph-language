import { html, setHTML, type Raw } from "../lib/dom.ts";
import { load, page, type Ctx, type Any } from "../lib/data.ts";

// Audit explorer: pages of events from audit/<k>.json, with type, actor and text filters.
export function render(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const a: Any = await load("audit.json");
    const types: string[] = a.types ?? [];
    const chain = a.chain ?? {};
    const type = c.q.get("type") ?? "";
    const actor = c.q.get("actor") ?? "";
    const text = c.q.get("q") ?? "";
    const pageNo = Math.max(0, Math.min(Number(c.q.get("p") ?? 0) || 0, Math.max(0, (a.pages ?? 1) - 1)));
    w.push(() => wireAudit(c.el, a, { type, actor, text, pageNo }));
    return html`
      <h1>Audit</h1>
      <section class="chain ${chain.ok ? "ok" : "bad"}" aria-label="chain status">
        <strong>Chain ${chain.ok ? "verified" : "BROKEN"}</strong>
        <span class="muted">${chain.count ?? 0} entries checked of ${a.total ?? 0}${chain.ok ? "" : `, first bad entry ${chain.first_bad ?? "unknown"}`}</span>
        <div class="muted">head <code>${chain.head ?? "none"}</code></div>
      </section>
      <form class="pick filters" onsubmit="return false">
        <label>Type <select name="type"><option value="">all</option>${types.map((t) => html`<option value="${t}"${t === type ? " selected" : ""}>${t}</option>`)}</select></label>
        <label>Actor <input name="actor" value="${actor}" autocomplete="off" /></label>
        <label>Search <input name="q" type="search" value="${text}" autocomplete="off" /></label>
      </form>
      <p class="pager"><button type="button" id="aud-prev">Newer page</button> <span id="aud-where" class="muted"></span> <button type="button" id="aud-next">Older page</button></p>
      <p id="aud-count" class="muted" role="status"></p>
      <ol class="plain events" id="aud-list"></ol>
    `;
  });
}

interface State {
  type: string;
  actor: string;
  text: string;
  pageNo: number;
}

// Mirrors transcript_for() in build_data.py: sessions are "<owner>/<phase>/<agent>".
function transcriptUrl(session: unknown, repo: string | null): string | null {
  if (typeof session !== "string" || !repo) return null;
  const parts = session.split("/");
  if (parts.length < 3) return null;
  return `https://github.com/${repo}/blob/audit-transcripts/${parts[0]}/${parts[parts.length - 2]}/${parts[parts.length - 1]}.jsonl.gz`;
}

function wireAudit(root: HTMLElement, a: Any, s: State): void {
  const form = root.querySelector<HTMLFormElement>("form.filters")!;
  const list = root.querySelector<HTMLElement>("#aud-list")!;
  const count = root.querySelector<HTMLElement>("#aud-count")!;
  const where = root.querySelector<HTMLElement>("#aud-where")!;
  const prev = root.querySelector<HTMLButtonElement>("#aud-prev")!;
  const next = root.querySelector<HTMLButtonElement>("#aud-next")!;
  const pages = Math.max(1, a.pages ?? 1);
  let gen = 0;

  const go = () => {
    const fd = new FormData(form);
    const p = new URLSearchParams();
    if (fd.get("type")) p.set("type", String(fd.get("type")));
    if (fd.get("actor")) p.set("actor", String(fd.get("actor")));
    if (fd.get("q")) p.set("q", String(fd.get("q")));
    if (s.pageNo) p.set("p", String(s.pageNo));
    const hash = `#/audit${p.toString() ? "?" + p.toString() : ""}`;
    if (location.hash !== hash) history.replaceState(null, "", hash);
    void draw();
  };

  const draw = async () => {
    const my = ++gen;
    const fd = new FormData(form);
    const type = String(fd.get("type") ?? "");
    const actor = String(fd.get("actor") ?? "").toLowerCase();
    const q = String(fd.get("q") ?? "").toLowerCase();
    where.textContent = `Page ${s.pageNo + 1} of ${pages}`;
    prev.disabled = s.pageNo === 0;
    next.disabled = s.pageNo >= pages - 1;
    setHTML(list, html`<li class="muted">Loading…</li>`);
    try {
      const pg: Any = await load(`audit/${s.pageNo}.json`);
      if (my !== gen) return;
      const events: Any[] = (pg.events ?? []).filter(
        (e: Any) =>
          (!type || e.type === type) &&
          (!actor || String(e.actor ?? "").toLowerCase().includes(actor)) &&
          (!q || JSON.stringify(e).toLowerCase().includes(q)),
      );
      count.textContent = `${events.length} event${events.length === 1 ? "" : "s"} on this page match.`;
      setHTML(
        list,
        html`${events.map((e: Any) => {
          const link = transcriptUrl(e.data?.session, a.repo ?? null);
          return html`<li class="event">
            <details>
              <summary><span class="muted">#${e.seq}</span> <code>${e.type}</code> ${e.actor ?? ""} <span class="muted">${(e.ts ?? "").slice(0, 16)}</span></summary>
              ${link ? html`<p><a href="${link}" rel="noopener noreferrer">Transcript</a></p>` : html``}
              <pre class="code"><code>${JSON.stringify(e, null, 2)}</code></pre>
            </details>
          </li>`;
        })}`,
      );
    } catch (e) {
      if (my !== gen) return;
      list.innerHTML = `<li class="error" role="alert">${e instanceof Error ? e.message : String(e)}</li>`;
    }
  };

  form.addEventListener("change", () => {
    s.pageNo = 0;
    go();
  });
  let t = 0;
  form.addEventListener("input", () => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      s.pageNo = 0;
      go();
    }, 250);
  });
  prev.addEventListener("click", () => {
    s.pageNo = Math.max(0, s.pageNo - 1);
    go();
  });
  next.addEventListener("click", () => {
    s.pageNo = Math.min(pages - 1, s.pageNo + 1);
    go();
  });
  void draw();
}
