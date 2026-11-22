# RFC draft: arrays-buffers-int-array

Status: draft
Class: language
Slug: arrays-buffers-int-array
Builds on: RFC 0020 (kernel-v8, accepted). Uses RFC 0014 (lexical-syntax-v3, accepted) for every token and RFC 0004 for diagnostic records. Amends RFC 0020 by name only, in rules F1, F2, F6, F7, M1, EX2, B5, T6, T7 and TR1, as listed in Design. Does not revive RFCs 0008, 0010, 0022, 0023, 0025, 0027, 0029, 0032, 0034 or 0036; all are rejected. This draft keeps the bump-allocator and trap shape of RFC 0036 and changes the rules listed in Alternatives.

## Summary

Adds one growable array type, `IntArray`, whose elements are `Int`. A value of this type is a shared handle to a block on a bump-allocated heap. Six built-in functions create, read, write and grow arrays. Growth needs the effect `alloc`, which is checked the same way as `io`. Parameters and results may have type `IntArray`. Every failure is a defined trap.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Nine drafts for it were rejected. Their vote records give no reasons, so this draft does not assume which part failed. It states each choice a reviewer could reject, in Design and Alternatives, so that each can be changed alone.

Reading accepted RFC 0020 against the earlier drafts shows one gap. F7 and T6 limit parameters and results to `Int` and `Bool`. An array type that cannot be passed to or returned from a function is of little use. This draft amends both rules. As far as its text shows, RFC 0036 did not.

Open user issues this draft depends on:

- #36 (effect spelling, `!io` or `io`). `alloc` takes whatever spelling #36 settles for `io`. Nothing else here depends on #36.
- #64 and #68 (whether traps appear in signatures). This draft adds no trap marks to signatures. Array operations trap as RFC 0020 TR1 describes.
- #67 (structure of trap kinds). RFC 0020 lists four kinds. This draft adds four flat kinds. If #67 chooses another structure, only the names in TR1 change.
- #31 (type-mismatch code). This draft uses E0200, the code RFC 0020 already uses for type mismatch. It does not depend on the code in the other drafts named in #31.

Roadmap note: M2b says no new RFC is proposed before a compiler is on `main`. The scratch copy is not a git checkout, so this agent cannot confirm the state of `main`. The gate check shows `glyphc` responding and one conformance test passing. The orchestrator should confirm this before the draft is voted on.

## Design

### D1. Type and handles

`IntArray` names a type. Its values are handles. `let b = a` and passing an argument copy the handle, not the elements. All handles to one array see the same length, capacity and elements.

An `IntArray` has no equality. `==` and `!=` keep the rule in E3, so an `IntArray` operand is E0200. `print` takes `Int` or `Text` only (P1), so printing an `IntArray` is E0200.

### D2. Built-in functions

| Function | Signature | Effect | Behaviour |
| --- | --- | --- | --- |
| `int_array` | `(cap: Int): IntArray` | `alloc` | New array with length 0 and capacity `cap`. Traps as D3 gives. |
| `len` | `(a: IntArray): Int` | none | Length. |
| `get` | `(a: IntArray, i: Int): Int` | none | Element `i`. Traps `index-out-of-bounds` unless `0 <= i < len(a)`. |
| `set` | `(a: IntArray, i: Int, v: Int)` | none | Replaces element `i`, under the same bounds rule. Never changes the length. |
| `push` | `(a: IntArray, v: Int)` | `alloc` | Appends `v`, growing as D3 gives. |
| `pop` | `(a: IntArray): Int` | none | Removes and returns the last element. Traps `empty-pop` if the length is 0. |

`set` and `push` return no value. They are used as statements, and using either as a value is E0200 (T5). Arguments are evaluated left to right (E10). For `set`, all three arguments are evaluated before the bounds check, so a trap in an argument comes before a bounds trap.

Reserved names: `IntArray` is reserved as a type name, and `int_array`, `len`, `get`, `set`, `push` and `pop` are reserved as function names, as `print` is (B5, F6). A binding or declaration that takes one of these names is E0300. Using one as a value is E0301.

### D3. Layout, growth and traps

An array is a header of three `Int` fields on the heap: length, capacity, and the address of an element block of `8 * capacity` bytes. The header is 24 bytes. The element block holds only elements below the length; slots above it are never read.

`int_array(cap)`:

1. If `cap < 0`, trap `bad-capacity`.
2. If `cap > HEAP_LIMIT / 8`, trap `out-of-memory`. This check comes before any multiplication.
3. Allocate a 24-byte header and an element block of `8 * cap` bytes (no bytes when `cap` is 0). If the allocation does not fit under the limit in D4, trap `out-of-memory`.
4. Set the length to 0 and the capacity to `cap`.

`push(a, v)`:

1. If `len(a) < cap(a)`, store `v` at index `len(a)` and add 1 to the length. Stop.
2. Otherwise, if `cap(a) > HEAP_LIMIT / 16`, trap `out-of-memory`. This check comes before any multiplication.
3. Let `newcap = max(2 * cap(a), 4)`. Allocate an element block of `8 * newcap` bytes under D4. If it does not fit, trap `out-of-memory`.
4. Copy the `len(a)` elements into the new block, point the header at it, set the capacity to `newcap`, then store `v` at index `len(a)` and add 1 to the length.

The old block is abandoned, not freed. No alias needs an update, because every alias shares the header and the header is what changes.

`get`, `set`, `pop` and `len` read or write the header and the block. `set` never grows the array.

### D4. Heap

The heap is a bump allocator. Each allocation takes the next bytes. Nothing is freed one block at a time. There is no free list and no collector.

The counter is the total number of bytes allocated since the run began. Headers and abandoned blocks count. The limit is `HEAP_LIMIT = 268435456` (256 MiB). It is fixed by the language, not set by the build. An allocation that would take the counter above `HEAP_LIMIT` traps `out-of-memory`. Each run starts with an empty heap. Because the count and the limit are part of the language, the same program traps at the same point on every host and every run (principle 7).

Arenas are not part of this RFC. The checklist item does not need them.

Benchmark that would justify a free list: a program whose live array data stays under half of `HEAP_LIMIT`, but whose total allocation goes over `HEAP_LIMIT` and so traps `out-of-memory` under this rule. No such program exists yet. Until one does, no free list is proposed.

### D5. Traps

TR1's list of kinds gains four:

- `bad-capacity`: `int_array` with `cap < 0` (D3).
- `index-out-of-bounds`: `get` or `set` with `i` outside `0` to `len - 1`.
- `empty-pop`: `pop` on an array of length 0.
- `out-of-memory`: any allocation that breaks D3 step 2 or 3, or D3 push step 2 or 3, or the limit in D4.

Each kind follows TR1 exactly: one line `trap: <kind>` on standard error, exit status 1 through `proc_exit`, no code, earlier output kept.

### D6. Effect `alloc`

F1 becomes `fn NAME(p1: T1, ...) [: R] [io] [alloc] block`. Both effect words are optional, and they appear in this order. The spelling of `alloc` is the spelling of `io` that #36 settles.

M1 becomes: `main` may have `io` and `alloc`.

F2 gains a rule. A function without `alloc` may not call `int_array`, `push`, or a function declared `alloc`. Doing so is E0402 at the span of the call. A function declared `alloc` may call any of them.

EX2 is amended. An example is treated as declaring `alloc`, so it may call `int_array`, `push` and alloc functions. It may not call `io` functions or `print` (E0400), as before. Each example runs with its own empty heap (EX3), so this keeps examples deterministic.

### D7. Parameters, results and variables (amends T6 and F7)

T6 becomes: parameter and result types are `Int`, `Bool` or `IntArray`. A `Text` there is still E0100.

F7 becomes: parameters are `Int`, `Bool` or `IntArray` (T6).

A function with an `IntArray` result returns a handle, and F3 and F4 apply unchanged. `let` and `var` may hold an `IntArray`. A `var` of that type may be reassigned an `IntArray` value (B2). Reassigning replaces the handle. It does not change the array that the old handle names.

### D8. Names

B5 and F6 gain the names `int_array`, `len`, `get`, `set`, `push` and `pop`. T7 gains `IntArray`. These names are reserved in the same way as `print`, `Int`, `Bool` and `Text`.

## Alternatives

- **Value semantics, copying on `let`.** Rejected. Each `push` in a loop would copy the array, so the loop is quadratic. It also needs a copy rule that the earlier drafts did not settle.
- **Reassigning growth, `a = push(a, v)`.** Rejected. Aliases go stale after growth, and the reader cannot see that from one call. D3 avoids this by keeping the header shared.
- **Trap on `push` past capacity.** Rejected. Growth is the common case, and trapping would make `push` unusable without a guessed size.
- **`set` grows the array when `i == len`.** Rejected. It gives two ways to add an element, against principle 1. `push` is the only growth.
- **Generic element type.** Not in this RFC. RFC 0020 has no type parameters, and adding them needs a type-system decision. `IntArray` is one concrete type. A generic form can come later under its own name.
- **Byte buffers in this RFC.** Deferred. Buffers need a decision on slices, which this RFC does not make. RFC 0024 (byte type) is accepted, and a buffer type can reuse the shape of D2 later.
- **Allocation without an effect.** Rejected. It would hide allocation from the signature, against principle 3.
- **A free list now.** Rejected until the benchmark in D4 exists.
- **Effect name `alloc` as a keyword, not a word in the effect clause.** Not chosen. The clause already holds `io`, so `alloc` joins it, and #36 decides the spelling for both.

## Cost

Adds:

- the type name `IntArray` and its handle rule;
- six reserved function names (D8);
- the effect word `alloc` in F1 and M1, and one sentence in F2 and EX2;
- two type names in T6 and F7;
- four trap kinds in TR1;
- one diagnostic code, E0402 (below).

Removes: nothing.

Estimated size: about 700 tokens added to the core spec. The core is 917 tokens measured now, against a cap of 12,000. The estimate is not measured, and the tokeniser gives the real figure. The growth is within the cap.

The planning rule says growth needs a simplification elsewhere. This draft proposes none, because the cap is not reached. Reviewers should say whether they want a cut anyway. See open question 4.

Spec card: `spec/card.md` covers diagnostics only. This RFC adds about four lines (about 90 tokens): the type and handle rule, the `alloc` effect, and the four trap kinds. The card is 244 tokens of 2,000 now.

Diagnostics: E0402 is new. It is not in `spec/errors.json`, and no RFC uses it. E0401 is avoided, because rejected drafts 0029 and 0032 use it. E0200, E0300 and E0301 are reused with the meanings RFC 0020 gives them. No other code is added.

## Test plan

Files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (the number the orchestrator assigns) and `kind`. Each run test states stdout and status. Each trap test states the trap line, which matches TR1.

Run tests:

- `arr-empty`: `let a = int_array(0)`, `print(len(a))`. Stdout `0`, status 0.
- `arr-push-len`: `int_array(0)`, three pushes, `print(len(a))`. Stdout `3`, status 0.
- `arr-alias`: `let a = int_array(2)`, `let b = a`, `push(b, 7)`, `print(get(a, 0))`. Stdout `7`, status 0.
- `arr-grow`: 100 pushes, then print `len(a)` and `get(a, 99)`. Stdout `100` and the last value pushed, status 0.
- `arr-set`: push 1, push 2, `set(a, 0, 9)`, print `get(a, 0)` and `get(a, 1)`. Stdout `9` then `2`, status 0.
- `arr-pop`: push 1 and 2, `pop` twice, print each. Stdout `2` then `1`, status 0.
- `arr-param`: `fn make(): IntArray alloc { return int_array(4) }`, `fn fill(a: IntArray, n: Int) alloc` with a `while` loop that pushes `n` values, and `fn main() io alloc` that calls both and prints `len`. Stdout `3`, status 0. This checks the F7 and T6 amendment.
- `arr-example`: `fn size(a: IntArray): Int { return len(a) }` with `example size(int_array(3)) == 3`. `glyphc check` exits 0 with no diagnostics. This checks EX2 as amended.
- `trap-index`: `get(a, 3)` on a length-3 array. Stdout empty, stderr `trap: index-out-of-bounds`, status 1.
- `trap-index-set`: `set(a, -1, 0)` on a length-3 array. Stderr `trap: index-out-of-bounds`, status 1.
- `trap-after-output`: `print(1)`, then `get(a, 3)` on a length-3 array. Stdout `1`, stderr `trap: index-out-of-bounds`, status 1.
- `trap-empty-pop`: `pop` on a new array. Stderr `trap: empty-pop`, status 1.
- `trap-bad-capacity`: `int_array(-1)`. Stderr `trap: bad-capacity`, status 1.
- `trap-oom`: `int_array(134217728)`, which asks for 1 GiB of elements. Stderr `trap: out-of-memory`, status 1. This is fast, since the check runs before any push.
- `trap-oom-grow`: a push loop on one array until growth passes `HEAP_LIMIT`. Stderr `trap: out-of-memory`, status 1. It is slow, so it is a separate file that can be skipped locally.

Compile-error tests:

- `err-missing-alloc`: `fn f(a: IntArray) { push(a, 1) }`. One record, code E0402, span on the `push` call, no fix.
- `err-alloc-call`: `fn g(): IntArray { return int_array(1) }`. One record, code E0402, span on the `int_array` call, no fix.
- `err-type-mismatch`: `get(a, true)` on an `IntArray`. One record, code E0200, span on `true`, no fix.
- `err-array-eq`: `let x = int_array(0) == int_array(0)` inside a function declared `alloc`. One record, code E0200, span on the first operand.
- `err-print-array`: `print(int_array(0))` inside `main` declared `io alloc`. One record, code E0200, span on the argument.
- `err-reserved`: `let len = 1`. One record, code E0300, span on `len`.

## Open questions

1. The spelling of `alloc` depends on #36.
2. Whether traps appear in signatures (#64, #68). This draft adds none. If they must appear, the kinds in D5 need the same marks as the existing ones.
3. The structure of trap kinds (#67). This draft adds four flat kinds.
4. Whether growth needs a cut. The planning rule says it does. This draft proposes none, because the core is far under its cap. Reviewers should name a cut if they want one.
5. Whether `HEAP_LIMIT` should be set by the build instead. The draft fixes it so the output does not depend on the build.
6. Whether the six function names should be keywords instead of reserved names. This draft uses reserved names, which is the smaller change.
