---
amends: RFC 0020 T3 (where Text may appear), RFC 0020 E3 (equality operand types),
  RFC 0020 F6 (reserved function names), RFC 0020 TR1 (trap kinds)
builds-on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8)
class: language
slug: text-minimal
status: rejected
supersedes: none; a smaller fifth attempt at the readiness item `text` after RFCs
  0007, 0026, 0028 and 0030, all rejected
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: approve
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: Text, minimal set

## Summary

Give `Text` the operations that the readiness item `text` (`docs/SPEC.md`, section 9) asks for, and no more: indexing to a byte, a byte length, slicing, concatenation, and equality. Ordering of `Text` is not added. A `Text` value is immutable and always valid UTF-8. Literals and escapes are unchanged from RFC 0014.

## Motivation

The readiness item `text` asks for "indexing, slicing, comparison, and building". RFC 0020 T3 says a `Text` value can only be bound, assigned and printed, so the item is not met. Stage 1 must slice source text and test it for equality, for example to match keywords and identifiers. It does not need to sort text. This draft provides exactly those needs.

Four earlier drafts tried this item and were all rejected. Their vote records give no reasons, so this draft does not claim to answer any particular objection. It differs from them in three ways. It leaves out `Text` ordering (RFC 0026 TX6, RFC 0028 TX6 and RFC 0030 TX6), which is the largest rule to agree on and is not needed for the checklist's stated use. It adds no escape and no diagnostic code. It keeps the built-in set to four functions. Each of the four is needed for one checklist word: `text_byte` for indexing, `text_slice` for slicing, `text_cat` for building, and `text_len` for the length that the other three need.

The user issues this draft settles or bears on:

- Issue #69 (text ordering). RFC 0026 TX6 rejects `>`, `>=` and `<=` on `Text`. Its test `text/order-gt.test` expects E0100, which the accepted grammar no longer gives, since RFC 0020 added those operators to `cmp_op`. This draft keeps the accepted E4, which takes `Int` only, so `"a" > "b"` is E0200. The grammar is not changed.
- Issue #52 (`>`, `>=`, `<=`). This draft follows RFC 0020 and does not reopen the operator set.
- Issue #67 (trap kinds). RFC 0020 TR1 lists four kinds with no repeats. This draft adds two kinds with different names, one for a bad index and one for a full heap. Neither reuses an existing kind.
- Issues #64 and #68 (traps in signatures). RFC 0020 E9 and TR1 say traps carry no code and are not part of a signature. This draft follows that, and lists traps in the Behaviour column of TX4. It does not decide the open question.
- Issue #37 and issue #40 (escapes and codes). This draft keeps RFC 0014's escape set and adds no code. E0005 and E0006 already exist in `spec/errors.json`.
- Issues #73 and #75 (the card gives no syntax). This draft adds one line to the card for the new built-ins. It does not add source syntax to the card, which is a separate change.

## Design

### Values and literals

TX1. A `Text` value is a finite sequence of bytes that is valid UTF-8. The language has no operation that makes a `Text` from arbitrary bytes.

TX2. A text literal is written as RFC 0014 defines it. Its escapes are `\n`, `\"` and `\\`. Any other backslash sequence is E0005, and a tab or other control character inside a literal is E0001. This RFC adds no escape.

TX3. Evaluating a literal allocates nothing. Literals are held in static data.

### Built-in functions

TX4. Four built-in functions. Each has exactly one signature, and no name is overloaded.

| Function | Type | Behaviour |
| --- | --- | --- |
| `text_len(t)` | `(Text) -> Int` | The number of bytes in `t`. Pure. |
| `text_byte(t, i)` | `(Text, Int) -> Int` | The byte at index `i`, counting from 0, as a value from 0 to 255. Traps `index-out-of-bounds` unless `0 <= i < text_len(t)`. |
| `text_slice(t, from, to)` | `(Text, Int, Int) -> Text` | A new text of the bytes from `from` up to but not including `to`. Traps `index-out-of-bounds` unless `0 <= from <= to <= text_len(t)`. Allocates. |
| `text_cat(a, b)` | `(Text, Text) -> Text` | A new text of the bytes of `a` followed by the bytes of `b`. Allocates. |

TX5. Arguments are evaluated left to right, as E10 requires. Then the check named in TX4 runs. A failed check traps, and no other effect happens first.

TX6. The four names in TX4 are reserved. A user function with one of these names is E0300, as F6 already says for `print`, `Int`, `Bool` and `Text`. F6 is amended to list them.

TX7. Indexing and slicing count bytes. The language has no code-point or grapheme operation. Code-point iteration is a standard-library function.

### Equality and ordering

TX8. RFC 0020 E3 is amended so that `==` and `!=` take two `Int`, two `Bool` or two `Text` operands. Other operand types are E0200. So `"a" == 1` is E0200.

TX9. RFC 0020 E4 is unchanged. `<`, `<=`, `>` and `>=` take two `Int` operands, and any other operand type, including `Text`, is E0200.

### Where Text may appear

TX10. RFC 0020 T3 is replaced by this rule. A `Text` expression may appear as: the initialiser of a `let` or `var`; the right side of an assignment to a `Text` `var`; the argument of `print`; an operand of `==` or `!=`; or an argument of one of the four functions in TX4. Any other place is E0200.

TX11. RFC 0020 T6 is unchanged. A `Text` parameter or result is E0100 at the `Text` token. Passing text between user functions waits for the memory decision.

### Traps

TX12. RFC 0020 TR1 gains two kinds:
   - `index-out-of-bounds`: an index or slice bound in TX4 is out of range;
   - `out-of-memory`: `text_cat` or `text_slice` needs more bytes than the heap has left.

Traps carry no code (TR1), so these kinds are not added to `spec/errors.json`. When either fires, the run follows TR1: one line `trap: <kind>` on standard error, output written earlier stays, and the status is 1 through `proc_exit`.

### Memory

TX13. `text_cat` and `text_slice` allocate from the bump allocator. Nothing is freed one value at a time. A slice is a copy, not a view. Literal storage is never freed. This RFC needs only that an allocation can fail with `out-of-memory`. The region and any reset are for the memory decision.

## Alternatives

- **Ordering on `Text` now.** Deferred. It needs a byte-order rule and an edit to E4, and no checklist use needs it. If the team reads "comparison" as ordering, a follow-on RFC adds one rule for both ways, and this draft's Cost section shows that it is small.
- **Code-point indexing.** Rejected. `text_byte` would cost O(n), and `text_len` would count something other than bytes.
- **`text_byte` returning `Byte`.** Preferable once the byte type is accepted. Until then it returns `Int`.
- **`text_byte` returning an option.** Needs variant types, which the language does not have yet.
- **Clamping `text_slice`.** Rejected. It hides off-by-one errors, and the kernel already treats bad indices as traps.
- **Slice as a view.** Rejected for now. A view needs lifetime rules that the memory decision does not yet give.
- **`+` for concatenation.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading that the constitution forbids.
- **One trap kind for both new failures.** Rejected. A bad index and a full heap need different fixes, and the message should say which happened.

## Cost

Adds: four built-in functions (TX4); `Text` operands in E3 (TX8); the placement rule that replaces T3 (TX10); the four reserved names (TX6); and two trap kinds (TX12). Estimate: about 200 tokens of core spec, not yet measured, since the tokeniser has not run on this draft. The merge bot's count is the real one.

Removes: the sentence in T3 that gives `Text` no operation, and the words in E3 that say `Text` has no equality. Nothing else is removed. No new diagnostic code is added: the new errors use E0200, E0100 and E0300, all already in the table.

Spec card: about 60 tokens. One line lists the four functions with their types. One line says that `==` and `!=` take `Int`, `Bool` or `Text`. The trap line gains `index-out-of-bounds` and `out-of-memory`.

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`):

- `len-cat.test`: `print(text_len(text_cat("ab", "cde")))` prints `5`.
- `slice.test`: `print(text_slice("hello", 1, 3))` prints `el`, and `print(text_slice("hi", 0, 0))` prints an empty line.
- `byte.test`: `print(text_byte("hello", 1))` prints `101`.
- `equal.test`: `print("ab" == "ab")` prints `true`, and `print("ab" != "abc")` prints `true`.
- `escapes.test`: `text_len` of `"\n"`, `"\""` and `"\\"` prints `1` each.
- `index-trap.test`: `print("before")` then `print(text_byte("x", 1))` prints `before`, writes `trap: index-out-of-bounds` to standard error and exits with status 1.
- `slice-trap.test`: `print("before")` then `print(text_slice("x", 2, 1))` behaves the same way.
- `oom.test`: `var s = "ab"` then `while true { s = text_cat(s, s) }`. Standard output is empty, standard error is `trap: out-of-memory`, and the status is 1. Doubling exhausts any finite heap in about log2(heap size) steps, far below the TR3 limit.

Compile-error tests:

- `bad-escape.test` (E0005): `print("\q")`.
- `eq-mixed.test` (E0200): `print("a" == 1)`.
- `lt-text.test` (E0200): `print("a" < "b")`, which records the decision on issue #69.
- `slice-type.test` (E0200): `print(text_slice("a", "0", 1))`.
- `place.test` (E0200): `print(1 + "b")`, to check that `Text` is rejected as an arithmetic operand.
- `param.test` (E0100): `fn f(t: Text) { }`, to check TX11.
- `reserved.test` (E0300): `fn text_cat() { }`, to check TX6.

Each new operation and each new trap kind has a run test that exercises it.

## Open questions

1. Is equality enough for the checklist word "comparison"? This draft says yes. If the team says no, a follow-on RFC adds ordering for `Text` and changes E4.
2. Traps in signatures. Issues #64 and #68 are open. This draft follows RFC 0020 and keeps traps out of signatures. If that changes, the Behaviour column of TX4 changes.
3. The `Byte` type. `text_byte` returns `Int` until the byte type is accepted.
4. Text parameters and results. TX11 keeps them out until the memory decision is made.
5. Milestone. `governance/RULES.md` names M2 and the roadmap names M2b, and the roadmap says no new RFC is proposed before the first compiler merges. This draft was proposed because the assignment asks for it. If the orchestrator holds to the roadmap, withdraw it and hold it until then.
