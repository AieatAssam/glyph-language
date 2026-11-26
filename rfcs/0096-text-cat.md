---
amends: RFC 0035 TX9 (where Text may appear), RFC 0035 TX11 (what stays deferred),
  RFC 0020 TR1 (trap kinds), RFC 0020 F6 (reserved names)
builds-on: RFC 0035 (text-query), RFC 0037 (text-order), RFC 0020 (kernel-v8), RFC
  0014 (lexical-syntax-v3)
class: language
slug: text-cat
status: rejected
supersedes: none. Follows RFC 0091 and RFC 0095 (slicing, both rejected). This draft
  takes the building half of readiness item `text` and leaves slicing alone.
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: reject
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: Building text (text-cat)

## Summary

Add one built-in function, `text_cat(a, b)`, of type `(Text, Text) -> Text`. It returns a new `Text` whose bytes are the bytes of `a` followed by the bytes of `b`. The new bytes come from one fixed-size heap of 1048576 bytes, allocated by a bump allocator that never frees within a run. If a call would need more bytes than remain, the program traps with the new kind `heap-exhausted`. The heap is freed when the run ends. This closes the `building` part of readiness item `text` (`docs/SPEC.md`, section 9). Slicing stays deferred, as RFC 0091 and RFC 0095 left it.

## Motivation

The readiness item `text` asks for "indexing, slicing, comparison, and building". RFC 0035 (accepted) gives length, byte access and equality. RFC 0037 (accepted) gives ordering. Building is the one part that has no proposal still standing:

- RFC 0033 and RFC 0046 deferred building for lack of a memory decision, and were rejected. RFC 0035 TX11 says the same.
- RFC 0089 (minimal building) and RFC 0042 (building) were rejected without a recorded reason.
- RFC 0091 and RFC 0095 (slicing) were both rejected. Their rejection of the empty result and the trap choice is not revisited here.

The memory decision is the blocker. The designer rules already recommend a bump allocator for the first milestone, with no general free list until a benchmark shows the need. This draft takes that recommendation for text only, and makes the one choice that the earlier drafts left open: how big the heap is, and what happens when it is full.

Open user issues that this draft answers or bears on:

- #483 asks the card to list the built-in functions. `text_cat` is one more entry, with its signature and trap.
- #506 asks the card to say which operand types each operator and built-in accepts. The `text_cat` line states both operand types.
- #502 and #492 ask the card to say what a bad arithmetic case does. The `heap-exhausted` line answers the same question for building text in the same form: a trap, a kind name, exit status 1.
- #64 (whether failures show in signatures) and #67 (trap kinds). This draft does not decide #64. It adds one trap kind, the same way RFC 0035 avoided adding one. Trap kinds are listed in RFC 0020 TR1.

The benchmark gives no per-feature signal. Dev fitness is 0.0, and the held-out totals do not split by feature. The held-out `read` score (0.8584) is the lowest held-out metric, which is a reason to state the behaviour on the card. It is not a measured result for building.

## Design

### Function

TC1. `text_cat(a, b)` has type `(Text, Text) -> Text`. It is a built-in with one signature. No name is overloaded.

TC2. The result is a new `Text` of `text_len(a) + text_len(b)` bytes. Its first bytes are those of `a` and the rest are those of `b`, in order. Neither argument changes. If both arguments are empty, the result is the empty text and allocates 0 bytes.

TC3. Arguments are evaluated left to right (RFC 0020 E10). Then the call is made. A trap in an argument happens before the heap is checked.

### Heap

TC4. The run has one heap of exactly 1048576 bytes (2^20). The heap is set up when `main` starts. It is not resized, and it is not grown by the host.

TC5. The heap is a bump allocator. Each `text_cat` call takes the next `n` bytes, where `n` is the length of the result. It never returns bytes, so there is no free operation and no free list. Everything is released when the run ends.

TC6. Let `used` be the bytes taken so far in the run. A `text_cat` call that would make `used + n` exceed 1048576 traps with kind `heap-exhausted`. A call that makes `used + n` equal 1048576 succeeds. The check is made before any byte is written, so a trapping call writes nothing.

TC7. A fixed capacity is used, and not `memory.grow`, because the point where growth fails depends on the host. The same program must trap in the same place on every host, as the determinism rule requires. The capacity is a constant of the language. A program that needs more text than that is out of scope until a memory RFC changes the constant.

### Trap kind

TC8. RFC 0020 TR1 gains a fifth kind:
   - `heap-exhausted`: `text_cat` would take more bytes than the heap has left (TC6).

The trap line is `trap: heap-exhausted`, exit status 1, as TR1 already requires. The kind is not a diagnostic code and is not added to `spec/errors.json`.

TC9. The trap is not in the signature of `text_cat`, which follows RFC 0020 E9 and TR1. Issue #64 stays open.

### Where building may appear

TC10. RFC 0035 TX9 is amended. A `text_cat` call is a `Text` expression. It may appear wherever a text literal may: as the initialiser or assigned value of a `let` or `var` of type `Text`, as an argument of `print`, as an operand of `==` or `!=`, as the first or second argument of `text_cat`, and as the first argument of `text_len` or `text_byte`. Any other place is rejected with the diagnostic RFC 0020 T3 gives.

TC11. RFC 0035 TX10 is unchanged. A `Text` parameter or result of a user function is still rejected. Text cannot pass between user functions until the memory decision covers that case.

TC12. `text_cat` is a reserved name, added to RFC 0020 F6 next to `text_len` and `text_byte`. A user function with that name is rejected with the diagnostic F6 gives (E0300).

### What stays deferred

TC13. RFC 0035 TX11 is amended. Building is no longer deferred. Slicing stays deferred, and so does any operation that makes a `Text` pointing somewhere other than the heap or static data. The readiness item `text` is met once this RFC and the slicing RFC both land. Until slicing lands, the item stays open for slicing only.

## Alternatives

- **Grow the memory with `memory.grow` and trap only when the host refuses.** Rejected. The trap point would depend on the host, so the same program could behave differently on two machines. This breaks the determinism rule.
- **A per-call arena, freed when the function returns (RFC 0035 TX10 keeps text inside one function, so this would work today).** Rejected for now. A `while` loop in `main` can build text without any call returning, so a per-call arena does not bound it. The per-run bump allocator is the simpler bound. An arena can be added later for text that does not escape a call, once a benchmark shows the need.
- **A larger heap, such as 16 MiB.** Not chosen. The size is a constant, and it can be raised in a later RFC without a language change. A small heap makes the trap easy to test and keeps the test programs fast.
- **Return an option when the heap is full.** Rejected. The language has no variant types yet (records-variants item), and an option would need one.
- **`+` for concatenation.** Rejected. `+` is an `Int` operator (RFC 0020 E1), and a second meaning is the overloading the constitution forbids.
- **Concatenation of more than two texts in one call.** Not chosen. Two arguments is the smallest form. A program that joins three texts calls `text_cat` twice.
- **Both building and slicing in one RFC (RFC 0033).** Rejected. Slicing has two rejected drafts of its own, and the team should decide the heap question once, on building, before slicing is reopened.

## Cost

Adds: the signature (TC1), the byte count rule (TC2), the heap and its fixed size (TC4 to TC7), the fifth trap kind (TC8), the placement amendment (TC10), and the reserved name (TC12). Estimate: about 220 tokens of core spec. This is an estimate. The tokeniser has not been run on this draft, and the merge bot's count is the real one. The core spec is 917 of 12000 tokens according to the last check run, so the cap is not at risk.

Removes: the sentence in RFC 0035 TX11 that defers building. No diagnostic code is added. No grammar production is added, so the grammar file does not change.

Spec card: about 70 tokens. Two changes: one line for the signature, "`text_cat(a, b)` gives `a` followed by `b`; the heap is 1048576 bytes, and no room left traps `heap-exhausted`", and `heap-exhausted` added to the trap list. The card's trap list grows from four kinds to five. The card is 244 of 2000 tokens, so it has room.

## Test plan

Run tests (in `conformance/text/`; each file has a `--- meta` block with `id`, `rfc` and `kind`):

- `text/cat.test` (run): `print(text_cat("ab", "cd"))` prints `abcd`, exit 0. Checks TC2.
- `text/cat-empty.test` (run): `print(text_len(text_cat("", "")))` prints `0`, exit 0. Checks TC2 for a zero-byte result.
- `text/cat-var.test` (run): `var t = text_cat("a", "b")`, then `t = text_cat(t, "c")`, then `print(t)` prints `abc`, exit 0. Checks TC10 for a `var`.
- `text/cat-order.test` (run): `print(text_cat("x", text_cat("y", "z")))` prints `xyz`, exit 0. Checks TC3 and that nested calls are evaluated before the outer one.
- `text/cat-equal.test` (run): `print(text_cat("ab", "c") == "abc")` prints `true`, exit 0. Checks TC10 for an operand of `==`.
- `text/cat-fill.test` (run): `var t = "x"`, then `t = text_cat(t, t)` repeated 19 times, then `print(text_len(t))` prints `524288`, exit 0. The 19 calls take 2^20 - 2 bytes in all, which fits. Checks TC6 below the limit.
- `text/cat-exhaust.test` (trap): `var t = "x"`, then `t = text_cat(t, t)` repeated 21 times, then `print(text_len(t))`. The 20th call needs 2^20 bytes after 2^20 - 2 are used, so it traps. Expect exit 1, and stderr contains `trap: heap-exhausted`. Nothing is printed to standard output, because the `print` is never reached. Checks TC6 and TC8.
- `text/cat-arg-order.test` (trap): `var t = "x"`, then `t = text_cat(t, t)` repeated 19 times (these succeed, using 2^20 - 2 bytes), then `print(text_len(text_cat(t, "yz")))`. The call needs 2^19 + 2 bytes and only 2 remain, so it traps. Expect exit 1, stderr contains `trap: heap-exhausted`, and nothing on standard output. Checks TC3: the argument `t` is evaluated first, and the heap check happens in the call, before `text_len` runs.

Compile-error tests:

- `text/cat-missing-comma.test` (compile-error, `expect-errors` lists `E0100`): `print(text_cat("a" "b"))`. Checks the argument list in the grammar.
- `text/cat-reserved.test` (compile-error, `expect-errors` lists `E0300`): a file that declares a user function named `text_cat`. Checks TC12.

Coverage: TC1 and TC2 by `cat`, `cat-empty` and `cat-fill`; TC3 by `cat-order` and `cat-arg-order`; TC4 to TC7 by `cat-fill` and `cat-exhaust`; TC8 by `cat-exhaust` and `cat-arg-order`; TC10 by `cat-var` and `cat-equal`; TC12 by `cat-reserved`. TC9 has no test, because it is a non-decision that tests cannot show. TC11 is covered by the existing RFC 0035 rule tests, which must still reject a `Text` parameter.

## Open questions

1. Roadmap. `ROADMAP.md` says no new RFC is proposed before the first compiler merges onto `main`. This draft is written because the assignment asks for a `text` proposal this session. The orchestrator should decide whether to keep it open or hold it until that merge.
2. The heap size of 1048576 bytes is a judgement. A benchmark that shows real programs exhausting it would justify a change of constant, and that change needs its own RFC.
3. A free list is not proposed. The designer rule says it waits for a benchmark that the bump allocator fails. Name that benchmark when it exists: a workload that loops building and dropping text and reaches `heap-exhausted` with live text below the limit.
4. Issue #64. If the team decides failures appear in signatures, `text_cat` changes with every other trapping function. This draft does not decide #64.
5. Issue #31 (type mismatch code). A `text_cat` call with an `Int` argument has no test, because the code waits on issue #31.
6. Slicing. Open. It needs a separate RFC that decides what a slice of a heap text is (a view or a copy), and what a bad range does. The earlier drafts disagree on the second point, and that disagreement is for that RFC.
