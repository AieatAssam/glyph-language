Class: language
Slug: arrays-buffers-owned
Status: draft
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3), RFC 0020 (kernel-v8), RFC 0024 (byte-type). All accepted.
Amends: RFC 0020 productions `type` and `ptype` (adds `[T]`), `param` (adds the `var` parameter form) and the effect list (adds `alloc`). Replaces nothing.

# RFC draft: One growable array type with no aliasing

## Summary

Glyph gets one growable array type, `[T]`, where `T` is `Int` or `Byte`. Built-ins:

- `arr(T)`: a new empty array of type `[T]`. Effect `alloc`.
- `len(a)`: the element count, an `Int`.
- `a[i]`: the element at index `i`, of type `T`. Traps `index` when `i` is below 0 or not below `len(a)`.
- `a[i] = v`: write an element. `a` must be a `var` name. Same trap.
- `push(a, v)`: append `v`. `a` must be a `var` name. Effect `alloc`. Traps `heap` when the heap is full.
- `copy(a)`: a new array with the same elements. Effect `alloc`.

Storage is a block on a bump heap that is never freed. Capacity starts at 4 and doubles when full. No two live names reach one block: an array is never bound from another name, never assigned from another name, and never returned from a parameter. Copies are explicit. A `var` parameter gives the callee the caller's block for the length of the call. The RFC adds codes E0220, E0221 and E0222 and two trap kinds, `index` and `heap`.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9, item 3: "growable arrays and byte buffers"). Stage 0 needs a growable token list, and its WebAssembly encoder needs an output buffer. The self-hosted compiler (M5) needs both.

User issue #505 asks the card to say "which types exist and how records and lists are declared". The card cannot answer that while no list type exists. This RFC gives the list type. It does not answer the rest of #505.

The benchmark findings show no array-related diagnostic, so they do not ground this RFC. The roadmap (M2b) also defers new RFCs until a compiler is on `main`. This draft is written as assigned. It can be held in draft until that merge; nothing here depends on a compiler that exists today.

Eighteen array drafts (0008 to 0094) are rejected. Their vote records give no reasons, so this draft does not claim to know which part failed. It differs from the closest rejected drafts in these visible ways:

1. The element type is `Int` or `Byte`, the two types already accepted or readiness-listed, not `Int` alone (0094) or `Int` or `Byte` with a `[]` empty literal (0047, 0087).
2. The type is named where it is written: `arr(T)` gives the type from its argument. No expression's type depends on its position.
3. Aliasing is blocked by three flat rules on names, with no move analysis (0043) and no copy on every bind (0039, 0040, 0041).
4. The only storage is a bump heap. There is no frame arena (0045) and no fixed capacity in the type (0047).

## Design

### Types

`[T]` is a type when `T` is `Int` or `Byte`. Any other `T` is E0200 (existing type error from RFC 0020). Arrays are values of their own type and have no subtype relation with other types.

### Expressions

`arr(T)`, `len(a)`, `a[i]`, `push(a, v)` and `copy(a)` are built-in forms. Each is listed with its type rule:

- `arr(T)` has type `[T]`.
- `len(a)` requires `a: [T]` and has type `Int`.
- `a[i]` requires `a: [T]` and `i: Int`, and has type `T`.
- `push(a, v)` requires `a: [T]` and `v: T`, and has type unit.
- `copy(a)` requires `a: [T]` and has type `[T]`.

An array name may appear only in these forms, in a `let` or `var` initialiser, as a call argument, or in an `=` assignment to an existing `var` name of the same type. The initialiser or right side of `=` must be one of: `arr(T)`, `copy(x)`, or a call whose result type is `[T]`. A bare array name on either side of `=` or in an initialiser is E0220.

### Bindings and assignment

- `let a = arr(Int)` and `var a = arr(Int)` bind a new block to `a`.
- `var a = copy(b)` binds a new block. `b` is unchanged.
- `a = copy(b)` replaces `a`'s block. The old block is not freed.
- `a[i] = v` and `push(a, v)` change the block that `a` names. They require `a` declared with `var`, or E0303 from RFC 0020.

### Calls

A parameter of type `[T]` is a read-only view. The callee may read it with `len`, `a[i]` and `copy`, and may pass it on as a read-only view. It may not write or push to it.

A parameter declared `var a: [T]` is a writable reference. The callee may write and push. A call that passes a `var` parameter must pass a name declared with `var`. Passing a `let` name is E0222.

A name may appear at most once among the arguments of one call when any of those arguments is an array. Passing the same array name twice is E0221.

A function may return `[T]` only if the value is a block created in the function, by `arr` or `copy`, or by a call. Returning a parameter, or a `var` name bound to a parameter, is E0220.

Because no name holds an array outside its scope, and no closures or globals exist, the only way two live names reach one block is through a call. E0221 and the read-only rule close that path.

### Effects

A function that calls `arr`, `copy` or `push`, directly or by call, must declare `alloc` in its signature. Otherwise the existing E0400 applies. `alloc` is a new effect word in the same slot as `io`.

### Heap and growth

The heap is one bump region, never freed. `arr(T)` allocates no block until the first `push` or `copy`; its capacity is then 4. When `len` equals capacity, `push` allocates a new block of twice the capacity, copies the elements, and writes `v`. If the heap cannot hold the new block, `push` traps `heap`. `copy(a)` allocates a block of capacity `len(a)`, or 4 if that is 0.

The heap is in linear memory. No garbage collector and no reference counting are added.

### Traps

Two trap kinds are added to RFC 0020's list: `index`, raised by `a[i]` and `a[i] = v` when `i` is out of range, and `heap`, raised by `push` or `copy` when the heap is full. Traps carry no code, as in spec core.

### Examples

An example may use `arr`, `len`, `a[i]`, `push` and `copy` on local names. It may not call an `alloc` function from a function without `alloc`, as RFC 0020 EX2 already requires. This RFC does not decide whether a trap inside an example is a build failure or a diagnostic. That question is open in #508 and #495, and this RFC follows its answer.

### Diagnostics

- E0220: an array name is bound, assigned, returned or initialised from another array name without `copy`. The fix is `copy(x)`.
- E0221: the same array name appears twice in one call's arguments.
- E0222: a `let` name is passed to a `var` parameter.

Each is new. Codes are never reused.

## Alternatives

- **Copy on every bind, pass and return.** Rejected. Each binding or call allocates, invisibly at the use site (principle 3).
- **Shared handles.** Rejected. A write through one name changes another with no sign at the use site (principle 2).
- **Move on store.** Rejected. It needs a move analysis and a use-after-move error.
- **Fixed capacity in the type.** Rejected. Stage 0 has no known bound on its token list.
- **A separate byte buffer type.** Rejected for now. `[Byte]` covers the encoder's output with the same rules, so one construct covers both cases (design principle 8).

## Cost

Adds:

- one type production `[T]`, one effect word `alloc`, one `var` parameter form;
- six built-in forms: `arr`, `len`, `copy`, `push`, `[]` read and `[]=` write;
- three codes, E0220 to E0222, and two trap kinds.

Removes: nothing.

Spec card: adds about one short section for arrays (the type, the five built-ins, the two effects of growth, and the traps). The card cap is 2,000 tokens. The core spec cap is 12,000 tokens. The token count of the addition has not been measured with the protected tokeniser. The merge bot must measure it before this RFC is accepted.

## Test plan

Run tests:

- `arr-len-zero`: `arr(Int)` has length 0.
- `arr-push-read`: push three Ints, read each back.
- `arr-grow`: push 5 Bytes; capacity doubles from 4 to 8, values intact.
- `arr-copy-independent`: `copy` a `var` array, write the copy, the original is unchanged.
- `arr-var-param`: a `var` parameter written by the callee; the caller sees the change.
- `arr-view-read`: a `let` parameter read by the callee.
- `arr-trap-index`: read at index equal to `len`; exit status 1, `trap: index`.

Compile-error tests:

- `arr-err-bind`: `let b = a` where `a` is an array name; E0220.
- `arr-err-alias-arg`: `f(a, a)` with an array parameter; E0221.
- `arr-err-var-param`: passing a `let` name to a `var` parameter; E0222.
- `arr-err-alloc`: calling `push` from a function without `alloc`; E0400 (existing).

Coverage: one test for each production and each built-in form.

## Open questions

- Whether `alloc` is a separate effect word or part of an existing effect in RFC 0020. This draft adds it.
- Whether `[T]` should be spelled differently for token count. The tokeniser must measure it.
- Whether a trap in an example is a diagnostic (#508, #495). Unresolved here.
- The roadmap deferral (M2b) in the Motivation section. The orchestrator must decide whether this draft waits.
