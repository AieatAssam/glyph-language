---
adds-codes: E0205
author: designer-safe
builds-on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted)
class: language
extends-meaning: E0200 (array used as a value), E0303 (mutable use of a name that is not a `var`), E0400 (effect the caller does not declare)
slug: arrays-buffers-var
status: draft
---
# RFC draft: Growable arrays that live in one binding and are passed by reference

Class: language
Slug: arrays-buffers-var
Status: draft
Author: designer-safe
Builds on: RFC 0014, RFC 0020 and RFC 0024, all accepted.
Amends: RFC 0020 productions `param`, `ptype` and `rtype` (adds the array type and the `var` parameter form); RFC 0020 T7 (an array name used as a value is E0200, not E0301); EX2 (an example may not call an `alloc` function). Adds the effect word `alloc` in the same slot as `io`. Replaces nothing.

## Summary

Glyph gets one growable array type, `Arr(T)`, where `T` is `Int` or `Byte`. An array is created by `arr(T)` in the initialiser of a `let` or `var` binding. It is read with `len` and `get`, changed with `set` and `push`, and passed to a function as a read-only or mutable parameter. An array is never returned, never copied, never stored in another array, and never assigned. So each array has exactly one owning binding, and a callee sees it only during the call. The one aliasing hazard, one array passed twice in one call, is a compile error. Storage comes from a bump heap that is never freed. Out-of-range access and heap exhaustion are defined traps. The rule set adds one diagnostic code, E0205.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Stage 0 needs a growable token list, and its WebAssembly encoder needs an output buffer. The self-hosted compiler (M5) needs the same. Both are filled and read inside one compile, and neither needs an array to leave the function that made it. So this draft drops the parts of earlier drafts that carried the most rules: returning arrays, copying on bind, and the alias analysis they need.

The spec card has no built-in functions listed, so a program cannot use `len` even when it exists (#483). This RFC adds `len` to the built-in table, and the card line it needs is in Cost.

This RFC does not add the I/O built-ins that would let a program write its buffer to standard output (#454) or read input (#459). Those are a separate RFC.

Earlier drafts: about seventeen array drafts (0008 to 0047, 0087, 0090) are rejected, and 0034 was also rejected. Their vote records give no reasons, so this draft does not claim to know which part failed. The main differences from them are these. Arrays may not be returned or copied (0034 and 0090 copy or return them). Arrays are not first-class values (0090 allowed local binding and return). Mutation goes through a `var` parameter, and no name holds an array after the call that made it returns.

No benchmark finding supports this RFC. The current benchmark shows dev fitness 0.0, and its diagnostic table lists 540 `UNKNOWN` errors, none about arrays.

Roadmap gate. `architecture/ROADMAP.md` (M2b) says no new RFC is proposed until a compiler is on `main`. The scratch copy has `bin/glyphc` and `compiler/stage0`, and `sbx python3 -m tools.check.run` passes all gate rules there. I could not confirm that the compiler is on `main`. The assignment asks for this proposal, so I wrote it. The orchestrator should confirm the gate before any vote.

## Design

Rules prefixed AV are new. Every other rule is RFC 0020's or RFC 0024's and is unchanged, except where a rule says "amends".

### Types

AV1. `Arr(T)` is a type, where `T` is the type name `Int` or `Byte`. It is written as the IDENT `Arr`, `(`, the element type, and `)`. It is allowed only as the type of a parameter (AV2). It is not allowed as a result type and not as the type of a binding. A binding gets its array type from the initialiser `arr(T)` (AV4). Any other element type, and an array type in a result position, is E0100 at the token the grammar rejects.

AV2. A parameter may have type `Arr(T)` (read-only view) or `var Arr(T)` (mutable view). In a mutable view `push` and `set` are allowed. A view is a reference to the caller's binding for the duration of the call. Nothing else is a parameter form.

AV3. An array is not a value. A bare array name, such as `a` in `let b = a`, `print(a)` or `return a`, is E0200 at the name. A bare array name is allowed in exactly two places: as the first argument of `len`, `get`, `set` or `push` (AV5), and as an argument of a user function whose parameter is an array (AV6). `arr(T)` is allowed only as the whole initialiser of a `let` or `var` binding; elsewhere it is E0200 at `arr`.

### Built-in functions

AV4. The built-ins below are the only array operations. The index is `Int`. Element arguments must have the element type exactly (RFC 0020 B2 and E8), so `Byte` is not converted to `Int` or back.

- `arr(T)`: the initialiser form. `T` is `Int` or `Byte`, and it is the only place a type name is an argument. It returns an empty array with capacity 0. It allocates no block. Any other argument is E0200 at the argument.
- `len(a): Int`: the length of `a`. Pure.
- `get(a, i): T`: the element at `i`. If `i` is below 0 or at or above `len(a)`, the run traps `index-out-of-range` (AV9). Pure.
- `set(a, i, v)`: writes `v` at `i`, with the same range rule. A statement. Using it as a value is E0200.
- `push(a, v)`: appends `v`. A statement with effect `alloc` (AV8). Using it as a value is E0200.

AV5. `set` and `push` change their first argument. That argument must name a `var` binding or a `var` parameter. Otherwise E0303 at the argument. A read-only parameter is never mutable, so `set` or `push` on it is E0303.

AV6. In a call to a user function, an argument whose parameter type is `Arr(T)` must be an array name of element type `T`. An argument whose parameter type is `var Arr(T)` must be a `var` name, or a `var` parameter, of element type `T`. A `let` name passed to a `var` parameter is E0303 at the argument. An element type mismatch is E0200 at the argument.

### Effects and aliasing

AV7. In one call, the same array name may not appear in two arguments when one of those arguments is a `var` view. The second occurrence is E0205 at the name. Two read-only views of one array are allowed.

AV8. The effect word `alloc` is an IDENT with text `alloc`, accepted only in the effect slot after `io`. A function declares `alloc` if its body calls `push` directly or calls a function that declares `alloc`. A missing `alloc` is E0400 at the call. `arr`, `len`, `get` and `set` do not allocate and need no `alloc`.

Grammar amended in RFC 0020's productions:

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "alloc" ] block NEWLINE { example NEWLINE }
param   = IDENT ":" ptype
ptype   = "Int" | "Bool" | "Byte" | arr | "var" arr
rtype   = "Int" | "Bool" | "Byte"
arr     = "Arr" "(" ( "Int" | "Byte" ) ")"
```

`"alloc"` in the grammar is an IDENT with that text. `alloc` before `io`, or a repeated word, is E0100 at the token. `var` before `arr` in a parameter is the only place `var` appears in a parameter.

AV9. EX2 is amended: an example may call neither a function with `io` nor one with `alloc`. Calling one is E0400. `len`, `get` and `arr` are pure, so `example len(arr(Int)) == 0` is valid.

### Memory and traps

AV10. The heap is a bump allocator with no free. When `push` finds length equal to capacity, it allocates a block of `max(4, 2 * capacity)` slots, copies the elements into it, and appends. Capacity is internal and is not visible to Glyph text. Each block counts at its full size, capacity times element size, and an abandoned block still counts. The run's total may not exceed 268435456 bytes (256 MiB). A `push` that would pass the limit traps `heap-exhausted` before any write, so the array is unchanged. The limit is a constant of the language, so the trap point is the same on every run and on every platform.

AV11. Traps are added to RFC 0020 TR1. Each writes `trap: <kind>` to standard error and exits with status 1, as TR1 requires. Output written before the trap stays written.
- `index-out-of-range`: `get` or `set` with an index below 0 or at or above `len`. The argument order is checked first (RFC 0020 E10), and the range check comes after the arguments are evaluated.
- `heap-exhausted`: a `push` that would take the total heap count over the limit in AV10.

### Why one array never has two live owners

AV12. An array's handle lives in exactly one binding. A binding is created only by `let` or `var` with `arr(T)`, and nothing copies a handle (AV3). A parameter view is a reference to that binding for one call (AV2), and the caller cannot touch the binding while the call runs. AV7 stops one call from holding two mutable views of one binding. So during a call, a mutable view is the only live way to change that array. Principle 2 holds: a reader can see from the call text which names may change an array.

Example, valid, prints `2`, then `2`:

```
fn fill(p: var Arr(Int)) alloc {
    push(p, 1)
    push(p, 2)
}

fn main() io alloc {
    var a = arr(Int)
    fill(a)
    print(len(a))
    print(get(a, 1))
}
```

Example, invalid, E0205 at the second `a`:

```
fn two(x: var Arr(Int), y: Arr(Int)): Int alloc {
    push(x, 1)
    return len(y)
}

fn main() io alloc {
    var a = arr(Int)
    print(two(a, a))
}
```

Example, invalid, E0200 at the `a` on the right side:

```
fn main() io alloc {
    var a = arr(Int)
    let b = a
}
```

## Alternatives

- **Return arrays from functions.** Not chosen. A returned array needs either a copy or a move rule, and both add rules that this RFC avoids. Stage 0 can fill an output buffer through a `var` parameter instead.
- **Copy on every bind, pass and return (0039, 0040, 0041).** Not chosen. Each `let` or call would allocate, and the allocation would be invisible at the use site, which breaks principle 3.
- **Shared handles (0023, 0025, 0038).** Rejected. A write through one name changes another with no sign at the use site, which breaks principle 2.
- **Move on store (0043).** Not chosen. It needs a move analysis and a use-after-move error. AV3 and AV7 are checks on one call, with no flow analysis.
- **Position-typed `empty` (0087, 0047).** Not chosen. `arr(T)` names its element type where it is written, so no position rule exists.
- **Frame arenas (0045).** Not chosen. Arrays are never returned here, so a frame-end rule is not needed for the first milestone.
- **A free list.** Not proposed. The benchmark that would justify one is a compile by stage 0 of its own source that exhausts the 256 MiB limit of AV10. Until that benchmark exists, AV10 is enough.
- **Brackets, `[Int]` and `a[i]`.** Not chosen here. RFC 0014 has no `[` or `]` tokens, and adding them is a lexical amendment. Proposed as a follow-up if measurement shows a saving.

## Cost

Adds: one type form (`Arr(T)`) and its production `arr`; the `var` parameter form; five built-in names (`arr`, `len`, `get`, `set`, `push`); one effect word (`alloc`); two trap kinds; one diagnostic code (E0205); two extended meanings (E0200 and E0303 as AV3 and AV5 say); rules AV1 to AV12.

Removes: nothing. No accepted rule is cut. RFC 0020 T7 changes only in that an array name used as a value gets E0200 instead of E0301. That is a change of code for one case, not a removed rule.

Estimated spec-core growth: about 600 tokens. This is an estimate. The protected tokeniser has not run on this draft, so the figure is unmeasured. The merge bot measures the real figure against the 12,000-token cap.

Spec card (`spec/card.md`, currently 645 bytes): adds one line for the type `Arr(Int)` and `Arr(Byte)`; one line for the built-ins `arr`, `len`, `get`, `set` and `push`; one line for `alloc` in the signature order; one line for the two traps (AV11). About 120 tokens, well under the 2,000-token cap. The card gap in #483 for `len` is closed by the built-in line.

Not fixed by this RFC: the card's missing basic syntax (#480, #481) and the I/O built-ins (#454, #459). Both are separate work.

## Test plan

Test files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (assigned by the publisher) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line. Compile-error tests state the code and span.

Run tests:

- `arr-push-get`: `var a = arr(Int)`, `push` 3 then 5, `print(get(a, 1))`. Output `5`. Covers AV4, AV8 and the `arr` production.
- `arr-grow`: a loop pushes 100 values; `print(len(a))` gives `100`; `print(get(a, 99))` gives the last value pushed. Covers AV10 growth.
- `arr-byte`: `var a = arr(Byte)`, `push(a, byte(2))`, `push(a, byte(5))`, `print(int(get(a, 1)))`. Output `5`. Covers the `Byte` element type of AV4 and RFC 0024.
- `arr-var-param`: the `fill` example from AV12. Output `2`, then `2`. Covers AV2, AV6 and the `var` parameter form.
- `arr-read-param`: `fn total(p: Arr(Int)): Int` sums `get(p, i)` over `len(p)`; the caller's array keeps its length after the call. Covers AV2 read view.
- `arr-empty-len`: `print(len(arr(Int)))`. Output `0`. Covers AV4 `arr` allocating nothing.
- `arr-check-examples`: `example len(arr(Int)) == 0` passes under `glyphc check`. Covers AV9.
- `trap-index`: `get(a, 0)` on an empty array. Stdout empty; stderr `trap: index-out-of-range`; status 1. Covers AV11.
- `trap-set-negative`: `set(a, -1, 0)` on a length-1 array. Stderr `trap: index-out-of-range`; status 1. Covers AV11 for `set`.
- `trap-after-output`: `print(1)`, then `get(a, 3)` on a length-3 array. Stdout `1`; stderr `trap: index-out-of-range`; status 1. Covers the output rule of AV11.
- `trap-heap`: a loop of `push` calls on one `Int` array, longer than 2^24 iterations, then `print(1)`. The capacity doubles, and the abandoned blocks count, so the 256 MiB total is passed inside the loop. Stdout empty; stderr `trap: heap-exhausted`; status 1. Slow, so it runs in the long suite. Its run time is unmeasured. Covers AV10 and AV11.

Compile-error tests, each stating the code and the span:

- `arr-let-value` (E0200): `let b = a` where `a` is a `var` array. Span at `a`. Covers AV3.
- `arr-return-value` (E0200): `return a` where `a` is a local array. Span at `a`. Covers AV3 (no array return).
- `arr-arr-type-result` (E0100): `fn f(): Arr(Int) alloc { }`. Span at `Arr`. Covers AV1.
- `arr-elem-type` (E0100): `Arr(Bool)` as a parameter type. Span at `Bool`. Covers AV1.
- `arr-arg-value` (E0200): `arr(5)`. Span at `5`. Covers AV4.
- `arr-arr-not-initialiser` (E0200): `print(arr(Int))`. Span at `arr`. Covers AV3.
- `arr-set-let` (E0303): `set` on a `let` array. Span at the first argument. Covers AV5.
- `arr-set-read-param` (E0303): `push` on a read-only parameter. Span at the first argument. Covers AV5.
- `arr-pass-let-var` (E0303): a `let` array passed to a `var` parameter. Span at the argument. Covers AV6.
- `arr-alias-two` (E0205): the `two(a, a)` example from AV12. Span at the second `a`. Covers AV7.
- `arr-no-alloc` (E0400): a function with no `alloc` that calls `push` on its parameter. Span at the call. Covers AV8.
- `arr-example-alloc` (E0400): `example` calling a function declared `alloc`. Covers AV9.
- `arr-effect-order` (E0100): `fn f(): Int alloc io { return 1 }`. Span at `alloc`. Covers AV8.
- `arr-reserved` (E0300): `fn push(): Int { return 1 }`. Span at `push`. Covers the reserved names of RFC 0020 B5 and F6.

Coverage: every new production (`arr`, the `var` parameter form, the `alloc` effect slot) is reached by a run test. E0205 has a compile-error test. Every code this draft uses has at least one test: E0100, E0200, E0205, E0300, E0303, E0400.

## Open questions

1. Whether the 256 MiB constant is the right limit. It matches the earlier drafts and was not measured. The stage 0 benchmark should record the peak heap count before the number is accepted.
2. Whether a free list is needed. See Alternatives. The named benchmark decides.
3. Whether a read-only view of a `let` array is useful when the owner is a `var`. This draft allows any array name in a read-only view.
4. Whether `arr(T)` should be replaced by bracket forms after the tokeniser shows the saving (see Alternatives). That is an amendment to RFC 0014.
5. Whether returning arrays is needed for the self-hosted compiler (M5). This draft says no. If M5 needs it, a follow-up RFC adds a move rule with its own codes.
6. Whether the I/O built-ins take `Arr(Byte)` directly or a slice. That belongs to the I/O RFC.
