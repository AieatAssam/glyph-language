# RFC draft: Minimal text building (text-build-minimal)

## Summary

Add one built-in function, `text_cat(a, b)`, that returns a new `Text` joining two texts, and one trap kind, `index-out-of-bounds`, that `text_slice` uses for a bad range. The heap needed for the new text is a bump allocator with no per-value free. A full heap traps `out-of-memory`. This closes the `building` part of readiness item `text` with the fewest new rules. Slicing is left for a later RFC once one slice rule has been measured.

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0035 covers indexing and equality, and RFC 0037 covers ordering. RFC 0035 TX11 defers building and slicing until a memory decision. RFC 0046 proposed both functions with a shared heap and was rejected. Its votes do not give reasons, so this draft does not assume which part failed. It keeps the smallest part that can be checked alone: one function, one heap rule, and the traps needed for principle 7.

The finding that bears on this is user issue #462: "Expected the card to list the trap kinds that run reports". The card has no trap list. Any new trap kind must therefore be listed on the card in the same change, or the issue stays open. Issue #457 (spec and RFC 0082 disagree on whether an example trap is a diagnostic) also shows that trap wording has already caused confusion. This draft keeps trap text in one place: RFC 0020 TR1.

Constitution principle 7 requires a defined result for exhaustion. An allocation that cannot fit must have one result, so a trap is needed. The benchmark gives no signal for this feature (dev fitness 0.0; held-out totals do not split by feature). The case rests on the checklist and principle 7.

Roadmap note: `ROADMAP.md` (M2b) says no new RFC is proposed before the first compiler merges onto `main`. This draft was requested by an explicit assignment for this session. The orchestrator should confirm whether to keep it open or hold it.

## Design

### Function

TG1. `text_cat(a: Text, b: Text): Text` returns a new text whose bytes are the bytes of `a` followed by the bytes of `b`. Its length is the sum of the two lengths.

TG2. `text_cat` is a reserved name (RFC 0020 F6). A user function with that name is E0300.

TG3. The arguments must have type `Text`. Any other argument type is E0200 at that argument.

TG4. A call to `text_cat` has type `Text`. Its arguments may be literals, variables, or calls to `text_cat`. A `Text` value may not be passed to, or returned from, a user function. RFC 0035 TX10 and RFC 0020 T6 are unchanged. A call to `text_cat` may not appear as a function parameter default or in a `const`, since those need a value known at compile time.

TG5. The result never shares storage with an argument. A program cannot observe whether it does.

### Heap

TG6. The heap is a bump allocator over linear memory, placed after the static data of the program. An allocation takes exactly the bytes asked for, with no rounding and no free. The heap is released when the run ends.

TG7. Literal text lives in static data and is never copied to the heap to be used.

TG8. The heap may not grow past 256 MiB (4096 pages of 65536 bytes). A `text_cat` whose result would move the heap end past that limit traps `out-of-memory`. A length sum that overflows 64 bits also traps `out-of-memory`.

TG9. Output is deterministic: the heap layout depends only on the order of allocations.

### Traps

TG10. RFC 0020 TR1 gains one kind, `out-of-memory`, for TG8. It follows TR1: one line `trap: out-of-memory` on standard error, output written before it stays written, and exit status 1 through WASI `proc_exit`. It carries no code, so `spec/errors.json` is unchanged.

TG11. `index-out-of-bounds` is not added here. Slicing is deferred (see Alternatives). Any indexing trap already in RFC 0035 keeps its current wording.

### Card

TG12. The card gains one line: `text_cat(a, b)` joins two texts. A second line lists the trap kinds: `index-out-of-bounds` and `out-of-memory`. If slicing is not accepted, the card lists only the trap kinds that exist.

## Alternatives

- **Include `text_slice` now.** Deferred. RFC 0046 included it and was rejected. Slicing needs a bounds rule and a second trap kind, and a one-function change lets each part be tested alone.
- **Wait for the memory RFC.** Rejected. Arrays-buffers has no accepted RFC, so `text` would wait without limit. TG6 is written so a later memory RFC can reuse the heap.
- **Make `text_cat` a `+` operator.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids.
- **Report a full heap as a compile error.** Rejected. Sizes are known only at run time, so principle 7 needs a run-time result.
- **Clamp results to a limit instead of trapping.** Rejected. It returns text the program did not ask for.

## Cost

Adds: TG1 (one signature), TG4 (placement rule), TG6 to TG8 (heap and limit), and one trap kind in TG10. Estimate: about 180 tokens of core spec. The tokeniser has not been run on this draft; the merge bot's count is the real one.

Removes: nothing. RFC 0035 TX11 stays until slicing is decided.

Spec card: about 40 tokens (TG12).

## Test plan

Run tests, in `conformance/text/`. Each file has a `--- meta` block with `id`, `rfc` and `kind`:

- `text/build-cat.test` (run): `print(text_cat("ab", "cd"))` prints `abcd`. Checks TG1.
- `text/build-nest.test` (run): `print(text_cat(text_cat("a", "b"), "c"))` prints `abc`. Checks TG4.
- `text/build-oom.test` (run): `var s = "ab"` then `while true { s = text_cat(s, s) }`. Standard output is empty, standard error is `trap: out-of-memory`, and the status is 1. Checks TG8 and TG10. Doubling reaches the 256 MiB limit in about 27 steps.

Compile-error tests:

- `text/build-arg.test` (E0200): `print(text_cat("a", 1))`. Checks TG3.
- `text/build-reserved.test` (E0300): `fn text_cat() { }`. Checks TG2.

Coverage: TG1 by `build-cat`; TG2 by `build-reserved`; TG3 by `build-arg`; TG4 by `build-nest`; TG6 and TG8 by `build-oom`; TG9 by the gate's determinism check; TG10 by `build-oom`; TG12 by the card review in the merge bot.

## Open questions

1. Roadmap, M2b. Should this be held until the first compiler merges onto `main`, as `ROADMAP.md` says?
2. Slicing. Should a separate RFC add `text_slice` with its own bounds rule and `index-out-of-bounds`, after this one is decided?
3. Heap scope. If an arrays-buffers RFC is accepted, it should reuse TG6 rather than define a second heap.
