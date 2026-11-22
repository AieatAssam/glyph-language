---
amends: RFC 0020 T3 (where Text may appear), RFC 0020 E3 (equality operand types),
  RFC 0020 F6 (reserved names)
builds-on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8)
class: language
slug: text-total
status: rejected
supersedes: none; a sixth attempt at the readiness item `text`, after RFCs 0007, 0026,
  0028, 0030 and 0031
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: reject
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Text operations that cannot fail

## Summary

Give `Text` four built-in functions and equality, and make every one of them total: each call returns one defined value for every input, and none traps on a bad index or bad bounds. `Text` has no ordering. Literals and escapes are unchanged from RFC 0014. The only way an operation can stop the program is memory exhaustion, which is named in the Behaviour column and nowhere else.

## Motivation

The readiness item `text` (`docs/SPEC.md`, section 9) asks for "indexing, slicing, comparison, and building". RFC 0020 T3 says a `Text` value can only be bound, assigned and printed, so the item is not met.

Four earlier drafts (0007, 0026, 0028, 0030) and one smaller draft (0031) were rejected. Their vote records give no reasons, so this draft does not claim to answer a particular objection. What the open user issues show is that the trap question is unsettled and blocks every text draft:

- Issue #64 and principle 3 of the constitution. Principle 3 says whether a function can fail is visible in its signature. RFC 0020 E9 and TR1 say traps are not part of a signature. Each text draft that adds a trapping operation therefore takes a side in #64. This draft avoids the question by adding no trapping operation except allocation, see Memory.
- Issue #67 (trap kinds). Adding `index-out-of-bounds` would be a fifth kind. This draft adds none.
- Issue #68 and #69. RFC 0026 TX4 and RFC 0027 R7 disagree about traps in signatures, and RFC 0026 TX6 conflicts with the accepted grammar. This draft has no ordering on `Text`, so TX6 is not restated.
- Issue #52 and #54. This draft uses only `==` and `!=`, which RFC 0020 E3 already allows for `Int` and `Bool`. It does not touch `>`, `>=` or `<=`.
- Issue #73 and #75 (the card has no syntax). This draft adds a line to the card for the new functions and does not add source syntax to the card.
- Principle 7 of the constitution: no undefined behaviour, and every out-of-bounds access has one defined result. A total operation meets this directly.

The benchmark gives no signal for text. Dev fitness is 0.0 and the held-out totals do not split by feature, so this is a design argument, not a measured one.

## Design

### Values and literals

TX1. A `Text` value is a finite sequence of bytes that is valid UTF-8. No operation makes a `Text` from arbitrary bytes.

TX2. A text literal is written as RFC 0014 defines it. Its escapes are `\n`, `\"` and `\\`. Any other backslash sequence is E0005. A tab or other control character inside a literal is E0001. This RFC adds no escape.

TX3. Evaluating a literal allocates nothing. Literals are held in static data.

### Built-in functions

TX4. Four built-in functions. Each has one signature and no name is overloaded. Every function returns a value for every input.

| Function | Type | Effects | Behaviour |
| --- | --- | --- | --- |
| `text_len(t)` | `(Text) -> Int` | none | The number of bytes in `t`. |
| `text_byte(t, i)` | `(Text, Int) -> Int` | none | The byte at index `i`, counting from 0, as a value from 0 to 255. If `i < 0` or `i >= text_len(t)`, the result is `-1`. |
| `text_slice(t, from, to)` | `(Text, Int, Int) -> Text` | allocates | First, each bound is clamped into `[0, text_len(t)]`. The result is the bytes from `from` up to but not including `to`. If the clamped `from` is not less than the clamped `to`, the result is the empty text. |
| `text_cat(a, b)` | `(Text, Text) -> Text` | allocates | A new text: the bytes of `a` followed by the bytes of `b`. |

TX5. Arguments are evaluated left to right (RFC 0020 E10). Then the Behaviour column applies. No other step runs first.

TX6. The four names in TX4 are reserved. A user function with one of these names is E0300, as RFC 0020 F6 already requires for `print`, `Int`, `Bool` and `Text`. F6 is amended to list them.

TX7. Indexing and slicing count bytes. There is no code-point or grapheme operation. Code-point iteration belongs to the standard library.

TX8. `text_byte` returns `Int`, not `Byte`, because the byte type is not yet accepted (RFC 0024). When it is, the return type changes in one line of this RFC.

### Equality

TX9. RFC 0020 E3 is amended so that `==` and `!=` accept two `Text` operands and compare bytes. Mixing `Text` with another type is E0200. The operators `<`, `<=`, `>`, `>=` do not accept `Text`; RFC 0020 E4 is unchanged, so `"a" < "b"` is E0200.

### Where Text may appear

TX10. RFC 0020 T3 is replaced by this rule. A `Text` expression may appear as the initialiser of a `let` or `var`, the right side of an assignment to a `Text` `var`, the argument of `print`, an operand of `==` or `!=`, or an argument of one of the four functions in TX4. Any other place is E0200.

TX11. RFC 0020 T6 is unchanged. A `Text` parameter or result is E0100 at the `Text` token. Passing text between user functions waits for the memory decision.

### Memory

TX12. `text_cat` and `text_slice` take their bytes from the bump allocator. Nothing is freed one value at a time. A slice is a copy, not a view.

TX13. If the allocator has too few bytes left for a call in TX12, the run stops with `trap: out-of-memory`, as RFC 0020 TR1 describes for traps: output written earlier stays, and the status is 1 through `proc_exit`. This is the only trap this RFC introduces, and it is not a bounds failure. The kind is named here and catalogued in `spec/errors.json` only if the team decides traps carry codes.

## Alternatives

- **Trapping bounds checks (the earlier drafts).** Rejected here. Each such draft adds a trap kind and so decides issue #64 without the team. A total design needs no decision on #64 for text.
- **`text_byte` returning an option.** Cleaner than `-1`, but it needs variant types, which the language does not have. Revisit with the records-variants item. Until then `-1` is the only sentinel and the card must say so.
- **Clamped `text_byte` (returning the nearest byte).** Rejected. It returns a byte that the program did not ask for, and hides off-by-one errors that `-1` makes visible.
- **Ordering on `Text`.** Deferred. The checklist word "comparison" is read here as equality, which is what the word needs for matching keywords and identifiers. If the team reads it as ordering, a follow-on RFC adds one rule to E4.
- **`+` for concatenation.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids.
- **Slice as a view.** Rejected for now. A view needs lifetime rules that the memory decision does not yet give.
- **A `text` builder.** Rejected here. A builder is a growable byte buffer and belongs with the arrays-buffers item.

## Cost

Adds: four built-in functions (TX4); the `Text` rule for `==` and `!=` (TX9); the placement rule that replaces T3 (TX10); the reserved names (TX6); and the sentence on allocation failure (TX13). Estimate: about 220 tokens of core spec. This is not measured, because the tokeniser has not run on this draft. The merge bot's count is the real one.

Removes: the sentence in RFC 0020 T3 that gives `Text` no operation, and the words in E3 that give `Text` no equality. No trap kind is added, and no diagnostic code is added: the new errors use E0100, E0200 and E0300, which `spec/errors.json` already lists.

Spec card: about 70 tokens. One line lists the four functions with their types. One line says `==` and `!=` take `Text`, and that `text_byte` returns `-1` out of range. The trap line gains `out-of-memory` only if TX13 is accepted.

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`):

- `len-cat.test`: `print(text_len(text_cat("ab", "cde")))` prints `5`.
- `slice-clamp.test`: `print(text_slice("hello", 1, 3))` prints `el`. `print(text_slice("hi", -4, 9))` prints `hi`. `print(text_slice("hi", 2, 1))` prints an empty line.
- `byte.test`: `print(text_byte("hello", 1))` prints `101`. `print(text_byte("hi", 2))` prints `-1`.
- `equal.test`: `print("ab" == "ab")` prints `true`, and `print("ab" != "abc")` prints `true`.
- `escapes.test`: `text_len` of `"\n"`, `"\""` and `"\\"` prints `1` each.
- `oom.test`: `var s = "ab"` then `while true { s = text_cat(s, s) }`. Standard output is empty, standard error is `trap: out-of-memory`, and the status is 1.

Compile-error tests:

- `bad-escape.test` (E0005): `print("\q")`.
- `eq-mixed.test` (E0200): `print("a" == 1)`.
- `lt-text.test` (E0200): `print("a" < "b")`. This records the decision on issue #69.
- `slice-type.test` (E0200): `print(text_slice("a", "0", 1))`.
- `param.test` (E0100): `fn f(t: Text) { }`, to check TX11.
- `reserved.test` (E0300): `fn text_byte() { }`, to check TX6.

Every function in TX4 and every rule in TX9 and TX10 has a run or compile-error test above.

## Open questions

1. Is equality enough for the checklist word "comparison"? This draft says yes. If not, a follow-on RFC adds ordering on `Text` and changes E4.
2. `-1` as the out-of-range result of `text_byte`. It is total but it is a sentinel. It should be replaced when the team has options, and the card must say so.
3. Traps in signatures (issue #64). This draft avoids the question except for `out-of-memory`. If principle 3 is read to require every failure in the signature, TX13 needs an effect in the table, and so do the allocating functions.
4. Milestone. `roadmap` (M2b) says no new RFC is proposed before the first compiler merges onto `main`. This draft was proposed because the assignment asks for it. If the orchestrator holds to the roadmap, withdraw it and hold it until then.
