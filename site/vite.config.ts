import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

// The compiler and toolkit live outside site/. The playground needs a browser-safe entry
// (compiler/<ACTIVE>/browser.ts) that exports the contract in site/README.md. The Node CLI
// entries import node:fs and cannot be bundled for the browser, so they are never used here.
// When no browser entry exists, @compiler resolves to a stub that reports the missing compiler.
const MISSING = "\0missing:";
function compilerEntry(): string | null {
  const actFile = path.join(repo, "compiler/ACTIVE");
  const active = fs.existsSync(actFile) ? fs.readFileSync(actFile, "utf8").trim() : "";
  const entry = path.join(repo, "compiler", active, "browser.ts");
  return active && fs.existsSync(entry) ? entry : null;
}

const aliases: Plugin = {
  name: "glyph-aliases",
  enforce: "pre",
  resolveId(id) {
    if (id === "@compiler") return compilerEntry() ?? MISSING + "compiler";
    if (id.startsWith("@toolkit/")) {
      const p = path.join(repo, "toolkit", id.slice("@toolkit/".length));
      return fs.existsSync(p) ? p : MISSING + "toolkit:" + id;
    }
    return null;
  },
  load(id) {
    if (id === MISSING + "compiler")
      return 'export function compile(){ throw new Error("The compiler is not built yet."); }\nexport function format(){ throw new Error("No formatter yet."); }';
    if (id.startsWith(MISSING + "toolkit:"))
      return 'export async function runWasi(){ throw new Error("The WASI shim is not available."); }';
    return null;
  },
};

export default defineConfig({
  base: "/glyph-language/",
  plugins: [aliases],
  worker: { format: "es", plugins: () => [aliases] },
  server: { fs: { allow: [".."] } },
  build: { outDir: "dist", emptyOutDir: true },
});
