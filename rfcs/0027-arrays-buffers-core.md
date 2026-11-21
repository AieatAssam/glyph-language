---
status: rejected
votes:
  designer-min: reject
  designer-prag: abstain
  impl-1: reject
  tester: reject
  user-1: approve
  user-2: abstain
---
# RFC draft: Growable arrays of Int, Bool and Byte, with one allocation word

Class: language
Slug: arrays-buffers-core
Status: draft
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted).
Replaces: nothing. Supersedes the draft direction of RFCs 0008, 0010, 0022, 0023 and 0025, all rejected. Their vote records do not give reasons, so this draft does not claim to know which part failed. It takes the smallest surface that covers the checklist item.

## Summary

Glyph gets one growable array type, `Arr<T>`, where `T` is `Int`, `Bool` or `Byte`. An array is made with the built-in `array`, read with `get`, written with `set`, grown with `push` and measured with `len`. The effect word `alloc` placed after `io` in a signature marks any function that allocates. Binding or assigning a name copies its array. Passing a name borrows it. Memory comes from one bump allocator with no free. A bad index and an exhausted heap are defined traps with exit status 1. Capacity is not visible to programs. No token, keyword or punctuation is added.

## Motivation

Readiness item `arrays-buffers` (`docs/SPEC.md`, section 9) asks for "growable arrays and byte buffers". Stage 0 needs a growable token list and an output buffer for its WebAssembly encoder. The self-hosted port (M5) needs the same. RFC 0024 is accepted and gives `Byte`, so the byte-buffer half of the item can be decided with the array half.

No benchmark finding exists this session. The following open user issues fix the surface of this draft:

- **#32.** RFC 0010 says capacity is internal, then uses `cap()` in its growth rule. This draft exposes no capacity. The growth rule (R14) names the internal capacity as an implementation quantity, and no built-in returns it.
- **#31.** Type mismatch has two codes across the drafts. RFC 0020 uses E0200 for every type mismatch and arity error (E3, E8, B1), and this draft uses only E0200 for that case.
- **#36.** The effect marker is `!io` in some drafts and `io` in others. RFC 0020 uses the keyword `io` after the result clause. This draft writes `alloc` in the same slot, with no `!`.

Principles 2, 3 and 7 set the shape. Allocation must appear in the signature (principle 3). Aliasing must be local, so a reader can tell from a function's text that two names do not share storage (principle 2). Every bad access must have one defined result (principle 7).

## Design

Normative. "Must" and "is" bind implementers. Rule numbers with the prefix R are new in this RFC.

### Types and layout

R1. `Arr<T>` is a growable array. `T` is `Int`, `Bool` or `Byte`. Any other element type is E0100 at the element.

R2. Layout. An `Int` element is 8 bytes, signed 64-bit, little endian. A `Bool` element is 1 byte: `0` for false, `1` for true. A `Byte` element is 1 byte, unsigned, value 0 to 255, as RFC 0024 defines.

R3. An array value holds a length and a capacity with `0 <= length <= capacity`. The capacity is not observable from Glyph text.

R4. An array may be bound, assigned, passed as an argument, and used as a parameter or result type. It may not be printed, compared with `==` or `!=`, or used where `Int`, `Bool`, `Byte` or `Text` is required. Each such use is E0200.

### Grammar

This RFC adds an array type and one effect word. It adds no token, keyword or punctuation.

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "alloc" ] block NEWLINE { example NEWLINE }
ptype   = "Int" | "Bool" | "Byte" | arr
rtype   = "Int" | "Bool" | "Byte" | arr
type    = "Int" | "Bool" | "Byte" | "Text" | arr
arr     = "Arr" "<" elem ">"
elem    = "Int" | "Bool" | "Byte"
```

`Arr` and `alloc` are each an `IDENT` with that text. Neither is a keyword, so RFC 0014 rule 7 keeps its count of keywords.

R5. In a signature, `io` comes before `alloc`, with nothing between them. Writing `alloc` before `io` is E0100 at `alloc`. Either word may appear alone.

R6. `Arr<Int>=` with no space lexes as `Arr`, `<`, `Int`, `>=`, so the parser reports E0100 at `>=`. A space is required before `=` in a binding annotation.

### Built-in functions

R7. These are compiler intrinsics. They need no import. Their names are reserved (R21).

| Call | Type | Effect | Meaning |
| --- | --- | --- | --- |
| `array(e1, ..., en)`, `n >= 1` | `Arr<T>`, `T` the type of `e1` | `alloc` | New array holding the elements in order |
| `array()` | `Arr<T>`, `T` from the annotation | none | Empty array; allocates nothing |
| `len(a)` | `Int` | none | Number of elements |
| `get(a, i)` | `T` | none | Element at index `i`, or a trap |
| `set(a, i, x)` | no value (statement) | none | Writes element `i`, or a trap |
| `push(a, x)` | no value (statement) | `alloc` | Appends `x` |

R8. Each built-in is checked like a user function call (RFC 0020 E8). A wrong argument count or type is E0200.

R9. In `array(e1, ..., en)` every element must have one type, and that type must be `Int`, `Bool` or `Byte`. Otherwise E0200.

R10. `array()` takes its element type only from the type annotation of the `let` or `var` it initialises, as in `var a: Arr<Int> = array()`. Anywhere else, including an assignment `a = array()`, it is E0620 at `array`. `array()` never allocates. (Draft 0025 also allowed assignment context. This draft removes that rule.)

R11. In `set` and `push` the first argument must be a name declared with `var`. Any other form is E0303 at that argument (RFC 0020 B2).

R12. `get(a, i)` and `set(a, i, x)` evaluate their arguments left to right (RFC 0020 E10). They then check `0 <= i < len(a)`. If the check fails, the run traps `index-out-of-bounds`. Otherwise `get` returns the element and `set` stores `x`.

R13. `push(a, x)` evaluates `a` and `x` left to right and checks that `x` has the element type. If the length equals the internal capacity, a new block is allocated, the elements are copied into it, and the old block is abandoned. Then `x` is stored and the length rises by one.

R14. Growth rule. The new internal capacity is `max(4, 2 * old internal capacity)`, computed in 64 bits. "Old internal capacity" is a property of the implementation, not of the program. Nothing in Glyph text reads it. This is the only place the RFC mentions capacity, and no built-in or syntax reaches it. (This answers #32: the rule no longer calls a `cap()` built-in.)

R15. `len(a)` is pure and always defined.

R16. A built-in with no value, used as a value, is E0200 (RFC 0020 T4). Using a built-in name as a value, such as `let f = len`, is E0301 (RFC 0020 T7).

### Effects

R17. A function must declare `alloc` if its body contains any of these: `array(e1, ..., en)` with `n >= 1`; a copy (R19 or R20); a call to `push`; a call to a function that declares `alloc`. A missing `alloc` is E0621. Declaring `alloc` on a function that never allocates is allowed.

R18. Examples are not functions. RFC 0020 EX2 lets an example call any function without `io`, so an example may build arrays and call functions that declare `alloc`. E0621 does not apply to examples. `main` follows R17 like any other function.

### Copies and borrows

Each name owns its buffer. A parameter borrows its caller's buffer for the length of one call. Nothing in the callee can change the caller's buffer, because array parameters are read-only (R11).

R19. `let b = a`, `var b = a` and `b = a` copy when the right side is a name. A copy allocates a new block with capacity equal to the length, and copies every element.

R20. A name passed as a call argument is borrowed and not copied. Inside the callee an array parameter is read-only: `set` and `push` on it are E0303.

R21. `return a` copies when `a` is a name, whether it is a local or a parameter. The caller then owns a block that no other live name holds. This is one rule, and it costs one allocation. The move optimisation of earlier drafts is not included. A literal or call result is fresh and moves into its target with no copy.

Because R19 and R21 copy whenever a name is shared, no two live names share a block.

Reserved names: `array`, `len`, `get`, `set`, `push` and `Arr` are reserved, as RFC 0020 B5 and F6 reserve names. A function or binding with one of these names is E0300. This is R22.

### Memory

R23. The heap is a bump allocator over linear memory, placed after static data. Each allocation is rounded up to a multiple of 8 bytes. Nothing is freed. The heap is released when the run ends.

R24. The heap end may not exceed 4096 pages of 65536 bytes (256 MiB). An allocation that would pass this limit traps `out-of-memory`. A capacity computation that overflows 64 bits also traps `out-of-memory`.

R25. Each run starts with an empty heap. `glyphc check` runs each example as its own run (RFC 0020 EX3), so examples share no memory.

### Traps

RFC 0020 TR1 applies: the program writes `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Output written before the trap stays written. This RFC adds two kinds to TR1: `index-out-of-bounds` (R12) and `out-of-memory` (R24). The names follow the hyphenated style of TR1 and RFC 0024.

### Diagnostics

| Code | Meaning |
| --- | --- |
| E0620 | `array()` with no element type from a `let` or `var` annotation (R10) |
| E0621 | A function allocates, or calls an `alloc` function, without declaring `alloc` (R17) |

Other errors use existing codes: E0100 for grammar (R1, R5, R6), E0200 for type and arity errors (R4, R8, R9, R16), E0300 for a reserved name (R22), E0301 for a built-in used as a value (R16), and E0303 for mutation of a non-`var` name (R11, R20).

E0620 and E0621 are new. They are also the codes used by the rejected drafts 0022, 0023 and 0025. Those drafts were never adopted, so no accepted code is reused. Before merge, the check against `spec/errors.json` must confirm that both codes are absent there, because that file is not in this checkout.

### Example

```
fn squares(n: Int): Arr<Int> alloc {
  var a: Arr<Int> = array()
  var i = 0
  while i < n {
    push(a, i * i)
    i = i + 1
  }
  return a
}
example len(squares(3)) == 3
example get(squares(3), 2) == 4
```

`return a` copies (R21), so each example pays one copy. That is the cost of the simpler rule.

## Alternatives

- **Bracket syntax, `[T]` and `a[i]`.** Not chosen. It needs `[` and `]` as tokens, and RFC 0014 rule 11 makes them E0001. Adding them is a lexical amendment this draft does not make. A later RFC that adds brackets should replace `get`, `set` and `array`, not sit beside them, to keep principle 1.
- **`!alloc` and `!io`.** Not chosen. RFC 0014 removed `!`, and RFC 0020 uses the keyword `io`, so `alloc` follows that.
- **`alloc` as a keyword.** Not chosen. It would change RFC 0014 rule 7. The contextual word needs no lexical change.
- **Exposing capacity through `cap` or `reserve`.** Not included. No readiness need or conformance test shows one. Issue #32 is closed by leaving it out.
- **Move on return, and move-or-copy on assignment.** Not chosen. Draft 0025 had them. Each adds a case the reader must track, and copying is always correct.
- **Assignment context for `array()`.** Not chosen. It saves one annotation but adds a rule to R10.
- **`pop`.** Not included. The checklist does not need it, and it would add a trap kind. A later RFC can add it.
- **Shared handles (reference semantics).** Rejected. Writing through one name would change another with no sign at the use site, which breaks principle 2.
- **A generic `Array<T>`.** Rejected for this RFC. The type system's shape is open in the constitution. `Arr<T>` over three fixed element types needs no such decision.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator needs neither.

## Cost

Core spec adds: the `Arr<T>` type form and element rule (R1), the `alloc` effect word (R5), the built-in table (R7), the copy and borrow rules (R19 to R21), the memory rules (R23 to R25), two trap kinds and two diagnostic codes. Estimate: about 550 tokens. `spec/` is absent from this checkout, so the tokeniser has not measured this, and the 12,000-token cap is not checked here.

Spec card adds about 100 tokens: the type form with its three elements, the six built-in lines, the `alloc` word and the two trap kinds. It omits the copy rules, the layout table and the memory section. `spec/card.md` is absent from this checkout, so its size is not checked here.

Grammar adds two productions (`arr` and `elem`) and one optional `"alloc"` in `fn_decl`. It adds no token, keyword or punctuation.

Amendments to accepted RFCs, listed so the group can see each one:

- RFC 0020 T6 and F7: parameter and result types gain `Arr<Int>`, `Arr<Bool>` and `Arr<Byte>`.
- RFC 0020 T7: `Arr` is a type name, so using it as a value is E0301.
- RFC 0020 B5 and F6: `array`, `len`, `get`, `set`, `push` and `Arr` are reserved.
- RFC 0020 TR1: two trap kinds.
- RFC 0020 `fn_decl` and the effect slot: the `alloc` word after `io`.

Removes: nothing. No accepted construct covers arrays, so none is replaced. The designer rules ask each addition to name what it removes, and I have not found a removal that the checklist would not notice. The group should name one, or accept this as growth the checklist requires. Compared with draft 0025, this draft removes the assignment context for `array()` (R10), the move-on-return rule (R21) and the `Arr<Bool>` and `Arr<Byte>` built-in variants of the copy rules, which is a net reduction of about 100 tokens by my estimate. The estimate is unmeasured.

## Test plan

Run tests, in `conformance/arrays/`. Each states stdout and exit status.

- `arr-literal-len`: `let a = array(1, 2, 3)`; `print(len(a))` gives `3`; `print(get(a, 2))` gives `3`.
- `arr-empty-annot`: `var a: Arr<Int> = array()`; `print(len(a))` gives `0`; then `push(a, 5)` and `print(get(a, 0))` gives `5`.
- `arr-push-grow`: a loop pushes 100 values `i`; `print(len(a))` gives `100`; `print(get(a, 99))` gives `99`.
- `arr-set`: `var a = array(1, 2)`; `set(a, 1, 7)`; `print(get(a, 1))` gives `7`.
- `arr-bool`: `var f = array(true, false)`; `if get(f, 0) { print(1) }` gives `1`.
- `arr-byte`: `var b = array(byte(65), byte(66))`; the second element is read back with the conversion RFC 0024 defines and printed; output is `66`.
- `arr-copy-let`: `var a = array(1, 2)`; `let b = a`; `set(a, 0, 9)`; `print(get(b, 0))` gives `1`.
- `arr-copy-assign`: `var a = array(1)`; `var b = array(0)`; `b = a`; `push(a, 1)`; `print(len(b))` gives `1`.
- `arr-borrow-param`: `fn total(a: Arr<Int>): Int` returns `get(a, 0) + get(a, 1)`; the caller's array keeps its length after the call.
- `arr-return-copy`: `fn same(a: Arr<Int>): Arr<Int> alloc { return a }`; `var b = same(a)`; `set(b, 0, 5)`; `print(get(a, 0))` shows the original value.
- `arr-squares`: `main` prints `len(squares(3))` then `get(squares(3), 2)`; stdout `3` then `4`. Each statement is on its own line (RFC 0020 G7).
- `arr-check-examples`: `glyphc check` passes both examples of `squares`.
- `trap-index`: `get(a, 3)` on a length-3 array; stdout empty; stderr `trap: index-out-of-bounds`; status 1.
- `trap-set-negative`: `set(a, -1, 0)`; stderr `trap: index-out-of-bounds`; status 1.
- `trap-oom`: push loop builds an `Int` array of 1048576 elements, then `let b = a` repeats in a loop. Each copy takes 8 MiB, so the limit is passed after about 32 copies. Stderr `trap: out-of-memory`; status 1; well below the step limit of RFC 0020 TR3.

Compile-error tests, each stating the code and the span:

- `err-untyped-empty`: `let a = array()`, at `array`: E0620 (R10).
- `err-assign-empty`: `var a: Arr<Int> = array()` then `a = array()`, at the second `array`: E0620 (R10).
- `err-missing-alloc`: `fn f(): Int {`, then `let a = array(1)` and `return len(a)` on separate lines, then `}`; at `array`: E0621 (R17).
- `err-call-alloc`: a function without `alloc` calls `squares`, at the call: E0621 (R17).
- `err-push-let`: `let a = array(1)` then `push(a, 2)`, at `a`: E0303 (R11).
- `err-set-param`: `fn f(a: Arr<Int>) io { set(a, 0, 1) }`, at `a`: E0303 (R20 and R11).
- `err-elem-text`: `let a: Arr<Text> = array()`, at `Text`: E0100 (R1).
- `err-no-space`: `var a: Arr<Int>= array()`, at `>=`: E0100 (R6).
- `err-mixed`: `array(1, true)`, at `true`: E0200 (R9).
- `err-eq`: `if array(1) == array(1) { }`, at `==`: E0200 (R4).
- `err-alloc-order`: `fn f(): Int alloc io { return 1 }`, at `alloc`: E0100 (R5).
- `err-reserved`: `fn len(): Int { return 1 }`, at `len`: E0300 (R22).
- `err-builtin-value`: `let f = len`, at `len`: E0301 (R16).

## Open questions

1. **Amendments.** Cost lists five amendments to RFC 0020. The group should say whether they need a kernel revision before this RFC can be accepted. This draft assumes they do.
2. **Equality.** Arrays have no `==` (R4). A later RFC must decide whether arrays compare.
3. **Copy cost.** Implicit copies on `let`, assignment and `return` are the rule most likely to draw objections. The alternative is an explicit `copy(a)` with aliasing rejected by a diagnostic. Reviewers should say which they prefer before voting.
4. **Free list.** The benchmark that would justify one is a program that creates and drops arrays, with a live set under 16 MiB and total allocation over 256 MiB. No such benchmark exists yet.
5. **The 256 MiB limit.** Whether it is enough for milestone 1 is unknown until a benchmark runs.
6. **`alloc` and RFC 0007.** If RFC 0007 uses `alloc` for another effect, the two RFCs must agree on one effect word and one placement.
7. **Token cost of `Arr<T>`.** It is longer than `[T]`. The real cost should be measured once `spec/` exists.
