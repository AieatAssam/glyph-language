# Glyph site

Static site for GitHub Pages at `/glyph-language/`. Vite and TypeScript, no framework.

## Build

```sh
cd /Users/aieat/git/glyph-language && python3 site/build_data.py   # repo state -> site/public/data/*.json
cd site && npm install && npm run build                              # output in site/dist
npm run dev                                                          # runs build_data.py first
npm test                                                             # node --test on src/lib
```

`build_data.py` reads git read-only and the repository files. Every JSON file is deterministic and
safe to regenerate. `site/public/data/` is generated and gitignored.

## Playground contract

The playground imports the compiler as `@compiler` and the WASI shim as `@toolkit/wasi-browser.ts`.
Both aliases are set in `vite.config.ts`. `@compiler` resolves to `compiler/<ACTIVE>/browser.ts`, which
must be a browser-safe entry that implements the module contract below. The current `stage0` entry
is a Node CLI that imports `node:fs`, so it has no browser entry yet and `@compiler` falls back to a stub
that reports "The compiler is not built yet". The rest of the site still works.

### Compiler module

`@compiler` (the active compiler, mapped from `compiler/ACTIVE`) and older compilers at
`compilers/<version>/main.js` export:

```ts
compile(src: string): {
  ok: boolean;
  wasm?: Uint8Array;            // present when ok; instruction count and size are read from it
  diagnostics: Diagnostic[];
};
format(src: string): string;    // optional; the Format button reports it unavailable if it throws

interface Diagnostic {
  code: string;                 // for example "E0207"
  message: string;
  line: number;                 // 1-based
  col: number;                  // 1-based
  fix?: { label: string; start: number; end: number; text: string }; // offsets into src
}
```

A `fix` replaces `src.slice(start, end)` with `text`. The user applies it with the button in the
diagnostics list, and the playground re-checks.

### Older compilers

`site/public/compilers/index.json` lists the older compilers the picker offers:

```json
{"items": [{"version": "0.2.0"}]}
```

Each one lives at `site/public/compilers/<version>/main.js` and follows the module contract above.
The version string must match `[\w.+-]{1,40}`.

### Running programs

The worker calls `runWasi(wasm, { stdin })` from `@toolkit/wasi-browser.ts`. It returns
`{ exitCode, stdout, stderr, trap }`. The shim is minimal WASI preview 1 with stdio, args, env,
clocks, random and `proc_exit`. There is no filesystem.

### Limits and sharing

Each request runs in a Web Worker with a 5 second limit. A stuck worker is terminated and replaced.
Share links encode the source as base64url (UTF-8) in `#/playground?s=...&v=...`.

## Data files

Views read only these JSON files from `public/data/`: `home.json`, `spec.json`, `why.json`,
`history/index.json`, `history/<v>.json`, `rfcs.json`, `rfc/<n>.json`, `agents.json`, `bench.json`,
`bench/<date>.json`, `audit.json`, `audit/<k>.json`, `bootstrap.json`, `digests.json`.
