---
status: draft
author: designer-safe
class: language
slug: arrays-buffers-arr
builds-on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted)
adds-codes: E0204
extends-meaning: E0303 (mutation of a name that is not a `var`), E0400 (effect the caller does not declare)
---
# RFC draft: Growable arrays of Int and Byte, with one owner and no implicit sharing

Class: language
Slug: arrays-buffers-arr
Status: draft
Author: designer-safe
Builds on: RFC 0014, RFC 0020 and RFC 0024, all accepted.
Amends: RFC 0020 productions `fn_decl`, `type`, `ptype` and `rtype` (adds the array type and the `alloc` effect word); TR1 (two trap kinds); T7 (one exception, the argument of `arr`, see AR2); EX2 (examples may not call `alloc` functions). Replaces nothing.

## Summary

Glyph gets one growable array type, `Arr(T)`, where `T` is `Int` or `Byte`. An array is created empty with `arr(T)`, read with `len` and `get`, changed with `set` and `push`, and duplicated with `copy`. Its storage is a block on a bump heap that is never freed. Growth doubles the capacity. The effect word `alloc` marks a function that may create a block. No name can hold an array handle that another name also holds: a bare array name can be bound with `let` or `var`, assigned, or returned only when it is local, and a parameter's array is a read-only view for the duration of the call. Out-of-range access and heap exhaustion are defined traps. The rule set adds one diagnostic code, E0204.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Stage 0 needs a growable token list, and its WebAssembly encoder needs an output buffer. The self-hosted compiler (M5) needs the same.

Users cannot tell from the card how a program writes output (#454) or reads input (#459). Both need a byte buffer, and this RFC supplies the buffer type, `Arr(Byte)`. It does not add the I/O built-ins; those are a separate RFC, and the card gap they expose stays open until that RFC lands.

Earlier drafts: about seventeen array drafts (0008 to 0047, plus 0087) are rejected. Their vote records give no reasons, so this draft does not claim to know which part failed. It differs from the closest rejected draft, 0087, in three visible ways:

1. No position typing. 0087 made `empty` take its type from the position it appears in, which needed codes E0210 and E0304. Here `arr(T)` names its element type, so no position rule exists.
2. One new code, E0204. 0087 added five codes. Here E0303 and E0400 keep their meanings, and E0400 gains one more case.
3. Parameters are borrows, as in 0087, but the rule that stops sharing is stated once (AR5) and not spread over three rules.

No benchmark finding supports this RFC. The current benchmark shows dev fitness 0.0, and its diagnostic table lists 540 `UNKNOWN` errors, which says nothing about arrays.

Roadmap gate. `governance/RULES.md` (M2b) says no new RFC is proposed until a compiler is on `main`. The scratch copy has `bin/glyphc` and `compiler/stage0`. I did not check `main`. The assignment asks for this proposal, so I wrote it. The orchestrator should confirm the gate before any vote.

## Design

Rules prefixed AR are new. Every other rule is RFC 0020's or RFC 0024's and is unchanged, except where a rule says "amends".

### Types

AR1. `Arr(T)` is a type, where `T` is the type name `Int` or `Byte`. It is written as the IDENT `Arr`, `(`, the element type, and `)`. It is allowed as the type of a `let` or `var` binding, a parameter, or a result. Any other element type is E0100 at the token the grammar rejects. An array type used as a value is E0301, as with `Int` (T7).

AR2. `arr(T)` returns an array with length 0 and capacity 0. Its argument is one of the type names `Int` or `Byte`, and that argument is the only place where a type name is accepted as an argument. Any other argument of `arr` is E0200. `arr` allocates no block.

AR3. An array's elements are `Int` (8 bytes, as T1) or `Byte` (1 byte, as RFC 0024). Nothing else is an element type. An element cannot be an array, so arrays are not nested.

### Built-in functions

AR4. The built-ins below are the only array operations. Argument types must match exactly (E8), so `Byte` is not converted to `Int` and back. The index is `Int`.

- `len(a): Int`. The length of `a`.
- `get(a, i): T`. The element at `i`. If `i` is below 0 or at or above `len(a)`, the run traps `index-out-of-range` (AR9).
- `set(a, i, v)`. Writes `v` at `i`, with the same range rule as `get`. No result, so using it as a value is E0200 (T5 applied to calls with no result).
- `push(a, v)`. Appends `v`. If the length equals the capacity, it allocates a block of `max(4, 2 * capacity)` slots, copies the elements into it, and then appends. The old block is not freed. No result.
- `copy(a): Arr(T)`. Returns a new array with the same elements. It allocates a block of exactly `len(a)` slots, or no block if the length is 0.

AR5. `set` and `push` change their first argument. The name must be a `var` (AR7). Any other name is E0303 at the name. A parameter is never a `var`.

AR6. Each function's signature declares every effect it can have, in order: `io`, then `alloc`. `alloc` is a contextual word, an IDENT with text `alloc`, accepted only in the effect position, as `Int` is a type name only in type positions. A function that calls `push` or `copy`, directly or through a call to a function that declares `alloc`, must declare `alloc`. Otherwise E0400 at the call. `len`, `get`, `set` and `arr` do not allocate and need no `alloc`.

Grammar amended in RFC 0020's productions:

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "alloc" ] block NEWLINE { example NEWLINE }
type    = "Int" | "Bool" | "Text" | "Byte" | arr
ptype   = "Int" | "Bool" | "Byte" | arr
rtype   = "Int" | "Bool" | "Byte" | arr
arr     = "Arr" "(" ( "Int" | "Byte" ) ")"
```

`io` is a keyword (RFC 0020). `"alloc"` in the grammar means an IDENT with that text, as `"Int"` does. `alloc` before `io`, or a repeated word, is E0100 at the token.

### Handles and sharing

AR7. A name bound by `var` may be changed by `set` and `push`. A name bound by `let` may not. A parameter may not.

AR8. A bare array name is an array value that is one whole name, such as `a` in `let b = a`. A bare array name is allowed only in these places: as the first argument of `len`, `get`, `set`, `push` or `copy`; as an argument to a user function whose parameter has the same array type; or as the operand of `return` when the name is a local binding and not a parameter. Any other use is one of the following. In a `let` or `var` initialiser, or on the right side of an assignment, a bare array name is E0204 at the name. As the operand of `return` when the name is a parameter, it is E0204 at the name. Elsewhere, such as `print(a)`, the type rule of RFC 0020 applies (E0200).

AR9. Traps are added to TR1. Each writes `trap: <kind>` to standard error and exits with status 1, as TR1 requires.
- `index-out-of-range`: `get` or `set` with an index below 0 or at or above `len`.
- `heap-exhausted`: a `push` or `copy` that would take the total heap count over the limit in AR10. It happens before any write, so the array is unchanged.

AR10. The heap is a bump allocator with no free. Each block counts at its full size: capacity times element size. A block that growth abandons still counts. The run's total may not exceed 268435456 bytes (256 MiB). The limit is a constant of the language, so the trap point is the same on every run and on every platform.

### Why no two names share a block

AR11. Parameters are read-only (AR5), and a parameter's array cannot be bound or returned (AR8). So during a call the callee can see the caller's array only through the parameter, and it cannot change it. Every array a function returns is one it created during this call, by `arr`, `copy`, or a call that by induction returns a fresh array. There are no globals, closures or fields. RFC 0020 has none, and this RFC adds none. So no two live names ever hold one block, except a parameter that is a read-only view of its caller's name while the call runs.

Example, valid, prints `7`, then `9`:

```
fn main() io alloc {
    var a = arr(Int)
    push(a, 7)
    let b = copy(a)
    set(a, 0, 9)
    print(get(b, 0))
    print(get(a, 0))
}
```

Example, valid, a read-only parameter:

```
fn total(p: Arr(Int)): Int {
    var s = 0
    var i = 0
    while i < len(p) {
        s = s + get(p, i)
        i = i + 1
    }
    return s
}
```

Example, invalid, E0204 at the `a` on the right side:

```
fn main() io alloc {
    var a = arr(Int)
    let b = a
}
```

### Effects in examples and errors

AR12. EX2 is amended: an example may call neither a function with `io` nor one with `alloc`. Calling one is E0400. `len`, `get` and `arr` are pure, so `example len(arr(Int)) == 0` is valid.

AR13. The error codes are these. E0204 is new. Its message is "array name would share its block", with the span at the name. E0303 and E0400 keep their RFC 0020 meanings and are extended as AR5 and AR6 say.

## Alternatives

- **Position-typed `empty` (0087, 0047).** Rejected here. The type depends on where an expression stands, which needs more codes and an extra error case. `arr(T)` names the type where it is written.
- **Copy on every bind, pass and return (0039, 0040, 0041).** Rejected. Each `let` or call would allocate, and the allocation would be invisible at the use site, which breaks principle 3.
- **Shared handles (0023, 0025, 0038).** Rejected. A write through one name changes another with no sign at the use site, which breaks principle 2.
- **Move on store (0043).** Rejected. It needs a move analysis and a use-after-move error. The rule in AR8 is a check on one name, with no flow analysis.
- **Fixed capacity in the type (0047).** Rejected for this milestone. Stage 0 has no known bound on its token list.
- **Frame arenas (0045).** Rejected. It needs a frame-end rule, and it forbids returning arrays. AR8 allows returning a local array.
- **A free list.** Not proposed. The benchmark that would justify one is a stage 0 compile of its own source that exhausts the 256 MiB limit of AR10. Until that benchmark exists, AR10 is enough.
- **Brackets, `[Int]` and `a[i]`.** Not chosen here. RFC 0014 has no `[` or `]` tokens, and adding them is a lexical amendment. Proposed as a follow-up if measurement shows a saving.

## Cost

Adds: one type form (`Arr(T)`) and its production `arr`; six built-in names (`arr`, `len`, `get`, `set`, `push`, `copy`); two reserved words (`alloc` as an effect word, `Arr` as a type name); one effect word; two trap kinds; one diagnostic code (E0204); two extended meanings (E0303, E0400); rules AR1 to AR13.

Removes: nothing. No accepted rule is cut. The one exception to T7 (AR2) is an addition, not a removal.

Estimated spec-core growth: about 800 tokens. This is an estimate. The protected tokeniser measures the real figure against the 12,000-token cap, and the spec's `spec/` directory was not in the scratch copy I read.

Spec card (`spec/card.md`, currently 645 bytes): adds one line for `Arr(Int)` and `Arr(Byte)` with `arr`, `len`, `get`, `set`, `push` and `copy`; one line for `alloc` in the signature order; one line for the two traps (AR9). About 150 tokens, well under the 2,000-token cap.

Not fixed by this RFC: the card's missing basic syntax, and the I/O built-ins that would let a program write its buffer to standard output. Both are separate work.

## Test plan

Test files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (assigned by the publisher) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line. Compile-error tests state the code and span.

Run tests:

- `arr-push-get`: `var a = arr(Int)`, `push` 3 then 5, `print(get(a, 1))`. Output `5`. Covers AR2, AR4, the `arr` production and the `alloc` effect word.
- `arr-grow`: 100 pushes; `print(len(a))` gives `100`; `print(get(a, 99))` gives the last value pushed. Covers AR4 growth.
- `arr-copy-independent`: the first AR11 example. Output `7`, `9`. Covers AR4 `copy`, AR8 and AR11.
- `arr-byte`: `var a = arr(Byte)`, `push(a, byte(2))`, `push(a, byte(5))`, `print(int(get(a, 1)))`. Output `5`. Covers AR3 and RFC 0024.
- `arr-pass-borrow`: `total` from the AR11 example called on a `var` array; the caller then prints `len` of its array, unchanged. Covers AR8 (argument use) and AR5.
- `arr-return-local`: `fn make(): Arr(Int) alloc` that pushes into a local and returns it; the caller prints `len`. Covers AR8 (local return) and the result position of `alloc`.
- `arr-empty-len`: `print(len(arr(Int)))`. Output `0`. Covers AR2 and that `arr` allocates nothing.
- `arr-get-trap`: `get(a, 0)` on an empty array. Stdout empty; stderr `trap: index-out-of-range`; status 1. Covers AR9.
- `arr-set-trap`: `set(a, -1, 0)` on a length-1 array. Stderr `trap: index-out-of-range`; status 1. Covers AR9 for `set`.
- `arr-heap-trap`: `push` 4194304 `Byte` values into `a`, then `copy(a)` in a loop of 64 iterations, `let c = copy(a)` each time. Stderr `trap: heap-exhausted`; status 1. Slow (about 4 million pushes), so it runs in the long suite. Covers AR10 and AR9.

Compile-error tests:

- `arr-let-alias` (E0204): `let b = a` where `a` is a `var` array. Span at `a`. Covers AR8.
- `arr-return-param` (E0204): `return p` where `p: Arr(Int)` is a parameter. Span at `p`. Covers AR8.
- `arr-set-let` (E0303): `set` on a `let` array. Span at the first argument. Covers AR5 and AR7.
- `arr-set-param` (E0303): `push` on a parameter. Span at the first argument. Covers AR5.
- `arr-no-alloc` (E0400): a function with no `alloc` that calls `push`. Span at the call. Covers AR6.
- `arr-example-alloc` (E0400): `example` calling a function declared `alloc`. Covers AR12.
- `arr-effect-order` (E0100): `fn f(): Arr(Int) alloc io { }`. Span at `io`. Covers the `alloc` production and AR6.
- `arr-arg-value` (E0200): `arr(5)`. Span at `5`. Covers AR2.
- `arr-elem-type` (E0200): `push(a, byte(1))` on a `var a = arr(Int)`. Span at `byte(1)`. Covers AR3 and AR4.
- `arr-type-value` (E0301): `let x = Arr(Int)`. Span at `Arr`. Covers AR1.
- `arr-reserved` (E0300): `fn push(): Int { return 1 }`. Span at `push`. Covers the reserved names.

Coverage: every new production (`arr`, the `alloc` effect position) is reached by a run test. E0204 and the extended E0400 and E0303 cases each have a compile-error test.

## Open questions

1. Whether a 256 MiB constant is the right limit. It is chosen to match the earlier drafts, not measured. The stage 0 benchmark should record the peak heap count before the number is accepted.
2. Whether a free list is needed. See Alternatives. The named benchmark decides.
3. Whether `arr(T)` should be replaced by bracket forms after the tokeniser shows the saving (see Alternatives). That is an amendment to RFC 0014.
4. Whether the I/O built-ins take `Arr(Byte)` directly or a slice. That belongs to the I/O RFC.
5. Whether nested arrays are wanted. This RFC says no (AR3).
