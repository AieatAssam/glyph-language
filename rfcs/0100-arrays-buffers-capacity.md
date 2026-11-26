Class: language
Slug: arrays-buffers-capacity
Status: draft (held: see Motivation)
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8), RFC 0024 (byte-type). All accepted.
Amends: RFC 0020 productions `type` and `ptype` (adds `[T]`), `param` (adds the `var` parameter form) and the effect list (adds `alloc`). Replaces nothing.

# RFC draft: Growable arrays with explicit capacity and no aliasing

## Summary

Glyph gets one growable array type, `[T]`, where `T` is `Int` or `Byte`. Every array has a length and a capacity, both visible to the program. Built-ins:

- `arr(T, n)`: a new empty array of type `[T]` with capacity `n`. `n` is an `Int`. Effect `alloc`.
- `len(a)`: the element count, an `Int`.
- `cap(a)`: the capacity, an `Int`.
- `a[i]`: the element at index `i`, of type `T`. Traps `index` when `i` is below 0 or not below `len(a)`.
- `a[i] = v`: write an element. `a` must be declared with `var`. Same trap.
- `push(a, v)`: append `v`. `a` must be declared with `var`. Effect `alloc`. Doubles the capacity when full. Traps `heap` when the heap cannot hold the new block.
- `copy(a)`: a new array with the same elements and capacity `len(a)`. Effect `alloc`.

Storage is a block on a bump heap that is never freed. No two live names reach one block. Copies are explicit. A `var` parameter lets the callee write the caller's block for the length of the call.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9, item 3: "growable arrays and byte buffers"). Stage 0 needs a growable token list, and its WebAssembly encoder needs an output buffer.

User issue #547 asks how to "write list literals" and declare record types. The card has no list type, so it cannot answer that. This RFC gives the list type. It does not answer the rest of #547.

The benchmark findings do not ground this RFC. Dev fitness is 0.0, held-out totals do not split by feature, and the most common diagnostic is UNKNOWN (540). The held-out `read` score (0.8584) is the lowest held-out metric, which suggests the card needs more on collections. That is a reason, not a measurement.

Eighteen or more array drafts (0008 to 0097) are rejected. Their vote records give no reasons, so this draft does not know which part failed. It differs from the closest rejected draft, 0097, in one visible way: capacity is written in the program (`arr(T, n)` and `cap`) instead of starting at a hidden 4. The aliasing rules are restated here in full, not by reference to 0097.

The roadmap (M2b, `architecture/ROADMAP.md`) says no new RFC is proposed until a compiler is on `main`. This draft is written as assigned and is held as a draft until that merge. Nothing here depends on a compiler that exists today. The orchestrator must confirm the gate before any vote.

## Design

### Types

`[T]` is a type when `T` is `Int` or `Byte`. Any other `T` is E0200 (existing type error from RFC 0020). Arrays have no subtype relation with other types.

### Expressions

- `arr(T, n)` has type `[T]`. `n` must have type `Int`, or E0200.
- `len(a)` and `cap(a)` require `a: [T]` and have type `Int`.
- `a[i]` requires `a: [T]` and `i: Int`, and has type `T`.
- `push(a, v)` requires `a: [T]` and `v: T`, and has type unit.
- `copy(a)` requires `a: [T]` and has type `[T]`.

An array name may appear only in these places: the initialiser of a `let` or `var`, the right side of `=` to a `var` name of the same type, or as a call argument. The initialiser or right side must be `arr(T, n)`, `copy(x)`, or a call whose result type is `[T]`. A bare array name anywhere else is E0220.

### Bindings and assignment

- `let a = arr(Int, n)` and `var a = arr(Int, n)` bind a new block to `a`.
- `var a = copy(b)` binds a new block. `b` is unchanged.
- `a = copy(b)` replaces the block that `a` names. The old block is not freed.
- `a[i] = v` and `push(a, v)` change the block `a` names. `a` must be declared with `var`, or E0303 (RFC 0020).

### Calls

A parameter of type `[T]` is a read-only view. The callee may use `len`, `cap`, `a[i]` and `copy` on it, and may pass it on as a read-only view. It may not write or push.

A parameter declared `var a: [T]` is a writable reference. A call that passes it must pass a name declared with `var`. Passing a `let` name is E0222.

An array name may appear at most once among the arguments of one call. Passing the same array name twice is E0221.

A function may return `[T]` only if the value is a block made in that function, by `arr`, `copy`, or a call. Returning a parameter, or a name bound to one, is E0220.

No name holds an array outside its scope, and there are no closures or globals. So the only way two live names reach one block is through a call, and E0221 with the read-only rule closes that path.

### Effects

A function that calls `arr`, `copy` or `push`, directly or through a call, must declare `alloc` in its signature. Otherwise E0400 (RFC 0020) applies. `alloc` is a new effect word in the same slot as `io`.

### Heap and growth

The heap is one bump region, never freed. `arr(T, n)` allocates a block of capacity `n` at once, or none when `n` is 0. When `push` finds `len(a) == cap(a)`, it allocates a block of capacity `max(1, 2 * cap(a))`, copies the elements, and writes `v`. If the heap cannot hold the block, `push` traps `heap`. `copy(a)` allocates a block of capacity `len(a)`. The old block of a grown array stays on the heap.

The heap is in linear memory. No garbage collector and no reference counting are added. A general free list is not added. The benchmark that would justify one is a workload where the bump heap runs out with live data the program no longer needs; none exists yet.

### Traps

Two trap kinds are added to RFC 0020's list: `index`, raised by `a[i]` and `a[i] = v` when `i` is out of range, and `heap`, raised by `push` or `arr` or `copy` when the heap is full. Traps carry no code, as in spec core.

### Examples

An example may use `arr`, `len`, `cap`, `a[i]`, `push` and `copy` on local names. It may not call an `alloc` function from a function without `alloc` (RFC 0020 EX2). Whether a trap inside an example is a build failure is open (#508, #495). This RFC follows the answer given there.

### Diagnostics

- E0220: an array name is bound, assigned, returned or passed where this RFC does not allow it. The fix is `copy(x)` where the rule allows a copy.
- E0221: the same array name appears twice in one call's arguments.
- E0222: a `let` name is passed to a `var` parameter.

Codes E0220 to E0222 are not in `spec/errors.json` and are not used by any other RFC. Each is new.

## Alternatives

- **Implicit capacity starting at 4 (RFC 0097).** Rejected here. A hidden number is not visible to the program, so a model cannot reason about growth from the text (principle 2).
- **Fixed capacity in the type.** Rejected. Stage 0 has no known bound on its token list.
- **Copy on every bind, pass and return.** Rejected. Each binding or call allocates, invisibly at the use site (principle 3).
- **Shared handles.** Rejected. A write through one name changes another with no sign at the use site (principle 2).
- **A separate byte buffer type.** Rejected for now. `[Byte]` covers the encoder's output under the same rules, so one construct covers both cases (principle 8).
- **Frame arenas for arrays.** Rejected for this RFC. It adds a second lifetime rule. It can come later as a separate RFC if the benchmark shows bump allocation is not enough.

## Cost

Adds:

- one type production `[T]`, one effect word `alloc`, one `var` parameter form;
- seven built-in forms: `arr`, `len`, `cap`, `copy`, `push`, `[]` read and `[]=` write;
- three codes, E0220 to E0222, and two trap kinds.

Removes: nothing.

Spec card: adds one short section (the type, the built-ins, the effect, and the two traps). Its size is not measured here. The protected tokeniser must measure it before any vote. The card cap is 2,000 tokens and the core spec cap is 12,000 tokens. The merge bot must report the net change.

## Test plan

Run tests:

- `arr-new-cap`: `arr(Int, 3)` has length 0 and capacity 3.
- `arr-push-read`: push three Ints into `arr(Int, 4)`, read each back.
- `arr-grow`: `arr(Byte, 2)`, push 3 values; capacity becomes 4, values intact.
- `arr-grow-zero`: `arr(Int, 0)`, push one value; capacity becomes 1.
- `arr-copy-independent`: `copy` a `var` array, write the copy, the original is unchanged.
- `arr-var-param`: a `var` parameter written by the callee; the caller sees the change.
- `arr-view-read`: a `let` parameter read by the callee.
- `arr-trap-index`: read at index equal to `len`; exit status 1, `trap: index`.
- `arr-trap-heap`: push until the heap is full; exit status 1, `trap: heap`. Depends on the card stating the heap size.

Compile-error tests:

- `arr-err-bind`: `let b = a` where `a` is an array name; E0220.
- `arr-err-alias-arg`: `f(a, a)` with an array parameter; E0221.
- `arr-err-var-param`: passing a `let` name to a `var` parameter; E0222.
- `arr-err-alloc`: calling `push` from a function without `alloc`; E0400 (existing).

Coverage: one test for each production and each built-in form (`arr`, `len`, `cap`, `a[i]`, `a[i] = v`, `push`, `copy`).

## Open questions

- Heap size. The trap test needs a fixed heap size, which the card must state. This RFC does not choose it.
- Whether `alloc` is a separate effect word or part of an existing effect in RFC 0020. This draft adds it.
- Whether a trap in an example is a diagnostic (#508, #495). Unresolved here.
- Whether this draft waits for the compiler merge (M2b). The orchestrator decides.
