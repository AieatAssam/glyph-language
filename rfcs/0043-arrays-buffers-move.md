---
amends: RFC 0020 rules T6, T7, F2, EX2 and P1 (listed in Design, rule A11)
builds-on: RFC 0014 (lexical-syntax-v3, accepted), RFC 0020 (kernel-v8, accepted),
  RFC 0004 (diagnostic style, accepted)
class: language
revives: none
slug: arrays-buffers-move
status: rejected
supersedes: none
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: approve
  tester: abstain
  user-1: abstain
  user-2: abstain
---
# RFC draft: arrays-buffers-move

## Summary

Adds one growable array type, `Ints`, whose elements are `Int`. An `Ints` value has exactly one owner: the name it is bound to. Using an `Ints` name as a whole value on the right of `let`, `var`, an assignment or `return` moves it, and the source name is dead from that point. Passing an `Ints` name as a call argument lends it, read-only, for the length of the call. Only a `var` name can be changed, and only by the built-ins `set` and `push`. Five built-in functions create, read, write and grow arrays. Growth and creation carry the effect word `alloc`, which is checked like `io`. Every failure is a defined trap.

## Motivation

Readiness item `arrays-buffers` is open (spec section 9). Issue #361 reports that no RFC has been proposed for it and that twelve drafts were rejected with no reasons recorded. The vote records of those drafts give no reason for any rejection, so this draft does not claim to answer a particular objection. It is grounded in the open user issues on the spec card (#341, #342, #344, #345, #348, #351, #353, #360) only in the sense that the Cost section lists the card lines it adds.

The rejected drafts fall into three groups. Shared handles (0023, 0025, 0038) let a write through one name change another with nothing at the use site, which breaks principle 2 (local reasoning). Copy-on-store drafts (0040, 0041) keep local reasoning but make every `let` or return a possible allocation, and 0041 says itself that a move rule was left open because it "needs move analysis". This draft takes that open path. Ownership moves instead of copying, so there is one live owner at any point and no duplication to hide. The move analysis is kept small on purpose. It needs no flow analysis across loops: a move of an outer name inside a `while` body is an error (E0311), and a move in one branch of an `if` is treated as a move on the whole `if` unless that branch returns.

Roadmap check: `ROADMAP.md` (M2b) says no new RFC is proposed until a compiler is on `main`. The tree this agent reads has `spec/grammar.peg` for the walking-skeleton program `fn main() io { print(1) }` and `compiler/ACTIVE` set to `stage0`. That suggests the first merge is in. This agent works from a scratch copy and cannot confirm the state of `main` or whether the M2b gate counts as met. Issues #349 and #359 report that `check` and `run` still print "no front end yet". The orchestrator should confirm the gate before voting.

Resubmission check: RFC 0041 (arrays-buffers-explicit-copy) was rejected and this draft is close to it in scope (one element type, six to five built-ins, lend on call). It differs in substance on one point: ownership is by move, not by explicit `copy`. If the orchestrator counts this as the same substance under the resubmit cooldown, hold this draft.

## Design

Rules prefixed A are new in this RFC. Every other rule is RFC 0020's, unchanged, except where a rule says "amends".

### A1. Type

`Ints` is a type name, lexed as an `IDENT` (RFC 0014). It is valid in a type position: the type of a `let` or `var`, a parameter, and a result. It is not a keyword. Any other use of `Ints` as a value is E0301, as with `Int`.

Amends T6: parameter and result types are `Int`, `Bool` or `Ints`. A `Text` there is still E0100.

An `Ints` value has a length, an `Int` of 0 or more, and a sequence of `Int` elements. Capacity is kept by the runtime and is not visible in Glyph.

### A2. Built-in functions

These five names are built in. They are reserved like `print` (F6): a function or binding that takes one of these names is E0300.

- `ints(n: Int) alloc: Ints`. Returns a new array of length `n`, every element `0`. Capacity is `n`. A negative `n` traps `negative-length`.
- `len(a: Ints): Int`. Returns the length.
- `get(a: Ints, i: Int): Int`. Returns the element at index `i`. An `i` below 0 or at or above the length traps `index-out-of-bounds`.
- `set(a: Ints, i: Int, v: Int)`. Replaces the element at `i`, with the same bounds rule as `get`. It has no result, so using it as a value is E0200 (T5). Its first argument must be a `var` name (A6).
- `push(a: Ints, v: Int) alloc`. Appends `v`. Its first argument must be a `var` name (A6). See A8 for growth.

Built-in calls follow E8: the argument count and types must match. The built-ins take their arguments in the order shown.

### A3. Ownership by move

An `Ints` value is owned by exactly one name at a time.

1. A name of type `Ints` used as the whole right side of `let`, `var`, an assignment, or as the operand of `return`, is a move. The move ends the source name's value. The source name is then *moved*.
2. Any later use of a moved name is E0310 at the use. This includes `len`, `get`, `set`, `push`, a lend in a call, and another move.
3. A `var` name that is moved may be assigned again: `a = ints(0)` makes `a` live again. A `let` name cannot be assigned, so a moved `let` name stays moved (B2).
4. A move does not copy. The elements stay where they are and the new name owns them. No allocation happens in a move.

Example that is valid:

```
fn main() io {
    var a = ints(2)
    let b = a
    a = ints(1)
    print(len(b))
    print(len(a))
}
```

Output: `2`, then `1`.

### A4. Lending to a call

1. Passing an `Ints` name as a call argument lends it. The caller still owns the value. A lend is not a move, so the name is live after the call.
2. Inside the callee, the parameter is read-only. The callee may call `len` and `get`, and may lend the parameter to another call. Using a parameter as the whole right side of `let`, `var`, an assignment or `return` is E0313, and calling `set` or `push` on it is E0312 (A6).
3. The caller is suspended during the call, and the kernel has no global variables (RFC 0020, F-rules). So no other name can change the borrowed array while the callee runs.

A call whose argument is not a bare name, such as `f(ints(3))`, passes a fresh value. The callee still gets a lend, and the value is dropped when the call returns. A later rule may allow this to be moved in; this draft does not.

### A5. Results

A function with an `Ints` result returns a value it owns. `return a` moves `a` (A3). `return ints(3)` returns a fresh value. A function with an `Ints` result must return on every path (F3). A call's result of type `Ints` binds without a move, because it has no source name.

### A6. Mutation

1. `set` and `push` change the array their first argument names. That name must be declared with `var` and must be in scope in the current function. Otherwise E0312 at the first argument.
2. A `let` name, a parameter, and a moved name cannot be changed. A moved `var` name cannot be changed until it is assigned again (A3.3). Changing a moved name is E0310.
3. Mutation is visible at the call site, because the first argument is a `var` name written in that call. A reader sees the change without reading the callee.

### A7. Moves and control flow

1. A move inside an `if` branch counts as a move of that name after the whole `if`, unless the branch ends in `return` (F3), in which case it does not. So a name moved in either branch that falls through is moved after the `if`.
2. A `while` body may not move a name declared outside that body. Such a move is E0311 at the moving name. A name declared inside the body may be moved there.
3. The condition of `while` and `if` is `Bool` (E7). It is evaluated before the body, so it cannot move anything.
4. Evaluation order is RFC 0020's (E10). A move in an earlier operand makes a later use of the same name in the same expression E0310.

### A8. Capacity and growth

1. `ints(n)` gives capacity `n`. `push` on an array with length below capacity writes into the existing storage.
2. `push` on an array with length equal to capacity allocates a new buffer. The new capacity is `max(4, 2 * capacity)`, and the elements are copied into it. The old buffer is not freed (A9).
3. Element storage is 8 bytes per `Int`. Capacity never shrinks.

### A9. Memory

All `Ints` storage comes from one bump heap. Nothing is freed while the program runs, and a value's storage lasts until the program ends. A growth step leaves the old buffer unused, which is the cost of the bump strategy (designer memory rules). The heap has a fixed size of 256 MiB in every build, the same as the execution limit in `governance/RULES.md`, so the point at which a program runs out of memory is the same in every build. Exhaustion traps `out-of-memory`.

Exhaustion is a trap, not a diagnostic. Because the heap size is fixed, the trap point is deterministic (constitution: determinism).

No free list, reference counting or tracing collector is added. The benchmark that would justify a free list is not yet measured. The bump heap plus value moves is expected to be enough for the first milestone.

### A10. Effects

1. The effect clause of a function is a fixed-order list of effect words, each at most once: `[io] [alloc]`. So `fn f() io alloc` is valid and `fn f() alloc io` is E0100 at `io`. This amends F1, where `io` was the only effect word.
2. A call is allowed only if the caller's effects include every effect of the callee. Otherwise E0400 at the call. This generalises F2: a function without `alloc` may not call `ints`, `push`, or any function that has `alloc`.
3. `main` may declare `io alloc`.
4. Examples (EX2) may call only functions with no effect. An example that calls `ints` or `push`, or any `io` function, is E0400.

### A11. Print, equality and amendments

1. `Ints` has no `==`, `!=`, `<` or other operator (E3, E4). Using one is E0200.
2. `print` takes `Int`, `Bool` or `Text` only (P1). `print` of an `Ints` name is E0200.
3. Amends T6 and T7 as in A1. Amends F2 and EX2 as in A10. Amends P1 by no change in form; `Ints` is simply not one of its argument types.

### A12. Diagnostic codes

New codes in `spec/errors.json`. None of these codes is used in any accepted RFC or in `spec/errors.json` today.

- E0310: use of a moved name. The message is "use of a moved value". Span: the use.
- E0311: move of an outer name inside a `while` body. The message is "value moved inside a loop". Span: the moving name.
- E0312: first argument of `set` or `push` is not a `var` name in scope. The message is "mutation of a value that is not a var". Span: the first argument. Fix: none, since the fix would change a binding and the author chooses which.
- E0313: move of a borrowed parameter. The message is "cannot move a borrowed value". Span: the moving name.

Trap kinds, written as `trap: <kind>` on stderr (RFC 0004, card): `negative-length`, `index-out-of-bounds`, `out-of-memory`. None is a code.

## Alternatives

- **Shared handles (0023, 0025, 0038).** Rejected in those drafts. A write through one name changes another with nothing at the use site, which breaks principle 2.
- **Explicit `copy(a)` on every store (0041).** Not chosen here. It needs a copy built-in, a fix that inserts it, and an allocation at each copy. The move rule above does the same job with no allocation.
- **Copy on store, implicit (0040, 0039).** Rejected. A copy can happen at a line that looks like a plain assignment.
- **Full move analysis across loops.** Not chosen. It needs a fixed-point over `while` bodies, and the kernel does not need it yet. A move of an outer name in a loop is an error, which needs no analysis.
- **Functional update, `a = push(a, v)`.** Rejected. Each write allocates, and the bump heap runs out after a few thousand writes.
- **Generic `Arr<T>`.** Not chosen. The type system's shape is open under the constitution, and one concrete type needs no such decision.
- **Byte buffers in this RFC.** Deferred. RFC 0024 is accepted, but a byte buffer needs slices, which this draft does not make.
- **`pop`, slices, capacity in Glyph.** Omitted. No test in this draft needs them. Each is a later RFC under its own name.
- **Allocation without an effect.** Rejected. It hides allocation from the signature, against principle 3.
- **Reference counting or a tracing collector.** Rejected by the designer rules. Moves and a bump heap need neither.

## Cost

What this RFC adds to the token budget:

- Type name `Ints`: 1 type.
- Built-in functions: 5 (`ints`, `len`, `get`, `set`, `push`). Short names chosen for token cost.
- Effect word `alloc`: 1 effect, plus the fixed-order rule in A10.
- Four diagnostic codes (E0310 to E0313) and three trap kinds (`negative-length`, `index-out-of-bounds`, `out-of-memory`).
- Move rules A3 and A7.

What it removes to pay for it: nothing in this RFC. The estimate is about 900 tokens of spec core. This agent could not run the protected tokeniser from a scratch copy, so this is an estimate to be measured by the merge bot against the 12,000 token cap.

Spec card (`spec/card.md`): adds one block of about 10 lines listing the five built-ins, the `alloc` effect, the move rule in one sentence, and the three trap kinds. The card is well under its 2,000 token cap. The card's basic syntax is a separate item (#341 and the related issues) and is not part of this RFC.

## Test plan

Test files go in `conformance/arrays/`. Each has a `--- meta` block with `id`, `rfc` (the number the orchestrator assigns) and `kind`. Run tests state stdout and exit status. Trap tests state the trap line from A9 and A2. Compile-error tests state the code.

Run tests:

- `arrays-create-len`: `ints(3)` then `len` prints `3`. Exit 0.
- `arrays-push-grow`: pushes 10 values into a `var` array of capacity 0 and prints `get` of the last index. Exercises A8.
- `arrays-move-then-reassign`: the Example in A3 with output `2` and `1`.
- `arrays-lend-read`: a function that takes an `Ints` parameter and returns `len`, called twice on one name. Shows lend (A4) keeps the name live.
- `arrays-branch-return-move`: a move in an `if` branch that ends in `return` leaves the name live after the `if`. Shows A7.1.

Trap tests:

- `arrays-index-trap`: `get` at index equal to length. Expected `trap: index-out-of-bounds`, exit 1.
- `arrays-negative-length-trap`: `ints(-1)`. Expected `trap: negative-length`, exit 1.

Compile-error tests:

- `arrays-use-after-move`: `let b = a` then `len(a)`. Expected E0310 at `a`.
- `arrays-set-not-var`: `set` on a `let` name. Expected E0312.
- `arrays-move-in-while`: `let b = a` inside a `while` body where `a` is outer. Expected E0311.
- `arrays-move-borrowed-param`: `return p` in a function whose parameter `p` is `Ints`. Expected E0313.
- `arrays-push-needs-alloc`: `push` in a function with no `alloc`. Expected E0400.
- `arrays-print`: `print` of an `Ints` name. Expected E0200.

Each new code (E0310 to E0313) has one compile-error test, which satisfies the coverage rule in the constitution. Each grammar production this RFC adds needs a run test, which the list above covers.

## Open questions

1. Whether a call argument that is a fresh value (`f(ints(3))`) should be allowed to move into a `let` in the caller's body. A3 and A4 leave it as a lend only.
2. Whether `alloc` should be inferred for examples. A10.4 forbids it. A later RFC can relax this if the examples need arrays.
3. Whether the heap size of 256 MiB (A9) is right, given the execution limit in `governance/RULES.md`. The number is taken from the rules file and is not measured.
4. Whether slices and `pop` belong in the first milestone. This draft says no.
