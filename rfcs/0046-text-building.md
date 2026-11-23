# RFC draft: Building text (text-building)

## Summary

Add two built-in functions that make new `Text` values: `text_cat(a, b)`, which joins two texts, and `text_slice(s, from, to)`, which copies a byte range. Both copy from one bump heap that nothing frees one value at a time. A bad slice range traps `index-out-of-bounds`. Running out of heap traps `out-of-memory`. Together with the rule for where `Text` may appear, this closes the readiness item `text` for "building" and "slicing", the two parts RFC 0035 TX11 left open.

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0035 (accepted) covers indexing and equality. RFC 0037 (accepted) covers ordering. RFC 0035 TX11 says building and slicing wait for a memory decision. Without this RFC, a program cannot make a text value that is not a literal or a copy of one, so it cannot assemble output.

The memory decision has not landed. Every arrays-buffers draft in `rfcs/` (0008, 0010, 0022, 0023, 0025, 0027, 0029, 0032, 0036 to 0041, 0043, 0045) is rejected, and none is accepted. User issue #361 reports that arrays-buffers has no accepted RFC and twelve rejections with no reasons. Waiting for that decision keeps `text` open indefinitely. This draft therefore defines only what text needs: a bump heap with no per-value free. It is written so that a later memory RFC can reuse it without changing the rules here.

Principle 7 of the constitution settles the trap question. It requires that every program "either fails to compile with a diagnostic or has exactly one defined result, including on overflow, out-of-bounds access, and exhaustion". A slice with a bad range and a full heap are both reachable at run time, so each needs a defined result. A trap with a fixed message and exit status is that result, and RFC 0020 TR1 already gives the mechanism. The only change is to name two kinds. RFC 0031 and RFC 0033 are both rejected, and both added trap kinds. This draft adds two kinds because the constitution requires them, and the Alternatives section says so.

The benchmark gives no signal for this feature. Dev fitness is 0.0, and the held-out totals do not split by feature. The case rests on the readiness checklist and on principle 7.

Note on the roadmap: `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. This draft was requested by an explicit assignment for this session, so it is written now. Open question 1 asks the orchestrator to confirm this.

## Design

### Functions

TG1. `text_cat(a: Text, b: Text): Text` returns a new text whose bytes are the bytes of `a` followed by the bytes of `b`. Its length is the sum of the two lengths.

TG2. `text_slice(s: Text, from: Int, to: Int): Text` returns a new text holding the bytes of `s` at indexes `from` up to, not including, `to`. Its length is `to - from`. `from` equal to `to` gives the empty text.

TG3. Both functions return a copy. A result never shares storage with an argument, so a program cannot observe whether it does.

TG4. `text_cat` and `text_slice` are reserved names. A user function with either name is E0300, the diagnostic RFC 0020 F6 gives for reserved names. This amends RFC 0035 TX5 to add the two names.

### Argument and result rules

TG5. The arguments must have the types in TG1 and TG2. Any other argument type is E0200 at that argument.

TG6. A call to either function has type `Text`.

TG7. This amends RFC 0035 TX9. A `Text` expression may also appear as an argument of `text_cat` or `text_slice`. The list is otherwise unchanged. This makes nested calls such as `text_cat(text_slice(s, 0, 2), "!")` legal. Any other place is rejected with the diagnostic RFC 0020 T3 gives today.

TG8. RFC 0035 TX11 is withdrawn. RFC 0035 TX10 and RFC 0020 T6 are unchanged. A `Text` parameter or result of a user function is still rejected, so text values live only within one expression or statement.

### Heap and traps

TG9. The heap is a bump allocator over linear memory, placed after the static data of the program. An allocation takes exactly the bytes it asks for, with no rounding. Nothing is freed one value at a time. The heap is released when the run ends.

TG10. Literal text lives in static data. It is never copied to the heap to be used, and it is never freed or moved.

TG11. The heap may not grow past 256 MiB (4096 pages of 65536 bytes). An allocation that would move the heap end past that limit traps `out-of-memory`. A length sum that overflows 64 bits also traps `out-of-memory`.

TG12. `text_slice` with `from < 0`, `to < from`, or `to > len(s)` traps `index-out-of-bounds`. No range is clamped. A bad range is a program error, and clamping would hide it.

TG13. RFC 0020 TR1 gains two kinds:
   - `index-out-of-bounds`: a `text_slice` range is outside the text (TG12);
   - `out-of-memory`: the heap would pass its limit (TG11).

   Both follow TR1: one line `trap: <kind>` on standard error, output written before the trap stays written, exit status 1 through WASI `proc_exit`. Neither carries a code, so neither is added to `spec/errors.json`.

TG14. Evaluation is left to right (RFC 0020 E10). In `text_slice(s, from, to)`, the check in TG12 runs after all three arguments are evaluated.

TG15. The output of both functions is deterministic. The heap layout depends only on the order of allocations, so the same program and compiler give the same bytes.

## Alternatives

- **Wait for the memory RFC.** Rejected. Arrays-buffers has failed for several drafts, and `text` should not depend on it. This draft defines the heap for text only.
- **Clamp `text_slice` to the range.** Rejected, as in RFC 0031 and RFC 0033. It returns text the program did not ask for, and it hides off-by-one errors.
- **Make a slice a view on its input.** Rejected. A view needs lifetime rules that the memory model does not yet give. TG3 avoids them.
- **Make `text_cat` a `+` operator.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids.
- **One trap kind for both failures.** Rejected. A bad index and a full heap need different fixes, and the message should say which one happened.
- **No new trap kinds: report both failures as a compile-time error.** Rejected. A slice range and a heap size are known only at run time, so principle 7 cannot be met by a compile error alone.
- **Shorter names (`cat`, `sub`).** Not chosen here. Principle 8 asks for the cheapest names, but that choice should be measured with the tokeniser. The `text_` names match `text_len` and `text_byte` (RFC 0035), so the family stays consistent. A rename can follow a measurement.
- **Heap limit below 256 MiB.** Not chosen. The limit matches RFC 0022 AR23 and RFC 0010 item 18, so one limit applies to all heap values once a memory RFC is accepted.

## Cost

Adds: TG1 and TG2 (two signatures), TG3 (the copy rule), TG5 to TG7 (argument, result and placement rules), TG9 to TG11 (heap rule and limit), TG12 (the bounds rule), and the two trap kinds in TG13. Estimate: about 300 tokens of core spec. The tokeniser has not been run on this draft, so the merge bot's count is the real one.

Removes: RFC 0035 TX11, which defers building. The sentence is replaced by TG8. No diagnostic code is added: the type mismatch uses E0200, the reserved names use E0300, and the traps carry no code.

Spec card: about 50 tokens. One line gives the two signatures. One line says that a bad slice range traps `index-out-of-bounds` and a full heap traps `out-of-memory`. The trap line in the card lists the two new kinds.

## Test plan

Run tests, in `conformance/text/`. Each file has a `--- meta` block with `id`, `rfc` and `kind`:

- `text/build-cat.test` (run): `print(text_cat("ab", "cd"))` prints `abcd`.
- `text/build-slice.test` (run): `print(text_slice("hello", 1, 3))` prints `el`. `print(text_slice("ab", 1, 1))` prints an empty line. This checks TG2 and TG3.
- `text/build-nest.test` (run): `print(text_cat(text_slice("hello", 0, 2), "!"))` prints `he!`. This checks TG7.
- `text/build-trap-index.test` (run): `print("before")` then `print(text_slice("ab", 0, 3))`. Standard output is `before`, standard error is `trap: index-out-of-bounds`, and the status is 1. This checks TG12 and TG13.
- `text/build-oom.test` (run): `var s = "ab"` then `while true { s = text_cat(s, s) }`. Standard output is empty, standard error is `trap: out-of-memory`, and the status is 1. Doubling reaches the 256 MiB limit in about 27 steps, well below the step limit of RFC 0020 TR3.

Compile-error tests:

- `text/build-arg.test` (E0200): `print(text_cat("a", 1))`. This checks TG5.
- `text/build-param.test` (E0200 or E0100, as RFC 0020 T6 already gives): `fn f(s: Text) { }`. This checks TG8 and confirms that text parameters are still rejected.
- `text/build-reserved.test` (E0300): `fn text_cat() { }`. This checks TG4.

Coverage: TG1 and TG2 by `build-cat` and `build-slice`. TG3 by `build-slice`. TG5 by `build-arg`. TG7 by `build-nest`. TG8 by `build-param`. TG9 and TG11 by `build-oom`. TG12 and TG13 by `build-trap-index`. TG14 and TG15 by the gate's determinism check, which compiles twice.

## Open questions

1. Roadmap, M2b. `ROADMAP.md` says no new RFC before the first compiler merges onto `main`. This draft was requested by an explicit assignment. If the orchestrator keeps the roadmap, withdraw it and hold it until then.
2. Heap scope. TG9 defines the heap for text only. If an arrays-buffers RFC is later accepted, it should reuse this heap rather than define a second one. That RFC may need to change TG9's wording, not its behaviour.
3. Trap kinds. TG13 adds two kinds because principle 7 requires a defined result for out-of-bounds access and exhaustion. If the team decides a different mechanism satisfies principle 7, TG13 and the two tests that use it change together.
4. Names. TG4 and the card lines use the `text_` family from RFC 0035. A measured rename, if cheaper, is a separate RFC.
