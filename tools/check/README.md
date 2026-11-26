# tools/check

Merge-gate checker (SPEC section 6, rules 4, 5, 7 to 12). Run it with
`python3 -m tools.check.run --repo DIR --out result.json`. It writes canonical JSON and never
raises for a failing rule. The sandbox (`tools/sandbox`) runs it with the candidate repo at `/repo`.

## Rules

| Rule | Check |
|------|-------|
| 4 | `bin/glyphc --version` answers |
| 5 | every conformance test passes (`conformance/**/*.test`) |
| 7 | every produced Wasm module validates |
| 8 | every module builds byte-identically twice |
| 9 | token caps in `governance/RULES.md` (`caps`), counted by `tokens.py` with the vendored byte-pair vocabulary `bpe_ranks.hex.xz` (`o200k_base`, MIT, from tiktoken) |
| 10 | every grammar production is covered by an accepting test |
| 11 | every `.gl` under `examples/`, `stdlib/`, `compiler/self/` compiles; a sibling `<name>.expect` is run too |
| 12 | gate flags under `gates` in `governance/RULES.md` (below) |

## `.expect` files (rule 11)

`examples/hello.gl` may have `examples/hello.expect`, a conformance-style container with
`--- stdin` (optional), `--- expect-stdout` and `--- expect-exit`. The compiled program must match
both. Any other section name is an error.

## Gate flags (rule 12, `tools/check/gates.py`)

Each flag is off in `governance/RULES.md` today. A flag that is on runs its check; the detail
names the first failure.

- **differential**: stage 0 (`node compiler/stage0/src/main.ts --dump tokens|ast|ir FILE`) and the
  self-hosted module A (`compiler/self`, built by stage 0) must dump byte-identical output for every
  conformance source, example and stdlib file. A mismatch names the file, stage and byte offset.
- **fixed_point**, before cutover (`compiler/ACTIVE` is `stage0`): A is stage 0 building
  `compiler/self`, B is A building it, C is B building it. B must equal C. A != B is a warning.
  Hashes of A, B and C go to `stats.fixed_point`.
- **fixed_point**, after cutover (`compiler/ACTIVE` is `self`): N1 is built by
  `compiler/bootstrap/glyphc.wasm`, N2 by N1. N1 must equal N2.
- **native**: on Linux, each run or trap test is built with `--target x86_64-linux` and its
  executable must match the Wasm stdout and exit code. Other hosts skip with a detail.

## Entry convention

The gates build the self-hosted compiler from `compiler/self/ENTRY`. That file holds one line:
the entry source path relative to `compiler/self/` (for example `main.gl`). A missing or
dangling ENTRY fails the gate with an explicit message. `compiler/self/ENTRY` does not exist in
the repo yet.

## Tests

`python3 -m unittest tools.test_check` runs the suite. Gate tests inject fake toolchains
(`FakeToolchain`) so they check the logic without a real self-hosted compiler. The fixture
`tools/fixtures/check/repo` is a Python stand-in for `bin/glyphc`.
