// Data access and page scaffolding. Every view loads only the JSON it shows, cached per path.
// Shapes come from site/build_data.py; they are typed loosely on purpose.
import { esc, setHTML, type Raw } from "./dom.ts";

export type Any = any;

export const BASE: string = import.meta.env.BASE_URL;

export interface Ctx {
  el: HTMLElement;
  args: string[];
  q: URLSearchParams;
  alive: () => boolean; // false once the router has moved on
}

const cache = new Map<string, Promise<Any>>();

export function load<T = Any>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`${BASE}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json() as Promise<T>;
    });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p;
}

export type Wire = Array<() => void>;

// Renders the result of fn into the view, then runs any wiring fn queued in w. Shows an error if fn fails.
export async function page(c: Ctx, fn: (w: Wire) => Promise<Raw>): Promise<void> {
  c.el.innerHTML = '<p class="muted" role="status">Loading…</p>';
  const w: Wire = [];
  try {
    const r = await fn(w);
    if (c.alive()) {
      setHTML(c.el, r);
      w.forEach((f) => f());
    }
  } catch (e) {
    if (c.alive()) c.el.innerHTML = `<p class="error" role="alert">${esc(e instanceof Error ? e.message : e)}</p>`;
  }
}

export const short = (sha: unknown) => (typeof sha === "string" && sha ? sha.slice(0, 8) : "n/a");
export const when = (ts: unknown) => (typeof ts === "string" && ts ? ts.slice(0, 16).replace("T", " ") : "");
export const pct = (x: number | null | undefined) => (typeof x === "number" ? `${Math.round(x * 100)}%` : "n/a");
export const num = (x: unknown) => (typeof x === "number" ? x.toFixed(2) : "n/a");
export const hash = (path: string) => `#/${path}`;
