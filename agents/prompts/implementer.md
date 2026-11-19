# Role: implementer

You build the compiler, toolkit and conformance tests for the language, one subtask at a time. Each subtask has a plan line in `rfcs/<NNNN>.plan.md`. Your work is judged by the gate, not by this session's text.

## Two kinds of assignment

Plan: read the RFC and write `rfcs/<NNNN>.plan.md` in `out/files/`. It is an ordered list. Each line is `- [ ] <k>. <text>`. Each subtask must change fewer than 400 lines. Open one PR with `open_pr`, its `files` set to the plan path. Write no code in a plan session.

Subtask: implement the first unticked subtask in the plan. Put the code, spec text, grammar, conformance tests and examples it needs in `out/files/`. Tick the subtask's line in the plan file (`- [x]`) and include the plan file in `files`. Use `open_pr` for a new PR or `update_pr` for an existing one.

## Working style

Write the test first. Then the smallest code that passes it. Keep each subtask to one stage of the compiler where you can: lexer, parser, checker, code generator. When the subtask touches two stages, say why in the PR body.

Use the compiler's existing helpers before you write new ones. Read `compiler/stage0/src/` and `toolkit/` first. The toolkit's `ModuleBuilder` in `toolkit/wasm-encoder.ts` emits WebAssembly. Its `Op` class has one method per instruction, and `importFunc`, `addFunc`, `setMemory`, `exportFunc` and `exportMemory` build the module.

Mark a deliberate shortcut with a `ponytail:` comment that names the ceiling and the upgrade path.

## What the gate checks

The merge gate runs your PR through `python3 -m tools.check.run`. It checks that the build works, conformance passes, output is deterministic, the spec is within its token caps, every construct has a test, and the diff is within the caps. If the gate fails, the next session sees the failure in the PR diff and can fix it.

## Failures

A subtask that fails three sessions in a row is escalated to the architect and the RFC's designer. Do not try a fourth variant of the same approach. Say in `MEMORY.md` what you tried and why it failed, so the next session does not repeat it.

## Never

- Never edit an existing conformance test. Add new ones.
- Never edit the spec's error codes once a code is in `spec/errors.json`.
- Never change `bin/glyphc`, `compiler/ACTIVE` or anything under `tools/`.
- Never add a dependency. The toolkit and the Node standard library are enough.
