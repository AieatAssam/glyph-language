---
builds-on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted),
  RFC 0004 (diagnostic style, accepted)
class: language
slug: arrays-buffers-explicit-copy
status: rejected
supersedes: none
votes:
  designer-min: reject
  designer-prag: abstain
  impl-1: abstain
  tester: abstain
  user-1: abstain
  user-2: abstain
---
# RFC draft: arrays-buffers-explicit-copy

## Summary

Adds one growable array type, `IntArray`, whose elements are `Int`. Every `IntArray` value owns its elements. A name never silently shares storage with another name. Assigning or returning an existing array needs an explicit `copy(a)`. Passing an array to a function lends it for the duration of the call, read-only. Six built-in functions create, read, write, grow and copy arrays. Anything that allocates has the effect word `alloc`, checked like `io`. Every failure is a defined trap. A bare array name on the right of a store is an error with a machine-applicable fix that inserts `copy`.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Issue #361 reports that no RFC has been proposed for it and that twelve drafts were rejected with no reasons recorded. The vote records of those drafts give no reason for any rejection, so this draft does not claim to answer a particular objection.

The choice that most affects local reasoning (principle 2) is whether two names may share storage. The rejected drafts with shared handles (0023, 0025, 0038) let a write through one name change another with nothing at the use site to show it. Draft 0040 copied on store implicitly, so a copy could happen at a line that looks like a plain assignment. This draft keeps the copy in the text. A reader sees `copy(a)` wherever memory is duplicated, and sees no duplication anywhere else. That keeps the cost visible (principle 3: effects in the signature) and keeps the rule local.

The surface is small on purpose: one element type, no slices, no `pop`, no bytes. Byte buffers and the text builder depend on this item, so the first milestone needs only growth and copy.

Open user issues this draft responds to:

- #361: no RFC for the item. This draft is the proposal the issue asks for.
- #341, #342, #344, #345, #348, #351, #353, #360: the spec card gives no syntax. The Cost section lists the card lines this draft adds. They cover arrays only; the card's basic syntax is a separate item.
- #72: `spec/errors.json` lacks codes that accepted RFCs use. This draft adds no new meaning to any code (see Cost).

Roadmap conflict: `ROADMAP.md` (M2b) says no new RFC is proposed until a compiler is on `main`, and issues #359 and #349 report that `check` and `run` still print "no front end yet". This agent works from a scratch copy and cannot see the state of `main`. The assignment asks for this proposal. The orchestrator should confirm the M2b gate before anyone votes. If the gate is not met, this draft should be held, not voted on.

## Design

Rules prefixed C are new in this RFC. Every other rule is RFC 0020's, unchanged, except where a rule below says "amends".

### D1. Type

`IntArray` is a type name. It is valid wherever RFC 0020 allows `Int` or `Bool` in a type position: the type of a `let` or `var`, a parameter, and a result. Elsewhere it is E0200.

A value of type `IntArray` has a length, an `Int` of 0 or more, and a sequence of `Int` elements. Its capacity is kept by the runtime and is not visible in Glyph.

`IntArray` has no `==`, `!=`, `<` or other operator. Using one is E0200. `print` accepts `Int` and `Bool` only, so printing an `IntArray` is E0200.

### D2. Ownership and copies

C1. A name holding an `IntArray` may not be the whole right side of a `let`, a `var`, an assignment, or a `return`. Such a use is E0200 at the name. The diagnostic carries a fix: the span of the name, replaced by `copy(NAME)`.

C2. `copy(a)` returns a new `IntArray` with the same elements, length and its own storage. Its capacity equals its length. The copy is fresh, so `let b = copy(a)` is allowed. `copy` allocates (E-rule A3).

C3. A call result of type `IntArray` is fresh. A function that returns an array must return a fresh value, so `return` of a name is C1's error. A call such as `int_array(3)` or `f(a)` binds without a copy.

C4. Passing a name as a call argument lends it. Inside the callee the parameter is read-only: the callee may call `len`, `get`, pass the parameter to another function, or `copy` it. It may not assign to the parameter (E0303, from RFC 0020's rule on parameters) and may not use it as the first argument of `set` or `push` (D3). The caller is suspended during the call and the kernel has no global variables, so the borrowed array cannot change while the callee runs.

### D3. Built-in functions

These names are reserved: `IntArray`, `int_array`, `len`, `get`, `set`, `push`, `copy`. A binding, parameter or function with one of these names is E0300 at the name. Using one as a value is E0301. Built-in calls are checked as RFC 0020 checks a call.

| Function | Signature | Effect | Behaviour |
| --- | --- | --- | --- |
| `int_array` | `(cap: Int): IntArray` | `alloc` | New array of length 0 and capacity `cap`. Traps as D5 gives. |
| `len` | `(a: IntArray): Int` | none | Length of `a`. |
| `get` | `(a: IntArray, i: Int): Int` | none | Element `i`, counted from 0. Traps `index-out-of-bounds` unless `0 <= i < len(a)`. |
| `set` | `(a: IntArray, i: Int, v: Int)` | none | Replaces element `i` under the same bounds rule. Never changes the length. |
| `push` | `(a: IntArray, v: Int)` | `alloc` | Appends `v`, growing as D4 gives. |
| `copy` | `(a: IntArray): IntArray` | `alloc` | C2. |

S1. The first argument of `set` and `push` must be a bare name declared with `var` in the current function. Any other form, including a parameter or a `let` name, is E0303 at that argument.

S2. `set`, `push` return nothing. Using either as a value is E0200 (RFC 0020's rule for statement-only calls).

S3. Arguments are evaluated left to right (RFC 0020 E10). For `set`, all three arguments are evaluated before the bounds check.

### D4. Layout and growth

An array value is a header of three `Int` fields in the heap: length, capacity, and the address of an element block of `8 * capacity` bytes. Slots at index `len` or above are never read.

`push(a, v)`:

1. If `len < cap`, store `v` at index `len` and add 1 to the length. Stop.
2. Otherwise let `newcap = max(2 * cap, 4)`. Allocate a block of `8 * newcap` bytes (D6). If that fails, trap `out-of-memory`.
3. Copy the `len` elements to the new block, point the header at it, set the capacity to `newcap`, then store `v` and add 1 to the length.

The old block is abandoned, not freed. Because each header has one owner (C1, C4), no other name needs updating.

### D5. Creation and traps

`int_array(cap)`:

1. If `cap < 0`, trap `bad-capacity`.
2. Allocate the header and a block of `8 * cap` bytes under D6. If the request fails, trap `out-of-memory`.
3. Set the length to 0 and the capacity to `cap`.

`copy(a)` allocates a header and a block of `8 * len(a)` bytes under D6. It cannot fail except by D6.

### D6. Heap

The heap is a bump allocator over WebAssembly linear memory. Each allocation takes the next bytes, rounded up to a multiple of 8. Nothing is freed one block at a time. There is no free list and no collector.

The counter is the total number of bytes allocated since the run began. Headers and abandoned blocks count. The limit is `HEAP_LIMIT = 268435456` (256 MiB), a constant of the language, not of the build. An allocation that would take the counter over `HEAP_LIMIT` traps `out-of-memory`. Each run starts with an empty heap, so the same program traps at the same point on every host (principle 7).

No free list is proposed. The benchmark that would justify one is a program whose live array data stays under half of `HEAP_LIMIT` but whose total allocation exceeds `HEAP_LIMIT`. No such program exists yet.

### D7. Effects and examples

E1. `alloc` is an effect word in the signature, after `io` if both appear: `fn f(p: Int): R io alloc { ... }`. Any other order is E0100 at the word. The word is recognised only in that position.

E2. A call to `int_array`, `push` or `copy`, and a call to a function that declares `alloc`, is allowed only in a function that declares `alloc`. Otherwise E0400 at the call. This extends RFC 0020's `io` check (F2) to `alloc`.

E3. An example (EX2 of RFC 0020) may call functions that declare `alloc`, and may copy. Each example runs with its own empty heap, so examples stay deterministic. An example may not call `io` functions or `print`, as before.

E4. `main` may declare `io` and `alloc`, in that order.

### D8. Parameter and result types (amends RFC 0020 T6 and F7)

T6 and F7 become: parameter and result types are `Int`, `Bool` or `IntArray`. `Text` there remains E0100.

### D9. Traps (amends RFC 0020 TR1)

TR1's list of kinds gains three:

- `bad-capacity`: `int_array` with `cap < 0`.
- `index-out-of-bounds`: `get` or `set` with `i` outside `0` to `len - 1`.
- `out-of-memory`: any allocation that breaks D4, D5 or D6.

Each follows TR1 exactly: one line `trap: <kind>` on standard error, exit status 1 through `proc_exit`, no code, and output written before the trap stays written.

### D10. Grammar

`fn_decl` in `spec/grammar.peg` accepts an `alloc` word after the optional `io` word, and `type` accepts the name `IntArray`. Both are reached by tests in the Test plan.

## Alternatives

- **Shared handles (0023, 0025, 0038).** Rejected. A write through one name changes another with no sign at the use site, which breaks principle 2.
- **Implicit copy on store (0040, 0039).** Not chosen. It keeps the source short, but a copy then happens on a line that looks like a plain assignment, and the reader cannot see it. The fix-it in C1 gives the same safety with the copy in the text. Reviewers who prefer the implicit form should say so before the vote. This is open question 1.
- **Copy on every call.** Rejected. Every call with an array argument would allocate. C4 gives the same safety with no copy.
- **Bracket syntax `a[i]`.** Rejected for this RFC. RFC 0014 has no `[` or `]` token. If a later RFC adds them, they replace `get` and `set` rather than sit beside them (principle 1).
- **A generic `Array<T>`.** Rejected for this RFC. The type system's shape is open under the constitution, and one element type needs no such decision.
- **Functional update (each write returns a new array).** Rejected. Each write allocates, and with no free list the heap runs out after a few thousand writes.
- **A `pop` function.** Deferred. No test in this draft needs it, and it adds a removal path with its own trap rules.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator need neither.

## Cost

Adds to the spec core: the type name `IntArray` (D1); the store rule C1 with its fix; the copy rule C2; the borrow rule C4; seven reserved names (D3); six built-in signatures (D3); the `alloc` word and rule E1 to E4; three trap kinds (D9); the heap constant (D6). Estimated about 1,000 tokens. The merge bot measures the real size. The current core size is not visible from this checkout.

Removes: nothing. No accepted rule is changed except the two type lists in D8 and the trap list in D9. The planning rule says growth needs a simplification elsewhere. This draft proposes none. A reviewer may name one.

Spec card: about 7 new lines, under 200 tokens: the `IntArray` type, the store rule with `copy`, the six built-in signatures, the `alloc` word and its order, and the three trap kinds. The card remains far under its 2,000-token cap.

Diagnostics: no new meaning. The codes used are E0100, E0200, E0300, E0301, E0303 and E0400, with the meanings RFC 0020 gives them. None of these is in `spec/errors.json` yet (issue #72). The implementation PR must add them to that file, each with its one meaning. This draft introduces no code that another accepted RFC already uses for something else.

## Test plan

Test files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (the number the orchestrator assigns) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line from D9.

Run tests:

- `ia-len-empty`: `fn main() io alloc`, `let a = int_array(0)`, `print(len(a))`. Stdout `0`, status 0.
- `ia-push-grow`: 100 `push` calls of `i`, then print `len(a)` and `get(a, 99)`. Stdout `100` then `99`, status 0. Shows D4 growth.
- `ia-set`: push 1, push 2, `set(a, 0, 9)`, print `get(a, 0)` and `get(a, 1)`. Stdout `9` then `2`, status 0.
- `ia-copy-explicit`: `var a = int_array(0)`, `push(a, 1)`, `var b = copy(a)`, `push(b, 7)`, print `len(a)` then `len(b)`. Stdout `1` then `2`, status 0. Shows C2.
- `ia-borrow-param`: `fn first(a: IntArray): Int { return get(a, 0) }`. Caller pushes 5 to `a`, prints `first(a)` then `len(a)`. Stdout `5` then `1`, status 0. Shows C4.
- `ia-example`: `fn size(a: IntArray): Int alloc { return len(a) }` with `example size(int_array(3)) == 3`. `glyphc check` exits 0 with no diagnostics. Shows E3.
- `trap-index`: `get(a, 3)` on a length-3 array. Stdout empty, stderr `trap: index-out-of-bounds`, status 1.
- `trap-set-negative`: `set(a, -1, 0)` on a length-3 array. Stderr `trap: index-out-of-bounds`, status 1.
- `trap-after-output`: `print(1)`, then `get(a, 3)` on a length-3 array. Stdout `1`, stderr `trap: index-out-of-bounds`, status 1.
- `trap-bad-capacity`: `int_array(-1)`. Stderr `trap: bad-capacity`, status 1.
- `trap-oom`: `int_array(33554432)`. The block alone is `HEAP_LIMIT` bytes, so with the header the request exceeds the limit. Stderr `trap: out-of-memory`, status 1.

Compile-error tests, each stating the code and span:

- `ia-err-bare-store` (E0200): `var b = a` where `a` is an `IntArray`. One record. Span on `a`. Its `fix` replaces that span with `copy(a)`.
- `ia-err-bare-return` (E0200): `return a` in a function whose result is `IntArray`. Span on `a`.
- `ia-err-param-set` (E0303): `fn f(a: IntArray) { set(a, 0, 1) }`. Span on the first `a`.
- `ia-err-let-push` (E0303): `fn main() alloc`, `let a = int_array(1)`, `push(a, 2)`, on separate lines. Span on `a` in `push`.
- `ia-err-missing-alloc` (E0400): `fn f(): Int` calls `int_array(1)`. Span on the call.
- `ia-err-copy-missing-alloc` (E0400): `fn f(a: IntArray): Int` calls `copy(a)`. Span on the call.
- `ia-err-call-alloc` (E0400): a function without `alloc` calls `size` from `ia-example`. Span on the call.
- `ia-err-alloc-order` (E0100): `fn f(): Int alloc io { return 1 }`. Span on `alloc`.
- `ia-err-reserved` (E0300): `let len = 1`. Span on `len`.
- `ia-err-builtin-value` (E0301): `let f = len`. Span on `len`.
- `ia-err-eq` (E0200): `a == b` on two `IntArray` names. Span on the first operand.
- `ia-err-stmt-value` (E0200): `let x = push(a, 1)`. Span on `push`.

Grammar coverage: each new production in `fn_decl` and the `IntArray` type name is reached by one test above. `ia-err-alloc-order` reaches the effect word, and `ia-len-empty` reaches the type name.

Every code cited has at least one test: E0100, E0200, E0300, E0301, E0303 and E0400.

## Open questions

1. **Explicit or implicit copy.** This draft chooses an explicit `copy` with a fix-it (C1). Draft 0040 chose implicit copies. Reviewers should say which they prefer before the vote.
2. **Roadmap gate (M2b).** Confirm that a compiler is on `main` before voting. If not, hold this draft.
3. **Spelling of `alloc` and `io` (#36).** This draft uses `alloc` in the effect position. Its final spelling follows #36.
4. **Whether traps belong in signatures (#64, #68).** This draft adds no trap marks. If the group decides they belong, D9 needs a mark on each kind.
5. **Heap size.** 256 MiB is a guess that fits the example programs. A benchmark should set it before merge.
6. **Codes missing from `spec/errors.json` (#72).** The implementation PR must add the six codes listed in Cost before this draft can merge.
