---
amends: RFC 0035 TX9 (where Text may appear), RFC 0035 TX11 (what is deferred), RFC
  0035 TX5 and RFC 0020 F6 (reserved names)
builds-on: RFC 0035 (text-query), RFC 0020 (kernel-v8), RFC 0014 (lexical-syntax-v3)
class: language
slug: text-slice
status: rejected
supersedes: none. Takes the slicing part of the readiness item `text` that RFC 0035
  TX11 deferred, and leaves building (`text_cat`) for a later RFC after the memory
  decision.
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: reject
  tester: approve
  user-1: approve
  user-2: abstain
---
# RFC draft: Text slicing without allocation (text-slice)

## Summary

Add one built-in function, `text_slice(t, i, j)`, that returns the bytes of `t` from index `i` up to but not including index `j`. If the range is not `0 <= i <= j <= text_len(t)`, the result is the empty text. The function cannot trap and allocates nothing: a slice is a view into the bytes its first argument already points to. This closes the `slicing` part of readiness item `text` with no new trap kind, no new heap rule, and no new diagnostic code.

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0035 is accepted and covers indexing (`text_byte`), length and equality. Its TX11 defers slicing and building together, because RFC 0035 says both need the memory decision. RFC 0035 open question 4 says the item stays open until a building RFC lands.

Slicing does not need the memory decision. RFC 0035 TX11 keeps heap text out of this stage: every `Text` value is a literal or a copy of one, and literals live in static data. A slice of a literal can be a view, a start address and a length into static data, and no allocation happens. The earlier attempts combined slicing with building and a heap, so they could not be decided separately:

- RFC 0046 proposed slicing and building together, and was rejected.
- RFC 0089 (text-build-minimal) proposed `text_cat` with a bump heap and an `out-of-memory` trap, and left slicing out. It was rejected too.

This draft takes only the part that does not need the heap. That keeps the test of each decision separate.

Two open user issues bear on the choice:

- Issue #64 asks whether failures should be visible in a signature. Principle 3 of the constitution says they should. RFC 0020 E9 and TR1 say traps are not part of a signature. A slice that traps on a bad range would have to take a side on #64. This draft avoids that by having no trap.
- Issue #67 (trap kinds). This draft adds no trap kind, so the card's trap list does not change.
- Issue #462 asks the card to list the trap kinds that `run` reports. This draft adds none, so the card's trap list needs no change for it.
- Issue #457 shows that trap wording already causes confusion. This draft adds no trap wording.

The benchmark gives no per-feature signal. Dev fitness is 0.0, and the held-out totals do not split by feature. The held-out `read` score (0.8584) is the lowest of the held-out metrics. A model that reads the card needs the signature to call the function, so one card line is the cheapest change that could help. This is a design argument, not a measured result.

## Design

### Function

TS1. `text_slice(t, i, j)` has type `(Text, Int, Int) -> Text`. Its effects are none. It is a built-in, with one signature, and no name is overloaded.

TS2. Let `n` be `text_len(t)`. If `0 <= i <= j <= n`, the result is the `j - i` bytes of `t` starting at index `i`, counting from 0. Otherwise the result is the empty text, with length 0. Indexes count bytes (RFC 0035 TX4).

TS3. The result is a view. It records the address and length of the bytes it covers and copies none of them. Its bytes are read-only. A view never outlives its argument's storage, because every `Text` value at this stage refers to static data (see Open questions 2).

TS4. Arguments are evaluated left to right (RFC 0020 E10). `text_slice` never traps, never allocates, and reads no state other than its arguments. Every call returns exactly one `Text` value.

TS5. `text_slice` is a reserved name, added to RFC 0020 F6 in the same way RFC 0035 TX5 adds `text_len` and `text_byte`. A user function with that name is rejected with the reserved-name diagnostic.

### Where a slice may appear

TS6. RFC 0035 TX9 is amended. A `text_slice` call is a `Text` expression, so it may appear wherever a text literal may: as the initialiser or assigned value of a `let` or `var` of type `Text`, as an argument of `print`, as an operand of `==` or `!=`, and as the first argument of `text_len`, `text_byte` or `text_slice`. Any other place is rejected with the diagnostic RFC 0020 T3 already gives.

TS7. RFC 0035 TX10 is unchanged. A `Text` value, including a slice, may not be a parameter or result of a user function. Text cannot pass between user functions until the memory decision.

### What is still deferred

TS8. RFC 0035 TX11 is amended to defer building only. `text_cat` and any other operation that makes a new `Text` value that does not point into static data stay out of this RFC and wait for a memory RFC. The readiness item `text` stays open until building lands.

## Alternatives

- **Trap on a bad range.** Rejected. It needs a decision on #64 and a new trap kind (#67), and this RFC is meant to make neither decision.
- **Clamp the range to the text.** Rejected. It returns bytes the program did not ask for, and hides an off-by-one error. RFC 0035 rejects the same clamping for `text_byte`.
- **Return an option.** Cleaner than an empty text, but the language has no variant types yet (records-variants item). Revisit then.
- **Include `text_cat` now, as RFC 0046 and RFC 0089 did.** Rejected here. Building needs heap memory and an out-of-memory trap, and it is the part that has not been decided.
- **Slice by start and length, `text_slice(t, i, n)`.** Not chosen. Start and end (`[i, j)`) give one range rule, `0 <= i <= j <= text_len(t)`, that is simple to test. Both forms have the same token cost, so this is a choice of reading, not of size.

## Cost

Adds: the signature in TS1, the range rule in TS2, the placement amendment in TS6, and one reserved name in TS5. Estimate: about 120 tokens of core spec. The tokeniser has not been run on this draft. The merge bot's count is the real one.

Removes: the words in RFC 0035 TX11 that defer slicing. The building deferral stays.

Spec card: about 40 tokens. One line: "`text_slice(t, i, j)` gives bytes `i` up to `j`; any other range gives empty text." The card gains no trap line, because nothing here traps.

No new diagnostic code is added. This RFC reuses the codes that `spec/errors.json` already lists.

## Test plan

Run tests, in `conformance/text/`. Each file has a `--- meta` block with `id`, `rfc` and `kind`:

- `text/slice.test` (run): `print(text_slice("hello", 1, 3))` prints `el`. Checks TS2.
- `text/slice-whole.test` (run): `print(text_slice("hi", 0, 2))` prints `hi`. `print(text_len(text_slice("hi", 2, 2)))` prints `0`. Checks TS2 at both ends.
- `text/slice-range.test` (run): `print(text_len(text_slice("hi", -1, 1)))`, `print(text_len(text_slice("hi", 1, 0)))` and `print(text_len(text_slice("hi", 0, 3)))` each print `0`. The program exits 0, so no trap happens. Checks TS2 and TS4.
- `text/slice-view.test` (run): `var t = text_slice("hello", 1, 4)` then `print(text_byte(t, 0))` prints `101`. Checks TS3 and TS6 for a `var`.
- `text/slice-equal.test` (run): `print(text_slice("abc", 0, 2) == "ab")` prints `true`. Checks TS6 for an operand of `==`.

Compile-error tests:

- `text/slice-missing-comma.test` (E0100): `print(text_slice("a" 0 1))`. Checks the grammar for the argument list.

Coverage: TS1 and TS2 by `slice`, `slice-whole` and `slice-range`; TS3 by `slice-view`; TS4 by `slice-range`; TS6 by `slice-view` and `slice-equal`. TS5 has no test yet, because the code for a reserved-name diagnostic is not in `spec/errors.json`. The test is added when that code is catalogued. A wrong argument type has no test for the same reason: the type-mismatch code is the one issue #31 settles.

## Open questions

1. Roadmap, M2b. `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. This draft was requested by an explicit assignment for this session. The orchestrator should decide whether to keep it open or hold it.
2. Views and heap. This draft assumes every `Text` value points into static data, which holds while RFC 0035 TX11 keeps heap text out. A later memory RFC that adds heap text must say whether a slice of a heap text may be a view, or must copy. That RFC has to be written against TS3.
3. Empty result for a bad range. If the team decides that failures are visible in a signature (#64), an empty result could change to a trap. Until then, the empty result is the only defined value that does not need a new trap kind.
4. Type-mismatch code for `i` and `j`, and the reserved-name code for TS5. Both wait on issue #31 and on the catalogue.
5. Building. Open, and handled by a later RFC after the memory decision. The `text` item stays open until then.
