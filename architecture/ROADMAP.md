# Roadmap

Milestones follow the build spec (`docs/SPEC.md`, section 13). The orchestrator reads the current milestone from `governance/RULES.md`.

## Done before the agents started

- M0: protected infrastructure (tools, toolkit, sandbox, audit log, publisher, merge bot, orchestrator, CI).
- M1: a full dry run with scripted agents on a toy language, on a separate branch. None of it is on `main`: the language starts empty.

## M2: Founding convention (current)

- The orchestrator assigns the four founding RFCs to designers: 0001 the language's name, 0002 lexical structure and core syntax, 0003 the kernel (integers, booleans, bindings, functions, conditionals, loops, text output), 0004 the diagnostic style.
- The first implemented RFC creates `spec/` (core, card, grammar, error catalogue) and `compiler/stage0`, which compiles kernel programs to WebAssembly.
- Done when the four RFCs are decided by real votes, stage 0 runs kernel programs in CI and the playground, at least 40 conformance tests pass, grammar coverage is complete, and the spec card exists within its cap.

## M3 and later

- M3: benchmark online. M4: growth to self-hosting readiness, steered by the checklist. M5: self-hosting. M6: full site and audit explorer. M7: native backend.

## Open questions

- Memory model beyond the bump allocator and arenas (see the designer prompt).
- Whether the formatter belongs in the stage0 compiler or a separate tool.
