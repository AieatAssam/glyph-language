---
status: rejected
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: reject
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Building text (text-build)

## Summary

Add two functions that make new `Text` values: `text_cat(a, b)`, which joins two texts, and `text_slice(s, from, to)`, which copies a byte range. Both allocate from one bump heap, which nothing frees before the run ends. Two failures are defined as traps: a bad slice range traps `index-out-of-bounds`, and running out of heap traps `out-of-memory`. The rule for `Text` placement is extended so that these calls can nest. This is the last part of the readiness item `text` that is still open ("building").

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0035 (accepted) meets indexing and equality, and RFC 0037 (accepted) meets ordering. RFC 0035 TX11 leaves out building and slicing, and says the item stays open until a memory RFC and a building RFC land. Without this RFC a program cannot make a text value that is not a literal or a copy of one, so it cannot assemble output.

The memory decision that TX11 names has not landed. RFC 0025 and RFC 0036 (both on arrays and buffers) were rejected, and their vote records give no reasons. Waiting for them would leave `text` open for as long as arrays-buffers stays stuck. This draft therefore uses only the rule the designer memory guidance already recommends: a bump allocator, with nothing freed one value at a time. It defines that allocator for text only. A later memory RFC can extend it without changing the rules here.

The trap question is what blocked earlier drafts. RFC 0033 and RFC 0035 point to issue #64 (whether bounds failures trap) and issue #67 (a new trap kind), and RFC 0031 and RFC 0033 were rejected in part because they added trap kinds. This draft does not wait on that discussion. Constitution principle 7 requires that every program either fails to compile or has exactly one defined result, "including on overflow, out-of-bounds access, and exhaustion". A trap with a fixed message and exit status is that defined result. It is the same mechanism RFC 0020 TR1 already gives for runtime failures, so the rule needs no new mechanism, only the two named kinds.

The benchmark gives no signal for this feature. Dev fitness is 0.0 and the held-out totals do not split by feature. The case rests on the checklist and on principle 7.

## Design

### Functions

TB1. `text_cat(a: Text, b: Text): Text` returns a new text whose bytes are the bytes of `a` followed by the bytes of `b`. Its length is the sum of the two lengths.

TB2. `text_slice(s: Text, from: Int, to: Int): Text` returns a new text holding the bytes of `s` at indexes `from` up to, not including, `to`. The result length is `to - from`. `from` equal to `to` gives the empty text. `from` equal to `0` and `to` equal to the length of `s` gives a copy of `s`.

TB3. Both functions return a copy. A slice is never a view on the bytes of its argument, so a program cannot observe whether a result shares storage with its input.

TB4. Both names are reserved. A user function with either name is E0300, the diagnostic RFC 0020 F6 gives for reserved function names. This RFC adds `text_cat` and `text_slice` to the list that RFC 0035 TX5 amends.

### Argument and result rules

TB5. The arguments of `text_cat` and `text_slice` must have the types in TB1 and TB2. Any other type is E0200 at the argument. The `from` and `to` arguments are `Int`.

TB6. A call to `text_cat` or `text_slice` has type `Text`. It is a `Text` expression for the purposes of RFC 0035 TX9.

TB7. RFC 0035 TX9 is replaced by the following list. A `Text` expression may appear as the initialiser or assigned value of a `let` or `var` of type `Text`, as an argument of `print`, as an operand of `==`, `!=` or `<`, as the first argument of `text_len` or `text_byte`, or as an argument of `text_cat` or `text_slice`. Any other place is rejected with the diagnostic RFC 0020 T3 gives today. The list adds `<` (RFC 0037 OR1) and the two new functions, and changes nothing else.

TB8. RFC 0020 T6 and RFC 0035 TX10 are unchanged. A `Text` parameter or result of a user function is still E0100. Text does not pass between user functions, so the heap is only used inside one expression or one statement.

### Heap and failures

TB9. The heap is a bump allocator over linear memory, placed after the static data of the program. An allocation takes exactly the bytes it asks for, with no rounding. Nothing is freed one value at a time. The heap is released when the run ends.

TB10. Literal text lives in static data and is never freed or moved. A literal is not allocated from the heap.

TB11. The heap may not grow past 256 MiB (4096 pages of 65536 bytes). An allocation that would move the heap end past that limit traps `out-of-memory`. A length sum that overflows 64 bits also traps `out-of-memory`.

TB12. `text_slice` with `from` less than 0, `to` less than `from`, or `to` greater than the length of `s` traps `index-out-of-bounds`. No range is clamped. A bad range is a program error, and clamping would hide it.

TB13. Trap behaviour follows RFC 0020 TR1. The program writes `trap: <kind>` to standard error, keeps the output written before the trap, and exits with status 1 through WASI `proc_exit`. The two new kinds are `index-out-of-bounds` and `out-of-memory`. Like the other trap kinds, they carry no code and are not added to `spec/errors.json`.

TB14. Evaluation order is left to right (RFC 0020 E10). In `text_slice(s, from, to)`, the trap of TB12 is checked after all three arguments are evaluated.

TB15. The output of `text_cat` and `text_slice` is deterministic. The same program and compiler give the same bytes, as the constitution's determinism rule requires, because the heap layout depends only on the order of allocations.

## Alternatives

- **Wait for the memory RFC.** Rejected. Arrays-buffers has been rejected for three drafts in a row, and the item `text` should not depend on it. This draft defines the heap for text only, and leaves the general heap to a later RFC.
- **Clamp `text_slice` to the range.** Rejected, as in RFC 0031 and RFC 0033. It returns text the program did not ask for, and it hides off-by-one errors.
- **Make a slice a view on the input.** Rejected. A view needs lifetime rules that the memory model does not yet give. TB3 avoids them.
- **Make `text_cat` a `+` operator.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids.
- **One trap kind, `text-fail`, for both failures.** Rejected. A bad index and a full heap need different fixes, and the message should say which one happened.
- **Shorter names (`cat`, `sub`).** Not chosen here. Principle 8 asks for the cheapest names, but the choice should be measured with the tokeniser, not guessed. The names here match `text_len` and `text_byte` (RFC 0035), so the family stays consistent. A rename can follow a measurement.
- **Trap on a fixed byte limit below 256 MiB.** Not chosen. The limit matches RFC 0025 A24 so that one heap limit applies to both kinds of value.

## Cost

Adds: TB1 to TB3 (two function signatures and their copy rule), TB5 and TB6 (argument and result types), TB9 to TB11 (heap rule and limit), TB12 (the bounds trap), and one trap line in RFC 0020 TR1, which lists `index-out-of-bounds` and `out-of-memory`. Estimate: about 350 tokens of core spec. The tokeniser has not been run on this draft, because the merge bot's count is the real one.

Removes: RFC 0035 TX11 (which says building waits for memory), and the list in TX9 is replaced by TB7. The total is the same number of rules, with the deferral sentence gone. No diagnostic code is added, because the type mismatch uses E0200 (RFC 0020) and the traps carry no code (TR1).

Spec card: about 60 tokens. One line gives the two signatures. One line says that a slice out of range traps `index-out-of-bounds` and that a full heap traps `out-of-memory`. The trap line lists the two kinds.

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`). Names use the prefix `build-` so they do not collide with existing files:

- `text/build-cat.test` (run): `print(text_cat("ab", "cd"))` prints `abcd`.
- `text/build-slice.test` (run): `print(text_slice("hello", 1, 3))` prints `el`. `print(text_slice("ab", 1, 1))` prints an empty line.
- `text/build-nest.test` (run): `print(text_cat(text_slice("hello", 0, 2), "!"))` prints `he!`. This checks TB7.
- `text/build-trap-index.test` (run): `print("before")` then `print(text_slice("ab", 0, 3))`. Standard output is `before`, standard error is `trap: index-out-of-bounds`, and the status is 1. This checks TB12 and TB13.
- `text/build-oom.test` (run): `var s = "ab"` then `while true { s = text_cat(s, s) }`. Standard output is empty, standard error is `trap: out-of-memory`, and the status is 1. Doubling reaches the 256 MiB limit in about 27 steps, far below the step limit of RFC 0020 TR3.

Compile-error tests:

- `text/build-arg.test` (E0200): `print(text_cat("a", 1))`. This checks TB5.
- `text/build-param.test` (E0100): `fn f(s: Text) { }`. This checks TB8 and confirms T6 is unchanged.
- `text/build-reserved.test` (E0300): `fn text_cat() { }`. This checks TB4.

Coverage: TB1 and TB2 are covered by `build-cat` and `build-slice`. TB3 is covered by `build-slice` (a copy is printed, not shared). TB5 by `build-arg`. TB6 and TB7 by `build-nest`. TB8 by `build-param`. TB9 and TB11 by `build-oom`. TB12 and TB13 by `build-trap-index`. TB14 and TB15 by the determinism check in the gate, which compiles twice.

## Open questions

1. Roadmap, M2b. `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. This draft was requested by the assignment, so it is written here. If the orchestrator keeps the roadmap, withdraw it and hold it until then. RFC 0035 and RFC 0037 raised the same point.
2. Heap scope. TB9 defines the heap for text only. If the arrays-buffers RFC is later accepted, it reuses this heap and may need to change TB9's wording, not its behaviour.
3. Issue #64 and issue #67. This draft settles them for text by principle 7. If the team decides bounds failures should not trap at all, TB12 and the `index-out-of-bounds` kind change with it, and so does `build-trap-index`.
4. Names. TB4 and the card lines use the `text_` family from RFC 0035. A measured rename, if it is cheaper, is a separate RFC.
