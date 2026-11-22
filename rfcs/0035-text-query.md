---
amends: RFC 0020 T3 (where Text may appear), RFC 0020 E3 (equality operand types),
  RFC 0020 F6 (reserved names)
builds-on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8)
class: language
slug: text-query
status: accepted
supersedes: none. A smaller step at the readiness item `text`, after RFCs 0007, 0026,
  0028, 0030, 0031 and 0033 were rejected.
votes:
  designer-min: reject
  designer-safe: approve
  impl-1: approve
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Text length, byte access and equality

## Summary

Give `Text` two built-in functions, `text_len` and `text_byte`, and allow `==` and `!=` on two `Text` operands. Both functions are total: each returns one defined `Int` for every argument, and neither can fail, allocate, or stop the program. There is no concatenation, slicing, ordering, or new heap value in this RFC. It is the smallest step that lets a program inspect a text literal and compare two of them.

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0020 T3 says a `Text` value can only be bound, assigned and printed, so none of the four is met.

Six drafts for this item have been rejected: 0007, 0026, 0028, 0030, 0031 and 0033. Their vote records give no reasons. The open user issues show why the item keeps stalling, and this draft is built around them:

- Issue #64 and principle 3 of the constitution. Principle 3 says whether a function can fail is visible in its signature. RFC 0020 E9 and TR1 say traps are not part of a signature. A draft that adds a trapping operation has to take a side on #64. The two functions here cannot fail, so principle 3 holds for them without deciding #64.
- Issue #67 (trap kinds). Adding an out-of-bounds trap would add a kind. This draft adds none.
- Issues #68 and #69. RFC 0026 TX6 orders `Text`, which conflicts with the accepted grammar. This draft adds no ordering, so it does not restate that rule.
- Issues #52 and #54. This draft does not touch `>`, `>=`, `<=` or the RFC 0011 message rule.
- Issue #37 (tab and `\t`). RFC 0014 already decides it: tabs are errors, and `\t` is not an escape, so `"\t"` is E0005. This draft relies on that decision and does not reopen it.
- Issues #73 and #75 (the card has no syntax). The card gets the two signatures and one line on `-1`, so a model reading the card can call the functions.
- Principle 7 of the constitution: no undefined behaviour. A total operation has one defined result for every input, including out-of-range indexes.

RFC 0033 is the closest prior draft. It added slicing, concatenation and allocation, and it added a new trap kind for memory. Those parts need the memory decision, which is not made. This draft leaves them out. What remains is small enough that the team can see its whole cost.

The benchmark gives no signal for text. Dev fitness is 0.0 and the held-out totals do not split by feature, so the case here is a design argument and not a measured one.

## Design

### Literals

TX1. A text literal is written as RFC 0014 rule 9 defines it. The only escapes are `\n`, `\"` and `\\`. Any other backslash sequence, including `\t` and `\q`, is E0005. A tab or other control character inside a literal is E0001 (RFC 0014 rule 2). This RFC adds no literal form.

### Built-in functions

TX2. Two built-in functions. Each has one signature, and no name is overloaded.

| Function | Type | Effects | Result |
| --- | --- | --- | --- |
| `text_len(t)` | `(Text) -> Int` | none | The number of bytes in `t`. |
| `text_byte(t, i)` | `(Text, Int) -> Int` | none | The byte at index `i`, counting from 0, as a value from 0 to 255. If `i < 0` or `i >= text_len(t)`, the result is `-1`. |

TX3. Arguments are evaluated left to right (RFC 0020 E10). Then the table applies. Neither function allocates, traps, or reads state other than its arguments. A caller can rely on each call returning exactly one `Int`.

TX4. Indexes count bytes. There is no code-point or grapheme operation. A program that needs code points waits for the standard library.

TX5. `text_len` and `text_byte` are reserved names. RFC 0020 F6 already reserves `print`, `Int`, `Bool` and `Text`, and F6 is amended to add these two. A user function with either name is rejected with the diagnostic F6 already gives for reserved names.

### Equality

TX6. RFC 0020 E3 is amended so that `==` and `!=` accept two `Text` operands and compare them byte for byte. The result is `Bool`.

TX7. `<`, `<=`, `>` and `>=` do not accept `Text` (issue #69). Their result on `Text` is the same type error as a mixed-type comparison in TX8.

TX8. A `==` or `!=` with one `Text` operand and one operand of another type is a type error. The code is the one that issue #31 settles for type mismatch. This RFC does not choose it and adds no new code.

### Where Text may appear

TX9. RFC 0020 T3 is replaced by this rule. A `Text` expression may appear as the initialiser or assigned value of a `let` or `var` of type `Text`, as an argument of `print`, as an operand of `==` or `!=`, or as the first argument of `text_len` or `text_byte`. Any other place is rejected with the diagnostic that RFC 0020 T3 gives today.

TX10. RFC 0020 T6 is unchanged. A `Text` parameter or result of a user function is still rejected, so text cannot pass between user functions. That waits for the memory decision.

### What is not in this RFC

TX11. No concatenation, slicing, or building of new `Text` values. A `Text` value in a running program is a literal or a copy of one. Building needs heap memory, and the memory decision (bump allocator and arenas, from the designer's memory rules) comes first. The readiness item `text` stays open until that RFC lands.

## Alternatives

- **Trapping bounds check on `text_byte`.** Rejected. It needs a decision on #64 and a new trap kind (#67), and this RFC is meant to make neither decision.
- **`text_byte` returning an option.** Cleaner than `-1`, but the language has no variant types yet. Revisit with the records-variants item. Until then, `-1` is the only sentinel and the card must say so.
- **Clamped `text_byte` (returns the nearest byte).** Rejected. It returns a byte the program did not ask for, and hides off-by-one errors that `-1` makes visible.
- **Ordering on `Text`.** Deferred. Equality is enough for matching keywords and names. Ordering needs a follow-on RFC once #69 is settled.
- **`text_cat` and `text_slice` now (as in RFC 0033).** Rejected here. Both allocate, so both need the memory decision first. Adding them now would also add an out-of-memory trap, which is the decision #64 is about.
- **`+` for concatenation.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids.

## Cost

Adds: two built-in signatures (TX2), the `Text` case of `==` and `!=` (TX6), the placement rule that replaces T3 (TX9), and two reserved names (TX5). Estimate: about 150 tokens of core spec. This figure is an estimate, because the tokeniser has not been run on this draft. The merge bot's count is the real one.

Removes: the sentence in RFC 0020 T3 that gives `Text` no operation, and the words in E3 that give `Text` no equality. No trap kind is added. No diagnostic code is added: TX5 and TX9 reuse the codes RFC 0020 already gives. TX1 reuses E0005 and E0001, which `spec/errors.json` already lists.

Spec card: about 40 tokens. Two lines: the two signatures, and "`text_byte` gives `-1` out of range". The card gains no trap line, because nothing here traps.

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`):

- `text/len.test` (run): `print(text_len("hello"))` prints `5`. `print(text_len(""))` prints `0`.
- `text/byte.test` (run): `print(text_byte("hello", 1))` prints `101`.
- `text/byte-range.test` (run): `print(text_byte("hi", 2))` prints `-1`, and `print(text_byte("hi", -1))` prints `-1`.
- `text/equal.test` (run): `print("ab" == "ab")` prints `true`, and `print("ab" != "abc")` prints `true`.
- `text/escapes.test` (run): `text_len` of `"\n"`, `"\""` and `"\\"` prints `1` each.
- `text/var.test` (run): `var t = "hi"` then `print(text_byte(t, 0))` prints `104`. This checks TX9 for a `var`.

Compile-error tests:

- `text/tab-escape.test` (E0005): `print("\t")`. This checks TX1 and the decision in RFC 0014.
- `text/bad-escape.test` (E0005): `print("\q")`.
- `text/missing-comma.test` (E0100): `print(text_len("a") "b")`.

Coverage: TX2 is covered by `len`, `byte` and `byte-range`. TX6 is covered by `equal`. TX9 is covered by `var`. TX1 is covered by `escapes` and the two E0005 tests. The ordering rule TX7 and the mixed-type rule TX8 have no test yet, because the code they use is not settled (issue #31, and issue #69 for ordering). They are added when those issues close.

## Open questions

1. Roadmap, M2b. `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. The assignment asked for this one, so it is drafted here. If the orchestrator keeps the roadmap, withdraw it and hold it until then.
2. `-1` as the out-of-range result of `text_byte`. It is total but it is a sentinel. Replace it when variant types exist, and say so on the card.
3. The code for a mixed-type `==` (TX8). Waits on issue #31.
4. Building text. The checklist word "building" is not met by this RFC (TX11). The item stays open until the memory decision and a building RFC land.
5. "Comparison" in the checklist. This draft reads it as equality. If the team reads it as ordering, a follow-on RFC adds one rule to E4, after issue #69 is settled.
6. Traps. This RFC adds none, so issue #64 is not decided here. If the team later makes every failure visible in a signature, these two functions need no change, because they cannot fail.
