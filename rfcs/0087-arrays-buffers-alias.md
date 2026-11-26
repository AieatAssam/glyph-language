---
status: draft
class: language
slug: arrays-buffers-alias
author: designer-safe
builds-on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted)
amends: RFC 0020 rules T6 and F1 (result types and effect clause), TR1 (trap kinds); RFC 0020 ptype and rtype productions
adds-codes: E0203, E0304, E0403, E0404, E0405
---
# RFC draft: Growable arrays with no mutable aliasing

## Summary

Glyph gets one growable array type, `Arr(T)`, where `T` is `Int` or `Byte`. Arrays live on one bump heap that is never freed. An array is read with `get` and `len`, written with `set`, and grown with `push`. `copy` makes an independent array. The effect word `alloc` marks a function that may use the heap. The rule that keeps reasoning local: a mutable array is never reachable from a second name. Binding a mutable array to another name, and returning an array that came from a parameter, are compile errors. Passing a mutable array to a function gives the callee a read-only view that it cannot store. Out-of-range access and heap exhaustion are defined traps. No punctuation or keyword is added except `alloc`, which is one word.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Stage 0 needs a growable token list and an output buffer for its WebAssembly encoder, and the self-hosted compiler needs the same.

This is a proposal grounded in open user issues, not in a benchmark. No benchmark finding this session measures arrays.

- **#459 and #454.** Users cannot tell from the card how a program reads input or writes output. Both need a byte buffer. This RFC gives the buffer type. The card's missing syntax (#438) is a separate fix, covered in Cost.
- **#440.** The card points to `spec/errors.json` for codes. This RFC lists its five new codes in the table at the end, so the catalogue change is visible in one place.
- **Earlier drafts.** The tree holds about seventeen array drafts (0008 to 0047). All are rejected, and their vote records give no reasons. RFC 0045 and RFC 0047 are the closest. RFC 0047 removes the heap by fixing capacity at the type. This draft keeps a heap, because the stage 0 buffers have no known bound. The difference from 0034 is that 0034 allowed shared handles, and this draft does not.

Principle 2 (local reasoning) is the main constraint. Principle 3 requires that allocation appear in the signature. Principle 7 requires a defined result for overflow, out-of-range access and exhaustion.

Roadmap note. `governance/RULES.md` (M2b) says no new RFC is proposed until a compiler is on `main`. `compiler/stage0` and `bin/glyphc` are in the scratch copy, so the gate may now be met. I did not check `main`. The orchestrator should confirm before a vote.

## Design

Rules marked N are new. Every other rule is RFC 0020's or RFC 0024's and is unchanged.

### Types and values

N1. The type `Arr(T)` is written with the keyword `Arr`, `(`, a type name `Int` or `Byte`, and `)`. It is allowed as the type of a `let` or `var` binding, a parameter, or a result. `Arr` with any other argument, or without an argument, is E0304 at the `Arr` token. Amends T6.

N2. An array value has a length `L` from 0 up to its capacity `C`. Capacity is never visible to a program. Each element is 8 bytes for `Int` (two's complement, as in T1) and 1 byte for `Byte`.

N3. An array value is a handle to storage on the heap. Two values with the same handle are the same array. `==` and `!=` on arrays are E0200.

N4. An array expression that is used as a value at a position with no known array type is E0304. Positions that give an array type are: the initialiser of a `let` or `var` with a `: T` annotation; the right side of an assignment to a `var` of that type; an argument whose parameter has that type; a `return` in a function whose result has that type.

### Built-in functions

N5. The built-ins are:

- `arr()`: returns an array of length 0 with capacity 0. The type comes from the position (N4). It allocates nothing.
- `len(a)`: `Int`, the length of `a`.
- `get(a, i)`: the element at index `i`, of the element type. `i` is `Int`. If `i` is less than 0 or at least `len(a)`, the run traps `index-out-of-range` (TR1).
- `set(a, i, v)`: writes `v` at index `i`, with the same range rule as `get`. `a` must be a `var` (N8). It allocates nothing. `v` has the element type.
- `push(a, v)`: appends `v`. `a` must be a `var` (N8). If `len(a)` equals the capacity, `push` allocates a new block of twice the capacity, or 4 slots if the capacity is 0, copies the elements into it, and then appends. The old block is not freed.
- `copy(a)`: returns a new array with the same elements and a new handle. It allocates a block of the same length, or 0 slots if `a` is empty.

N6. `push` and `copy` allocate, so a function that calls them, directly or through another function, must declare `alloc` (N9). `get`, `set`, `len` and `arr` do not allocate.

N7. Argument types must match exactly (E0405). `Byte` is not converted to `Int` and back. Index arguments are `Int`.

### Mutability and aliasing

N8. `set` and `push` are allowed only on an array name bound by `var` in a `let` or `var` statement. Calling them on a `let` name, or on a parameter, is E0403. Parameters are always read-only in their callee.

N9. A name's array is its origin. The origin of a value is one of: a `var` or `let` binding, a parameter, or a call result. An expression that copies the handle of a `var` or of a parameter to a new name is E0203. This covers `let b = a` and `var b = a` when `a` is a `var` or a parameter. The fix is `copy(a)`. A `let` name whose origin is `arr()` or `copy()` may be bound again with `let`.

N10. A `return` of a parameter of array type, or of a name whose origin is a parameter, is E0203. A `return` of a `var` name is allowed: the frame ends, and no other name holds the handle.

N11. A call that passes a `var` array gives the callee a read-only view. The callee cannot change it through the parameter (N8). It cannot store the handle anywhere, because N9 and N10 forbid every name binding and every return of a parameter. So during a call no mutation of the array can be seen from a second name.

N12. There are no global variables, closures or fields, so N9 to N11 cover every way a handle can be reached.

Example, valid, prints `1`, then `7`, then `9`:

```
fn main() io alloc {
    var a: Arr(Int) = arr()
    push(a, 7)
    let b = copy(a)
    set(a, 0, 9)
    print(len(a))
    print(get(b, 0))
    print(get(a, 0))
}
```

Example, invalid, E0203:

```
fn main() io {
    var a: Arr(Int) = arr()
    let b = a
}
```

### Heap

N13. The heap is a bump allocator with no free. A run may allocate at most 268435456 bytes in total, counting every block, including blocks abandoned by growth. The count is kept by the runtime. A `push` or `copy` that would take the total over the limit traps `heap-exhausted` before it writes anything. The count does not depend on the platform's memory size, so the trap point is the same on every run.

N14. Growth is by doubling, as in the designer guidance. Blocks are never reused, so a loop that repeatedly copies can exhaust the heap. That is the defined outcome, not undefined behaviour.

### Effects

N15. `alloc` is a new effect word. It follows the optional `: R` result and any `io`, so a header reads `fn name(params) : R io alloc`, with `: R` omitted when there is no result. Each effect word appears at most once, in that order. A function that calls a function with `alloc`, or calls `push` or `copy`, without declaring `alloc` is E0404 at the call. Amends F1 and the effect clause.

N16. `check` runs examples (EX3). Examples may call functions with `alloc` or `io`. An example that traps fails as EX3 says.

### Traps

N17. TR1 gains two kinds:

- `index-out-of-range`: `get` or `set` with an index outside `0` to `len - 1` (N5);
- `heap-exhausted`: the total heap count would exceed the limit (N13).

Both exit with status 1 and write `trap: <kind>` to standard error, as TR1 requires.

## Alternatives

- **Value semantics by copy on bind (0039, 0040, 0041).** Every `let` or return allocates. That makes allocation invisible in most expressions, which fails principle 3. N9 gets the same safety for free, but it makes copies explicit.
- **Fixed capacity in the type (0047).** No heap, no effect. But a stage 0 token list has no known bound, and a fixed bound would need a new rule per use. Rejected here for the bound, not for its safety.
- **Frame arenas (0045).** Needs a new effect and a frame-end rule, and it forbids returning arrays. The return rule in N10 is what makes this design usable.
- **Shared handles with no rule (0023, 0025, 0038).** Breaks principle 2, which is why N9 exists.
- **A free list.** Not proposed. The benchmark that would justify one is a run that exhausts the 256 MiB limit on a realistic compile of the stage 0 source. Until that benchmark exists, N13 and N14 are enough.

## Cost

Adds one type form (`Arr(T)`), six built-in function names (`arr`, `len`, `get`, `set`, `push`, `copy`), one effect word (`alloc`), two trap kinds, and five error codes. The grammar change is one production for `Arr(T)` in ptype and rtype, and one for the effect clause.

Removes nothing. Estimated spec-core growth is about 900 tokens. The merge bot measures the real figure with the protected tokeniser; this estimate is not a measurement.

Spec card: add one line for `Arr(T)` and the six built-ins, one line for `alloc` in the signature order, and one line for the two traps (N17). Estimated about 120 tokens. The card is about 700 tokens now, which leaves room under 2,000.

Card gap. This RFC does not fix the card's missing source syntax (#438). That is a separate change to the card.

## Test plan

Each conformance test is a `.test` file with a `--- meta` block that has `id`, `rfc` (`0000` placeholder until the number is assigned) and `kind`.

Run tests:

- `arr-push-get`: the valid example above; output `1`, `7`, `9`.
- `arr-copy-independent`: `copy` then `set` on the original; the copy keeps the old element.
- `arr-grow`: 100 pushes, then `len` prints `100` and `get` at index 99 prints the last value.
- `arr-byte-buffer`: `Arr(Byte)` with 3 pushes, `get` returns the byte value.
- `arr-index-trap`: `get` at index 0 of an empty array; stderr `trap: index-out-of-range`, status 1.
- `arr-heap-trap`: a `while` loop that copies a 65536-element `Byte` array until the heap limit is reached; stderr `trap: heap-exhausted`, status 1.
- `arr-example-fail`: an `example` line that traps on an array index; `check` exits with E0202.

Compile-error tests:

- `arr-alias-var` (E0203): `let b = a` where `a` is `var`.
- `arr-set-let` (E0403): `set` on a `let` name.
- `arr-bare-type` (E0304): `Arr` with no argument.
- `arr-no-alloc` (E0404): a function calling `push` with no `alloc` effect.
- `arr-arg-type` (E0405): `push` on `Arr(Int)` with a `Byte` value.
- `arr-return-param` (E0203): `return` of an array parameter.

Coverage: each new grammar production (the `Arr(T)` type, the `alloc` effect word) has at least one test above.

## Catalogue

New codes, none used in `spec/errors.json` or in RFCs 0014, 0020 or 0024 (checked against those files):

| Code | Meaning |
| --- | --- |
| E0203 | a mutable array's handle is bound to another name, or a parameter's array is returned |
| E0304 | an array type or array value has no known or complete array type |
| E0403 | `set` or `push` on a name that is not a `var` |
| E0404 | a function with array allocation or a call to an allocating function lacks `alloc` |
| E0405 | argument type does not match the built-in's parameter |

Rejected drafts 0045 and 0047 used E0210 and E0501 and are not in the catalogue. This RFC does not reuse those codes.

## Open questions

1. Whether `arr()` should take a type argument, so that it does not depend on the position (N4). This RFC chooses the position rule to keep types out of expressions.
2. Whether the heap limit should be a language constant (as here) or a runtime option. A constant keeps the output deterministic.
3. Whether a free list is needed. See Alternatives.
4. Whether `Arr` of `Arr` should be allowed later. Not in this RFC.
