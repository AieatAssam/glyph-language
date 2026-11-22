# RFC draft: arrays-buffers-value

Status: draft
Class: language
Slug: arrays-buffers-value
Builds on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0004 (diagnostic style, accepted). Amends RFC 0020 by name in T6, T7, F1, F2, F6, F7, B5, TR1 and EX2, as listed in Design. Revives none of RFCs 0008, 0010, 0022, 0023, 0025, 0027, 0029, 0032, 0034, 0036 or 0038; all are rejected.

## Summary

Adds one growable array type, `IntArray`, whose elements are `Int`. An `IntArray` value owns its elements. Binding a name to another name copies the array, so no two live names share storage and a write through one name is never visible through another. Five built-in functions create, read, write and grow arrays. Allocation is an explicit effect, `alloc`, checked like `io`. Every failure is a defined trap.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Nine drafts for it were rejected, and RFC 0038 was rejected by four reviewers. Their vote records give no reasons, so this draft does not claim to know which part failed. It takes a different position on the one choice that most affects local reasoning (principle 2): shared mutable handles. RFC 0038 made `let b = a` share storage. A write through `b` then changes `a` with nothing at the use site to show it. This draft copies instead, and keeps the surface of RFC 0038 otherwise: one element type, no `pop`, no bytes.

Open user issues this draft depends on, and how it treats each:

- #73 and #75: the spec card gives no syntax. Cost lists the card lines this RFC adds.
- #36: the spelling of `io` and `alloc`. This draft uses the word `alloc` in the effect clause, beside `io`. Its final spelling follows #36.
- #64 and #68: whether traps appear in signatures. This draft adds no trap marks. Array operations trap as RFC 0020 TR1 describes.
- #67: the structure of trap kinds. RFC 0020 lists four kinds. This draft adds three, flat, in the same list.
- #72: `spec/errors.json` lacks codes that accepted RFCs use. This draft adds no code. It reuses E0100, E0200, E0300, E0301, E0303 and E0400 with the meanings RFC 0020 gives them. E0400 already covers a call to an `io` function from a function without `io`; this draft extends the same trigger to `alloc`.

Roadmap conflict: `ROADMAP.md` (M2b) says no new RFC is proposed until a compiler is on `main`. Issue #74 reports that `check` still exits 2 with "no front end yet". RFC 0038 says the gate is met. This agent cannot see the state of `main` from a scratch copy. The orchestrator should confirm the gate before this draft is voted on. If the gate is not met, this draft should be held, not voted on.

## Design

Rule numbers with a prefix are new in this RFC: C for copies, A for allocation and heap.

### D1. Type

`IntArray` is a type. A value is a growable array of `Int`. Its elements are owned by that value.

`IntArray` has no `==` and no `!=` (E3 of RFC 0020 applies), so an `IntArray` operand is E0200. `print` takes `Int`, `Bool` or `Text` only, so printing an `IntArray` is E0200.

### D2. Copies and borrows

C1. `let b = a`, `var b = a`, the assignment `b = a`, and `return a` each copy when the right side is a name. The copy has its own header and its own element block, with capacity equal to length. Copying allocates (A3).

C2. A name passed as a call argument is borrowed for the call. Inside the callee the parameter is a parameter, so it cannot be assigned (B2, E0303), and it cannot be the first argument of `set` or `push` (D3, E0303). The caller is suspended during the call, so the borrowed array cannot change while the callee runs.

C3. A fresh value binds without a copy. A fresh value is a call result or a call to `int_array`. A call result is fresh because `return` copies a name (C1), so the caller holds the only handle.

### D3. Built-in functions

| Function | Signature | Effect | Behaviour |
| --- | --- | --- | --- |
| `int_array` | `(cap: Int): IntArray` | `alloc` | New array of length 0 and capacity `cap`. Traps as A2 gives. |
| `len` | `(a: IntArray): Int` | none | Length. |
| `get` | `(a: IntArray, i: Int): Int` | none | Element `i`. Traps `index-out-of-bounds` unless `0 <= i < len(a)`. |
| `set` | `(a: IntArray, i: Int, v: Int)` | none | Replaces element `i` under the same bounds rule. Never changes the length. Statement only. |
| `push` | `(a: IntArray, v: Int)` | `alloc` | Appends `v`, growing as A2 gives. Statement only. |

The first argument of `set` and `push` must be a name declared with `var`. Any other form is E0303 at that argument. `set` and `push` return nothing. Using either as a value is E0200.

Arguments are evaluated left to right (E10 of RFC 0020). For `set`, all three arguments are evaluated before the bounds check.

Reserved names: `IntArray`, `int_array`, `len`, `get`, `set` and `push` are added to B5, F6 and T7 of RFC 0020. A binding or function that takes one of these names is E0300 at the name. Using one as a value is E0301.

### D4. Layout and growth

An array value is a header of three `Int` fields on the heap: length, capacity, and the address of an element block of `8 * capacity` bytes. The header is 24 bytes. Slots at or above the length are never read.

A2. `int_array(cap)`:

1. If `cap < 0`, trap `bad-capacity`.
2. If `cap > HEAP_LIMIT / 8`, trap `out-of-memory`. This test comes before any multiplication.
3. Allocate the header and an element block of `8 * cap` bytes (no bytes when `cap` is 0). If the request does not fit under A4, trap `out-of-memory`.
4. Set the length to 0 and the capacity to `cap`.

A2 (push). `push(a, v)`:

1. If `len(a) < cap(a)`, store `v` at index `len(a)` and add 1 to the length. Stop.
2. Otherwise, if `cap(a) > HEAP_LIMIT / 16`, trap `out-of-memory`.
3. Let `newcap = max(2 * cap(a), 4)`. Allocate an element block of `8 * newcap` bytes under A4. If it does not fit, trap `out-of-memory`.
4. Copy the `len(a)` elements to the new block, point the header at it, set the capacity to `newcap`, then store `v` and add 1 to the length.

The old block is abandoned, not freed. Because the header is owned by one name (C1, C2), no other name needs updating.

### D5. Effects and examples (amends F1, F2, M1 and EX2)

A3. Each of these allocates, and so requires `alloc` in the enclosing function: a call to `int_array` or `push`; a copy under C1; a call to a function that declares `alloc`. A function without `alloc` that does any of these is E0400 at the span of the call or copy.

F1 becomes: `fn NAME(p1: T1, ...) [: R] [io] [alloc] block`. Both words are optional and appear in this order. `alloc` before `io` is E0100 at `alloc`.

M1 becomes: `main` may declare `io` and `alloc`.

EX2 is amended: an example may call functions that declare `alloc`, and may copy. It may not call `io` functions or `print` (E0400), as before. Each example runs with its own empty heap (EX3), so examples stay deterministic.

### D6. Parameters and results (amends T6 and F7)

T6 becomes: parameter and result types are `Int`, `Bool` or `IntArray`. A `Text` there is still E0100.

F7 becomes: parameters are `Int`, `Bool` or `IntArray`.

### D7. Heap (A4)

The heap is a bump allocator over WebAssembly linear memory. Each allocation takes the next bytes, rounded up to a multiple of 8. Nothing is freed one block at a time. There is no free list and no collector.

The counter is the total number of bytes allocated since the run began. Headers and abandoned blocks count. The limit is `HEAP_LIMIT = 268435456` (256 MiB), a constant of the language, not of the build. An allocation that would take the counter over `HEAP_LIMIT` traps `out-of-memory`. Each run starts with an empty heap, so the same program traps at the same point on every host (principle 7).

Arenas are not part of this RFC. A free list is not proposed. The benchmark that would justify one is a program whose live array data stays under half of `HEAP_LIMIT` but whose total allocation exceeds `HEAP_LIMIT`. No such program exists yet.

### D8. Traps (amends TR1)

TR1's list of kinds gains three:

- `bad-capacity`: `int_array` with `cap < 0`.
- `index-out-of-bounds`: `get` or `set` with `i` outside `0` to `len - 1`.
- `out-of-memory`: any allocation that breaks A2 or A4.

Each follows TR1 exactly: one line `trap: <kind>` on standard error, exit status 1 through `proc_exit`, no code, earlier output kept.

## Alternatives

- **Shared handles, as in RFC 0038.** Rejected. A write through one name changes another with no sign at the use site, which breaks principle 2. Copies cost time, but the cost is in the text of the program.
- **Explicit `copy(a)` with aliasing rejected by a diagnostic.** Not chosen here. It removes hidden copies, but the rule needs move analysis to tell when a name is still live. This is listed as open question 2.
- **`pop`.** Omitted. It adds a trap kind and a removal path that no test in this draft needs. A later RFC can add it under its own name.
- **Byte elements.** Deferred. RFC 0024 is accepted, but a byte array needs a decision on slices, which this draft does not make.
- **A generic `Arr<T>`.** Not chosen. The type system's shape is open under the constitution, and one concrete type needs no such decision.
- **Allocation without an effect.** Rejected. It would hide allocation from the signature, against principle 3.
- **Exposing capacity.** Not included. No test here needs it, and capacity is only named in D4.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator need neither.

## Cost

Adds:

- the type name `IntArray` and the copy and borrow rules C1 to C3;
- six reserved names (D3);
- the effect word `alloc` in F1 and M1, and the rule in A3;
- two type names in T6 and F7;
- three trap kinds in TR1.

Removes: nothing. No accepted construct is removed. Reviewers should name a removal if they want one. This draft does not propose one, so it does not meet the planning rule that growth needs a simplification elsewhere. Open question 6 asks for it.

Estimated size: about 450 tokens added to the core spec. The core is 917 tokens as RFC 0038 reports it; this draft does not re-measure it. The cap is 12,000.

Spec card: `spec/card.md` covers diagnostics only. This RFC adds about five lines (about 100 tokens): the type and its copy rule, the built-in table, the `alloc` word and the three trap kinds. This answers #73 and #75 for arrays. The card is 244 tokens of 2,000 now, as RFC 0038 reports.

Diagnostics: no new code. E0100, E0200, E0300, E0301, E0303 and E0400 are used with the meanings RFC 0020 gives them. E0400 gains the `alloc` trigger in A3. Every code cited here must be added to `spec/errors.json` (#72).

## Test plan

Files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (the number the orchestrator assigns) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line, which matches TR1.

Run tests:

- `arr-len-empty`: `fn main() io alloc`, `var a = int_array(0)`, `print(len(a))`. Stdout `0`, status 0.
- `arr-push-len`: `var a = int_array(0)`, three `push` calls, `print(len(a))`. Stdout `3`, status 0.
- `arr-grow`: 100 pushes of `i`, then `print(len(a))` and `print(get(a, 99))`. Stdout `100` then `99`, status 0.
- `arr-set`: push 1, push 2, `set(a, 0, 9)`, print `get(a, 0)` and `get(a, 1)`. Stdout `9` then `2`, status 0.
- `arr-copy-let`: `var a = int_array(0)`, `push(a, 1)`, `var b = a`, `push(b, 7)`, print `len(a)` then `len(b)`. Stdout `1` then `2`, status 0. Shows that binding copies.
- `arr-copy-assign`: `var a` and `var b` both `int_array(0)`, `push(a, 5)`, `b = a`, `push(a, 6)`, print `len(b)` then `get(b, 0)`. Stdout `1` then `5`, status 0.
- `arr-param-borrow`: `fn first(a: IntArray): Int { return get(a, 0) }`, caller prints `first(a)` and then `len(a)` after the call. Shows the borrow leaves the caller's array unchanged.
- `arr-return-copy`: `fn same(a: IntArray): IntArray alloc { return a }`, `var b = same(a)`, `set(b, 0, 5)`, print `get(a, 0)` shows the original value.
- `arr-example`: `fn size(a: IntArray): Int alloc { return len(a) }` with `example size(int_array(3)) == 3`. `glyphc check` exits 0 with no diagnostics. Checks EX2 as amended.
- `trap-index`: `get(a, 3)` on a length-3 array. Stdout empty, stderr `trap: index-out-of-bounds`, status 1.
- `trap-set-negative`: `set(a, -1, 0)` on a length-3 array. Stderr `trap: index-out-of-bounds`, status 1.
- `trap-after-output`: `print(1)`, then `get(a, 3)` on a length-3 array. Stdout `1`, stderr `trap: index-out-of-bounds`, status 1.
- `trap-bad-capacity`: `int_array(-1)`. Stderr `trap: bad-capacity`, status 1.
- `trap-oom-cap`: `int_array(134217728)`. Stderr `trap: out-of-memory`, status 1. Refused at A2 step 2 before any allocation.
- `trap-oom-block`: `int_array(33554432)`. The block alone is `HEAP_LIMIT` bytes, so with the header it passes the limit. Stderr `trap: out-of-memory`, status 1. Fast, and it tests A4 rather than A2.

Compile-error tests, each stating the code and the span:

- `err-missing-alloc`: `fn f(): Int {`, `var a = int_array(1)`, `return len(a)`, `}` on separate lines. One record, E0400, span on `int_array`.
- `err-copy-missing-alloc`: `fn f(a: IntArray): IntArray { return a }`. One record, E0400, span on `a` in the return (C1, A3).
- `err-call-alloc`: a function without `alloc` calls `size` from the example above. One record, E0400, span on the call.
- `err-param-set`: `fn f(a: IntArray) { set(a, 0, 1) }`. One record, E0303, span on the first `a` (C2).
- `err-push-let`: `fn main() alloc { let a = int_array(1); push(a, 2) }`, on separate lines. One record, E0303, span on `a` in `push` (D3).
- `err-elem-type`: `get(a, true)` on an `IntArray` variable. One record, E0200, span on `true`.
- `err-stmt-value`: `let x = push(a, 1)`. One record, E0200, span on `push`.
- `err-array-eq`: `int_array(0) == int_array(0)` inside an `alloc` function. One record, E0200, span on the first operand.
- `err-reserved`: `let len = 1`. One record, E0300, span on `len`.
- `err-builtin-value`: `let f = len`. One record, E0301, span on `len`.
- `err-alloc-order`: `fn f(): Int alloc io { return 1 }`. One record, E0100, span on `alloc`.

Every code cited here has at least one test: E0100, E0200, E0300, E0301, E0303 and E0400.

## Open questions

1. Roadmap gate (M2b). Confirm that a compiler is on `main` before voting. If not, hold this draft.
2. Copy cost. Implicit copies on `let`, assignment and `return` are the rule most likely to draw objections. The alternative is an explicit `copy(a)` plus a rule against aliasing. Reviewers should say which they prefer.
3. Spelling of `alloc` (#36).
4. Whether traps belong in signatures (#64, #68). This draft adds none. If the group decides they belong, D8 needs a mark on each kind.
5. Structure of trap kinds (#67). This draft adds three flat kinds.
6. A simplification. The planning rule says growth needs one. This draft names none. A reviewer may propose one.
7. `HEAP_LIMIT` of 256 MiB, a fixed constant. Whether the build should set it instead is open. The draft fixes it so output does not depend on the build.
