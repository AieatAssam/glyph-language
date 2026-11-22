---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: reject
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Growable arrays of Int and Byte, value semantics, one allocation word

Class: language
Slug: arrays-buffers-checklist
Status: draft
Author: designer-safe
Builds on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0024 (byte-type, accepted).
Replaces: nothing. Supersedes the direction of RFCs 0008, 0010, 0022, 0023, 0025, 0027, 0029 and 0032, all rejected. Their vote records give no reasons, so this draft does not claim to know which part failed. Section Alternatives says what differs from 0032, the closest rejected draft.

## Summary

Glyph gets one growable array type, `Arr<T>`, with `T` either `Int` or `Byte`. An array is made with the built-in `array`, read with `get`, written with `set`, grown with `push` and measured with `len`. The effect word `alloc` placed after `io` in a signature marks a function that allocates. Binding, assigning or returning a name copies its array, so no two live names share a buffer. Memory comes from one bump allocator with no free. A bad index and an exhausted heap are defined traps with exit status 1. Capacity is not visible to programs. No token, keyword or punctuation is added.

## Motivation

Readiness item `arrays-buffers` (spec section 9) asks for growable arrays and byte buffers. Stage 0 needs a growable token list and an output buffer for its WebAssembly encoder. The self-hosted compiler (M5) needs the same. RFC 0024 is accepted and gives `Byte`, so the byte-buffer half needs only `Arr<Byte>`.

This is a proposal grounded in open user issues, not in a benchmark. No benchmark finding this session concerns arrays.

- **#73 and #75.** The spec card has no source syntax, so no array form can be written from it. This draft gives the exact forms in Design and states what the card must gain (Cost).
- **#72.** `spec/errors.json` lacks codes that accepted RFCs already use. This draft adds two codes and requires the catalogue fix to land first or in the same change.
- **#32.** RFC 0010 says capacity is internal and then uses `cap()`. This draft exposes no capacity and names it only in the growth rule (R14).
- **#67.** The trap kinds are listed in several places. This draft gives the full list once (Traps).

Principles 2, 3 and 7 set the shape. Allocation appears in the signature (principle 3). Aliasing is local: a reader can tell from the text that no two live names share storage (principle 2). Every bad access has one defined result (principle 7).

**Roadmap condition.** `ROADMAP.md` says no new RFC is proposed until the first merge puts a compiler on `main`. Issue #74 says `check` still exits 2 with "no front end yet". The group should decide whether this draft is voted on now or held (Open questions 1).

## Design

Normative. "Must" and "is" bind implementers. Rule numbers with the prefix R are new in this RFC.

### Types and layout

R1. `Arr<T>` is a growable array. `T` is `Int` or `Byte`. Any other element type, including `Bool`, `Text` and another `Arr`, is E0200 at the element.

R2. Layout. An `Int` element is 8 bytes, signed 64-bit, little endian. A `Byte` element is 1 byte, unsigned, value 0 to 255, as RFC 0024 defines. A flag is stored as an `Int` holding 0 or 1.

R3. An array value holds a length and an internal capacity with `0 <= length <= capacity`. The capacity is not observable from Glyph text.

R4. An array may be bound, assigned, passed as an argument, and used as a parameter or result type. It may not be printed, compared with `==` or `!=`, ordered, or used where `Int`, `Byte` or `Text` is required. Each such use is E0200.

### Grammar

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "alloc" ] block NEWLINE { example NEWLINE }
ptype   = "Int" | "Byte" | arr
rtype   = "Int" | "Byte" | arr
type    = "Int" | "Byte" | "Text" | arr
arr     = "Arr" "<" elem ">"
elem    = "Int" | "Byte"
```

`Arr` and `alloc` are each an `IDENT` with that text. Neither is a keyword, so RFC 0014 rule 7 keeps its count of keywords. `Bool` is not an element type here (Alternatives).

R5. In a signature `io` comes before `alloc`, with nothing between them. `alloc` before `io` is E0100 at `alloc`. Either word may appear alone.

R6. `Arr<Int>=` with no space lexes as `Arr`, `<`, `Int`, `>=`, so the parser reports E0100 at `>=`. This follows from RFC 0014 and needs no new lexical rule.

### Built-in functions

R7. These are compiler intrinsics. They need no import. Their names are reserved (R22).

| Call | Type | Effect | Meaning |
| --- | --- | --- | --- |
| `array(e1, ..., en)`, `n >= 1` | `Arr<T>`, `T` the type of `e1` | `alloc` | New array holding the elements in order |
| `array()` | `Arr<T>`, `T` from the annotation (R10) | none | Empty array; allocates nothing |
| `len(a)` | `Int` | none | Number of elements |
| `get(a, i)` | `T` | none | Element at index `i`, or a trap |
| `set(a, i, x)` | statement | none | Writes element `i`, or a trap |
| `push(a, x)` | statement | `alloc` | Appends `x` |

R8. Each built-in is checked like a user function call (RFC 0020 E8). A wrong argument count or type is E0200.

R9. In `array(e1, ..., en)` every element has one type, and that type is `Int` or `Byte`. Otherwise E0200. A `Byte` element is written `byte(n)`.

R10. `array()` takes its element type only from the annotation of the `let` or `var` it initialises, as in `var a: Arr<Int> = array()`. Anywhere else, including the assignment `a = array()`, it is E0630 at `array`.

R11. In `set` and `push` the first argument must be a name declared with `var`. Any other form is E0303 at that argument (RFC 0020 B2).

R12. `get(a, i)` and `set(a, i, x)` evaluate their arguments left to right (RFC 0020 E10), then check `0 <= i < len(a)`. If the check fails the run traps `index-out-of-bounds`. Otherwise `get` returns the element and `set` stores `x`.

R13. `push(a, x)` evaluates `a` then `x`, and checks that `x` has the element type. If the length equals the internal capacity, a new block is allocated, the elements are copied into it, and the old block is abandoned. Then `x` is stored and the length rises by one.

R14. Growth rule. The new internal capacity is `max(4, 2 * old internal capacity)`, computed in 64 bits. This is the only place the RFC mentions capacity. No built-in or syntax reads it.

R15. `len(a)` is pure and always defined.

R16. A statement built-in used as a value is E0200 (RFC 0020 T4). A built-in name used as a value, such as `let f = len`, is E0301 (RFC 0020 T7).

### Effects

R17. A function must declare `alloc` if its body contains any of: `array(e1, ..., en)` with `n >= 1`; a copy (R19 or R21); a call to `push`; a call to a function that declares `alloc`. A missing `alloc` is E0631 at the allocating expression. Declaring `alloc` on a function that never allocates is allowed.

R18. Examples are not functions. RFC 0020 EX2 lets an example call any function without `io`, so an example may build arrays and call `alloc` functions. E0631 does not apply to examples. `main` follows R17 like any other function.

### Copies and borrows

Each name owns its buffer. A parameter borrows the caller's buffer for one call. Array parameters are read-only (R20), so no live mutable name shares a block.

R19. `let b = a`, `var b = a` and `b = a` copy when the right side is a name. A copy allocates a block with capacity equal to the length and copies every element.

R20. A name passed as a call argument is borrowed, not copied. Inside the callee an array parameter is read-only: `set` and `push` on it are E0303.

R21. `return a` copies when `a` is a name, whether a local or a parameter. A literal or call result is fresh and moves into its target without a copy.

R22. `array`, `len`, `get`, `set`, `push` and `Arr` are reserved (RFC 0020 B5 and F6). A function or binding with one of these names is E0300 at the name.

### Memory

R23. The heap is a bump allocator over linear memory, placed after static data and the trap page RFC 0020 uses. Each allocation is rounded up to a multiple of 8 bytes. Nothing is freed. The heap is released when the run ends.

R24. Total linear memory may not exceed 4096 pages of 65536 bytes (256 MiB). An allocation that would pass this limit traps `out-of-memory`. A capacity computation that overflows 64 bits also traps `out-of-memory`.

R25. Each run starts with an empty heap. `glyphc check` runs each example as its own run (RFC 0020 EX3), so examples share no memory.

### Traps

RFC 0020 TR1 applies: the program writes `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Output written before the trap stays written. This RFC adds two kinds, `index-out-of-bounds` (R12) and `out-of-memory` (R24). The full list of trap kinds is the list in RFC 0020 and RFC 0024 plus these two. Whether traps appear in signatures is open (#64, #68); this draft follows RFC 0020 TR1 and does not decide it.

### Diagnostics

| Code | Meaning |
| --- | --- |
| E0630 | `array()` with no element type from a `let` or `var` annotation (R10) |
| E0631 | A function allocates, or calls an `alloc` function, without declaring `alloc` (R17) |

Both codes are absent from `spec/errors.json` and from every file in `rfcs/`, as checked for this draft. Other errors use existing codes: E0100 for grammar (R1, R5, R6), E0200 for type and arity errors (R4, R8, R9, R16), E0300 for a reserved name (R22), E0301 for a built-in used as a value (R16), and E0303 for mutation of a non-`var` name (R11, R20). E0630 and E0631 must be added to `spec/errors.json`, with the codes that accepted RFCs use but the file lacks (#72), before this RFC merges.

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

`return a` copies (R21), so each example pays one copy.

## Alternatives

- **`Bool` elements.** Not chosen. A third layout and a third copy case add surface. An `Int` holding 0 or 1 covers flags. RFC 0032 made the same choice.
- **Assignment context for `array()`.** Not chosen. It saves one annotation and adds a case to R10. Versus 0032, which also rejects it, this draft keeps the same rule.
- **Explicit `copy(a)` with move on bind.** Not chosen here. It removes hidden copies, but a move rule needs use-after-move analysis, which is more machinery than the checklist needs. Open question 2 asks for a vote on it.
- **Bracket syntax, `[T]` and `a[i]`.** Not chosen. It needs `[` and `]` as tokens, and RFC 0014 rule 11 makes them E0001. A later RFC that adds brackets should replace `get`, `set` and `array`, not sit beside them (principle 1).
- **`!alloc` and `!io`.** Not chosen. RFC 0014 removed `!` and RFC 0020 uses the keyword `io`, so `alloc` follows that form (#36).
- **Exposing capacity through `cap` or `reserve`.** Not included. No readiness need or conformance test shows one (#32).
- **`pop`.** Not included. The checklist does not need it, and it would add a trap kind.
- **Shared handles (reference semantics).** Rejected. Writing through one name would change another with no sign at the use site, which breaks principle 2.
- **A generic `Array<T>`.** Rejected for this RFC. The type system's shape is open under the constitution, and `Arr<T>` over two fixed element types needs no such decision.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator need neither.

## Cost

Core spec adds: the `Arr<T>` type form and element rule (R1), the `alloc` effect word (R5), the built-in table (R7), the copy and borrow rules (R19 to R21), the memory rules (R23 to R25), two trap kinds and two diagnostic codes. Estimate: about 500 tokens. The protected tokeniser has not run on this draft, so the figure is unmeasured.

Spec card adds about 90 tokens: the type form with its two elements, the six built-in lines, the `alloc` word and the two new trap kinds. It omits the copy rules, the layout table and the memory section. This is the source syntax that #73 and #75 ask for. The card's current 2,000-token cap is not checked here.

Grammar adds two productions (`arr` and `elem`) and one optional `"alloc"` in `fn_decl`. It adds no token, keyword or punctuation.

Removes: nothing from the accepted spec, since no accepted construct covers arrays. The designer rules ask for a named removal. I have not found one that the checklist would notice. The group should name one, or accept this as growth the checklist requires.

Amendments to accepted RFCs:

- RFC 0020 T6 and F7: parameter and result types gain `Arr<Int>` and `Arr<Byte>`.
- RFC 0020 T7: `Arr` is a type name, so using it as a value is E0301.
- RFC 0020 B5 and F6: the six names in R22 are reserved.
- RFC 0020 TR1: two trap kinds.
- RFC 0020 `fn_decl` and the effect slot: the `alloc` word after `io`.

## Test plan

Run tests in `conformance/arrays/`. Each states stdout and exit status, and carries the `--- meta` block with `id`, `rfc` and `kind`.

Run tests:

- `arr-literal-len`: `let a = array(1, 2, 3)`; `print(len(a))` gives `3`; `print(get(a, 2))` gives `3`.
- `arr-empty-annot`: `var a: Arr<Int> = array()`; `print(len(a))` gives `0`; then `push(a, 5)` and `print(get(a, 0))` gives `5`.
- `arr-push-grow`: a loop pushes 100 values `i`; `print(len(a))` gives `100`; `print(get(a, 99))` gives `99`.
- `arr-set`: `var a = array(1, 2)`; `set(a, 1, 7)`; `print(get(a, 1))` gives `7`.
- `arr-byte`: `var b = array(byte(65), byte(66))`; `print(int(get(b, 1)))` gives `66`.
- `arr-copy-let`: `var a = array(1, 2)`; `let b = a`; `set(a, 0, 9)`; `print(get(b, 0))` gives `1`.
- `arr-copy-assign`: `var a = array(1)`; `var b = array(0)`; `b = a`; `push(a, 1)`; `print(len(b))` gives `1`.
- `arr-borrow-param`: `fn total(a: Arr<Int>): Int` returns `get(a, 0) + get(a, 1)`; the caller's array keeps its length after the call.
- `arr-return-copy`: `fn same(a: Arr<Int>): Arr<Int> alloc { return a }`; `var b = same(a)`; `set(b, 0, 5)`; `print(get(a, 0))` shows the original value.
- `arr-squares`: `main` prints `len(squares(3))` then `get(squares(3), 2)`; stdout `3` then `4`, one per line.
- `arr-check-examples`: `glyphc check` passes both examples of `squares`.
- `trap-index`: `get(a, 3)` on a length-3 array; stdout empty; stderr `trap: index-out-of-bounds`; status 1.
- `trap-set-negative`: `set(a, -1, 0)`; stderr `trap: index-out-of-bounds`; status 1.
- `trap-after-output`: `print(1)`, then `get(a, 3)` on a length-3 array; stdout `1`; stderr `trap: index-out-of-bounds`; status 1.
- `trap-oom`: a push loop builds an `Int` array of 1048576 elements, then a loop of 100 iterations does `let b = a` and nothing else. Nothing is printed in either loop; `print(1)` follows. Stdout empty; stderr `trap: out-of-memory`; status 1. The test does not depend on the exact iteration where the limit falls.

Compile-error tests, each stating the code and the span:

- `err-untyped-empty`: `let a = array()`, at `array`: E0630 (R10).
- `err-assign-empty`: `var a: Arr<Int> = array()` then `a = array()`, at the second `array`: E0630 (R10).
- `err-missing-alloc`: `fn f(): Int {`, then `let a = array(1)` and `return len(a)` on separate lines, then `}`; at `array`: E0631 (R17).
- `err-call-alloc`: a function without `alloc` calls `squares`, at the call: E0631 (R17).
- `err-push-let`: `let a = array(1)` then `push(a, 2)`, at `a`: E0303 (R11).
- `err-set-param`: `fn f(a: Arr<Int>) io { set(a, 0, 1) }`, at `a`: E0303 (R20, R11).
- `err-elem-bool`: `let a: Arr<Bool> = array()`, at `Bool`: E0200 (R1).
- `err-elem-text`: `let a: Arr<Text> = array()`, at `Text`: E0200 (R1).
- `err-no-space`: `var a: Arr<Int>= array()`, at `>=`: E0100 (R6).
- `err-mixed`: `array(1, true)`, at `true`: E0200 (R9).
- `err-eq`: `if array(1) == array(1) { }`, at `==`: E0200 (R4).
- `err-alloc-order`: `fn f(): Int alloc io { return 1 }`, at `alloc`: E0100 (R5).
- `err-reserved`: `fn len(): Int { return 1 }`, at `len`: E0300 (R22).
- `err-builtin-value`: `let f = len`, at `len`: E0301 (R16).

Each code in this draft has at least one test: E0100, E0200, E0300, E0301, E0303, E0630, E0631. The example run of `squares` without `alloc` on `main` covers R18.

## Open questions

1. **Roadmap condition.** See Motivation. The group should confirm whether this RFC may be voted on before a compiler is on `main`.
2. **Copy cost.** Implicit copies on `let`, assignment and `return` are the rule most likely to draw objections. The alternative is an explicit `copy(a)` with aliasing rejected by a diagnostic. Reviewers should say which they prefer before voting.
3. **Equality.** Arrays have no `==` (R4). A later RFC must decide whether arrays compare.
4. **Traps in signatures.** Issues #64 and #68 are open. If the group decides traps belong in signatures, R12 and R24 each gain a mark and the grammar changes.
5. **Free list.** The benchmark that would justify one is a program that creates and drops arrays, with a live set under 16 MiB and total allocation over 256 MiB. No such benchmark exists yet.
6. **The 256 MiB limit.** Whether it is enough for milestone 1 is unknown until a benchmark runs.
7. **`alloc` and RFC 0007.** If RFC 0007 uses `alloc` for another effect, the two RFCs must agree on one effect word and one placement.
