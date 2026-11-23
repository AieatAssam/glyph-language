# RFC draft: Bounded arrays of Int and Byte, value semantics, no heap

Class: language
Slug: arrays-buffers-bounded
Status: draft
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted).
Amends: RFC 0020 rules T6, T7, B5, F6, TR1 and TR2, and its ptype and rtype productions. Adds rules A1 to A11 and codes E0210 and E0501.
Supersedes: nothing. This is not a resubmission of RFC 0045 in substance: 0045 needed the `alloc` effect and frame arenas, and this draft needs neither.

## Summary

Adds one kind of array value: a sequence of `Int` or of `Byte` whose maximum length, its capacity, is part of its type and is a literal from 0 to 1024. An array has a current length from 0 up to its capacity. Arrays are plain values. Binding, assignment, passing an argument and returning all copy the value, so no two names ever share storage. Storage lives inside the call frame; the design allocates no heap and needs no garbage collector, no free list and no effect word. Six built-ins give access: `empty`, `len`, `cap`, `get`, `set`, `push`. Every failure is a defined trap or a compile-time diagnostic.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Issue #361 reports that no RFC has been proposed for it and that twelve drafts were rejected with no reasons recorded. The drafts I could identify from the tree fall into five groups, as RFC 0045 also records:

- Shared handles (0023, 0025, 0038). A write through one name changes another with nothing at the use site. This breaks principle 2 (local reasoning).
- Copy on store (0039, 0040, 0041), as RFC 0045 summarises them. Each `let` or return may allocate.
- Move on store (0043). It needs a move analysis and a use-after-move error.
- Heap with no frame structure (0036). Every array lives until the program ends, which is unbounded in a loop.
- Frame arenas (0045). It adds effect `alloc`, amends F1 and F2 of the accepted kernel, and uses codes that `spec/errors.json` does not list.

This draft takes a different route from all five. It keeps copy semantics, but the copy has a size fixed by the type (at most 8 KiB for `Int`), allocates nothing, and is visible in the type. Nothing is shared, so there is no aliasing. Nothing is allocated on a heap, so there is no lifetime rule and no effect. Growth beyond the capacity is not offered; a program that needs more than 1024 elements must wait for a later RFC, which must name the benchmark that justifies a heap (see Open questions).

The memory allocator guidance in the designer rules asks for explicit capacity on growable buffers. Here the capacity is explicit and fixed, so the design needs no doubling strategy for this milestone.

Roadmap check. The roadmap's M2b section says no new RFC is proposed until a compiler is on `main`. In the scratch copy, `tools.check.run` reports rule 11 (one program compiles), and issues #349, #350, #354 and #359 report `no front end yet` for other inputs. The assignment asks for this proposal, so I wrote it. The orchestrator should confirm the gate before any vote.

Issues this draft responds to: #361 (no arrays RFC, no reasons recorded). The spec card has no syntax (#341 to #348, #351, #353, #360); this RFC adds card lines for arrays but does not fix the card's missing basic syntax.

## Design

Rules prefixed A are new. Every other rule is RFC 0020's or RFC 0024's, unchanged, except where a rule says "amends".

### A1. Array types

1. An array type is written `Int(N)` or `Byte(N)`, where `N` is an `INT` token. The element type is `Int` (8 bytes per element) or `Byte` (1 byte per element). `N` is the capacity.
2. `N` must satisfy 0 at most N at most 1024. A larger `N` is E0501 at the literal. A leading zero is E0006 (RFC 0014). A non-literal `N`, another element type, or a missing `(` `)` is E0100 at the token that the grammar rejects.
3. An array type may be the type of a `let` or `var` binding, a parameter, or a result. Amends T6 and the ptype and rtype productions (see Grammar).
4. An array type used as a value, as in `print(Int(3))` or `let x = Int(3)`, is E0301, as with `Int` (T7).

### A2. Array values

1. An array value has a length `L` with 0 at most L at most N, and N element slots. Slots at index L or above are not visible to any program.
2. The storage size of a value of type `Int(N)` is 8 + 8N bytes. Of `Byte(N)` it is 8 + N bytes. The 8 bytes hold `L`.
3. Equality: `==` and `!=` on arrays are E0200 (E3 takes only `Int` or `Bool`). Ordering is E0200 (E4).

### A3. Copy semantics

1. Initialising a `let` or `var` from an array expression copies the value. Assigning an array to a `var` of the same type copies the value. Passing an array as an argument copies it. Returning an array copies it.
2. The source and the copy never share storage. A later change to one is not visible through the other.
3. Assignment needs an exact type match (B2, E0200), so `Int(2)` cannot be assigned to `Int(3)`.

Example, valid, prints `1` then `7`:

```
fn main() io {
    var a: Int(2) = empty
    push(a, 7)
    let b = a
    set(a, 0, 9)
    print(len(b))
    print(get(b, 0))
}
```

Here `b` holds the value of `a` at the `let`, so it still has the element 7 and the change to `a` is not seen.

### A4. The `empty` value

1. `empty` is a built-in name for an array value of length 0. It has no fixed type of its own. Its type is the array type expected at its position.
2. A position expects an array type in these four cases only: the initialiser of a `let` or `var` with a `: T` annotation; the right side of an assignment to a `var` of array type; an argument of a user function whose parameter has array type; a `return` in a function whose result has array type.
3. Any other use of `empty`, including as an argument to a built-in, is E0210 at `empty`.

### A5. Built-in functions

These are built in. None has an effect word.

- `len(a): Int`. Returns `L`. `a` is any array-typed expression.
- `cap(a): Int`. Returns `N`. `a` is any array-typed expression.
- `get(a, i: Int): E`, where `E` is the element type. Returns the element at index `i`. If `i` is below 0 or at or above `L`, the run traps `index-out-of-bounds` (A9).
- `set(a, i: Int, v: E)`. Writes element `i`, with the same bounds rule as `get`. `a` must be a `var` name of array type, or the program is E0303 (B2) at `a`. This includes a parameter, which is immutable (B2). `set` has no result, so using it as a value is E0200 (T5 rule for calls with no result).
- `push(a, v: E)`. Appends `v` and makes `L` one larger. `a` must be a `var` name of array type, as for `set` (E0303). If `L` equals `N`, the run traps `array-full` (A9). Otherwise nothing else changes. No result, as for `set`.

Built-in calls follow E8: the argument count and types must match. A `Byte` element is read as `Byte`; use `int` (RFC 0024) to get an `Int`.

Example, valid, prints `2`, `5`, `3`:

```
fn main() io {
    var a: Byte(3) = empty
    push(a, byte(2))
    push(a, byte(5))
    print(int(get(a, 0)))
    print(int(get(a, 1)))
    print(cap(a))
}
```

### A6. Reserved names

The names `empty`, `len`, `cap`, `get`, `set` and `push` are reserved in the way `print` is (F6, B5). A function, parameter or binding with one of these names is E0300. The names `Int` and `Byte` are already reserved (RFC 0020 and RFC 0024).

### A7. Effects

Array operations have no effect word. Creating, copying and mutating a local array does no I/O and allocates nothing outside the frame. F1 and F2 are unchanged. Examples may use arrays (EX1 and EX2 apply as before).

### A8. Frame storage and the stack limit

1. Each function's array storage is the sum of the sizes of its array-typed parameters, array-typed bindings (in any block of the function), its array-typed result and each temporary the compiler creates to hold an array value. The compiler computes this sum from declared types, so it is fixed for each function.
2. Scalar values (`Int`, `Bool`, `Byte`) do not count toward this sum.
3. Before a call's frame is entered, the run adds the callee's sum to the sum of the frames already on the call path. If the total would exceed 8388608 bytes (8 MiB), the run traps `stack-exhausted`, as TR2 does for depth. The depth check of TR2 runs first.
4. There is no heap. Nothing is allocated during a run for arrays. This rule is the only memory rule the design needs.

### A9. Traps

Two new kinds, written as in TR1 (`trap: <kind>` on standard error, exit status 1):

- `index-out-of-bounds`: `get` or `set` with an index below 0 or at or above the current length.
- `array-full`: `push` when the length equals the capacity.

`stack-exhausted` gains the byte condition of A8.3. Its text in TR1 is otherwise unchanged. Traps carry no code (TR1).

### A10. Print and other operators

`print` takes `Int`, `Bool` or `Text` only (P1). `print` of an array is E0200 (P1: other argument types are E0200). Operators on arrays are E0200 (A2.3). Arrays are not `Text` and have no conversion (T4).

### A11. Diagnostic codes

Two codes are new. Neither appears in any RFC or in `spec/errors.json`; I checked the tree.

- E0210: `empty` in a position that does not expect an array type (A4.3). Message: "empty array has no expected type". Span: `empty`.
- E0501: an array capacity above 1024 (A1.2). Message: "array capacity is above 1024". Span: the literal. This sits in the limits range E0500 to E0599, next to E0500.

The implementation PR must add E0210 and E0501 to `spec/errors.json`. The file lists six codes today, and the kernel's own codes such as E0200 and E0303 are not in it yet. This RFC does not fix that gap, but it names it so the check job does not fail on the new codes alone.

## Grammar

Amends RFC 0020's productions. Written in the RFC 0020 style:

```
type  = "Int" | "Bool" | "Text" | "Byte" | arr
ptype = "Int" | "Bool" | "Byte" | arr
rtype = "Int" | "Bool" | "Byte" | arr
arr   = ("Int" | "Byte") "(" INT ")"
```

No expression production changes. `empty`, `len`, `cap`, `get`, `set` and `push` are ordinary identifiers and calls, so RFC 0014 is not amended. `Int(3)` in an expression parses as a call and is handled by A1.4.

## Alternatives

- **Heap arrays with a bump allocator (0036).** Rejected in that draft. Without a free or a frame rule, every array lives until the program ends. This draft has no heap.
- **Frame arenas (0045).** Rejected. It needed effect `alloc`, amendments to F1 and F2, and codes outside the catalogue. This draft needs none of them, because its storage is fixed by the type.
- **Shared handles (0023, 0025, 0038).** Rejected because a write through one name changes another. This draft copies on bind, pass and return instead.
- **Copy on store (0039 to 0041, as RFC 0045 summarises them).** These copied values whose size was not fixed. Here the copy is at most 8 KiB, allocates nothing, and its size is visible in the type. I have not re-read 0039 to 0041 in full, so I cannot say the difference answers each of their reasons. The orchestrator should judge this point.
- **Move on store (0043).** Rejected. It needs a move analysis and a use-after-move error; copies need neither.
- **Fixed-size arrays `[T; N]` (0008).** Rejected in that draft because byte buffers must grow. This draft keeps a fixed capacity but allows the length to vary from 0 to N with `push`, so a buffer grows up to its capacity.
- **Brackets: `[Int:4]` for types and `a[i]` for access.** Shorter, about two tokens fewer per access. Not chosen. RFC 0014 rule 11 makes `[` and `]` E0001, and changing it would alter an existing conformance test, which needs a supermajority. Proposed as a follow-up if measurement shows the saving is worth it.
- **Generic `Arr<T>`.** Not chosen. The type system's shape is open under the constitution.
- **Growth by doubling on a heap.** Deferred. A later RFC may add it with the benchmark named in Open questions.

## Cost

What this RFC adds to the token budget:

- Types: 2 array forms (`Int(N)`, `Byte(N)`), one production `arr`.
- One built-in constant (`empty`) and five built-in functions (`len`, `cap`, `get`, `set`, `push`), all reserved names.
- Two trap kinds (`index-out-of-bounds`, `array-full`) and one extended condition (A8.3).
- Two codes (E0210, E0501).
- Rules A1 to A11.

What it removes to pay for it: nothing. The amendments to T6, T7, B5, F6 and TR1 extend lists; no existing rule is cut. No effect is added, so F1, F2 and every effect rule are unchanged.

Size estimate: about 700 to 900 tokens of spec core. I did not run the protected tokeniser from the scratch copy, so the merge bot must measure this against the 12,000-token cap.

Spec card (`spec/card.md`): adds about 7 lines. They give the two array type forms, `empty`, the five built-ins, the two new traps and the rule that arrays are copied on bind, pass and return. The card is 645 bytes today and far under its 2,000-token cap. Basic syntax is a separate item and is not part of this RFC.

## Test plan

Test files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (assigned by the publisher) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line. Compile-error tests state the code and span.

Run tests:

- `arrays-empty-len`: `let a: Int(4) = empty` then `print(len(a))` prints `0`. Exit 0. Covers the `arr` production and A4.
- `arrays-push-get`: pushes `3` and `5` into `var a: Int(4)`, prints `get(a, 1)`. Exit 0. Covers A5 and A2.
- `arrays-set`: `set(a, 0, 9)` then prints `get(a, 0)`. Exit 0. Covers the `var` requirement in A5.
- `arrays-copy-on-bind`: the A3 example above. Prints `1` then `7`. Exit 0.
- `arrays-copy-on-pass`: a function takes `Int(2)`, binds it to a `var` copy, pushes, returns the copy. The caller's name keeps length 0 and prints it. Exit 0.
- `arrays-byte`: the A5 `Byte` example. Prints `2`, `5`, `3`. Exit 0.
- `arrays-cap`: `cap` of `Int(7)` prints `7`. Exit 0.
- `arrays-stack-trap`: recursion in which each frame holds an `Int(1024)` binding, until the 8 MiB sum is reached. Expected `trap: stack-exhausted`, exit 1. Covers A8.3.

Trap tests:

- `arrays-get-trap`: `get(a, 0)` on an empty array. Expected `trap: index-out-of-bounds`, exit 1.
- `arrays-negative-index-trap`: `get(a, -1)`. Expected `trap: index-out-of-bounds`, exit 1.
- `arrays-full-trap`: `push` into `var a: Int(1)` after one push. Expected `trap: array-full`, exit 1.

Compile-error tests:

- `arrays-capacity-over`: `let a: Int(1025) = empty`. Expected E0501 at the literal `1025`.
- `arrays-empty-no-type`: `print(len(empty))`. Expected E0210 at `empty`.
- `arrays-set-let`: `set` on a `let` name. Expected E0303 at the first argument.
- `arrays-set-param`: `set` on a parameter. Expected E0303 at the first argument.
- `arrays-print`: `print` of an array name. Expected E0200.
- `arrays-equal`: `a == b` on two arrays. Expected E0200.
- `arrays-type-value`: `let x = Int(3)`. Expected E0301 at `Int`.
- `arrays-reserved-name`: `fn push()`. Expected E0300.

Each new code (E0210, E0501) has a compile-error test, which meets the coverage rule. Each new grammar production (`arr`) is reached by the run tests above, which meets the rule that every production has a conformance test.

## Open questions

1. The roadmap gate (see Motivation). The orchestrator should confirm that the first merge is on `main` before any vote.
2. Whether `[T:N]` types and `a[i]` access should replace `T(N)` and the built-ins, after the protected tokeniser shows the saving. This needs an amendment to RFC 0014.
3. Whether growth beyond 1024 elements is needed. If so, a later RFC must name the benchmark that shows the bounded form is not enough, and must choose the heap strategy under the designer rules.
4. The values 1024 (A1.2) and 8 MiB (A8.3) are not measured. They must be checked against the runtime section once it exists.
5. The 8 KiB size of the largest array value and the copy cost of A3 are not measured either. The benchmark should record copy bytes per run before anyone accepts the copy rule.
