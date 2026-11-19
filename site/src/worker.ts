// Playground worker. Each request runs here so a runaway program can be stopped by
// terminating the worker. Compiler contract: see site/README.md.
import { runWasi } from "@toolkit/wasi-browser.ts";
import { countInstructions } from "./lib/wasm.ts";

const BASE: string = import.meta.env.BASE_URL;
const VERSION = /^[\w.+-]{1,40}$/;
const scope = self as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(m: unknown): void };

const modules = new Map<string, Promise<Any>>();
type Any = any;

function compilerFor(version: string | null): Promise<Any> {
  const key = version ?? "";
  let p = modules.get(key);
  if (!p) {
    p = (async () => {
      if (!version) return import("@compiler");
      if (!VERSION.test(version)) throw new Error(`bad compiler version: ${version}`);
      return import(/* @vite-ignore */ new URL(`${BASE}compilers/${version}/main.js`, self.location.href).href);
    })();
    modules.set(key, p);
    p.catch(() => modules.delete(key));
  }
  return p;
}

scope.onmessage = async (ev: MessageEvent) => {
  const { id, op, src, version, stdin } = ev.data as { id: number; op: string; src: string; version: string | null; stdin?: string };
  try {
    const mod = await compilerFor(version);
    let result: Any;
    if (op === "format") {
      result = { text: String(mod.format(src)) };
    } else {
      const c: Any = mod.compile(src);
      const diagnostics = c.diagnostics ?? [];
      const wasm: Uint8Array | undefined = c.wasm ? new Uint8Array(c.wasm) : undefined;
      const stats = wasm ? { size: wasm.byteLength, instructions: countInstructions(wasm) } : null;
      if (op === "check") result = { ok: !!c.ok, diagnostics, stats };
      else if (op === "run") {
        if (!c.ok || !wasm) result = { ok: false, diagnostics, stats: null };
        else {
          const out = await runWasi(wasm, { stdin: stdin ?? "" });
          result = { ok: true, diagnostics, stats, run: out };
        }
      } else throw new Error(`unknown op: ${op}`);
    }
    scope.postMessage({ id, ok: true, result });
  } catch (e) {
    scope.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};

