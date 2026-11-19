# Roadmap

Milestones are counted from zero. The orchestrator reads the milestone number from state and decides what each phase may open.

## M0: Toy compiler and spec seed

- `compiler/stage0` compiles a line-based toy language to WebAssembly and runs it under WASI.
- `spec/` holds the seed core, the card, the grammar and the error catalogue.
- `conformance/toy/` holds the first tests.
- Done when the conformance runner passes and `bin/glyphc run examples/hello-numbers.toy` prints its output.

## M1: Toy print

- Designers open the first RFC on the toy print statement.
- Implementers build it from a plan, one subtask at a time.
- Done when the RFC is accepted and its conformance tests pass in CI.

## M2: Live language

- Founding RFCs: name, lexical syntax, kernel, diagnostic style.
- Designers open them round-robin, at most two open RFCs per designer and five in total.
- Checklist-steered proposals follow once the founding RFCs are accepted.

## Open questions

- Memory model beyond the bump allocator and arenas (see the designer prompt).
- Whether the formatter belongs in the stage0 compiler or a separate tool.
