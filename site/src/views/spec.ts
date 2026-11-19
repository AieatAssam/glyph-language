import { html, md, Raw, setHTML } from "../lib/dom.ts";
import { load, page, short, hash, type Ctx, type Any } from "../lib/data.ts";
import { lineDiff, sideBySide } from "../lib/diff.ts";

const FILES_ORDER = ["core", "card", "grammar"] as const;

// Spec: every paragraph, with a "why" control that reveals its blame, RFC, votes and transcripts.
export function render(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const s: Any = await load("spec.json");
    const groups = new Map<string, Any[]>();
    for (const p of s.paragraphs ?? []) {
      if (!groups.has(p.file)) groups.set(p.file, []);
      groups.get(p.file)!.push(p);
    }
    const errors = s.errors
      ? html`<section><h2>Error codes</h2><pre class="code"><code>${JSON.stringify(s.errors, null, 2)}</code></pre></section>`
      : html``;
    const body = [...groups].map(
      ([file, ps]) => html`
        <section class="spec-file">
          <h2><code>${file}</code></h2>
          ${ps.map(
            (p: Any) => html`
              <article class="para" data-id="${p.id}">
                <div class="prose">${new Raw(md(p.md))}</div>
                <p class="para-tools"><button type="button" class="linkish" data-why="${p.id}" aria-expanded="false">why</button> <span class="muted">line ${p.line}</span></p>
                <div class="why" hidden></div>
              </article>`,
          )}
        </section>`,
    );
    w.push(() => wireWhy(c.el));
    return html`
      <h1>Spec</h1>
      <p class="muted">Version ${s.version ?? "unversioned"}. <a href="${hash("spec/history")}">Compare versions</a> or <a href="${hash("spec/timelapse")}">watch reference programs change</a>.</p>
      ${body}
      ${errors}
    `;
  });
}

let whyData: Promise<Any> | null = null;

function wireWhy(root: HTMLElement): void {
  if (root.dataset.whyWired) return;
  root.dataset.whyWired = "1";
  root.addEventListener("click", async (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-why]");
    if (!btn) return;
    const art = btn.closest("article.para")!;
    const panel = art.querySelector<HTMLElement>(".why")!;
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
    if (open || panel.dataset.ready) return;
    panel.textContent = "Loading…";
    try {
      whyData ??= load("why.json");
      const w: Any = (await whyData)[btn.dataset.why!];
      setHTML(panel, renderWhy(w));
      panel.dataset.ready = "1";
    } catch (e) {
      panel.textContent = `Could not load why.json: ${e instanceof Error ? e.message : e}`;
    }
  });
}

function renderWhy(w: Any): Raw {
  if (!w) return html`<p class="muted">No provenance recorded for this paragraph.</p>`;
  const trailers = Object.entries(w.trailers ?? {}).map(([k, v]) => html`<li><code>${k}</code>: ${String(v)}</li>`);
  const votes = (w.votes ?? []).map((v: Any) => html`<li>${v.agent} (${v.role ?? "no role"}): ${v.vote}</li>`);
  const tx = (w.transcripts ?? []).map((t: Any) =>
    t.url ? html`<li><a href="${t.url}" rel="noopener noreferrer">${t.agent} transcript</a></li>` : html`<li>${t.agent}, ${t.phase}</li>`);
  return html`<dl>
    <dt>Commit</dt><dd>${short(w.commit)} ${w.subject ?? ""}</dd>
    ${w.rfc ? html`<dt>RFC</dt><dd><a href="${hash("rfcs/" + w.rfc)}">${w.rfc}</a></dd>` : html``}
    ${trailers.length ? html`<dt>Trailers</dt><dd><ul class="plain">${trailers}</ul></dd>` : html``}
    ${votes.length ? html`<dt>Votes</dt><dd><ul class="plain">${votes}</ul></dd>` : html``}
    ${w.bench ? html`<dt>Bench</dt><dd><pre class="code"><code>${JSON.stringify(w.bench, null, 2)}</code></pre></dd>` : html``}
    ${tx.length ? html`<dt>Transcripts</dt><dd><ul class="plain">${tx}</ul></dd>` : html``}
  </dl>`;
}

// Two version pickers and a side-by-side line diff per spec file.
export function history(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const idx: Any = await load("history/index.json");
    const versions: string[] = (idx.items ?? []).map((i: Any) => i.version);
    if (!versions.length) return html`<h1>Spec history</h1><p class="muted">No spec tags yet.</p>`;
    const from = c.q.get("from") && versions.includes(c.q.get("from")!) ? c.q.get("from")! : versions[Math.max(0, versions.length - 2)];
    const to = c.q.get("to") && versions.includes(c.q.get("to")!) ? c.q.get("to")! : versions[versions.length - 1];
    const [a, b]: Any[] = await Promise.all([load(`history/${from}.json`), load(`history/${to}.json`)]);
    const opt = (v: string, sel: string) => html`<option value="${v}"${v === sel ? " selected" : ""}>${v}</option>`;
    const files = [...FILES_ORDER, ...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
      (f, i, arr) => arr.indexOf(f) === i && typeof (a[f] ?? b[f]) === "string",
    );
    const sections = files.map((f) => {
      const rows = sideBySide(lineDiff(String(a[f] ?? "").split("\n"), String(b[f] ?? "").split("\n")));
      const changed = rows.filter((r) => r.kind === "change").length;
      return html`<section>
        <h2><code>${f}</code> <span class="muted">${changed} changed line${changed === 1 ? "" : "s"}</span></h2>
        <div class="diff-wrap"><table class="diff">
          <thead><tr><th scope="col">${from}</th><th scope="col">${to}</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr class="${r.kind}"><td>${r.left ?? ""}</td><td>${r.right ?? ""}</td></tr>`)}</tbody>
        </table></div>
      </section>`;
    });
    w.push(() => {
      const form = c.el.querySelector<HTMLFormElement>("form.pick");
      form?.addEventListener("change", () => {
        const fd = new FormData(form);
        location.hash = `#/spec/history?from=${encodeURIComponent(String(fd.get("from")))}&to=${encodeURIComponent(String(fd.get("to")))}`;
      });
    });
    return html`
      <h1>Spec history</h1>
      <form class="pick" onsubmit="return false">
        <label>From <select name="from">${versions.map((v) => opt(v, from))}</select></label>
        <label>To <select name="to">${versions.map((v) => opt(v, to))}</select></label>
      </form>
      <p class="muted">Lines removed are on the left, added on the right. Changed rows are paired.</p>
      ${sections}
    `;
  });
}

// Reference programs across versions, with a play control.
export function timelapse(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const idx: Any = await load("history/index.json");
    const items: Any[] = idx.items ?? [];
    const snaps: Any[] = await Promise.all(items.map((i) => load(`history/${i.version}.json`)));
    const names = [...new Set(snaps.flatMap((s) => Object.keys(s.examples ?? {})))].sort();
    if (!items.length || !names.length) return html`<h1>Time-lapse</h1><p class="muted">No reference programs in any spec version yet.</p>`;
    const want = c.q.get("ex");
    const ex = names.includes(want ?? "") ? want! : names[0];
    const frames = snaps.map((s, i) => ({ v: items[i].version, text: s.examples?.[ex] ?? null }));
    w.push(() => wireTimelapse(c.el, frames));
    return html`
      <h1>Time-lapse</h1>
      <p class="muted">Step through spec versions, or press play. Each frame shows the reference program as it stood in that version.</p>
      <form class="pick" onsubmit="return false">
        <label>Program <select name="ex">${names.map((n) => html`<option value="${n}"${n === ex ? " selected" : ""}>${n}</option>`)}</select></label>
      </form>
      <div class="player">
        <div class="controls">
          <button type="button" id="tl-play" aria-pressed="false">Play</button>
          <input id="tl-range" type="range" min="0" max="${frames.length - 1}" value="${frames.length - 1}" aria-label="Spec version frame" />
          <output id="tl-label" for="tl-range">${frames.length ? frames[frames.length - 1].v : ""}</output>
        </div>
        <pre class="code" id="tl-frame" aria-live="polite"><code>${frames.length ? frames[frames.length - 1].text ?? "(absent in this version)" : ""}</code></pre>
      </div>
    `;
  });
}

function wireTimelapse(root: HTMLElement, frames: Any[]): void {
  const range = root.querySelector<HTMLInputElement>("#tl-range");
  const play = root.querySelector<HTMLButtonElement>("#tl-play");
  const label = root.querySelector<HTMLElement>("#tl-label");
  const frame = root.querySelector<HTMLElement>("#tl-frame code");
  const sel = root.querySelector<HTMLSelectElement>("select[name=ex]");
  if (!range || !play || !label || !frame) return;
  const show = (i: number) => {
    const f = frames[i];
    range.value = String(i);
    label.textContent = f.v;
    frame.textContent = f.text ?? "(absent in this version)";
  };
  let timer: number | null = null;
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    play.textContent = "Play";
    play.setAttribute("aria-pressed", "false");
  };
  play.addEventListener("click", () => {
    if (timer !== null) return stop();
    play.textContent = "Pause";
    play.setAttribute("aria-pressed", "true");
    let i = Number(range.value);
    if (i >= frames.length - 1) i = -1;
    timer = window.setInterval(() => {
      i++;
      if (i >= frames.length) return stop();
      show(i);
    }, 1200);
  });
  range.addEventListener("input", () => {
    stop();
    show(Number(range.value));
  });
  sel?.addEventListener("change", () => {
    location.hash = `#/spec/timelapse?ex=${encodeURIComponent(sel.value)}`;
  });
}
