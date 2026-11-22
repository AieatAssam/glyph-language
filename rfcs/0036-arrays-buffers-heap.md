---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: reject
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: arrays-buffers-heap

Status: draft
Class: language
Replaces: nothing. Builds on RFC 0020 (kernel, accepted) and RFC 0024 (byte type, accepted). Does not revive RFCs 0008, 0010, 0022, 0023, 0025, 0027, 0029, 0032 or 0034; all are rejected.

## Summary

Adds one growable array type of `Int` elements, `IntArray`, with a small set of built-in operations. Arrays are shared mutable handles on a bump-allocated heap. Allocation is an explicit effect. Every failure is a defined trap. Byte buffers are deferred to a later RFC built on RFC 0024.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Nine earlier drafts for this item were rejected. Their vote records give no reasons, so this draft does not assume which part failed. It takes the smallest surface that covers the item and states each choice that a reviewer could reject.

Two open user issues decide parts of this design and are not settled by it:

- #64 and #68: whether traps appear in signatures. This RFC does not add trap markers to signatures. Array operations trap as RFC 0020 TR1 describes, and their signatures show only the effect `alloc` where they allocate.
- #67: the trap kinds. RFC 0020 lists four. This RFC adds four more. If #67 decides on a different structure for trap kinds, the names here change with it and nothing else does.

The compiler exists on the current tree: `glyphc` answers, the walking skeleton builds and runs, and the stage0 unit tests pass (345 of 345). So the rule in the roadmap that no RFC is proposed before a compiler is on `main` is read here as met.

## Design

### D1. Type

`IntArray` is a type. A value of type `IntArray` is a handle. Copying a handle with `let b = a` copies the handle, not the elements. Two handles that refer to one array see the same elements, length and capacity.

### D2. Operations

Each is a built-in function. Argument types are checked by the type rules of RFC 0020.

| Name | Signature | Effect | Behaviour |
| --- | --- | --- | --- |
| `int_array` | `(cap: Int): IntArray` | `alloc` | New empty array with capacity `cap`. If `cap < 0`, trap `bad-capacity`. If the request does not fit the heap, trap `out-of-memory`. |
| `len` | `(a: IntArray): Int` | none | Number of elements. |
| `get` | `(a: IntArray, i: Int): Int` | none | Element `i`. If `i < 0` or `i >= len(a)`, trap `index-out-of-bounds`. |
| `set` | `(a: IntArray, i: Int, v: Int)` | none | Replace element `i`, under the same bounds rule as `get`. |
| `push` | `(a: IntArray, v: Int)` | `alloc` | Append `v`. See D3. |
| `pop` | `(a: IntArray): Int` | none | Remove and return the last element. If `len(a) == 0`, trap `empty-pop`. |

`set` and `pop` mutate the array they name, and every alias sees the change.

### D3. Growth

An array holds a header with `len`, `cap` and a pointer to its element block. `push` on a full array allocates a new block of `2 * cap`, copies the elements, and updates the header. The old block is not freed. The new capacity is `max(2 * cap, 4)` when `cap` is 0 or 1; this keeps growth from stalling at zero. If `2 * cap` does not fit in `Int`, or the block does not fit the heap, trap `out-of-memory`.

### D4. Heap

The heap is a bump allocator over WebAssembly linear memory. There is no free list and no garbage collector. Each allocation advances a pointer. Arenas are not part of this RFC.

The heap limit is a fixed constant, `HEAP_LIMIT = 268435456` bytes (256 MiB), and it does not depend on the host. An allocation that would move the pointer past `HEAP_LIMIT` traps `out-of-memory`. Because the limit is fixed, the same program traps at the same point on every run.

The benchmark that would justify a free list is a program in the benchmark set that runs out of heap under this allocator while its live data is under half of `HEAP_LIMIT`. No such program exists yet.

### D5. Traps

The four new kinds follow the form of RFC 0020 TR1: one line `trap: <kind>` on standard error, exit status 1 through WASI `proc_exit`, output written before the trap stays written. Traps carry no code.

New kinds: `bad-capacity`, `index-out-of-bounds`, `empty-pop`, `out-of-memory`.

### D6. Effects

`alloc` marks a function that can allocate. A function that calls `int_array` or `push` must declare `alloc` in its signature, as a caller must declare `io` for `print`. A function that does not declare `alloc` and calls a function that does is a compile error. The spelling of the effect marker is decided by #36. This RFC uses the word `alloc` in effect position, and it is blocked on #36 for the final spelling.

### D7. Examples

Functions that use arrays may carry examples in the form RFC 0020 defines. The compiler runs them as it runs other examples. Examples are part of the contract (principle 5).

## Alternatives

- **Value semantics with copy on assignment.** Rejected here. Every `let` copies the elements, and `push` in a loop becomes quadratic. It also needs a copy rule that the earlier drafts did not settle.
- **Reassigning growth, `a = push(a, v)`.** Rejected here. It makes aliases go stale after growth, which is a silent behaviour the reader cannot see from the text of one call.
- **Generic element type.** Not in this RFC. A generic type needs a type-system decision the kernel does not yet have. `IntArray` is one concrete type.
- **Byte buffers in this RFC.** Deferred. RFC 0024 is accepted, but the buffer operations need a decision on slices, which this RFC does not make.
- **Trap instead of growth on `set` past `len`.** Kept as written: `set` never grows the array. Only `push` grows it.

## Cost

Adds: one type name, `IntArray`; five built-in functions; one effect word, `alloc`; four trap kinds. Trap kinds are text in the runtime, not grammar productions, so the grammar changes only by the effect position.

Removes: nothing.

Spec card: two lines, one for the type and the handle rule, one for the list of traps. About 90 tokens. The core spec grows by an estimated 600 tokens, which is within the 12,000-token cap at 917 measured now (not measured yet for this text).

No new diagnostic codes are added. The one compile-time rule (missing `alloc`) uses the effect diagnostic that RFC 0020 defines for missing `io`, so the existing code covers it. If #36 or RFC 0020 lacks a code for the missing-effect case, this RFC adds one and it will be the next unused code in its block.

## Test plan

Run tests in `conformance/arrays/`. Each states stdout and exit status, and carries the `--- meta` block with `id`, `rfc` and `kind`.

- `arr-push-len`: `let a = int_array(0)`, three `push` calls, `print(len(a))`. Stdout `3`, status 0.
- `arr-alias`: `let a = int_array(2)`, `let b = a`, `push(b, 7)`, `print(get(a, 0))`. Stdout `7`, status 0. Shows aliases share elements.
- `arr-grow`: 100 pushes, then `print(len(a))` and `print(get(a, 99))`. Stdout `100` and the last pushed value, status 0.
- `arr-pop`: push 1 and 2, `pop` twice, print each. Stdout `2` then `1`, status 0.
- `trap-index`: `get(a, 3)` on a length-3 array. Stdout empty, stderr `trap: index-out-of-bounds`, status 1.
- `trap-index-set`: `set(a, -1, 0)`. Stderr `trap: index-out-of-bounds`, status 1.
- `trap-after-output`: `print(1)`, then `get(a, 3)` on a length-3 array. Stdout `1`, stderr `trap: index-out-of-bounds`, status 1.
- `trap-empty-pop`: `pop` on a new array. Stderr `trap: empty-pop`, status 1.
- `trap-bad-capacity`: `int_array(-1)`. Stderr `trap: bad-capacity`, status 1.
- `trap-oom`: `int_array(134217728)`, which asks for 1 GiB of 8-byte elements. Stderr `trap: out-of-memory`, status 1. This is fast, since the request is refused before any push.
- `trap-oom-grow`: a push loop on one array until the doubling overflows the heap. Stderr `trap: out-of-memory`, status 1. Slow; it is a separate test so it can be skipped locally.

Compile-error tests:

- `err-missing-alloc`: a function `fn f(a: IntArray) { push(a, 1) }` with no `alloc`. One record, code the missing-effect code from RFC 0020, span on the `push` call, no fix.
- `err-type-mismatch`: `get(a, true)`. One record, code the type-mismatch code from RFC 0020, span on `true`. The exact code depends on #31, which is open. This test cites the existing code and adds none.

Each new conformance test needs its trap line to match RFC 0020 TR1 format exactly.

## Open questions

1. Effect spelling for `alloc` (#36).
2. Whether traps appear in signatures (#64, #68). This draft does not add them.
3. The trap-kind structure (#67). This draft adds four flat kinds.
4. The type-mismatch code (#31).
5. Whether `HEAP_LIMIT` of 256 MiB is the right constant, or whether the build should set it. The draft fixes it, so output does not depend on the build.
