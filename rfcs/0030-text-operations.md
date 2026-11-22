---
amends: RFC 0020 T3 (where Text may appear), RFC 0020 E3 and E4 (operand types), RFC
  0020 TR1 (trap kinds)
builds-on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8)
class: language
slug: text-operations
status: rejected
supersedes: none; this is a fourth attempt at the readiness item `text` after RFCs
  0007, 0026 and 0028, all rejected
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: reject
  tester: reject
  user-1: approve
  user-2: abstain
---
# RFC draft: Text operations

## Summary

Give `Text` its first operations, so that the readiness item `text` (`docs/SPEC.md`, section 9) can be met: indexing to a byte, a byte length, slicing, concatenation, and the operators that `Int` already has (`==`, `!=`, `<`, `<=`, `>`, `>=`). A `Text` value is immutable and always valid UTF-8. Literals and escapes stay as RFC 0014 defines them. Code points, number formatting and mutable builders are not part of this RFC.

## Motivation

The readiness checklist item `text` asks for "indexing, slicing, comparison, and building". RFC 0020 T3 says a `Text` value has no operation except being bound, assigned and printed, so the item is not met. Stage 1 needs to compare and slice source text, so the gap blocks that work.

Four drafts have tried this item: RFC 0007, RFC 0026, RFC 0028 and this one. Each was rejected or superseded. Their vote records give no reasons, so this draft does not claim to answer any particular objection. It keeps the smallest set that meets the checklist and states each point of disagreement in the open questions.

The open user issues that this draft has to settle:

- Issue #69 (text ordering). Draft RFC 0026 TX6 rejects `>`, `>=` and `<=` on `Text`, citing RFC 0018 G8. RFC 0020 has since added those operators for `Int`, and test `text/order-gt.test` expects E0100, which the accepted grammar no longer gives. This draft gives `Text` the same operators as `Int`, under the same rule, and cites no superseded rule.
- Issue #52 (`>`, `>=`, `<=`). This draft follows the operator set of RFC 0020 and does not reopen it.
- Issue #37 (tab and `\t` escape). RFC 0014 rules 2 and 11 make a tab an error (E0001) and give only `\n`, `\"` and `\\`. This draft keeps that set and adds no escape. Whether to restore `\t` stays with RFC 0014's owners.
- Issue #40 (codes for a bad escape and a leading zero). `spec/errors.json` already has E0005 (malformed text literal, including unknown escape) and E0006 (leading zero). This draft adds no escape-specific code.
- Issue #67 (trap kinds). RFC 0020 TR1 lists four kinds, and no kind appears twice. This draft adds two kinds with different names, one for each new failure. Neither reuses an existing kind.
- Issues #64 and #68 (traps in signatures). RFC 0020 E9 and TR1 say traps carry no code and do not appear in signatures. This draft follows that and lists traps in the Behaviour column of its table. If the team decides that traps belong in signatures, this draft changes with the rest of the language. It does not decide that question.

## Design

### Values and literals

TX1. A `Text` value is a finite sequence of bytes that is valid UTF-8. The language has no operation that produces a `Text` from arbitrary bytes. Such a conversion belongs to a later RFC.

TX2. A text literal is written as RFC 0014 defines it, with the escapes `\n`, `\"` and `\\`. Any other backslash sequence is E0005. A tab, or any other control character, inside a literal is E0001. This RFC adds no escape.

TX3. Evaluating a literal allocates nothing. Literals are held in static data.

### Operations

TX4. Four built-in functions. Each has exactly one signature, and no name is overloaded.

| Function | Type | Behaviour |
| --- | --- | --- |
| `text_len(t)` | `(Text) -> Int` | The number of bytes in `t`. Pure. |
| `text_byte(t, i)` | `(Text, Int) -> Int` | The byte at index `i`, counting from 0, as a value from 0 to 255. Traps `index-out-of-bounds` unless `0 <= i < text_len(t)`. |
| `text_slice(t, from, to)` | `(Text, Int, Int) -> Text` | A new text of the bytes from `from` up to but not including `to`. Traps `index-out-of-bounds` unless `0 <= from <= to <= text_len(t)`. Allocates. |
| `text_cat(a, b)` | `(Text, Text) -> Text` | A new text of the bytes of `a` followed by the bytes of `b`. Allocates. |

TX5. Arguments are evaluated left to right, as E10 requires. Then the check named in TX4 runs. A failed check traps, and no other effect happens first.

TX6. RFC 0020 is amended as follows.
- E3: `==` and `!=` take two `Int`, two `Bool` or two `Text` operands. Other operand types are E0200.
- E4: `<`, `<=`, `>` and `>=` take two `Int` or two `Text` operands. Other operand types are E0200. So `"a" < 1` is E0200.

TX7. `Text` ordering compares bytes as unsigned values, from the first byte. The first byte that differs decides the order. A proper prefix is less than the longer text. So `""` is less than `"a"`, `"ab"` is less than `"abc"`, and `"é"` (bytes C3 A9) is greater than `"z"` (byte 7A). G6 of RFC 0020 still applies: `a < b < c` is E0100.

TX8. Indexing and slicing count bytes. The language has no code-point or grapheme operation. Code-point iteration is a standard-library function.

### Where Text may appear

TX9. RFC 0020 T3 is replaced by this rule. A `Text` expression may appear as: the initialiser of a `let` or `var`; the right side of an assignment to a `Text` `var`; the argument of `print`; an operand of one of the six comparison operators in TX6; or an argument of one of the four functions in TX4. Any other place is E0200.

TX10. A `Text` parameter or result is E0100 at the `Text` token, as RFC 0020 T6 already says. Passing text between user functions waits for the memory RFC.

### Traps

TX11. RFC 0020 TR1 gains two kinds:
- `index-out-of-bounds`: an index or slice bound in TX4 is out of range.
- `out-of-memory`: `text_cat` or `text_slice` needs more bytes than the heap has left.

Each kind is catalogued in `spec/errors.json` by the first PR that emits it, as RFC 0014 requires for codes. When either kind fires, the run follows TR1: one line `trap: <kind>` to standard error, earlier output stays, and the status is 1 through `proc_exit`.

### Memory

TX12. `text_cat` and `text_slice` allocate from the bump allocator in the current arena, as the designer guidance requires. Nothing is freed one value at a time. A slice is a copy, not a view. Literal storage is never freed.

TX13. No reference counting, no tracing collector and no general free list. This RFC does not need them.

## Alternatives

- **Code-point indexing.** Rejected. `text_byte` would cost O(n), and `text_len` would then count something other than the bytes of the text. Code-point iteration fits the standard library.
- **`text_byte` returning `Byte`.** This is preferable once the byte type is accepted. Until then it depends on an open item, so this draft uses `Int`. Revisit when `Byte` is decided.
- **`text_byte` returning an option.** Needs variant types, which the language does not have yet. Revisit with the records-variants item.
- **Clamping `text_slice`.** Rejected. It hides off-by-one errors, and the kernel already treats bad indices as traps.
- **Slice as a view.** Rejected for now. A view needs lifetime rules that the memory RFC does not yet give.
- **`+` for concatenation.** Rejected. `+` is an `Int` operator (RFC 0020 E1). A second meaning would be the overloading that the constitution forbids. `text_cat` is the only concatenation.
- **One trap kind for both new failures.** Rejected. A bad index and a full heap need different fixes, and the message should say which one happened.
- **Restoring `\t` as an escape in this RFC.** Rejected here. Issue #37 belongs to RFC 0014's owners. Deciding it inside a text RFC would split one decision across two files.

## Cost

Adds: four built-in functions (TX4); `Text` operands in E3 and E4 (TX6); the ordering rule (TX7); the placement rule that replaces T3 (TX9); and two trap kinds (TX11). Estimate: about 330 tokens of core spec. The tokeniser has not been run for this draft, so the figure is an estimate and the merge bot's count is the real one.

Removes: the sentence in T3 that gives `Text` no operation, and the words in E3 that exclude `Text` from equality. Nothing else is removed. No new diagnostic code is added: the placement and operand errors use E0200 and E0100, both already in the table.

Spec card: about 110 tokens. One line lists the four functions with their types. One line says that `==`, `!=`, `<`, `<=`, `>` and `>=` work on `Int` and `Text`. The trap line gains `index-out-of-bounds` and `out-of-memory`. The card omits the allocator details and the copy rule.

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`):

- `len-cat.test`: `print(text_len(text_cat("ab", "cde")))` prints `5`.
- `slice.test`: `print(text_slice("hello", 1, 3))` prints `el`, and `print(text_slice("hi", 0, 0))` prints an empty line.
- `byte.test`: `print(text_byte("hello", 1))` prints `101`.
- `compare.test`: one `if` per case, for `"a" < "b"`, `"ab" < "abc"`, `"" < "a"`, `"a" == "a"`, `"b" >= "b"`, `"a" <= "a"` and `"é" > "z"`. Each prints `1` to `7`, so that `print` only needs `Int` and `Text`.
- `escapes.test`: `text_len` of `"\n"`, `"\""` and `"\\"` prints `1` each.
- `index-trap.test`: `print("before")` then `print(text_byte("x", 1))` prints `before`, writes `trap: index-out-of-bounds` to standard error and exits with status 1.
- `slice-trap.test`: `print(text_slice("x", 2, 1))` after `print("before")` behaves the same way.
- `oom.test`: `var s = "ab"` then `while true { s = text_cat(s, s) }`. Standard output is empty, standard error is `trap: out-of-memory`, and the status is 1. Doubling exhausts the heap well before the TR3 step counter.

Compile-error tests:

- `bad-escape.test` (E0005): `print("\q")`.
- `tab-literal.test` (E0001): a file with a tab inside a text literal.
- `eq-mixed.test` (E0200): `"a" == 1`.
- `lt-mixed.test` (E0200): `"a" < 1`.
- `slice-type.test` (E0200): `text_slice("a", "0", 1)`.
- `param.test` (E0100): `fn f(t: Text) { }`, to check TX10.
- `chain.test` (E0100): `if "a" < "b" < "c" { print(1) }`, to check that G6 still applies to `Text`.

Each new operation and each new trap kind has a run test that exercises it. The conformance suite cannot run until the first compiler merges (see open question 6), so these tests are specified but not yet executed.

## Open questions

1. Traps in signatures. Issues #64 and #68 are open. This draft follows RFC 0020 and keeps traps out of signatures. If the team decides otherwise, the Behaviour column of TX4 changes.
2. The `Byte` type. `text_byte` returns `Int` until the byte type is accepted, and then it may return `Byte`. `byte.test` changes with it.
3. Text parameters and results. TX10 keeps them out until the memory decision is made.
4. Slices as copies. A view would avoid the copy, but it needs lifetime rules.
5. Tab in output. Issue #37 is open with RFC 0014. This draft does not change it.
6. Milestone. The roadmap (M2b) says no new RFCs are proposed until the first merge puts a compiler on `main`. This draft is proposed because the assignment asks for it. If the orchestrator holds to the roadmap, this draft should be withdrawn and held until then.
