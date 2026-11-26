---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: reject
  tester: reject
  user-1: reject
  user-2: approve
---
Class: language
Slug: arrays-buffers-int-only
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3) and RFC 0020 (kernel-v8), both accepted in M2a.
Amends: nothing. Adds productions and built-ins only.

# RFC draft: Growable arrays of Int, with no sharing

## Summary

Glyph gets one growable array type, `[Int]`. It is created with `arr(Int)`, read and written by index, grown with `push`, duplicated with `copy`, and measured with `len`. Storage is a block on a bump heap that is never freed. Capacity doubles on growth. A function that can create a block declares `!alloc` in its signature. An array name is never bound to a second name, and a parameter is a read-only view for the length of the call, so two live names never reach one block through a binding. Out-of-range index and heap exhaustion are defined traps. The RFC adds four diagnostic codes, E0700 to E0703, and two trap kinds.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9, item 3: "growable arrays and byte buffers"). Stage 0 needs a growable token list, and its WebAssembly encoder needs an output buffer. The self-hosted port (M5) needs both.

Evidence is thin. The benchmark findings show no array-related diagnostic: the only diagnostic row is `UNKNOWN: 540`, which says nothing about arrays. No open user issue asks for arrays. Issues #454 (write to standard output) and #459 (read input) show that programs cannot yet do I/O, and a byte buffer would be part of any answer. This RFC does not add I/O and does not answer those issues. It supplies the Int array that a later bytes RFC would build on.

Seventeen array drafts (0008 to 0047, plus 0087) are rejected. Their vote records give no reasons, so this draft does not claim to know which part failed. It is narrower than the closest rejected drafts in these visible ways:

1. Element type is `Int` only. `Bool` and `Byte` wait for their readiness items.
2. There is no `[]` literal and no position-typed empty value. `arr(Int)` names its type where it is written.
3. There are no `get` or `set` functions. Indexing `a[i]` covers both, at fewer tokens.
4. There is no `cap` or `reserve` built-in. Capacity is internal.
5. Every added form is named in Cost, and the RFC names what it leaves out.

The purpose clause and principles 2, 3, 4 and 7 set the shape. Allocation must appear in the signature (principle 3). Aliasing must be local (principle 2). Each error has a stable code (principle 4). Out-of-range access and exhaustion each have one result (principle 7).

## Design

Normative. "Must" and "is" bind implementers.

### Type and value

1. `[Int]` is the only array type form. Any other element type written in `[ ]` is E0700 at the type.
2. An array value is a handle to a block, with `len` and `cap`, where `0 <= len <= cap`. Each element is 8 bytes, signed, little endian. The handle is 12 bytes in linear memory: block address (4 bytes), `len` (4 bytes), `cap` (4 bytes). Handles are not first-class in source: no form reads the address.
3. `cap` is never visible in source.

### Built-ins

4. `arr(Int)` has type `[Int]` with `len` 0 and `cap` 0. It allocates no block and needs no `!alloc`. The argument must be the type name `Int`; the word is accepted only here. Any other argument is the ordinary type error.
5. `len(a)` has type `Int`. It has no effect and needs no `!alloc`.
6. `a[i]` reads element `i`. `i` is `Int`. The result has type `Int`. If `i < 0` or `i >= len(a)`, the program traps `index out of bounds`. It has no effect.
7. `a[i] = v` is a statement. `v` is `Int`. `a` must be a local `var` binding; otherwise E0702. The same bounds check as rule 6 applies.
8. `push(a, v)` is a statement. `a` must be a local `var` binding; otherwise E0702. `v` is `Int`. If `len == cap`, the program allocates a new block of `max(4, 2 * cap)` elements, copies the `len` elements, and abandons the old block. It then stores `v` at index `len` and increases `len` by one. It requires `!alloc` (rule 11).
9. `copy(a)` has type `[Int]`. It allocates a new block with `len` and `cap` equal to `len(a)`, copies the elements, and returns the new handle. It requires `!alloc`.

### Binding, assignment and parameters

10. A name whose type is `[Int]` is bound only by:
    a. `arr(Int)`,
    b. `copy(a)`,
    c. a call to a function whose return type is `[Int]`.
    Binding a `[Int]` name from another `[Int]` name, by `let`, `var` or assignment, is E0701. The text to write is `copy(a)`.
11. A parameter of type `[Int]` is a read-only view for the duration of the call. Rules 7 and 8 reject mutation of a parameter with E0702. A function that returns a parameter of type `[Int]` is E0701. The caller's array cannot change while the callee runs, because the language has no concurrency and no closures.
12. A function returns `[Int]` only from a local `var`, from `arr(Int)`, from `copy(a)`, or from a call to another such function. Returning a local `var` moves its block; the local is not usable afterwards, which is E0701 if it is read.

### Effects

13. A function's signature names its allocation effect with `!alloc` after the return type, for example `fn f(a: [Int]) -> Int !alloc`. A function that contains `push` or `copy`, directly or through a call to a function that declares `!alloc`, must declare `!alloc`. Otherwise E0703 at the call.
14. `arr`, `len`, indexing and their statements need no `!alloc`.

### Heap

15. The heap is a bump allocator over linear memory, placed above the static data. It never frees. A block request is satisfied by advancing the pointer. If the request does not fit, linear memory grows with `memory.grow`. If the growth would exceed the module's maximum memory size, the program traps `heap exhausted`.
16. Allocation order and sizes are deterministic. The same source and compiler give the same addresses.

### Traps

17. Two trap kinds are added to TR1: `index out of bounds` (rule 6, 7) and `heap exhausted` (rule 15). Each writes `trap: <kind>` to standard error and exits with status 1, as TR1 already requires.

### Diagnostic codes

18. E0700: array element type other than `Int` (rule 1).
19. E0701: a `[Int]` name is bound from another `[Int]` name (rule 10), or a parameter of type `[Int]` is returned or a local is read after it was returned (rules 11, 12).
20. E0702: `a[i] = v` or `push` on a name that is not a local `var`, including a parameter (rules 7, 8, 11).
21. E0703: `push` or `copy`, directly or through a call, in a function without `!alloc` (rule 13).

None of these codes appears in `spec/errors.json`, and none appears in any RFC in `rfcs/`.

## Alternatives

- **Position-typed `[]` empty literal.** Rejected drafts 0047 and 0087 used this. The type depends on the position, which needs extra codes. `arr(Int)` names its type where it is written.
- **`get` and `set` functions instead of indexing.** Two more built-ins and more tokens per access. Indexing is one construct for the read and the write.
- **Implicit copy on `let` or `var`.** Hides an allocation at a binding, against principle 3. `copy(a)` makes the cost visible in the text.
- **Copy on every call.** Deterministic, but makes read-only helpers allocate. The view rule avoids that without aliasing.
- **Reference counting or a tracing collector.** Not proposed. The designer rules forbid either without an RFC that pays for it. The bump allocator with no free is enough for stage 0 at this scale.
- **A general free list.** Not proposed. No benchmark justifies it yet.
- **`Byte` or `Bool` elements now.** Deferred to their readiness items, so that this RFC depends only on accepted items.

## Cost

What it adds to the spec:

- One type form, `[T]` with `T = Int`.
- Four built-in names: `arr`, `len`, `push`, `copy`.
- Two grammar productions: indexing read `a[i]` and indexing write `a[i] = v`.
- One effect word, `!alloc`, in function signatures.
- Two trap kinds and four diagnostic codes.

What it removes: nothing. No existing construct is replaced. The RFC does not claim a removal to pay for the additions, because the readiness checklist requires this item and no accepted construct covers it.

Card change: the card gains about 15 lines for the type, the four built-ins, indexing, `!alloc` and the two trap kinds. The size is estimated by hand, not measured with the tokeniser. The merge bot measures it. If the core spec would exceed 12,000 tokens, the author expects a later RFC to trim another section, and this RFC does not pick which.

## Test plan

Each conformance test has a `--- meta` block with `id`, `rfc` (0000 placeholder until numbered) and `kind`. File names follow the runner's convention.

- `run` `arr-grow`: push 10 values into `arr(Int)`, print `len` and the sum by index. Expected output: the length and sum, exit 0.
- `run` `arr-copy-independent`: `var b = copy(a)`, set `b[0]`, print `a[0]`. Expected: the original value.
- `run` `arr-index-trap`: read index 3 of an array of length 3. Expected: no stdout, stderr `trap: index out of bounds`, exit 1.
- `compile-error` `arr-elem-type`: a `[Bool]` annotation. Expected: E0700.
- `compile-error` `arr-bind-name`: `var b = a` where `a` is `[Int]`. Expected: E0701.
- `compile-error` `arr-param-set`: `a[0] = 1` where `a` is a parameter. Expected: E0702.
- `compile-error` `arr-no-alloc`: a function calling `push` with no `!alloc`. Expected: E0703 at the call.

Heap exhaustion (rule 15) has no test here. A test needs a large allocation loop and a stated time limit. It is listed under Open questions.

## Open questions

- Should `Bool` and `Byte` elements reuse this design when their readiness items land? The draft assumes yes, with no change to rules 4 to 17.
- Heap exhaustion needs a test that finishes in bounded time. Should the RFC fix the module memory maximum, or leave it to the implementer and test only the trap kind?
- Is `copy` the right name? The cheaper token form is `copy`; the alternative `clone` is longer and gives no extra meaning.
- Rule 12 moves a returned local, which the reader must notice. Is the rule worth its extra text, or should a return of a local always go through `copy`?
