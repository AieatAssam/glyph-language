import { html, setHTML, type Raw } from "../lib/dom.ts";
import { load, page, BASE, hash, type Ctx, type Any } from "../lib/data.ts";
import { b64urlEncode, b64urlDecode } from "../lib/b64.ts";

// One worker, replaced when a request times out. Requests carry an id so stale replies are ignored.
let worker: Worker | null = null;
let nextId = 1;
const TIMEOUT_MS = 5000;

function ask(msg: Record<string, unknown>): Promise<Any> {
  return new Promise((resolve, reject) => {
    if (!worker) worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
    const w = worker;
    const id = nextId++;
    const timer = window.setTimeout(() => {
      w.terminate();
      if (worker === w) worker = null;
      reject(new Error(`stopped after ${TIMEOUT_MS / 1000}s; the program may loop forever`));
    }, TIMEOUT_MS);
    const onMsg = (ev: MessageEvent) => {
      if (ev.data.id !== id) return;
      clearTimeout(timer);
      w.removeEventListener("message", onMsg);
      if (ev.data.ok) resolve(ev.data.result);
      else reject(new Error(ev.data.error));
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ ...msg, id });
  });
}

interface Diag {
  code: string;
  message: string;
  line: number;
  col: number;
  fix?: { label: string; start: number; end: number; text: string };
}

const CHECK_DEBOUNCE_MS = 350;

export function render(c: Ctx): Promise<void> {
  return page(c, async (w): Promise<Raw> => {
    const idx: Any = await fetch(`${BASE}compilers/index.json`).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }));
    const versions: string[] = ["current", ...(idx.items ?? []).map((i: Any) => i.version)];
    const shared = c.q.get("s");
    let initial = "";
    if (shared) {
      try {
        initial = b64urlDecode(shared);
      } catch {
        initial = "";
      }
    } else {
      initial = await sampleProgram();
    }
    const wanted = c.q.get("v");
    const version = wanted && versions.includes(wanted) ? wanted : "current";
    w.push(() => wire(c.el));
    return html`
      <h1>Playground</h1>
      <div class="pg">
        <div class="pg-edit">
          <label for="src">Source</label>
          <textarea id="src" spellcheck="false" rows="18" aria-describedby="status">${initial}</textarea>
          <div class="toolbar">
            <label>Compiler <select id="ver">${versions.map((v) => html`<option value="${v}"${v === version ? " selected" : ""}>${v}</option>`)}</select></label>
            <button type="button" id="run">Run</button>
            <button type="button" id="fmt">Format</button>
            <button type="button" id="share" class="ghost">Share link</button>
          </div>
          <p id="share-out" class="share" hidden><label for="share-url">Link</label> <input id="share-url" readonly /></p>
        </div>
        <div class="pg-out">
          <p id="status" role="status" class="muted">Checking…</p>
          <h2>Diagnostics</h2>
          <ul id="diags" class="plain diags"></ul>
          <h2>Output</h2>
          <dl class="stats"><dt>Wasm size</dt><dd id="st-size">n/a</dd><dt>Instructions</dt><dd id="st-ins">n/a</dd></dl>
          <pre class="code" id="stdout" aria-label="program output"><code></code></pre>
          <pre class="code err" id="stderr" hidden><code></code></pre>
        </div>
      </div>
      <p class="muted">Runs in a Web Worker with a 5 second limit. The playground is a convenience. The spec and the compiler are the authority. <a href="${hash("spec")}">Spec</a>.</p>
    `;
  });
}

async function sampleProgram(): Promise<string> {
  try {
    const idx: Any = await load("history/index.json");
    const last = (idx.items ?? []).at(-1);
    if (!last) return "";
    const snap: Any = await load(`history/${last.version}.json`);
    const first = Object.values(snap.examples ?? {})[0];
    return typeof first === "string" ? first : "";
  } catch {
    return "";
  }
}

function wire(root: HTMLElement): void {
  const src = root.querySelector<HTMLTextAreaElement>("#src")!;
  const ver = root.querySelector<HTMLSelectElement>("#ver")!;
  const status = root.querySelector<HTMLElement>("#status")!;
  const diagsEl = root.querySelector<HTMLElement>("#diags")!;
  const stdout = root.querySelector<HTMLElement>("#stdout code")!;
  const stderr = root.querySelector<HTMLElement>("#stderr")!;
  const stderrCode = stderr.querySelector("code")!;
  const size = root.querySelector("#st-size")!;
  const ins = root.querySelector("#st-ins")!;
  const runBtn = root.querySelector<HTMLButtonElement>("#run")!;
  const fmtBtn = root.querySelector<HTMLButtonElement>("#fmt")!;
  const shareBtn = root.querySelector<HTMLButtonElement>("#share")!;
  const shareOut = root.querySelector<HTMLElement>("#share-out")!;
  const shareUrl = root.querySelector<HTMLInputElement>("#share-url")!;

  const version_ = () => (ver.value === "current" ? null : ver.value);
  let timer = 0;
  let seq = 0;

  const showDiags = (diags: Diag[]) => {
    setHTML(
      diagsEl,
      html`${diags.map(
        (d, i) => html`<li class="diag">
          <div><code>${d.code}</code> <span class="muted">${d.line}:${d.col}</span></div>
          <div>${d.message}</div>
          ${d.fix ? html`<button type="button" class="linkish" data-fix="${i}">Apply fix: ${d.fix.label}</button>` : html``}
        </li>`,
      )}`,
    );
    if (!diags.length) diagsEl.innerHTML = '<li class="muted">No diagnostics.</li>';
  };

  let lastDiags: Diag[] = [];
  const check = async () => {
    const my = ++seq;
    try {
      const r = await ask({ op: "check", src: src.value, version: version_() });
      if (my !== seq) return;
      lastDiags = r.diagnostics;
      showDiags(lastDiags);
      size.textContent = r.stats ? `${r.stats.size} bytes` : "n/a";
      ins.textContent = r.stats ? String(r.stats.instructions) : "n/a";
      status.textContent = r.ok ? "Compiles." : `${lastDiags.length} problem${lastDiags.length === 1 ? "" : "s"}.`;
    } catch (e) {
      if (my !== seq) return;
      status.textContent = e instanceof Error ? e.message : String(e);
      diagsEl.innerHTML = "";
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(check, CHECK_DEBOUNCE_MS);
  };
  src.addEventListener("input", schedule);
  ver.addEventListener("change", () => void check());
  void check();

  diagsEl.addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-fix]");
    const d = btn && lastDiags[Number(btn.dataset.fix)];
    if (!d?.fix) return;
    const { start, end, text } = d.fix;
    src.value = src.value.slice(0, start) + text + src.value.slice(end);
    void check();
  });

  runBtn.addEventListener("click", async () => {
    stdout.textContent = "Running…";
    stderr.hidden = true;
    try {
      const r = await ask({ op: "run", src: src.value, version: version_() });
      if (!r.ok) {
        stdout.textContent = "Not run: the program does not compile.";
        return;
      }
      stdout.textContent = r.run.stdout || "(no output)";
      if (r.run.stderr || r.run.trap) {
        stderr.hidden = false;
        stderrCode.textContent = [r.run.stderr, r.run.trap ? `trap: ${r.run.trap}` : ""].filter(Boolean).join("\n");
      }
    } catch (e) {
      stdout.textContent = e instanceof Error ? e.message : String(e);
    }
  });

  fmtBtn.addEventListener("click", async () => {
    try {
      const r = await ask({ op: "format", src: src.value, version: version_() });
      src.value = r.text;
      void check();
    } catch (e) {
      status.textContent = `Format unavailable: ${e instanceof Error ? e.message : e}`;
    }
  });

  shareBtn.addEventListener("click", () => {
    const params = new URLSearchParams({ s: b64urlEncode(src.value) });
    if (ver.value !== "current") params.set("v", ver.value);
    shareUrl.value = `${location.origin}${location.pathname}#/playground?${params.toString()}`;
    shareOut.hidden = false;
    shareUrl.select();
  });
}

