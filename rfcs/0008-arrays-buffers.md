---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: reject
  tester: reject
  user-1: abstain
  user-2: approve
---
# RFC draft: Arrays and byte buffers

Class: language
Slug: arrays-buffers
Status: draft

## Summary

Glyph gets one growable array type, `[T]`, with a literal form, indexing, and five built-in functions: `len`, `cap`, `reserve`, `push`, `pop`. A byte buffer is `[Byte]`, not a separate type. Allocation is visible in signatures through an `!alloc` effect marker. Arrays have value semantics: a binding owns its buffer, and the only copies are the ones this RFC names. Memory comes from one bump allocator with no free. Every bad index, empty pop, bad capacity and exhausted heap is a defined trap.

## Motivation

Readiness checklist item 3 (`docs/SPEC.md`, section 9) requires "growable arrays and byte buffers" before the language can be used to write the compiler. The stage-0 compiler needs a token list and an output byte buffer, and the self-hosting port (M5) needs both. No benchmark finding or user issue is open this session, so this RFC rests on the checklist alone.

The purpose clause and principles 2, 3 and 7 set the shape. Allocation must appear in the signature (principle 3), so a model reading `fn f() -> [Int]` can tell whether it allocates. Aliasing must be local (principle 2), so mutating one name cannot change another. Out-of-bounds access and exhaustion must have one defined result (principle 7). A growable array is the first heap value in the language, so the memory strategy is also set here.

## Design

Normative. "Must" and "is" are binding on implementers.

### Types

1. `[T]` is a growable array whose elements have type `T`. `[T]` is a type form, not a generic: no user-defined type parameters are introduced by this RFC.
2. `T` must be one of the element types in the layout table below. Any other `T` is E0123.

| Element type | Size in bytes | Encoding |
| --- | --- | --- |
| `Int` | 8 | signed 64-bit, little endian |
| `Bool` | 1 | `0` or `1` |

`Byte` (1 byte, unsigned) is defined by the integers-booleans-bytes RFC. When that RFC is accepted, it is added to this table, and `[Byte]` is the byte buffer. This RFC does not define `Byte`.

3. An array value holds a length and a capacity. Invariant: `0 <= len <= cap`. The length is the number of elements a program can read. The capacity is the number of element slots allocated.

### Literals

4. `[e1, e2, ..., en]` with `n >= 1` has type `[T]`, where `T` is the type of `e1`. Every element must have type `T`. The literal allocates a block with `cap = n` and requires `!alloc`.
5. `[]` has the type given by its context: an annotation (`var a: [Int] = []`) or a parameter type. It allocates nothing and has `cap = 0`. Where no type is known, `[]` is E0120.
6. No trailing comma is allowed in a literal.

### Indexing

7. `a[i]` reads the element at index `i`, where `a` is any array-valued expression and `i` is `Int`. If `i < 0` or `i >= len(a)`, it traps `index out of bounds`. The result has type `T`.
8. `a[i] = e` is a statement. `a` must name a `var` binding (otherwise E0104). The same bounds check applies. `e` must have type `T`.

### Built-in functions

These are compiler intrinsics. They are not user-definable and need no import.

9. `len(a: [T]) -> Int`: the length. Pure.
10. `cap(a: [T]) -> Int`: the capacity. Pure.
11. `push(a, x) !alloc`: appends `x` to `a`. `a` must name a `var` binding (E0104). `x` must have type `T`. If `len(a) == cap(a)`, the new capacity is `max(4, 2 * cap(a))`, computed in 64 bits. A new block is allocated, the elements are copied, and the old block is abandoned. The length increases by one.
12. `pop(a) -> T`: removes the last element and returns it. `a` must name a `var` binding (E0104). If `len(a) == 0`, it traps `pop from empty array`. Pop does not shrink the capacity. Pure in the effect sense: it never allocates.
13. `reserve(a, n) !alloc`: `a` must name a `var` binding (E0104). `n` is `Int`. If `n < 0`, it traps `negative capacity`. If `n > cap(a)`, the capacity becomes exactly `n` and the elements are copied to a new block. Otherwise it does nothing. Growth by `reserve` is not doubled.

Where a built-in's first argument must be a `var` binding, the compiler checks this at the call site. The call does not need a `var` keyword.

### Effects

14. The `!alloc` marker is written after the return type, or after the parameter list when there is no return type. It is the same kind of marker as the kernel's `!io`.
15. A function must declare `!alloc` if its body contains any of the following: a literal with one or more elements, a copy (rule 19 or 20), a call to `push` or `reserve`, or a call to a function declared `!alloc`. Missing the marker is E0121. Declaring `!alloc` on a function that never allocates is allowed.
16. When a function has both `!io` and `!alloc`, `!io` comes first, separated by one space. Other orders, and any unknown marker, are E0122.

### Value semantics and copies

These rules say when an array's buffer is shared, moved or copied. Every binding owns its buffer, or borrows a parameter's buffer for the length of one call.

17. A copy creates a new block with `cap = len`, copies every element, and requires `!alloc`.
18. Assigning a name to a binding copies it: `let b = a` and `var b = a` both copy when `a` is a name.
19. Returning a local binding moves it: the buffer passes to the caller and the local ends. Returning a parameter copies it, because the caller still owns the buffer.
20. Passing a name as a call argument borrows it. No copy is made. A parameter of array type is read-only inside the callee: it cannot be assigned to, indexed for write, or passed to `push`, `pop` or `reserve`. The caller cannot run code during the call, so the borrow cannot change underneath the callee.
21. A literal or the result of a call is a fresh array. It is moved into the binding or the argument with no copy.

Because rules 18 and 19 copy whenever a name is aliased, no two live bindings ever share a block. A local binding can therefore be mutated without affecting any other name.

### Memory

22. The heap is a bump allocator over linear memory, placed after static data. Each allocation is rounded up to a multiple of 8 bytes. Nothing is freed. The heap is released when the program exits.
23. The compiler declares the module's linear memory maximum as 4096 pages (256 MiB). An allocation that would pass this limit, or any allocation for which the host refuses to grow memory, traps `out of memory`. A capacity computation that overflows 64 bits traps `out of memory`.
24. Arenas and a general free list are not part of this RFC. The benchmark that would justify a free list is: a loop that creates and discards arrays so that the live set stays under 16 MiB while total allocation exceeds 256 MiB. If that benchmark traps `out of memory` under the bump allocator after an arena design is tried, a free-list RFC may be written. An arena RFC for per-call lifetimes is the expected next step.

### Traps

The kernel's trap mechanism applies: the program writes `trap: <kind>` to standard error and exits with status 3 through WASI `proc_exit`. This RFC adds four kinds:

- `index out of bounds`
- `pop from empty array`
- `negative capacity`
- `out of memory`

### Compile-time diagnostics

| Code | Meaning |
| --- | --- |
| E0120 | `[]` with no type known from context |
| E0121 | Function allocates without declaring `!alloc` |
| E0122 | Effect markers out of order, or an unknown marker |
| E0123 | Element type has no entry in the layout table |

Assigning to a non-`var` binding, including via `push`, `pop`, `reserve` or `a[i] = e`, uses the existing code E0104 from the kernel RFC. Index on a non-array, or an element of the wrong type, uses the kernel's existing type-mismatch diagnostic. No new code is needed for either.

### Examples

```
fn squares(n: Int) -> [Int] !alloc {
  var a: [Int] = []
  var i = 0
  while i < n {
    push(a, i * i)
    i = i + 1
  }
  return a
}
example len(squares(3)) == 3 and squares(3)[2] == 4
```

`return a` moves the local `a` (rule 19), so no copy is made. The example uses `len` and indexing because array `==` is not defined here (see Open questions).

## Alternatives

- **Fixed-size arrays only (`[T; N]`).** Rejected. Byte buffers and the token list need to grow. A fixed-size form can be added later as its own RFC if the card has room.
- **A separate `Bytes` type next to `[T]`.** Rejected. It gives two ways to write a byte buffer and breaks principle 1. `[Byte]` covers the case.
- **Reference semantics: arrays are shared handles.** Rejected. Mutating one name would change another with no sign at the use site, which breaks principle 2.
- **Copy on every call.** Rejected. It makes every call with an array argument allocate and copy. Borrowing parameters (rule 20) keeps calls free.
- **A generic `Array<T>` form.** Rejected for this RFC. It needs a decision about user generics, which the constitution leaves open. `[T]` is shorter in tokens and needs no such decision.
- **Reference counting, or a tracing collector.** Rejected by the designer rules. Value semantics with bump allocation avoids both.
- **Growth by 1.5 times instead of 2 times.** Rejected for simplicity. Doubling is one line to implement and to test.

## Cost

Spec core adds: the `[T]` type form, the array literal, indexing (read and write), the `!alloc` marker, five built-in names, the layout table, the copy and borrow rules, the memory rules, four trap kinds, and four diagnostics. Estimate: about 900 tokens. The merge bot's tokeniser measures the real figure.

Spec card adds about 150 tokens: the type form, the literal, the two index forms, the `!alloc` marker, a five-row built-in table, and the four trap kinds. It omits the copy rules, the layout table and the memory section.

Removes: nothing yet. This RFC does not pay for itself, and the spec core cap means growth needs an offset before merge. The grammar offset is that `!alloc` uses the same effect-marker production as `!io`, so no new grammar production is added. The designer's next revision will name a further cut. The first candidate is `pop`, if the card runs over its cap. The second is `reserve`, if doubling in `push` is enough for milestone 1.

## Test plan

Run tests, in `conformance/arrays/`:

- `literal-len.test`: `[1, 2, 3]` has length 3 and capacity 3.
- `push-grow.test`: pushes ten values and prints the capacity after each growth step, which must be 4, 8, 16.
- `index-read-write.test`: reads and writes an element through a `var` binding.
- `copy-on-assign.test`: `let b = a` and then a write to `a` leaves `b` unchanged.
- `borrow-param.test`: a callee reads a borrowed array argument and the caller's array is unchanged.
- `pop.test`: pops the last element and shows the length decrease.
- `reserve.test`: `reserve` grows capacity to exactly `n`, and a smaller `n` changes nothing.
- `trap-index.test`: `index out of bounds`, exit status 3.
- `trap-pop-empty.test`: `pop from empty array`, exit status 3.
- `trap-negative-reserve.test`: `negative capacity`, exit status 3.
- `trap-oom.test`: pushes until the 256 MiB limit and expects `out of memory`, exit status 3.

Compile-error tests:

- `err-empty-literal.test`: untyped `[]`, expects E0120.
- `err-missing-alloc.test`: a `push` in a function without `!alloc`, expects E0121.
- `err-effect-order.test`: `!alloc !io` in that order, expects E0122.
- `err-push-let.test`: `push` on a `let` binding, expects E0104.
- `err-element-type.test`: `[Text]` before the text RFC adds a layout, expects E0123.

## Open questions

1. Equality on arrays. Not defined here. A later RFC must decide whether `==` on arrays exists, and it would need the element layouts above.
2. Slicing. The text RFC decides slicing for `Text`. Arrays should use the same form if it is accepted.
3. Element types beyond scalars. Records and tagged unions must add layouts to the table. Nested arrays are not allowed until then.
4. Arenas. A per-call arena RFC would reduce the pressure on the 256 MiB limit. It is not part of this RFC.
5. User generic functions over `[T]`. Depends on the type system decision, which the constitution leaves open.
6. Is 256 MiB enough for the milestone 1 benchmarks? The designer will revisit this when a benchmark exists.
