---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: abstain
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: arrays-buffers-borrow

Status: draft
Class: language
Slug: arrays-buffers-borrow
Builds on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0004 (diagnostic style, accepted).
Revives none of RFCs 0008, 0010, 0022, 0023, 0025, 0027, 0029, 0032, 0034, 0036, 0038 or 0039. All are rejected. This draft does not assume why they failed.

## Summary

Adds one growable array type, `IntArray`, whose elements are `Int`. An `IntArray` value owns its elements. Storing an existing array in a new name copies it, so two live names never share storage. A function receives an array as a read-only borrow and cannot write to it. Writes happen only through a `var` binding in the function that owns the name. Five built-in functions create, read, write and grow arrays. Functions that allocate say so with the effect word `alloc`, checked the same way as `io`. Every failure is a defined trap.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Issue #361 reports that no RFC has been proposed for it and that twelve drafts were rejected with no reasons recorded. The vote records of those drafts give no reason for any of the twelve rejections, so this draft does not claim to answer a particular objection.

It takes a position on the choice that most affects local reasoning (principle 2). Earlier drafts let a name share storage with another name, and a write through one name then changed the other with nothing at the use site to show it. This draft copies on store, and borrows on call. The surface is kept small: one element type, five functions, no slices, no `pop`, no bytes. The byte buffers and the text builder depend on this item, so a small first surface matters more than breadth.

Open user issues this draft responds to:

- #361: the item has no RFC, and the rejections give no reasons. This draft is the proposal the issue asks for.
- #341, #342, #344, #345, #348, #351, #353, #360: the spec card gives no syntax. The Cost section lists the card lines this draft adds. They are the array lines only; the card's basic syntax is a separate item.

Roadmap conflict: `ROADMAP.md` (M2b) says no new RFC is proposed until the first merge puts a compiler on `main`. Issue #359 and #349 report that `check` and `run` still print "no front end yet". This agent works from a scratch copy and cannot see the state of `main`. The orchestrator should confirm the M2b gate before this draft is voted on. If the gate is not met, this draft should be held, not voted on. See Open questions.

## Design

Rule prefixes: T for types, C for copies, A for built-in functions, F for effects, TR for traps (extended from RFC 0020). Every rule not prefixed here is RFC 0020's, unchanged.

### Types

D1. `IntArray` is a type name. It is valid where RFC 0020 allows `Int`, `Bool` and `Text` in a type position: the type of a `let` or `var`, a parameter, and a result. Elsewhere it is E0200.

D2. An `IntArray` value has a length, an `Int` of 0 or more. Its elements are `Int`. A capacity is kept by the runtime; it is not visible in Glyph.

D3. `IntArray` has no equality, no ordering and no operators. `==`, `!=`, `<` and the other operators on it are E0200. `print` does not accept it, and P1's rule for other argument types applies.

### Copies

C1. When the whole right side of a `let` or `var` initialiser, an assignment, or a `return` is a name that holds an `IntArray`, the value is copied into newly allocated storage. The copy is a new value with its own elements. A right side that is a call (for example `arr_new(3)`) is not copied, because the call already gives a new value.

C2. Any other use of an `IntArray` name does not copy. In particular, passing a name as an argument does not copy.

C3. A parameter of type `IntArray` is a read-only borrow for the length of the call. The callee may read it, call `arr_len` and `arr_get` on it, and pass it on as an argument. The callee may not write it: `arr_set` and `arr_push` on a parameter are E0303. Because the callee has no way to reach the caller's `var` (there are no global variables in the kernel), the array does not change while the call runs.

C4. Copying uses the heap, so it has the `alloc` effect (F2). A function that copies must declare `alloc`. Otherwise E0400.

### Built-in functions

These names are reserved. Declaring a binding, parameter or function with one of these names is E0300. Using one as a value is E0301. Their call forms are checked as RFC 0020 checks a call (E8).

A1. `arr_new(n: Int): IntArray alloc` creates an array of length `n`, with every element `0`. If `n` is below 0, the run traps `bad-length`. If `n` times 8 bytes does not fit in the free heap (T4), the run traps `heap-exhausted`.

A2. `arr_len(a: IntArray): Int` returns the length. It is pure.

A3. `arr_get(a: IntArray, i: Int): Int` returns the element at index `i`, counted from 0. If `i` is below 0 or not below the length, the run traps `index`. It is pure.

A4. `arr_set(a: IntArray, i: Int, v: Int)` writes `v` at index `i`. It has no result and no effect. `a` must be a bare name bound by `var` in the current function. A `let` binding or a parameter is E0303. Any other form of `a` is E0200. A bad index traps `index` as in A3. It is a statement only: used as a value, it is E0200 (T5 of RFC 0020).

A5. `arr_push(a: IntArray, v: Int)` appends `v`, so the length grows by 1. It has the `alloc` effect. `a` must be a bare `var` name, with the same checks as A4. If the length equals the capacity, the new capacity is the larger of 4 and twice the old capacity, the elements are copied to new storage, and the old storage is abandoned. If the new size does not fit in the free heap, the run traps `heap-exhausted`.

### Effects

F1. `alloc` is an effect word, written after the result clause and after `io` if there is one: `fn f(p: Int): R io alloc { ... }`. The order is `io` then `alloc`. Any other order, or a repeated word, is E0100. The word is recognised only in that position. Elsewhere it is an ordinary name, and reserved names apply (see above).

F2. A function calls `arr_new` or `arr_push`, or copies an array (C4), only if it declares `alloc`. A function without `alloc` may not call a function that declares `alloc`. Either is E0400. The check is the one RFC 0020 uses for `io` (F2 there) and extends to `alloc`.

F3. A function that declares `alloc` may be called from a function that declares `alloc` or `io alloc`. A function that declares only `io` may not call an `alloc` function. This follows from F2.

F4. An example (EX2 of RFC 0020) may not call a function with `alloc`, so `arr_new` in an example is E0400. An example has no bindings, so it cannot copy.

F5. `arr_set` and `arr_get` have no effect word. `arr_set` is not an `io` function and needs no `io`.

### Traps

TR1 of RFC 0020 is extended with three kinds, in the same flat list. Traps carry no code, as RFC 0020 states.

- `index`: an `arr_get` or `arr_set` index is outside `0` to length minus 1.
- `bad-length`: `arr_new` was given a negative length.
- `heap-exhausted`: an allocation (A1, A5, or a copy under C1) does not fit in the free heap.

The heap is one linear memory region of 16 MiB, fixed by this RFC and the same for every run. Each run starts with an empty heap. The allocator is a bump allocator. Freed storage is not reused in this milestone (the designer rules), so a loop that copies may exhaust the heap. That is a defined trap, not undefined behaviour.

Output written before a trap stays written (RFC 0020 TR1).

### Grammar

The grammar gains the effect word and nothing else in the fn signature. Concretely, `fn_decl` in `spec/grammar.peg` accepts `(": " type)? (" io")? (" alloc")?` in place of the single `io` form, and `type` accepts the name `IntArray`. The exact productions are for the implementer; each one is reached by a test in the Test plan.

## Alternatives

- **Shared handles (reference semantics).** Rejected. A write through one name would change another with no sign at the use site, which breaks principle 2. Drafts 0023, 0025 and 0038 chose this and were rejected.
- **Copy on every call.** Rejected here. Every call with an array argument would allocate. C3 gives the same safety with no copy.
- **Explicit `copy(a)` with aliasing rejected by a diagnostic.** Possible, and the main open question. It moves the cost to the programmer and adds a diagnostic that needs its own code. This draft chose implicit copies on store because it adds no code and no call-site syntax.
- **A generic `Array<T>`.** Rejected for this RFC. The type system's shape is open in the constitution. One element type needs no such decision.
- **Brackets `[T]` and `a[i]`.** Rejected for this RFC. RFC 0014 has no `[` or `]` token. Adding them is a lexical amendment this draft does not make. If a later RFC adds them, they replace `arr_get` and `arr_set`, not sit beside them (principle 1).
- **Fixed-length arrays only, no `arr_push`.** Rejected. Without growth, the text builder and the byte buffers have nothing to build on, and the checklist item is not met.
- **Functional update (each write returns a new array).** Rejected. Each write allocates, and with no free list the heap runs out after a few thousand writes.
- **A `pop` function.** Rejected for the first milestone. It removes a value with no use in the checklist. It can come in a later RFC with its own test.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator need neither.

## Cost

Adds to the spec core: the type name `IntArray` (D1 to D3), the copy rules (C1 to C4), five built-ins with their checks (A1 to A5), the effect word (F1 to F5), three trap kinds, and the heap constant. The core size is measured by the merge bot. This draft estimates about 900 tokens for the new rules. The current core size is not visible from this checkout, so the estimate is not checked here.

Removes: nothing. No existing rule is changed. RFC 0020 rule F2 is extended to `alloc`, and its wording is kept.

Spec card: about 6 new lines, under 200 tokens: the `IntArray` type with value semantics, the copy-on-store rule, the five built-in signatures, the `alloc` effect order, and the three trap kinds. The card stays well under 2,000 tokens if the other items add no more than about 1,500.

No new diagnostic codes. The codes used are E0100, E0200, E0300, E0301, E0303 and E0400, all with the meanings RFC 0020 gives them. None is in `spec/errors.json` yet (issue #72), so this draft depends on that file being fixed by the same change that makes the merge bot's no-second-meaning check possible. This draft adds no code, so the "never reused" rule holds.

## Test plan

Run tests (each prints or traps and is checked against the expected output or trap line):

- `arr-new-len`: `arr_new(3)` then `arr_len` prints `3`.
- `arr-get-set`: write index 1 to 7 with `arr_set` on a `var`, read it back with `arr_get`, and print `7`.
- `arr-push-grow`: a `var` array gets 10 `arr_push` calls; `arr_len` prints `10`, and `arr_get` on index 9 prints the last value pushed.
- `arr-copy-on-store`: `let a = arr_new(2)`, then `var b = a`, `arr_set(b, 0, 5)`, then `arr_get(a, 0)` prints `0`. Shows C1.
- `arr-borrow-param`: a function with an `IntArray` parameter reads it and returns `arr_len`. The caller's array is unchanged after the call. Shows C2 and C3.
- `arr-trap-index`: `arr_get` at index equal to the length; stderr has `trap: index`; exit status 1.
- `arr-trap-bad-length`: `arr_new(-1)`; `trap: bad-length`; exit 1.
- `arr-trap-heap`: a loop of `var b = a` copies until the 16 MiB heap is used; `trap: heap-exhausted`; exit 1.

Compile-error tests (each checks a code and a span):

- `arr-set-let` (E0303): `arr_set` on a `let` name.
- `arr-set-param` (E0303): `arr_set` on a parameter.
- `arr-set-value` (E0200): `print(arr_set(a, 0, 1))`.
- `arr-set-expr` (E0200): `arr_set(arr_new(1), 0, 1)`, a call as the first argument.
- `arr-alloc-missing` (E0400): a function without `alloc` calls `arr_new`.
- `arr-alloc-callee` (E0400): a function without `alloc` calls a function that has `alloc`.
- `arr-alloc-example` (E0400): an `example` expression `arr_len(arr_new(0)) == 0`.
- `arr-effect-order` (E0100): `fn f() alloc io`.
- `arr-reserved-name` (E0300): `let alloc = 1` and `fn arr_len() ...`.
- `arr-no-compare` (E0200): `arr_new(1) == arr_new(1)`.

Grammar coverage: each new production in `fn_decl` and the `IntArray` type name is reached by one of the tests above (`arr-effect-order` and `arr-set-let` reach the effect and type productions).

## Open questions

1. **Roadmap gate.** M2b says no new RFC until a compiler is on `main`. The assignment asks for this proposal anyway. If the orchestrator holds the gate, this draft should be withdrawn and held.
2. **Implicit or explicit copies.** C1 copies on store with no syntax. The alternative is an explicit `copy(a)` and a diagnostic on aliasing. Reviewers should say which they prefer before voting, since the rejected drafts do not say.
3. **Spelling of `alloc`.** Issue #36 asks about the spelling of `io` and `alloc`. This draft uses `alloc` as a contextual word in the effect position. Its final spelling follows #36.
4. **Heap size.** 16 MiB is a guess that fits the kernel's example programs. A benchmark should set it before merge.
5. **Codes missing from `spec/errors.json`.** The codes used here are in RFC 0020 but not in `spec/errors.json` (issue #72). This draft cannot merge until that file lists them.
