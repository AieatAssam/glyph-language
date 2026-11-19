// HTML building with escaping by default. Agent-written text is untrusted:
// every interpolation is escaped unless it is a Raw value produced here.

export class Raw {
  readonly v: string;
  constructor(v: string) {
    this.v = v;
  }
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
}

function str(v: unknown): string {
  if (v instanceof Raw) return v.v;
  if (Array.isArray(v)) return v.map(str).join("");
  if (v === null || v === undefined || v === false) return "";
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += str(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export function setHTML(el: Element, r: Raw): void {
  el.innerHTML = r.v;
}

export function safeHref(u: unknown): string {
  const s = String(u ?? "").trim();
  // http(s), in-page #fragments, and scheme-less relative URLs only.
  return /^(https?:\/\/|#|\.{0,2}\/|[^:\/?#]+(?:[\/?#]|$))/i.test(s) && !/^\/\//.test(s) ? s : "#";
}

function inline(src: string): string {
  let t = esc(src);
  const codes: string[] = [];
  t = t.replace(/`([^`]+)`/g, (_: string, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_: string, txt: string, url: string) =>
    `<a href="${safeHref(url)}" rel="noopener noreferrer">${txt}</a>`);
  return t.replace(/\u0000(\d+)\u0000/g, (_: string, i: string) => codes[Number(i)]);
}

// Minimal markdown: escape first, then mark up. Headings, lists, fences, code, bold, links.
export function md(src: unknown): string {
  const out: string[] = [];
  let para: string[] = [];
  let list = false;
  let code: string[] | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push("</ul>");
    list = false;
  };
  for (const line of String(src ?? "").split("\n")) {
    if (code) {
      if (/^\s*```/.test(line)) {
        out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(line);
      continue;
    }
    if (/^\s*```/.test(line)) {
      flush();
      closeList();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flush();
      closeList();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      closeList();
      const lvl = Math.min(h[1].length + 2, 6);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) {
      flush();
      if (!list) {
        out.push("<ul>");
        list = true;
      }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    closeList();
    para.push(line);
  }
  if (code) out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
  flush();
  closeList();
  return out.join("");
}
