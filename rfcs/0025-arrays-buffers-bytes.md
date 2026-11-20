---
status: draft
votes: {}
---
# RFC draft: Growable arrays of Int, Bool and Byte

Class: language
Slug: arrays-buffers-bytes
Status: draft
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted).
Replaces: nothing. Does not revive RFCs 0008, 0010, 0022 or 0023. Those drafts were rejected, and their rejection notes do not say why, so this draft does not assume the reasons.

## Summary

Glyph gets one growable array type, `Arr<T>`, where `T` is `Int`, `Bool` or `Byte`. An array is made with the built-in `array`, read with `get`, written with `set`, grown with `push` and measured with `len`. An effect word `alloc` placed after `io` in a signature marks any function that allocates. Arrays have value semantics: every name owns its buffer, and each copy is named by a rule. Memory comes from one bump allocator with no free. A bad index and an exhausted heap are defined traps with exit status 1. Capacity is not visible to programs. The syntax adds no token and no keyword.

## Motivation

Readiness item `arrays-buffers` (`docs/SPEC.md`, section 9) asks for "growable arrays and byte buffers". Stage 0 needs a growable token list and an output buffer for its WebAssembly encoder. The self-hosted port (M5) needs the same. RFC 0024 is now accepted and gives the `Byte` element type, so the byte-buffer half of the item can be decided here for the first time. Earlier array drafts were written before `Byte` was settled and did not cover it.

Three open user issues fix the surface of this draft:

- **#32.** RFC 0010 says capacity is internal and then uses `cap()` in its growth rule. This draft exposes no capacity. No built-in returns it, and the growth rule says only "the internal capacity".
- **#31.** Type mismatch has two codes in the drafts. RFC 0020 (accepted) uses E0200 for every type mismatch, and this draft uses E0200 and introduces no E0102.
- **#36.** The effect marker is written `!io` in some drafts and `io` in others. RFC 0020 uses the keyword `io` after the result clause. This draft writes `alloc` in the same slot, with no `!`.

Principles 2, 3 and 7 set the shape. Allocation must appear in the signature (principle 3). Aliasing must be local, so a reader can tell from a function's text whether two names share storage (principle 2). Every bad access must have one defined result (principle 7). Growth must stay within the 12,000-token core cap, so the element set is kept to the three types the checklist already names.

## Design

Normative. "Must" and "is" bind implementers. Rule numbers with the prefix A are new in this RFC.

### Types and layout

A1. `Arr<T>` is a growable array. `T` is `Int`, `Bool` or `Byte`. Any other element type, such as `Text`, is E0100 at the element.

A2. Layout. An `Int` element is 8 bytes, signed 64-bit, little endian. A `Bool` element is 1 byte: `0` for false, `1` for true. A `Byte` element is 1 byte, unsigned.

A3. An array value holds a length and a capacity, with `0 <= length <= capacity`. No program can read the capacity. No built-in in this RFC returns it.

A4. An array may be bound, assigned, passed as an argument, returned, and used as a parameter or result type. It may not be printed, compared with `==` or `!=`, or used where `Int`, `Bool`, `Byte` or `Text` is required. Each such use is E0200.

### Grammar

This RFC adds an array type and one effect word. It adds no token, no keyword and no punctuation.

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "alloc" ] block NEWLINE { example NEWLINE }
ptype   = "Int" | "Bool" | "Byte" | arr
rtype   = "Int" | "Bool" | "Byte" | arr
type    = "Int" | "Bool" | "Byte" | "Text" | arr
arr     = "Arr" "<" elem ">"
elem    = "Int" | "Bool" | "Byte"
```

`"Arr"` and `"alloc"` each mean an `IDENT` with that text. Neither is a keyword, so neither joins RFC 0014's keyword set.

A5. In a signature, `io` comes before `alloc`, with nothing between them. Writing `alloc` before `io` is E0100 at `alloc`. Either word may appear alone.

A6. Lexing note. `Arr<Int>=` with no space lexes as `Arr`, `<`, `Int`, `>=`, so the parser reports E0100 at `>=`. Write a space before `=` in a binding annotation, as in `var a: Arr<Int> = array()`.

A7. Statements do not change. `push(a, x)` and `set(a, i, x)` are call statements, which RFC 0020 already allows.

### Built-in functions

A8. These are compiler intrinsics. They need no import. Their names are reserved (A26).

| Call | Type | Effect | Meaning |
| --- | --- | --- | --- |
| `array(e1, ..., en)`, `n >= 1` | `Arr<T>`, `T` the type of `e1` | `alloc` | New array holding the elements in order |
| `array()` | `Arr<T>`, `T` from context | none | Empty array; allocates nothing |
| `len(a)` | `Int` | none | Number of elements |
| `get(a, i)` | `T` | none | Element at index `i`, or a trap |
| `set(a, i, x)` | no value (statement) | none | Writes element `i`, or a trap |
| `push(a, x)` | no value (statement) | `alloc` | Appends `x` |

A9. Each built-in is checked like a user function call (RFC 0020 E8). A wrong argument count or type is E0200.

A10. In `array(e1, ..., en)` every element must have the same type, and that type must be `Int`, `Bool` or `Byte`. Otherwise E0200.

A11. In `array()` the element type comes from context. The context is the annotation of a `let` or `var`, or the type of the target of an assignment. With no such context, `array()` is E0600. `array()` never allocates.

A12. In `set` and `push` the first argument must be a name declared with `var`. Any other form, including a `let` name, a parameter name, a literal or a call, is E0303 at that argument (RFC 0020 B2).

A13. `get(a, i)` and `set(a, i, x)` evaluate their arguments left to right (RFC 0020 E10). They then check `0 <= i < len(a)`. If the check fails, the run traps `index-out-of-bounds`. Otherwise `get` returns the element, and `set` stores `x`.

A14. `push(a, x)` evaluates `a` and `x` left to right and checks that `x` has the element type. If `len(a)` equals the capacity, a new block is allocated with capacity `max(4, 2 * capacity)`, computed in 64 bits, and the elements are copied into it; the old block is abandoned. Then `x` is stored and the length rises by one.

A15. `len(a)` is pure and always defined.

A16. A built-in with no value, used as a value, is E0200 (RFC 0020 T4). Using a built-in name as a value, such as `let f = len`, is E0301 (RFC 0020 T7 and F6).

### Effects

A17. A function must declare `alloc` if its body contains any of these: `array(e1, ..., en)` with `n >= 1`; a copy (A19 or A21); a call to `push`; a call to a function that declares `alloc`. A missing `alloc` is E0601. Declaring `alloc` on a function that never allocates is allowed.

A18. Examples are not functions, and RFC 0020 EX2 lets an example call any function without `io`. So an example may build arrays and call functions that declare `alloc`. E0601 does not apply to examples. `main` follows A17 like any other function.

### Copies and borrows

Every name owns its buffer. A parameter borrows its caller's buffer for the length of one call. No function runs while its caller is suspended in a way that could change the buffer, so a borrowed buffer cannot change during the call.

A19. `let b = a`, `var b = a` and `b = a` copy when the right side is a name. A copy allocates a new block with capacity equal to the length, and copies every element.

A20. Passing a name as a call argument borrows it and makes no copy. Inside the callee an array parameter is read-only: `set` and `push` on it are E0303 under A12.

A21. `return a` where `a` is a local binding, declared with `let` or `var` in the function, moves the buffer to the caller, and the local ends. `return a` where `a` is a parameter copies it, because the caller still owns its buffer.

A22. A literal or a call result is fresh. It moves into its target with no copy.

Because A19 and A21 copy whenever a name is shared, no two live names ever share a block.

### Memory

A23. The heap is a bump allocator over linear memory, placed after static data. Each allocation is rounded up to a multiple of 8 bytes. Nothing is freed. The heap is released when the run ends.

A24. The heap end may not exceed 4096 pages of 65536 bytes, which is 256 MiB. An allocation that would move the heap end past that limit traps `out-of-memory`. A capacity computation that overflows 64 bits also traps `out-of-memory`.

A25. Each run starts with an empty heap. `glyphc check` runs each example as its own run (RFC 0020 EX3), so examples share no memory.

A26. Reserved names. `array`, `len`, `get`, `set`, `push` and `Arr` are reserved as RFC 0020 B5 and F6 reserve names. A function or binding with one of these names is E0300.

### Traps

RFC 0020 TR1 applies: the program writes `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, and output written before the trap stays written. This RFC adds two kinds to TR1:

- `index-out-of-bounds` (A13);
- `out-of-memory` (A24).

### Diagnostics

| Code | Meaning |
| --- | --- |
| E0600 | `array()` with no element type known from context (A11) |
| E0601 | A function allocates, or calls an `alloc` function, without declaring `alloc` (A17) |

Other errors use codes that already exist: E0100 for grammar (A1, A5, A6), E0200 for types and arity (A4, A9, A10, A16), E0300 for a reserved name (A26), E0301 for a built-in used as a value (A16) and E0303 for mutation of a non-`var` name (A12). E0600 and E0601 are not used by any RFC in `rfcs/`, so both are new. The check against `spec/errors.json` has to be run when that file exists, because it is not in this checkout.

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

`return a` moves the local `a` (A21), so no copy is made. Each example calls `squares`, which declares `alloc`, and A18 allows that.

## Alternatives

- **Bracket syntax, `[T]` and `a[i]`.** Not chosen. These need `[` and `]` as tokens, and RFC 0014 rule 11 makes them E0001. Adding them is a lexical amendment that this draft does not make. If a later RFC adds brackets, it should replace `get`, `set` and `array`, not sit beside them, to keep principle 1.
- **`!alloc` and `!io`.** Not chosen. RFC 0014 removed `!`, and RFC 0020 uses the keyword `io`.
- **`alloc` as a keyword.** Not chosen for now. It would change RFC 0014 rule 7, which says exactly fourteen keywords. The contextual word needs no lexical change.
- **Exposing capacity through `cap` or `reserve`.** Not included. No readiness need is shown, and issue #32 is closed by leaving it out.
- **`pop`.** Not included. The checklist does not need it, and it would add a trap kind. A later RFC can add it.
- **Shared handles (reference semantics).** Rejected. Writing through one name would change another with no sign at the use site, which breaks principle 2.
- **Copy on every call.** Rejected. Every call with an array argument would allocate. Borrowed parameters (A20) avoid this.
- **A generic `Array<T>`.** Rejected for this RFC. The type system's shape is open in the constitution. `Arr<T>` over three fixed element types needs no such decision.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator needs neither.

## Cost

Core spec adds: the `Arr<T>` type form and element rule (A1), the `alloc` effect word (A5), the built-in table (A8), the copy and borrow rules (A19 to A22), the memory rules (A23 to A25), two trap kinds and two diagnostic codes. Estimate: about 650 tokens. `spec/` is absent from this checkout, so the tokeniser has not measured this figure, and the 12,000-token cap is not checked here.

Spec card adds about 110 tokens: the type form with its three elements, the six built-in lines, the `alloc` word and the two trap kinds. It omits the copy rules, the layout table and the memory section. `spec/card.md` is not in this checkout, so its size is not checked here.

Grammar adds two productions (`arr` and `elem`) and one optional `"alloc"` in `fn_decl`. It adds no token, keyword or punctuation.

Amendments to accepted RFCs, listed so the group can see each one:

- RFC 0020 T6 and F7: parameter and result types gain `Arr<Int>`, `Arr<Bool>` and `Arr<Byte>`.
- RFC 0020 T7: `Arr` is a type name, so using it as a value is E0301.
- RFC 0020 B5 and F6: `array`, `len`, `get`, `set`, `push` and `Arr` are reserved.
- RFC 0020 TR1: two trap kinds, `index-out-of-bounds` and `out-of-memory`.
- RFC 0020 `fn_decl` and the effect slot: the `alloc` word after `io`.

Removes: nothing. No accepted construct covers arrays, so none is replaced. The designer rules ask every addition to name what it removes, and I have not found a removal. The group should name one, or accept this as growth that the checklist requires.

## Test plan

Run tests, in `conformance/arrays/`. Each states stdout, stderr and exit status.

- `arr-params`: `fn first(a: Arr<Int>): Int { return get(a, 0) }`, called on `array(7, 8)`; stdout `7`, status 0.
- `array-literal`: `let a = array(1, 2, 3)`; `print(len(a))` gives `3`, and `print(get(a, 2))` gives `3`.
- `array-empty-context`: `var a: Arr<Int> = array()`, then `print(len(a))` gives `0`; then `push(a, 5)` and `print(get(a, 0))` gives `5`.
- `push-grow`: a loop pushes 100 values `i`; `print(len(a))` gives `100`, and `print(get(a, 99))` gives `99`.
- `set-write`: `var a = array(1, 2)`, `set(a, 1, 7)`, `print(get(a, 1))` gives `7`.
- `bool-array`: `var f = array(true, false)`; `if get(f, 0) { print(1) }` gives `1`.
- `byte-array`: `var b = array(byte(65), byte(66))`, then `print(int(get(b, 1)))` gives `66`. Uses RFC 0024 `byte` and `int`.
- `copy-on-let`: `var a = array(1, 2)`, `let b = a`, `set(a, 0, 9)`, `print(get(b, 0))` gives `1`.
- `copy-on-assign`: `var a = array(1)`, `var b = array(0)`, `b = a`, `push(a, 1)`, `print(len(b))` gives `1`.
- `borrow-param`: `fn total(a: Arr<Int>): Int` returns `get(a, 0) + get(a, 1)`; the caller's array keeps its length after the call.
- `return-move`: the example program above, with `fn main() io` whose body is two lines, `print(len(squares(3)))` and `print(get(squares(3), 2))`; stdout `3` then `4`. Each statement is on its own line, since RFC 0020 G7 forbids two statements on one line.
- `return-param-copy`: `fn same(a: Arr<Int>): Arr<Int> alloc { return a }`; `var b = same(a)`, then `set(b, 0, 5)`; `print(get(a, 0))` shows the original value.
- `check-examples`: `glyphc check` passes both examples of `squares`.
- `trap-index`: `get(a, 3)` on a length-3 array; stdout empty, stderr `trap: index-out-of-bounds`, status 1.
- `trap-set-negative`: `set(a, -1, 0)`; stderr `trap: index-out-of-bounds`, status 1.
- `trap-oom`: build an `Int` array of 1048576 elements with a push loop, then in a loop `let b = a` repeatedly. Each copy takes 8 MiB, so the heap limit is passed after about 32 copies. Stderr `trap: out-of-memory`, status 1, well below the step limit of RFC 0020 TR3.

Compile-error tests, each stating the code and the span:

- `err-untyped-empty`: `let a = array()`, at `array`: E0600 (A11).
- `err-missing-alloc`: `fn f(): Int {`, then `let a = array(1)` and `return len(a)` on separate lines, then `}`; at `array`: E0601 (A17).
- `err-call-alloc`: a function with no `alloc` calls `squares`, at the call: E0601 (A17).
- `err-push-let`: `let a = array(1)` then `push(a, 2)`, at `a`: E0303 (A12).
- `err-set-param`: `fn f(a: Arr<Int>) io { set(a, 0, 1) }`, at `a`: E0303 (A20 and A12).
- `err-elem-text`: `let a: Arr<Text> = array()`, at `Text`: E0100 (A1).
- `err-no-space`: `var a: Arr<Int>= array()`, at `>=`: E0100 (A6).
- `err-get-type`: `get(1, 0)`, at `get`: E0200 (A9).
- `err-push-value`: `let x = push(a, 1)`, at `push`: E0200 (A16).
- `err-mixed`: `array(1, true)`, at `true`: E0200 (A10).
- `err-eq`: `if array(1) == array(1) { }`, at `==`: E0200 (A4).
- `err-print-array`: `print(array(1))`, at the argument: E0200 (A4).
- `err-alloc-order`: `fn f(): Int alloc io { return 1 }`, at `alloc`: E0100 (A5).
- `err-reserved`: `fn len(): Int { return 1 }`, at `len`: E0300 (A26).
- `err-builtin-value`: `let f = len`, at `len`: E0301 (A16).

## Open questions

1. **Amendments to accepted RFCs.** Cost lists five amendments to RFC 0020. The group should say whether they need a kernel revision before this RFC can be accepted. This draft is written as if they do.
2. **Equality.** This draft gives arrays no `==` (A4). A later RFC must decide whether arrays compare.
3. **Brackets.** The `Arr<T>` form is longer in tokens than `[T]`. The real token cost should be measured once `spec/` exists. Brackets need a lexical amendment before they can be used.
4. **Free list.** The benchmark that would justify one is a program that creates and drops arrays with a live set under 16 MiB and total allocation over 256 MiB, which traps `out-of-memory` under the bump allocator. No such benchmark exists yet. Abandoned blocks count toward total allocation, so growing to `n` elements allocates about `2n` elements in total.
5. **The 256 MiB limit.** Whether it is enough for milestone 1 is unknown until a benchmark runs.
6. **`alloc` and RFC 0007.** If RFC 0007 uses `alloc` as an effect name, the two RFCs must agree on one effect word and one placement.
7. **Copy cost.** Implicit copies on `let` and assignment are the rule most likely to draw objections. The alternative is explicit `copy(a)` with aliasing rejected by a diagnostic. Reviewers should say which they prefer before voting.
