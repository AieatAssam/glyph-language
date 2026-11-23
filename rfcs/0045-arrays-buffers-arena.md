---
slug: arrays-buffers-arena
class: language
status: draft
amends: RFC 0020 rules T6 and F1 (result types and effect clause), EX2 unchanged
builds-on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted), RFC 0004 (diagnostic style, accepted)
supersedes: none
---
# RFC draft: arrays-buffers-arena

## Summary

Adds one growable array type, `Ints`, whose elements are `Int`. Every `Ints` value lives in the arena of the function call that created it. The arena is reset in one step when that call returns, so an array cannot outlive its frame. Because of that, no `Ints` value can be returned, stored under another name, or copied by assignment. Each array therefore has exactly one name for its whole life, and no two names ever share storage. The name can be read or changed in its own function, and it can be lent read-only to a callee. Five built-in functions create, read, write and grow arrays. Creation carries the effect word `alloc`. Every failure is a defined trap.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Issue #361 reports that no RFC has been proposed for it and that twelve drafts were rejected with no reasons recorded. Those drafts fall into four groups:

- Shared handles (0023, 0025, 0038). A write through one name changes another, with nothing at the use site. This breaks principle 2 (local reasoning).
- Copy on store (0039, 0040, 0041). Each `let` or return may allocate, and the copy can happen on a line that looks like a plain assignment.
- Move on store (0043). It keeps one owner but adds a move analysis and a dead-name error for every use after a move.
- Heap with no frame structure (0036). It leaves arenas out of scope, so every array lives until the program ends.

This draft takes a fifth path. It keeps arenas, which the designer memory rules recommend for values that live for one call, and it removes the question of aliasing by making sure no array can be bound under a second name. No moves are needed, nothing is copied, and the lifetime check is a single rule: an `Ints` value cannot leave its frame.

Scope note. I read the headers and status of all `arrays-buffers` drafts and the full text of 0043 and 0040. For 0036 I read only its header and its line about arenas. If 0036 already covers frame-scoped arrays in a way this draft does not, the orchestrator should hold this draft as a duplicate.

Roadmap check. `ROADMAP.md` (M2b) says no new RFC is proposed until a compiler is on `main`. In the scratch copy, `tools.check.run` passes rule 11 (one program compiles). Issues #349, #354, #359 and #350 report that every other input still gets `no front end yet`. So the first merge looks present but thin. This draft is proposed because the assignment asks for it, and the orchestrator should confirm the gate before any vote.

Issues this draft responds to: the spec card has no syntax, so the card lines this RFC adds are in Cost (#341, #342, #344, #345, #348, #351, #353, #360). The RFC does not itself fix the card's missing syntax reference.

## Design

Rules prefixed A are new. Every other rule is RFC 0020's, unchanged, except where a rule says "amends".

### A1. Type

`Ints` is a type name, lexed as an `IDENT` (RFC 0014). It is not a keyword. It is valid only as the type of a `let` or `var` binding, and as the type of a parameter. Amends T6: a result type may be `Int` or `Bool`. A result type of `Ints` is E0320 at the type. A `Text` result is still E0100.

An `Ints` value has a length, an `Int` of 0 or more, and a sequence of `Int` elements. Capacity is kept by the runtime and is not visible in Glyph.

Any other use of `Ints` in a value position is E0301, as with `Int`.

### A2. Built-in functions

These five names are built in. They are reserved like `print` (F6). A function or binding that takes one of these names is E0300.

- `ints(n: Int) alloc: Ints`. Returns a new array of length `n`, every element `0`. Capacity is `n`. A negative `n` traps `negative-length`.
- `len(a: Ints): Int`. Returns the length.
- `get(a: Ints, i: Int): Int`. Returns the element at index `i`. An `i` below 0 or at or above the length traps `index-out-of-bounds`.
- `set(a: Ints, i: Int, v: Int)`. Replaces the element at `i`, with the same bounds rule as `get`. It has no result, so using it as a value is E0200 (T5). Its first argument must be a local `var` name (A6).
- `push(a: Ints, v: Int) alloc`. Appends `v`. Its first argument must be a local `var` name (A6). See A7 for growth.

Built-in calls follow E8: the argument count and types must match.

### A3. Binding and the single-name rule

1. An `Ints` binding is created only by a call to `ints`: `let a = ints(3)` or `var a = ints(3)`. Its right side must be a call to `ints` (E0321 otherwise).
2. An `Ints` name may appear only in these positions, and anywhere else it is E0321 at the name:
   - the first argument of `len`, `get`, `set` or `push`;
   - an argument of a call to a user function, which is a lend (A4);
   - the right side of an assignment `a = ints(m)` to a `var` name, which replaces the binding (A3.3).
3. A `var` name of type `Ints` may be assigned a new `ints(m)` result. The old storage stays in the frame arena until return (A8). No other assignment to an `Ints` name is allowed.
4. Because a name is never the right side of `let`, `var`, an assignment, or `return` (except as in A3.3), no two names can refer to the same storage. There is no move and no copy in this RFC.

Example that is valid:

```
fn main() io alloc {
    var a = ints(2)
    set(a, 0, 7)
    push(a, 9)
    print(len(a))
    print(get(a, 2))
}
```

Output: `3`, then `9`.

### A4. Lending to a call

1. Passing an `Ints` name as an argument to a user function lends it. The caller keeps the value. A lend is not a move, and the name is live after the call.
2. Inside the callee, the parameter is read-only. The callee may call `len` and `get`, and may lend the parameter to another call. Calling `set` or `push` with a parameter as the first argument is E0322.
3. A parameter cannot be bound (A3) and cannot be returned (A1), so it cannot be stored where it would outlive the call.
4. The caller is suspended during the call, and the kernel has no global variables (RFC 0020, F-rules). So nothing else can change the lent array while the callee runs.

### A5. Results and escape

1. A function's result type is never `Ints` (A1). So no array created in a call can be returned to its caller.
2. A callee therefore cannot make a value that outlives it. This is what makes the frame arena safe (A8).
3. Arrays used only inside one function, or lent down the call chain, are the intended use.

A later RFC may add return by passing an arena to the callee. This draft does not.

### A6. Mutation

1. `set` and `push` change the array their first argument names. That name must be a local `var` name in the current function. Otherwise E0322 at the first argument.
2. A `let` name, a parameter, and any name of another function cannot be changed. Changing one is E0322.
3. The mutation is visible at the call site, because the first argument is a `var` name written in that call.

### A7. Capacity and growth

1. `ints(n)` gives capacity `n`. `push` on an array with length below capacity writes into the existing storage.
2. `push` on an array with length equal to capacity allocates a new block in the frame arena. The new capacity is `max(4, 2 * capacity)`. The elements are copied into the new block, and the old block is not freed until the frame returns (A8).
3. Element storage is 8 bytes per `Int`. Capacity never shrinks.

### A8. Memory

1. Each function call that creates `Ints` storage has a frame arena. A frame arena is the region of the one bump heap that starts at the bump pointer when the call begins.
2. When the call returns, the bump pointer is reset to the value it had at the call's start. Everything the call allocated is released in one step.
3. Allocation advances the bump pointer. There is no free list, no reference counting and no tracing collector. The designer rules allow none of these until a benchmark shows that frame arenas are not enough.
4. The heap has a fixed size in every build, so the point at which a program runs out of memory is the same in every build. Exhaustion traps `out-of-memory`. The size is a constant of the runtime. This draft sets it to 16 MiB; that number is not measured (Open question 2).

Because of A5, no pointer into a frame's arena can be used after that frame returns, so the reset cannot leave a dangling array.

### A9. Effects

1. The effect clause is a list of effect words, each at most once, written in the order `io` then `alloc`. So `fn f() io alloc` is valid, and `fn f() alloc io` is E0100 at `io`. This amends F1, where `io` was the only effect word.
2. A call is allowed only if the caller's effects include every effect of the callee. Otherwise E0400 at the call. So a function without `alloc` may not call `ints` or `push`, nor a function that has `alloc`.
3. `main` may declare `io alloc`.
4. Examples (EX2) may call only functions with no effect. An example that calls `ints`, `push`, or any `io` function is E0400.

### A10. Print and operators

1. `Ints` has no `==`, `!=`, `<` or other operator (E3, E4). Using one is E0321.
2. `print` takes `Int`, `Bool` or `Text` only (P1). `print` of an `Ints` name is E0321.

### A11. Diagnostic codes

New codes in `spec/errors.json`. The codes E0320, E0321 and E0322 are not used in any RFC or in `spec/errors.json` today. I checked the tree for them before writing this draft.

- E0320: a function result type is `Ints`. The message is "array cannot be returned". Span: the result type.
- E0321: an `Ints` name in a position A3 does not allow, or a binding that is not a call to `ints`. The message is "array used outside its frame". Span: the name.
- E0322: a `set` or `push` on a name that is not a local `var`, including a parameter. The message is "mutation of a value that is not a local var". Span: the first argument.

Trap kinds, written as `trap: <kind>` on standard error (RFC 0004, card): `negative-length`, `index-out-of-bounds`, `out-of-memory`. None is a code.

## Alternatives

- **Shared handles (0023, 0025, 0038).** Rejected in those drafts. A write through one name changes another with nothing at the use site.
- **Copy on store (0039, 0040, 0041).** Rejected. A copy can happen at a line that looks like a plain assignment. This draft forbids name-to-name binding instead of copying.
- **Move on store (0043).** Rejected. This draft needs no move analysis because no name is ever bound to another name.
- **Heap with no frame structure (0036).** Rejected. Without frame reset every array lives until the program ends. This draft adds the reset, which costs one bump-pointer reset per call.
- **Returning arrays from functions.** Not chosen. It needs either a copy, a move, or an arena passed in from the caller. Each is a separate decision. This draft keeps the rule simple and leaves return to a later RFC.
- **Fixed-size arrays `[T; N]` (0008).** Not chosen. They cannot grow, and a byte buffer needs growth.
- **A generic `Arr<T>`.** Not chosen. The type system's shape is open under the constitution, and one concrete type needs no such decision.
- **Explicit `arena` block syntax.** Not chosen. A block form adds a keyword and grammar. Per-call frames need no new syntax, so the cost is zero tokens.
- **Allocation without an effect.** Rejected. It hides allocation from the signature, against principle 3.

## Cost

What this RFC adds to the token budget:

- Type name `Ints`: 1 type.
- Built-in functions: 5 (`ints`, `len`, `get`, `set`, `push`). Names are short for token cost.
- Effect word `alloc`, plus the fixed order rule in A9.1.
- Three diagnostic codes (E0320 to E0322) and three trap kinds (`negative-length`, `index-out-of-bounds`, `out-of-memory`).
- Rules A1 to A10.

What it removes to pay for it: nothing. This draft does not cut existing rules, and the amendments to T6 and F1 change text without adding a construct.

Size estimate: about 800 to 900 tokens of spec core. I could not run the protected tokeniser from the scratch copy, so the merge bot must measure this against the 12,000 token cap. The current core is 917 tokens by the gate's count, so the total would be about 1,800.

Spec card (`spec/card.md`): adds about 8 lines. They list the five built-ins, the `alloc` effect, the rule that an array cannot leave its function, and the three trap kinds. The card is 645 bytes today and far under its 2,000 token cap. Basic syntax is a separate item (#341 and related issues) and is not part of this RFC.

## Test plan

Test files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (the number the orchestrator assigns) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line from A8 and A2. Compile-error tests state the code.

Run tests:

- `arrays-create-len`: `ints(3)` then `len` prints `3`. Exit 0.
- `arrays-set-get`: `set` at index 1 then `get` at index 1 prints the written value. Exit 0.
- `arrays-push-grow`: pushes 10 values into a `var` array of capacity 0 and prints `get` of the last index. Exercises A7.
- `arrays-lend-read`: a function that takes an `Ints` parameter and returns `len` through `Int` result, called twice on one name. Shows lend (A4) keeps the name live.
- `arrays-frame-reset`: a function called 1000 times that creates an array of 1000 elements and returns an `Int`. Exit 0. Shows the frame reset (A8) keeps the heap from running out.
- `arrays-reassign-var`: `var a = ints(2)`, then `a = ints(1)`, prints `len(a)` as `1`. Exit 0. Shows A3.3.

Trap tests:

- `arrays-index-trap`: `get` at index equal to length. Expected `trap: index-out-of-bounds`, exit 1.
- `arrays-negative-length-trap`: `ints(-1)`. Expected `trap: negative-length`, exit 1.
- `arrays-heap-trap`: a loop of `ints(1048576)` calls in one frame until the heap is full. Expected `trap: out-of-memory`, exit 1.

Compile-error tests:

- `arrays-result-type`: `fn f(): Ints` . Expected E0320 at the result type.
- `arrays-alias-let`: `let b = a` where `a` is `Ints`. Expected E0321 at `a`.
- `arrays-return-name`: `return a` where `a` is `Ints`. Expected E0321 at `a`.
- `arrays-set-param`: `set` on a parameter. Expected E0322 at the first argument.
- `arrays-set-let`: `set` on a `let` name. Expected E0322.
- `arrays-print`: `print` of an `Ints` name. Expected E0321.
- `arrays-push-needs-alloc`: `push` in a function with no `alloc`. Expected E0400.

Each new code (E0320 to E0322) has at least one compile-error test, which meets the coverage rule. Each grammar production this RFC adds needs a run test, and the run tests above cover the new forms: the type position, the built-in calls, `var` reassignment and the effect clause.

## Open questions

1. Whether returning arrays should come next, through an arena passed from the caller. This draft says yes, in a separate RFC, and does not decide the shape.
2. Whether the 16 MiB heap constant (A8.4) is right. It is not measured. The number must come from the runtime section, not from this draft.
3. Whether a loop that pushes into one frame should be allowed to grow the heap without bound until it traps. This draft says yes, because the trap is deterministic.
4. Whether `alloc` should be inferred for examples. A9.4 forbids it, and a later RFC can relax it if examples need arrays.
