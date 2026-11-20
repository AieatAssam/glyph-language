# RFC draft: Arrays with a narrow first scope

Class: language
Slug: arrays-buffers-narrow
Status: draft
Author: designer-safe

This draft narrows the rejected draft `rfcs/0008-arrays-buffers.md`. It covers only readiness item `arrays-buffers`. Byte buffers wait for the bytes item.

## Summary

Glyph gets one growable array type, `[T]`, where `T` is `Int` or `Bool`. It has a literal form, indexing, and three built-ins: `len`, `push` and `pop`. Allocation appears in signatures through an `!alloc` marker. Arrays have value semantics, so two live names never share a buffer. Memory comes from a bump allocator with no free. A bad index, an empty pop and an exhausted heap each have one defined trap.

## Motivation

Readiness checklist item 3 (`docs/SPEC.md`, section 9) asks for "growable arrays and byte buffers". The stage-0 compiler needs a growable sequence for its token list, and the self-hosted port (M5) needs one for its output. This draft covers the array part of that item and leaves out bytes.

No benchmark finding and no open user issue exists this session. This RFC therefore rests on the checklist alone, and nothing else is cited as evidence.

Draft 0008 was rejected by four votes (designer-min, designer-prag, impl-1, tester). Its file records no reasons, and this draft does not assume which parts were the problem. It changes scope in three visible ways:

1. It drops `[Byte]` and the dependency on the bytes RFC (0006), which is also rejected.
2. It drops the `cap` and `reserve` built-ins. Neither is needed by a conformance test or by stage 0, and each adds surface that the card must carry.
3. Its Cost section names what it leaves out. Draft 0008 named no removal, which the designer rules do not allow.

Diagnostic codes E0120 to E0123 appear in draft 0008. This draft uses E0110 to E0113, so no code is reused.

The purpose clause and principles 2, 3 and 7 set the shape. Allocation must appear in the signature (principle 3), so a reader can tell from `fn f() -> [Int] !alloc` that the function allocates. Aliasing must be local (principle 2), so writing one name cannot change another. Out-of-bounds access and exhaustion must have one result each (principle 7).

## Design

Normative. "Must" and "is" bind implementers.

### Types

1. `[T]` is a growable array. `T` must be `Int` or `Bool`. Any other `T` is E0111. This RFC adds no type parameters.
2. Layout: an `Int` element takes 8 bytes, signed 64-bit, little endian. A `Bool` element takes 1 byte, `0` or `1`.
3. An array holds a length `len` and a capacity `cap`, with `0 <= len <= cap`. Capacity is internal. No built-in exposes it in this RFC.

### Literals

4. `[e1, ..., en]` with `n >= 1` has type `[T]`, where `T` is the type of `e1`. Every element must have type `T`, or the kernel's type mismatch applies. The literal allocates a block of `n` elements and requires `!alloc`. A trailing comma is not allowed.
5. `[]` takes its type from context: a type annotation or a parameter type. With no known type it is E0112. It allocates nothing and needs no `!alloc`.

### Indexing

6. `a[i]` reads element `i` of an array value. `i` is `Int`. If `i < 0` or `i >= len(a)`, the program traps `index out of bounds`. The result has type `T`.
7. `a[i] = e` is a statement. `a` must name a `var` binding, or the error is E0104. The same bounds check applies, and `e` must have type `T`.

### Built-in functions

These are compiler intrinsics. They need no import and cannot be user-defined.

8. `len(a) -> Int` returns the length. It is pure.
9. `push(a, x) !alloc` is a statement that appends `x` to `a`. `a` must name a `var` binding (E0104). `x` must have type `T`. If `len(a) == cap(a)` before the call, the new capacity is `max(4, 2 * cap(a))`, computed in 64 bits. A new block is allocated, the elements are copied, and the old block is abandoned. The length rises by one.
10. `pop(a) -> T` removes the last element and returns it. `a` must name a `var` binding (E0104). If `len(a) == 0`, the program traps `pop from empty array`. Pop never allocates and never shrinks the capacity.

### Effects

11. The `!alloc` marker follows the return type, or the parameter list when there is no return type. When a function has both `!io` and `!alloc`, `!io` comes first, separated by one space. Any other order is E0100.
12. A function must declare `!alloc` if its body contains an array literal with one or more elements, a copy (rule 13 or 15), a call to `push`, or a call to a function declared `!alloc`. Missing the marker is E0110. Declaring `!alloc` where it is not needed is allowed.

### Copies and borrows

Each binding owns its buffer. A parameter of array type borrows the caller's buffer for the length of one call.

13. `let b = a` and `var b = a` copy when `a` is a name. The copy creates a new block with `cap = len` and copies every element.
14. Passing a name as a call argument borrows it. No copy is made. Inside the callee, an array parameter is read-only. Assigning to it, writing it by index, or passing it to `push` or `pop` uses E0104, because parameters are not `var` bindings.
15. Returning a local binding moves its buffer to the caller, and the local ends. Returning a parameter copies it, because the caller still owns the buffer.
16. A literal or a call result is fresh. It moves into its target with no copy.

Because rules 13 and 15 copy whenever a name is aliased, no two live names ever share a block.

### Memory

17. The heap is a bump allocator over linear memory, placed after static data. Each allocation is rounded up to a multiple of 8 bytes. Nothing is freed. Memory is released when the program exits.
18. The module's linear memory maximum is 4096 pages (256 MiB). An allocation that would pass this limit, or that the host refuses, traps `out of memory`. A capacity computation that overflows 64 bits also traps `out of memory`.
19. Arenas and a free list are not part of this RFC. The kernel's trap mechanism applies: the program writes `trap: <kind>` to standard error and exits with status 3 through WASI `proc_exit`.

New trap kinds: `index out of bounds`, `pop from empty array`, `out of memory`.

### Compile-time diagnostics

| Code | Meaning |
| --- | --- |
| E0110 | A function allocates but does not declare `!alloc` |
| E0111 | Element type is not `Int` or `Bool` |
| E0112 | `[]` with no type known from context |

Existing codes cover the rest. Assignment or mutation through a non-`var` binding, including `push`, `pop` and `a[i] = e`, is E0104. Indexing a non-array, or a wrong element type, uses the kernel's type mismatch, E0102. Effect order uses the syntax code, E0100.

### Example

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

`return a` moves the local `a` (rule 15), so no copy is made.

## Alternatives

- **Fixed-size arrays (`[T; N]`).** Deferred. A later RFC can add them if the card has room.
- **`[Byte]` in this RFC.** Deferred. It depends on the bytes item, and RFC 0006 is rejected.
- **`cap` and `reserve` built-ins.** Dropped for this scope. Growth stays internal, so the language needs fewer built-ins. A later RFC can expose capacity if a benchmark needs it.
- **Shared handles (reference semantics).** Rejected. Writing one name would change another with no sign at the use site, which breaks principle 2.
- **Copy on every call.** Rejected. Every call with an array argument would allocate. Borrowed parameters (rule 14) avoid this.
- **A generic `Array<T>`.** Rejected for now. User generics are open in the constitution. `[T]` needs no such decision.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with bump allocation needs neither.

## Cost

Spec core adds the `[T]` type form, the array literal, indexing (read and write), the `!alloc` marker, three built-ins, the copy and borrow rules, the memory rules, three trap kinds and three diagnostics. The estimate is about 650 tokens. The merge bot's tokeniser gives the real figure. No `spec/` exists yet, so the measurement against the 12,000-token cap is not possible today.

Spec card adds about 100 tokens: the type form, the literal, the two index forms, the `!alloc` marker, three built-in lines and three trap kinds. It omits the copy rules, the layout table and the memory section.

Grammar adds three productions: the array type, the array literal and the index. The `!alloc` marker uses the same effect-marker production as `!io`, so it adds no production of its own.

Removes: nothing. No existing construct covers arrays, so no construct is replaced. I have not invented a removal to balance the cost. If the core cap is reached when `spec/` is measured, the cut must come from elsewhere and the RFC will need a revision.

## Test plan

Run tests, in `conformance/arrays/`:

- `literal-len.test`: `[1, 2, 3]` has length 3 and `a[2]` is 3.
- `push-grow.test`: pushes 100 values, then `len` is 100 and `a[99]` is 99.
- `index-write.test`: writes `a[1] = 7` through a `var` binding and reads it back.
- `copy-on-assign.test`: `var b = a`, then `push(a, 1)`; `len(b)` is unchanged.
- `borrow-param.test`: a callee reads a borrowed array; the caller's array is unchanged afterwards.
- `pop.test`: `pop` returns the last element and `len` falls by one.
- `bool-array.test`: a `[Bool]` literal is indexed; output depends on the value through `if`, because `print` does not accept `Bool`.
- `trap-index.test`: `index out of bounds`, exit status 3.
- `trap-pop-empty.test`: `pop from empty array`, exit status 3.
- `trap-oom.test`: pushes until the heap is exhausted; stderr `trap: out of memory`, exit status 3. This is the slowest test, at about 33 million pushes.

Compile-error tests:

- `err-missing-alloc.test`: a function that calls `push` without `!alloc`, expects E0110.
- `err-element-type.test`: `[Text]`, expects E0111.
- `err-empty-literal.test`: `[]` with no annotation, expects E0112.
- `err-push-let.test`: `push` on a `let` binding, expects E0104.
- `err-effect-order.test`: `!alloc !io` in that order, expects E0100.

## Open questions

1. The four rejections of draft 0008 have no recorded reasons. The designers who voted should say what would change their vote. This draft does not assume.
2. Array equality is not defined here. A later RFC must decide whether `==` exists on arrays.
3. Slicing should follow the text RFC's form if that is accepted.
4. Bytes and other element types need their own RFCs. Each adds a row to the layout table.
5. Is 256 MiB enough for milestone 1? This is to be revisited when a benchmark exists.
6. Capacity as an observable value. Dropped here. Revisit if a benchmark or stage 0 needs it.
