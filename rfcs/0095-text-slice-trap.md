---
status: rejected
votes: {}
---
# RFC draft: Text slicing with a range trap (text-slice-trap)

## Summary

Add one built-in function, `text_slice(t, i, j)`, of type `(Text, Int, Int) -> Text`. It returns the bytes of `t` from index `i` up to but not including index `j`. If the range is not `0 <= i <= j <= text_len(t)`, the program traps with the new kind `slice-range`, as RFC 0020 TR1 describes. The result is a view into the bytes of `t`, so the call allocates nothing. This closes the `slicing` part of readiness item `text` (`docs/SPEC.md`, section 9). It amends RFC 0035 TX11 to allow slicing, and leaves building deferred. It builds on RFC 0035 (text-query), RFC 0037 (text-order), RFC 0020 (kernel-v8) and RFC 0014 (lexical-syntax-v3).

## Motivation

Readiness item `text` asks for "indexing, slicing, comparison, and building". RFC 0035 (accepted) gives indexing, length and equality. RFC 0037 (accepted) gives ordering. Both defer slicing and building together, because RFC 0035 TX11 says both need the memory decision. Slicing does not need that decision if a slice is a view into static data, because every `Text` value at this stage is a literal or a copy of one (RFC 0035 TX11). This is the same observation RFC 0091 made. This draft differs from 0091 in one choice: what a bad range does.

RFC 0091 returned the empty text for a bad range. That choice is rejected here, for a concrete reason. An empty text is a legal result when `i == j`, so a program cannot tell a bad range from a correct empty slice without a second check. An off-by-one error then produces wrong data with no visible failure. A trap stops the run, names the failure, and sets exit status 1. Principle 7 of the constitution asks for exactly one defined result per program, and a trap is one. A trap needs no new diagnostic code, because traps carry no code (RFC 0020 TR1).

The choice here differs from RFC 0035 TX2, which returns `-1` for an out-of-range `text_byte`. `-1` is not a legal byte index, so a program can check for it. An empty text is a legal slice, so it cannot be checked this way. That is why slicing traps while `text_byte` does not.

The benchmark gives no per-feature signal. Dev fitness is 0.0, and held-out totals do not split by feature. The held-out `read` score (0.8584) is the lowest held-out metric. That is a reason to put the behaviour on the card, not a measured result for slicing.

Open user issues that point at the same gap, all about what the card says:

- #502 asks what integer division by zero does. The card answers this by listing the trap kind (RFC 0020 TR1).
- #492 asks what integer arithmetic does on overflow. The same answer applies.
- #483 asks the card to list the built-in functions. A `text_slice` line is one such entry.
- #506 asks the card to list operators and the operand types each accepts. A signature line for `text_slice` answers that for one function.

This draft does not claim that any of these issues would be closed by it alone. It gives the card one more built-in, and it states what that built-in does on a bad input, in the same form the card already uses for overflow and division.

## Design

### Function

TS1. `text_slice(t, i, j)` has type `(Text, Int, Int) -> Text`. It is a built-in with one signature, and no name is overloaded.

TS2. Let `n` be `text_len(t)`. If `0 <= i <= j <= n`, the result is the `j - i` bytes of `t` starting at byte index `i`, counting from 0 (RFC 0035 TX4). Otherwise the program traps with kind `slice-range`. A slice with `i == j` inside the range is legal and returns the empty text.

TS3. The result is a view. It records the address and length of the bytes it covers and copies none of them. Its bytes are read-only. This is safe at this stage because every `Text` value refers to static data (RFC 0035 TX11). Open question 2 covers the heap case.

TS4. Arguments are evaluated left to right (RFC 0020 E10): `t`, then `i`, then `j`. The range check runs after all three are evaluated. A trap in an argument happens before the range check. `text_slice` reads no state other than its arguments and allocates nothing.

TS5. `text_slice` is a reserved name. It is added to RFC 0020 F6 the same way RFC 0035 TX5 adds `text_len` and `text_byte`. A user function with that name is rejected with the reserved-name diagnostic F6 already gives.

### Trap kind

TS6. RFC 0020 TR1 is amended to add a fifth kind:
   - `slice-range`: `text_slice` is called with `i < 0`, `j < i`, or `j > text_len(t)` (TS2).

The trap line is `trap: slice-range`, exit status 1, as TR1 already requires. The kind is not a diagnostic code and is not added to `spec/errors.json`.

TS7. The trap is not in the signature of `text_slice`, which follows RFC 0020 E9 and TR1. Issue #64 remains open. If the team later makes failures visible in signatures, this function's signature changes with the rest of the language.

### Where a slice may appear

TS8. RFC 0035 TX9 is amended. A `text_slice` call is a `Text` expression. It may appear wherever a text literal may: as the initialiser or assigned value of a `let` or `var` of type `Text`, as an argument of `print`, as an operand of `==` or `!=`, and as the first argument of `text_len`, `text_byte` or `text_slice`. Any other place is rejected with the diagnostic RFC 0020 T3 gives.

TS9. RFC 0035 TX10 is unchanged. A `Text` parameter or result of a user function is still rejected, so text cannot pass between user functions until the memory decision.

### What stays deferred

TS10. RFC 0035 TX11 is amended to defer building only. Concatenation and any other operation that makes a new `Text` value not pointing into static data wait for a memory RFC. The readiness item `text` stays open until that building RFC lands.

## Alternatives

- **Empty text for a bad range (RFC 0091).** Rejected. It cannot be told apart from a correct empty slice, so an off-by-one error produces wrong data silently (see Motivation).
- **`-1` sentinel, as in `text_byte`.** Rejected. A `Text` value has no sentinel that is not a legal value. A sentinel would need an option type.
- **Return an option.** Cleaner, but `option` needs variant types (records-variants item). Revisit then.
- **Clamp the range to the text.** Rejected. It returns bytes the program did not ask for, and hides the same error as the empty result.
- **Include concatenation now (RFC 0089, RFC 0046).** Rejected here. Building needs heap memory and an out-of-memory trap, and that decision has not been made.
- **Slice by start and length, `text_slice(t, i, n)`.** Not chosen. Start and end give one range rule, `0 <= i <= j <= text_len(t)`, that is simple to test. Both forms have the same token cost, so this is a choice of reading, not size.

## Cost

Adds: the signature (TS1), the range rule and trap (TS2), the view rule (TS3), the reserved name (TS5), the trap kind (TS6), and the placement amendment (TS8). Estimate: about 180 tokens of core spec. The tokeniser has not been run on this draft, so this figure is an estimate. The merge bot's count is the real one.

Removes: the words in RFC 0035 TX11 that defer slicing. The building deferral stays. No grammar production is added, so the grammar file does not change.

Spec card: about 60 tokens. Two changes: one line for the signature, "`text_slice(t, i, j)` gives bytes `i` up to `j`; a range outside `0 <= i <= j <= text_len(t)` traps `slice-range`", and `slice-range` added to the trap list. The card's trap list grows from four kinds to five. Growth of the core spec needs a simplification elsewhere under the constitution, and none is proposed here. The designer assumes the merge bot will report the net change and will reject the RFC if it exceeds the cap.

No new diagnostic code is added. The trap kind is not a code.

## Test plan

Run tests and trap tests, in `conformance/text/`. Each file has a `--- meta` block with `id`, `rfc` and `kind`. The `rfc` value is the four-digit number the publisher assigns to this RFC, and `0035` for the text query rules it builds on. Trap tests use `expect-exit` and `expect-stderr`, which the conformance checker already supports.

- `text/slice.test` (run): `print(text_slice("hello", 1, 3))` prints `el`, exit 0. Checks TS2.
- `text/slice-bounds.test` (run): `print(text_len(text_slice("hi", 0, 0)))` and `print(text_len(text_slice("hi", 2, 2)))` each print `0`, exit 0. Checks TS2 at both legal empty positions.
- `text/slice-whole.test` (run): `print(text_slice("hi", 0, 2))` prints `hi`, exit 0. Checks TS2 at the full range.
- `text/slice-view.test` (run): `var t = text_slice("hello", 1, 4)` then `print(text_byte(t, 0))` prints `101`, exit 0. Checks TS3 and TS8 for a `var`.
- `text/slice-equal.test` (run): `print(text_slice("abc", 0, 2) == "ab")` prints `true`, exit 0. Checks TS8 for an operand of `==`.
- `text/slice-trap-negative.test` (trap): `print(text_len(text_slice("hi", -1, 1)))`, exit 1, stderr contains `trap: slice-range`. Checks TS2 and TS6.
- `text/slice-trap-past-end.test` (trap): `print(text_len(text_slice("hi", 0, 3)))`, exit 1, stderr contains `trap: slice-range`. Checks TS2 at the upper bound.
- `text/slice-trap-reversed.test` (trap): `print(text_len(text_slice("hi", 2, 1)))`, exit 1, stderr contains `trap: slice-range`. Checks TS2 for `j < i`.
- `text/slice-arg-order.test` (trap): `print(text_len(text_slice("hi", -1, 9)))`, exit 1, stderr contains `trap: slice-range`. A bad `i` and a bad `j` give the same single trap, and the program does not trap before the range check. Checks TS4.

Compile-error tests:

- `text/slice-missing-comma.test` (compile-error, `expect-errors` lists `E0100`): `print(text_slice("a" 0 1))`. Checks the argument list in the grammar.

Coverage: TS1 and TS2 by `slice`, `slice-bounds`, `slice-whole` and the three range traps; TS3 by `slice-view`; TS4 by `slice-arg-order`; TS6 by all three trap tests; TS8 by `slice-view` and `slice-equal`. TS5 has no test yet, because the reserved-name code is not settled. TS7 has no test, because it is a non-decision that the tests cannot show. A wrong argument type (for example a `Bool` for `i`) has no test, because the type-mismatch code waits on issue #31.

## Open questions

1. Roadmap. `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. This draft is written because the assignment asks for a `text` proposal this session. The orchestrator should decide whether to keep it open or hold it until that merge.
2. Views and heap. TS3 assumes every `Text` value points into static data, which holds while RFC 0035 TX11 keeps heap text out. A memory RFC that adds heap text must say whether a slice of a heap text may be a view or must copy.
3. Issue #64. If the team decides failures appear in signatures, `text_slice` changes with every other trapping function. This draft does not decide #64.
4. Issue #67 (trap kinds). This draft adds one kind. If the team wants a shared kind for all range failures, `slice-range` is the name to merge into it.
5. Type-mismatch code for `i` and `j`, and the reserved-name code for TS5. Both wait on issue #31 and on the catalogue.
6. Building. Open, and handled by a later RFC after the memory decision. The `text` item stays open until then.
