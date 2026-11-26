---
amends: RFC 0035 TX9 (where Text may appear), RFC 0035 TX11 (slicing part only), RFC 0020 TR1 (trap kinds), RFC 0020 F6 (reserved names)
builds-on: RFC 0035 (text-query, accepted), RFC 0037 (text-order, accepted), RFC 0020 (kernel-v8), RFC 0014 (lexical-syntax-v3)
class: language
slug: text-slice-copy
status: draft
supersedes: none. Takes the slicing half of readiness item `text` and leaves building open. Differs from RFC 0091 and RFC 0095 (slicing, both rejected) in three points: the result is a copy, not a view; a bad range traps, it does not return empty or clamp; and the copy uses the run heap, so the heap is the one memory decision this RFC makes.
---
# RFC draft: Text slicing by copy (text-slice-copy)

## Summary

Add one built-in function, `text_slice(t, i, j)`, of type `(Text, Int, Int) -> Text`. It returns a new text holding the bytes of `t` from index `i` up to but not including index `j`. The new text is a copy in the run heap. If `i` and `j` are not `0 <= i <= j <= text_len(t)`, the program traps with the new kind `slice-range`. If the copy does not fit in the heap, the program traps with the new kind `heap-full`. This closes the slicing half of readiness item `text` (`docs/SPEC.md`, section 9). Building (`text_cat`, builders) stays open.

## Motivation

RFC 0035 TX11 defers slicing and building together, because both need heap memory, and says the memory decision comes first. RFC 0033 and RFC 0096 each tried to settle this, and both were rejected. The rejected slicing drafts give the reasons that matter:

- RFC 0033 rejected a slice view because "a view needs lifetime rules that the memory decision does not yet give". A copy needs no lifetime rule, because the result owns its bytes.
- RFC 0091 returned the empty text for a bad range. RFC 0095 traps. Both were rejected. This draft takes the trap, for the reason RFC 0095 gives: an empty result is legal when `i == j`, so a bad range would otherwise be silent.
- RFC 0096 proposed a per-run bump heap for `text_cat` and was rejected. This draft proposes the same heap for slicing only, with the smallest set of decisions that makes it work, so that the team can judge one question at a time.

The benchmark gives no per-feature signal. Dev fitness is 0.0, and the held-out figures are totals that do not split by feature (`docs/` findings, held-out `read` is 0.8584, the lowest held-out metric). This draft does not claim a benchmark result. The user issue that bears on it is #533: the card should list the string functions a program can use. Slicing is the most common text operation after length and byte access, and a program cannot split text without it.

## Design

TS1. `text_slice` is a built-in with the signature `(Text, Int, Int) -> Text`. Its three arguments are evaluated left to right (RFC 0020 E10).

TS2. Let `n` be `text_len(t)`. The call requires `0 <= i <= j <= n`. If the requirement fails, the program traps with kind `slice-range`. The check runs before any allocation.

TS3. On success the result is the `j - i` bytes of `t` from index `i`, copied into a new text. The result is always valid UTF-8 if `t` is, because the bytes are a copy and the function does not split code points. (Index arithmetic is on bytes, as in RFC 0035 TX2.) If `i == j`, the result is the empty text and nothing is copied.

TS4. Allocation uses the run heap. The run heap is one bump region of fixed size, chosen when the module is built, so its size and the point at which it runs out do not depend on the host. A copy takes the next `j - i` bytes; the bump pointer only moves forward. Nothing is freed. If the copy does not fit, the program traps with kind `heap-full`. The trap happens before any byte is written.

TS5. No other allocation strategy is added. No free list, no arena and no `memory.grow` is part of this RFC. The designer memory rules make the bump allocator the first step, and TS4 is that step with no more than its one use.

TS6. `text_slice` is a reserved name, added to RFC 0020 F6 next to `text_len` and `text_byte` (RFC 0035 TX5). A user function with that name is rejected with the diagnostic F6 gives.

TS7. RFC 0035 TX9 is amended. A `text_slice` call is a `Text` expression. It may appear wherever a text literal may: as the initialiser or assigned value of a `let` or `var` of type `Text`, as an argument of `print`, as an operand of `==` or `!=`, as the first argument of `text_len` or `text_byte`, and as the first argument of `text_slice`. Any other place is rejected with the diagnostic RFC 0020 T3 gives.

TS8. RFC 0035 TX10 is unchanged. A `Text` parameter or result of a user function is still rejected. A slice cannot pass between user functions in this RFC.

TS9. RFC 0020 TR1 gains two kinds, `slice-range` and `heap-full`. Traps still carry no code, write `trap: <kind>` on standard error, and exit with status 1.

TS10. No grammar production is added. `text_slice(a, b, c)` is an existing call form (RFC 0020 C1 to C3). No diagnostic code is added: the reserved-name and type errors reuse codes already in `spec/errors.json`.

## Alternatives

- **A view into the source bytes.** Rejected. RFC 0033 names the lifetime rules a view would need, and the memory decision does not give them. A copy avoids them.
- **Return the empty text on a bad range (RFC 0091).** Rejected, for the reason in Motivation: a correct empty slice and a bad range look the same to the program.
- **Clamp the range.** Rejected. It returns bytes the program did not ask for, and hides an off-by-one error.
- **Per-call arena for the copy.** Rejected for now. A `while` loop can allocate without any call returning, so a per-call arena does not bound memory (RFC 0096 says the same). An arena can be added later for text that does not escape a call, once a benchmark shows the need.
- **`memory.grow` until the host refuses.** Rejected. The trap point would depend on the host, which breaks determinism (principle 7 and the determinism rule).
- **Return an option when the heap is full.** Rejected. The language has no variant types yet.
- **Slicing and building together (RFC 0033, RFC 0096).** Rejected here. This draft takes slicing only, so the heap decision can be judged on the smallest use.

## Cost

Core spec, by estimate (the tokeniser has not run on this draft; the merge bot's count is the real one): about 190 tokens added. The signature and the reserved-name rule add about 60. The range rule and the heap rule add about 100. The two trap kinds add about 20. TX11 loses its slicing sentence, about 30 tokens. Net: about +190 tokens. The core spec is about 3,000 tokens by RFC 0020's own estimate, far under the 12,000-token cap, so nothing else needs to be removed to pay for this.

Spec card: about 45 tokens added. Two lines: the signature of `text_slice`, and "`text_slice` traps `slice-range` on a bad range and `heap-full` when the heap is full". The card's trap line already says "trap: <kind>", so no new format is added.

Adds: one built-in, one run-time heap, two trap kinds, one reserved name, one placement rule amendment. Removes: the slicing half of TX11. No grammar production is removed or added.

## Test plan

Run tests:

- `text/slice-mid`: `print(text_slice("hello", 1, 3))` prints `el` and exits 0. Checks TS1 and TS3.
- `text/slice-empty`: `print(text_len(text_slice("hello", 2, 2)))` prints `0`. Checks TS3, the `i == j` case.
- `text/slice-whole`: `text_slice("hello", 0, 5)` equals `"hello"` with `==`. Checks TS3 and TS7 (operand of `==`).
- `text/slice-var`: `var t = text_slice("hello", 1, 4)`, then print `t`. Checks TS7 for a `var`.
- `text/slice-range-trap`: `text_slice("hello", 3, 2)` gives stderr `trap: slice-range`, exit 1. Checks TS2 and TS9.
- `text/slice-range-high`: `text_slice("hi", 0, 3)` gives `trap: slice-range`, exit 1. Checks the `j <= n` side of TS2.
- `text/slice-heap-full`: a `while` loop that slices a 1000-byte text until the heap is full. Gives `trap: heap-full`, exit 1. Checks TS4 and TS9.
- `text/slice-trap-no-alloc`: a trapping call (`slice-range`), then in a separate run, a successful slice that fills the heap exactly. The bad call must not consume heap, so the exact fit succeeds. Checks TS2 (check before allocation).

Compile-error tests:

- `text/err-slice-reserved`: `fn text_slice(t: Text, i: Int, j: Int): Text { return t }` is rejected with E0300 (RFC 0020 F6). Checks TS6.
- `text/err-slice-type`: `text_slice(1, 0, 1)` is rejected with the type-error code RFC 0020 already gives for a wrong argument type (E0200 to E0299). Checks TS7 and the argument typing in TS1.
- `text/err-slice-param`: a user function with a `Text` parameter is still rejected (TX10). Checks TS8.

The grammar is unchanged, so no grammar production needs a new test (TS10).

## Open questions

1. **Principle 3.** The constitution says whether a function can fail or allocate is visible in its signature. `text_slice` can trap and can allocate, and its signature `(Text, Int, Int) -> Text` does not show that. RFC 0020 E9 and TR1 already say traps are not part of a signature, so this draft follows the accepted kernel. The team should decide whether that precedent covers `heap-full`, which is a new kind of effect. If it does not, the RFC needs a signature form, and that form would cost tokens. This draft does not choose one.
2. **Heap size.** The size of the run heap is set at build time, but this RFC does not give a number. The build spec's `execution.memory_mb` (256) is the upper bound the implementer should check against.
3. **Two kinds or one.** `slice-range` and `heap-full` are separate here so that a program's failure says which rule it broke. If the team prefers fewer kinds, both could be one kind, `text`, at the cost of a less useful message.
