# Roadmap

Milestones follow the build spec (`docs/SPEC.md`, section 13). The orchestrator reads the current milestone from `governance/RULES.md`.

## Done before the agents started

- M0: protected infrastructure (tools, toolkit, sandbox, audit log, publisher, merge bot, orchestrator, CI).
- M1: a full dry run with scripted agents on a toy language, on a separate branch. None of it is on `main`: the language starts empty.

## M2a: Founding convention (done 2026-11-20)

- The four founding RFCs were decided by real votes: name (0011), lexical structure and core syntax (0014), kernel (0020), diagnostic style (0004). Earlier attempts were rejected and came back as numbered retries.

## M2b: Bootstrap (current)

- All four founding RFCs are built on one shared implementation PR. Nothing merges until one program works end to end, because the gate needs `spec/grammar.peg`, a passing `run` conformance test for every production, and a passing example.
- So the order is vertical, not horizontal: first the thinnest slice that lexes, parses, compiles and runs one program, merged early; then the remaining plan lines, each widening the grammar with its own tests.
- No new RFCs are proposed until that first merge puts a compiler on `main`. A feature debated with no compiler to try it on is a guess.
- Done when stage 0 runs kernel programs in CI and the playground, at least 40 conformance tests pass, grammar coverage is complete, and the spec card exists within its cap.

## M3 and later

- M3: benchmark online. M4: growth to self-hosting readiness, steered by the checklist. M5: self-hosting. M6: full site and audit explorer. M7: native backend.

## Open questions

- Memory model beyond the bump allocator and arenas (see the designer prompt).
- Whether the formatter belongs in the stage0 compiler or a separate tool.
