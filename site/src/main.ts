import "./style.css";
import { setHTML, html } from "./lib/dom.ts";
import { type Ctx } from "./lib/data.ts";
import * as home from "./views/home.ts";
import * as playground from "./views/playground.ts";
import * as spec from "./views/spec.ts";
import * as work from "./views/work.ts";
import * as bench from "./views/bench.ts";
import * as audit from "./views/audit.ts";

type Route = [RegExp, (c: Ctx) => unknown, string];

const routes: Route[] = [
  [/^$/, home.render, ""],
  [/^playground$/, playground.render, "playground"],
  [/^spec$/, spec.render, "spec"],
  [/^spec\/history$/, spec.history, "spec"],
  [/^spec\/timelapse$/, spec.timelapse, "spec"],
  [/^rfcs$/, work.rfcs, "rfcs"],
  [/^rfcs\/([^/]+)$/, work.rfc, "rfcs"],
  [/^agents$/, work.agents, "agents"],
  [/^bench$/, bench.render, "bench"],
  [/^audit$/, audit.render, "audit"],
  [/^bootstrap$/, work.bootstrap, "bootstrap"],
  [/^digests$/, work.digests, "digests"],
];

const el = document.getElementById("app") as HTMLElement;
let gen = 0;

function mark(nav: string): void {
  for (const a of document.querySelectorAll<HTMLAnchorElement>("header nav a")) {
    if (a.dataset.nav === nav && nav) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function route(): void {
  const my = ++gen;
  const raw = location.hash.replace(/^#\/?/, "");
  const qi = raw.indexOf("?");
  const path = (qi >= 0 ? raw.slice(0, qi) : raw).replace(/\/+$/, "");
  const q = new URLSearchParams(qi >= 0 ? raw.slice(qi + 1) : "");
  window.scrollTo(0, 0);
  for (const [re, view, nav] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    mark(nav);
    const ctx: Ctx = {
      el,
      args: m.slice(1).map((s) => decodeURIComponent(s ?? "")),
      q,
      alive: () => my === gen,
    };
    void view(ctx);
    return;
  }
  mark("");
  setHTML(el, html`<h1>Not found</h1><p><a href="#/">Back to home</a></p>`);
}

window.addEventListener("hashchange", route);
route();
