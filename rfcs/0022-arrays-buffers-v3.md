---
status: draft
---
# RFC draft: Arrays of Int and Bool on existing tokens

Class: language
Slug: arrays-buffers-v3
Status: draft
Extends: RFC 0020 (kernel-v8, accepted) by new rules only, listed in Cost. Uses RFC 0014 (lexical-syntax-v3, accepted) without change. Does not amend rejected drafts 0008 and 0010.

## Summary

Glyph gets one growable array type, `Arr<T>`, where `T` is `Int` or `Bool`. Arrays are built with the built-in `array`, read with `get`, written with `set`, grown with `push` and measured with `len`. Allocation appears in signatures through the effect word `alloc`, which sits in the existing effect slot after `io`. Arrays have value semantics: each name owns its buffer, and every copy is named by a rule. Memory comes from one bump allocator with no free. A bad index and an exhausted heap are defined traps with exit status 1. The syntax needs no new token and no new keyword.

## Motivation

Readiness item `arrays-buffers` (`docs/SPEC.md`, section 9) asks for growable arrays and byte buffers. Stage 0 needs a growable token list, and the self-hosted port (M5) needs an output buffer. This draft covers arrays of `Int` and `Bool`. Byte buffers wait for a `Byte` element from RFC 0009, so the checklist item stays open until that is decided.

Open user issue #32 says RFC 0010 calls capacity internal and then uses `cap()` in its rule 9. This draft removes the conflict by exposing no capacity at all. The growth rule speaks of "the internal capacity", and no rule names a built-in that reads it.

Checking RFC 0010 against the accepted RFCs, which is my own check and not an open issue, found four clashes that a new draft has to avoid:

- It writes `!alloc` and `!io`. RFC 0014 removed `!`, and RFC 0020 uses the keyword `io`.
- It writes `[T]` and `a[i]`, which need the tokens `[` and `]`. RFC 0014 rule 10 has neither.
- Its traps exit with status 3. RFC 0020 TR1 says status 1.
- It uses E0104 for mutation of a non-`var` name. In RFC 0020 that is E0303.

Principles 2, 3 and 7 set the shape. Allocation must appear in the signature (principle 3). Aliasing must be local (principle 2). Every bad access must have one defined result (principle 7). Rejected drafts 0008 and 0010 gave no reasons, so this draft does not assume what they were.

## Design

Normative. "Must" and "is" bind implementers.

### Types

AR1. `Arr<T>` is a growable array. `T` is `Int` or `Bool`. The grammar accepts no other element type, so `Arr<Text>` is E0100.

AR2. Layout: an `Int` element is 8 bytes, signed 64-bit, little endian. A `Bool` element is 1 byte, `0` or `1`.

AR3. An array value holds a length and an internal capacity, with `0 <= len <= capacity`. No program can read the capacity.

AR4. An array may be bound, assigned, passed as an argument, returned or used as a parameter or result type. It may not be printed, compared with `==` or `!=`, or used as `Text`. Each such use is E0200.

### Grammar

This RFC adds an array type and one effect word. It adds no token and no keyword.

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "alloc" ] block NEWLINE { example NEWLINE }
type    = "Int" | "Bool" | "Text" | arr
ptype   = "Int" | "Bool" | arr
rtype   = "Int" | "Bool" | arr
arr     = "Arr" "<" elem ">"
elem    = "Int" | "Bool"
```

Here `"Arr"` and `"alloc"` mean an `IDENT` with that text, as RFC 0020 L1 reads `"Int"`. Neither is a keyword, so neither is listed in RFC 0014's keyword set.

AR5. `io` comes before `alloc`, with nothing between them. Any other order, including `alloc io`, is E0100.

AR6. Statements do not change. `push(a, x)` and `set(a, i, x)` are `call` statements, as RFC 0020 already allows.

### Built-in functions

AR7. These are compiler intrinsics. They need no import and cannot be user-defined.

| Call | Type | Effect | Meaning |
| --- | --- | --- | --- |
| `array(e1, ..., en)`, `n >= 1` | `Arr<T>`, `T` the type of `e1` | `alloc` | New array holding the elements in order |
| `array()` | `Arr<T>`, `T` from context | none | Empty array, no allocation |
| `len(a)` | `Int` | none | Number of elements |
| `get(a, i)` | `T` | none | Element at `i`, or a trap |
| `set(a, i, x)` | none (statement) | none | Writes element `i`, or a trap |
| `push(a, x)` | none (statement) | `alloc` | Appends `x` |

AR8. Each built-in is checked like a user function call (RFC 0020 E8). A wrong argument count or type is E0200.

AR9. In `array(e1, ..., en)` every element must have the same type. Otherwise E0200.

AR10. In `array()` the type comes from the nearest context: the annotation of a `let` or `var`, the target of an assignment, a parameter type, or a result type. With no known type it is E0600. `array()` never allocates.

AR11. In `set` and `push` the first argument must be a name bound by `var`. Any other form, including a `let` name, a parameter name, a literal or a call, is E0303.

AR12. `get(a, i)` and `set(a, i, x)` evaluate their arguments left to right. Then they check `0 <= i < len(a)`. If the check fails, the program traps `index out of bounds`. Otherwise `get` returns the element, and `set` stores `x`.

AR13. `push(a, x)` checks that `x` has type `T`. If `len(a)` equals the internal capacity, a new block is allocated with capacity `max(4, 2 * capacity)`, computed in 64 bits. The elements are copied and the old block is abandoned. Then `x` is stored and the length rises by one.

AR14. `len(a)` is pure and always defined.

AR15. A built-in with no result, used as a value, is E0200 (RFC 0020 T5). Using a built-in name as a value, such as `let f = len`, is E0301.

### Effects

AR16. A function must declare `alloc` if its body contains any of these: `array(e1, ..., en)` with `n >= 1`; a copy (AR18 or AR20); a call to `push`; a call to a function that declares `alloc`. A missing `alloc` is E0601. Declaring `alloc` on a function that never allocates is allowed.

AR17. `main` may declare `io` and `alloc` in either combination that AR5 allows. Examples are not functions. An example may build arrays and call functions that declare `alloc`. E0601 does not apply to examples.

### Copies and borrows

Every name owns its buffer. A parameter borrows its caller's buffer for the length of one call.

AR18. `let b = a`, `var b = a` and `b = a` copy when the right side is a name. A copy allocates a new block with capacity equal to the length, and copies every element.

AR19. Passing a name as a call argument borrows it. No copy is made. Inside the callee an array parameter is read-only: `set` and `push` on it are E0303 under AR11.

AR20. Returning a local name moves its buffer to the caller, and the local ends. Returning a parameter name copies it, because the caller still owns its buffer.

AR21. A literal or a call result is fresh. It moves into its target with no copy.

Because AR18 and AR20 copy whenever a name is shared, no two live names ever share a block.

### Memory

AR22. The heap is a bump allocator over linear memory, placed after static data. Each allocation is rounded up to a multiple of 8 bytes. Nothing is freed, and the heap is released when the program exits.

AR23. The module declares a linear memory maximum of 4096 pages (256 MiB). An allocation that would pass this limit, or that the host refuses, traps `out of memory`. A capacity computation that overflows 64 bits also traps `out of memory`.

AR24. No free list and no arena is part of this RFC. See Open questions for the benchmark that would justify a free list.

### Traps

RFC 0020 TR1 applies: the program writes `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. This RFC adds two kinds to TR1:

- `index out of bounds` (AR12);
- `out of memory` (AR23).

### Diagnostics

| Code | Meaning |
| --- | --- |
| E0600 | `array()` with no element type known from context (AR10) |
| E0601 | A function allocates, or calls an `alloc` function, without declaring `alloc` (AR16) |

Other errors use codes that already exist: E0100 for grammar, E0200 for types and arity, E0300 for a reserved name, E0301 for a built-in name used as a value and E0303 for mutation of a non-`var` name. No code in the E06xx range is used by any RFC in `rfcs/`, so E0600 and E0601 are new.

### Reserved names

AR25. `array`, `len`, `get`, `set`, `push` and `Arr` are reserved as in RFC 0020 B5 and F6. A function or binding with one of these names is E0300. `alloc` is not reserved, because it is not a keyword: it is read as an effect word only in the effect slot (AR5), and a binding or function may use the name `alloc` elsewhere.

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

`return a` moves the local `a` (AR20), so no copy is made. Each example calls `squares`, which declares `alloc`. That is allowed (AR17).

## Alternatives

- **`[T]`, `a[i]` and `[e1, e2]` (RFC 0008 and RFC 0010).** Rejected for this RFC. These forms need `[` and `]` as tokens, and RFC 0014 has neither. Adding them is a lexical amendment that this draft does not make. If the group later accepts brackets, the bracket forms should replace `get`, `set` and `array`, not sit beside them, to keep principle 1.
- **`!alloc` and `!io` (RFC 0010).** Rejected. RFC 0014 removed `!`.
- **A new keyword `alloc`.** Rejected for now. It changes RFC 0014's fourteen-word keyword set. The contextual word needs no lexical change.
- **`cap` and `reserve` built-ins.** Not included. Capacity is internal (AR3), and no readiness need is shown for it.
- **`pop` built-in.** Not included. The checklist item does not need it, and it would add a trap kind. A later RFC can add it.
- **Shared handles (reference semantics).** Rejected. Writing one name would change another with no sign at the use site, which breaks principle 2.
- **Copy on every call.** Rejected. Every call with an array argument would allocate. Borrowed parameters (AR19) avoid this.
- **A generic `Array<T>`.** Rejected for this RFC. The type system's shape is open in the constitution, and `Arr<T>` with two fixed elements needs no such decision.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Value semantics with a bump allocator needs neither.

## Cost

Spec core adds: the `Arr<T>` type form and its element rule (AR1), six built-in rows (AR7), the `alloc` effect word (AR5), the copy and borrow rules (AR18 to AR21), the memory rules (AR22 to AR23), two trap kinds and two diagnostic codes. Estimate: about 700 tokens. `spec/` is absent from this checkout, so the tokeniser has not measured the figure, and the 12,000-token cap is not checked.

Spec card adds about 120 tokens: the type form, the six built-in lines, the `alloc` word, and the two trap kinds. It omits the copy rules, the layout table and the memory section.

Grammar adds two productions (`arr` and `elem`) and one optional `alloc` in `fn_decl`. It adds no token, no keyword and no punctuation.

Removes: nothing. No existing construct covers arrays, so none is replaced. The designer rules ask every addition to name what it removes, and I have not found a removal for arrays. The group should name one, or accept this as growth the checklist requires.

Extends RFC 0020 by new rules, without editing its sentences: `Arr` is a type name (T7, B5); `Arr<T>` is a parameter and result type (T6); `alloc` is an effect word (grammar); two trap kinds (TR1); and new reserved names (B5, F6). RFC 0020 is accepted. If the group reads these as amendments that need a new kernel revision, this RFC cannot be accepted until that revision is decided.

## Test plan

Run tests, in `conformance/arrays/`:

- `arr-type-params`: `fn first(a: Arr<Int>): Int { return get(a, 0) }` called on `array(7, 8)`; prints `7`.
- `array-literal`: `array(1, 2, 3)` has length 3, and `get(a, 2)` is 3.
- `array-empty-context`: `var a: Arr<Int> = array()`, then `len(a)` is 0, then `push(a, 5)` and `get(a, 0)` prints `5`.
- `push-grow`: pushes 100 values; `len` is 100 and `get(a, 99)` is 99.
- `set-write`: `var a = array(1, 2)`, `set(a, 1, 7)`, prints `7`.
- `copy-on-let`: `var a = array(1, 2)`, `let b = a`, `set(a, 0, 9)`, prints `1` from `get(b, 0)`.
- `copy-on-assign`: `var b = array(0)`, `b = a`, `push(a, 1)`; `len(b)` is 1.
- `borrow-param`: `fn total(a: Arr<Int>): Int` returns `get(a, 0) + get(a, 1)`; the caller's array is unchanged after the call.
- `return-move`: the example program above, run with `print(len(squares(3)))` and `print(get(squares(3), 2))`; prints `3` and `4`.
- `return-param-copy`: `fn same(a: Arr<Int>): Arr<Int> alloc { return a }`; `var b = same(a)`, then `set(b, 0, 5)`; `get(a, 0)` is unchanged.
- `bool-array`: `var f = array(true, false)`; `if get(f, 0) { print(1) }` prints `1`.
- `check-example`: `glyphc check` passes both examples of `squares`.
- `trap-index`: `get(a, 3)` on a length-3 array; stderr `trap: index out of bounds`, exit status 1, empty stdout.
- `trap-set-negative`: `set(a, -1, 0)`; stderr `trap: index out of bounds`, exit status 1.
- `trap-oom`: pushes in a loop until the heap is exhausted; stderr `trap: out of memory`, exit status 1. This test is slow, since it needs tens of millions of pushes.

Compile-error tests (record code, span and fix; the rule is in brackets):

- `err-untyped-empty`: `let a = array()`, at `array` [AR10]: E0600.
- `err-missing-alloc`: `fn f(): Int { let a: Arr<Int> = array(1)`, then `return len(a)` and `}`, at `array` [AR16]: E0601.
- `err-call-alloc`: a function without `alloc` calls `squares`, at the call [AR16]: E0601.
- `err-push-let`: `let a = array(1)` then `push(a, 2)`, at `a` [AR11]: E0303.
- `err-set-param`: `fn f(a: Arr<Int>) io { set(a, 0, 1) }`, at `a` [AR11]: E0303.
- `err-elem-text`: `let a: Arr<Text> = array()`, at `Text` [grammar]: E0100.
- `err-get-type`: `get(1, 0)`, at `get` [AR8]: E0200.
- `err-push-value`: `let x = push(a, 1)`, at `push` [AR15]: E0200.
- `err-mixed`: `array(1, true)`, at `true` [AR9]: E0200.
- `err-print-array`: `print(array(1))`, at the argument [AR4]: E0200.
- `err-alloc-order`: `fn f(): Int alloc io { return 1 }`, at `io` [AR5]: E0100.
- `err-reserved`: `fn len(): Int { return 1 }`, at `len` [AR25]: E0300.
- `err-builtin-value`: `let f = len`, at `len` [AR15]: E0301.

## Open questions

1. **Extension of an accepted RFC.** Cost explains that this draft adds rules to RFC 0020. The group should say whether these count as amendments, which would need a new kernel revision first.
2. **Bytes.** The checklist item also asks for byte buffers. A `Byte` element row can be added when RFC 0009 is decided. Until then the item is open.
3. **Brackets.** The syntax is less short than `[T]` and `a[i]`. The token cost should be measured once `spec/` exists. Brackets need a lexical amendment before they can be used.
4. **Array equality.** Not defined here. A later RFC must decide whether `==` exists on arrays.
5. **Free list.** The benchmark that would justify one is a loop that creates and drops arrays, with the live set under 16 MiB and total allocation over 256 MiB, which traps `out of memory` under the bump allocator. No such benchmark exists yet. Abandoned blocks count toward total allocation, so a run that grows to `n` elements allocates about twice `n` times the element size.
6. **Examples that allocate.** AR17 lets examples allocate. Reviewers may prefer examples to be pure, which would need a rule of its own.
7. **Limit of 256 MiB.** Enough for milestone 1 is unknown until a benchmark runs.
