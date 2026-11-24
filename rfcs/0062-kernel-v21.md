---
alters_tests: true
status: draft
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v21
Status: draft
Replaces: RFC 0061 (kernel-v20, rejected). See Changes.
Depends on: `lexical-syntax-v4` (RFC 0048); RFC 0004 (records and traps); RFC 0011 (`.gl`).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (signed 64-bit), `Bool`, bindings, functions, `if`, `wh`, `ret` and file-level examples (`ex`). The builtin `put` prints an `Int`. A run ends by a return from `main` or by one of four traps, each with exit status 1. A text literal parses but is E0200. Text belongs to a standard library RFC not yet written.

This RFC gives the meanings that RFC 0048 cites as `kernel-v9`, which RFC 0049 rejected (Open question 1).

Not for vote until P0 and P1 (Test plan) hold. This draft cannot make them hold.

## Motivation

- RFC 0055 could not print text. RFC 0059 added text. RFC 0060 removed it.
- RFC 0061 was rejected on P0, P1, the vote arithmetic and the test format, not the design. This draft keeps the design and fixes those four points.

## Changes from RFC 0061

- **C1. Vote arithmetic.** With six non-abstaining votes, five approvals are needed for both `accept_ratio` 0.6667 and `supermajority_ratio` 0.75 (RULES rule 4). Four of six is 0.6666..., which is below 0.6667.
- **C2. RFC 0048 (P0).** Its front matter says `accepted`, its body says `Status: draft`, and its votes (4 approve, 2 reject) fail rule 4. This draft does not edit it; its author or the owner must.
- **C3. Cooldown (P1).** This draft resubmits RFC 0061 in substance, and RFC 0061 is the latest rejection of this design. Rule 6 therefore counts from RFC 0061's rejection. RFC 0059 and 0060 were rejected earlier, so their cooldowns end earlier. RFC 0061's rejection date is not in this repository (P1).
- **C4. Text removal kept.** Unchanged.
- **C5. Trap test format (tester).** Trap tests are run tests with stdout, stderr and exit status, as RFC 0004 section 5 does for `diag/trap-line`. There is no `kind: trap` or `expect-stderr` field.
- **C6. Exit status of a failing example (tester).** EX3 states it: `check`, `build` and `run` each exit 1 when they write any diagnostic.
- **C7. Syntax error in a test.** `err-example-budget` has `;` between `wh true { }` and `ret 0` (lexical-syntax-v4, G2).
- **C8. Codes and card.** Each code is added to `spec/errors.json` by the first PR that emits it.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, grammar, and the lexical and syntax errors are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens. A text literal is a `TEXT` token.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is E0200 at the literal, wherever it appears, and has type `?` (E10). It is reported once, by this rule.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value, it is E0200 at the call, and the value has type `?`. A call statement discards any result.

T6. A parameter type or result type is `Int` or `Bool`, the only tokens `ptype` and `rtype` accept. Any other token there, including `Text`, is E0100 at that token.

T7. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; call, literal, name, `( expr )`. Binary operators are left-associative, except the comparisons, which do not chain (lexical-syntax-v4, G6).

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` and `%` truncate toward zero. `%` takes the sign of the dividend, so `-7 % 3` is `-1`. A zero divisor traps `divide-by-zero`. `MIN / -1` traps `overflow`. `MIN % -1` is `0`.

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200.

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200.

E5. `and` and `or` take `Bool` operands and short-circuit: the right operand is not evaluated when the left decides the result. `not` takes `Bool`. Otherwise E0200.

E6. Unary `-` takes `Int`.

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200.

E8. A call's argument count and types must match its parameters. Otherwise E0200.

E9. Evaluation is left to right: the left operand, then the right; call arguments in order, then the call. `and` and `or` skip the right operand when the left decides.

E10. **Recovery.** A failed expression takes its operator's type (`Bool` for comparisons, `and`, `or` and `not`; `Int` for arithmetic), or its callee's result type for a call, or `?` if there is none. A failed name, a text literal and a valueless call used as a value have type `?`. `?` is accepted without a further diagnostic. No program can name it.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (lexical-syntax-v4, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch with the variable's type is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, as if by a `let` at its start, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int`, `Bool` or `Text`. Otherwise E0300 at the new name.

### Functions and effects

F1. `fn NAME(p1: T1, ...) [: R] [io] block`. `: R` comes before `io`, and both are optional. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the function body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool` or `Text` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in, with the signature `put(x) io`. Its argument must be `Int`. Any other type, including `Bool`, is E0200 at the argument. A text literal argument is reported only by T3. An argument of type `?` is accepted without a further diagnostic (E10). Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. `put` writes its `Int` in decimal, with a leading `-` if negative and no leading zeros, and then one LF.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals and loops

C1. `if cond block [ else block ]`. The `else` part is a block only (lexical-syntax-v4, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

### Examples

EX1. `ex EXPR` follows a function's closing `}` or another example of that function (lexical-syntax-v4, G5). It belongs to that function.

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each evaluate every example when there is no other compile error. Each example is its own run, at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false`, or any trap, is E0202 at the example. The span runs from the `ex` keyword to the last token of its expression. A failing example makes `check`, `build` and `run` each exit 1, and `build` and `run` then write no module and run no `main`.
### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Traps carry no code. Output written before the trap stays written. The kinds are:

- `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
- `divide-by-zero`: `/` or `%` with a zero divisor (E2);
- `stack-exhausted`: call depth would exceed 10000 (TR2);
- `step-exhausted`: more than 10000000 `wh` condition evaluations in one call frame (TR3).

TR2. `main` is at depth 1; an example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`.

TR3. **Loop counter per call.** Each call frame has its own counter, starting at 0. Each evaluation of a `wh` condition in that frame's own body adds 1. Before an addition would exceed 10000000, the run traps `step-exhausted`. Calls are not counted here. The limit is one constant (Open question 2).

TR4. **Traps are not in signatures.** This is an exception to principle 3, and Open question 2 asks the group to confirm it.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order.

### Card

K1. `spec/card.md` gains the kernel section below. Its size is in Cost.

```
# Card: kernel
Types: Int (signed 64-bit), Bool. Text literals are E0200.
Bind: let x = e (immutable), var x = e (mutable), no annotation. x = e assigns a var.
Fn: fn f(a: Int, b: Bool): R io { } ex e. R and io optional, in that order. Stmts separated by ;.
Stmts: let var assign call; if e { } else { }; wh e { }; ret [e].
Ops, low to high: or; and; == != < <= > >= (no chain); + -; * / %; unary - not.
Int: + - * and unary - trap overflow; / % truncate, % takes dividend sign; zero divisor traps.
Output: put(x) io prints an Int, then LF.
Entry: exactly one fn main() [io].
Ex: ex e must be Bool and true; run by check, build and run.
Trap: stderr "trap: K", exit 1. K is overflow, divide-by-zero, stack-exhausted or step-exhausted.
```

### Diagnostics

Records follow RFC 0004 section 2. Each code is added to `spec/errors.json` by the first PR that emits it (C8).

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch; a text literal (T3); a valueless call used as a value; arity; `main` signature | The operator (E3 to E5), the argument, the callee name (arity), `main`, the literal, the call, the `ret` keyword (bare `ret`), otherwise the expression |
| E0201 | types | A function with a result clause can reach its closing brace | The closing `}` |
| E0202 | types | An example evaluates to `false`, or traps (EX3) | The example, from `ex` to the end of its expression |
| E0300 | name | Duplicate declaration (B4, M1, F6), reserved name | The new name |
| E0301 | name | Unknown name; use before declaration; a function or type name used as a value | The name |
| E0302 | name | No `main` | The end-of-file token |
| E0303 | name | Assignment to a `let` or a parameter | The target name |
| E0400 | effects | Call to an `io` function or `put` without `io`, or from an example | The callee name |

## Alternatives

- **Text in `put`, as in RFC 0059.** Rejected (C4). Text moves to the standard library RFC.
- **Check-only examples, one run-wide loop counter, traps in signatures.** Rejected: EX3, TR3, TR4.
- **A loop limit of 10^9 (RFC 0059).** Rejected for now (Open question 2): unmeasured, and each budget test would run 10^9 steps.

## Cost

No file under `spec/` is changed by this RFC, and the design is unchanged from RFC 0061. The kernel rules in `spec/core` and the card section are not measured here. The merge bot measures them against the 12000-token and 2000-token caps when the implementing PR lands. That PR adds the rules, K1 and the codes. Removed relative to RFC 0059: the `Text` arm of `put`, the text-value rules, and their error rows, tests and card clause.

## Test plan

Tests live in `conformance/kernel/`, one per file. The `rfc` field of each meta block is this RFC's number, assigned on publication. Each compile-error program is complete: unless it is about `main`, it contains `fn main() io { }`.

Preconditions, required before the vote. Neither is met, and this draft cannot meet either:

- **P0. RFC 0048.** One status in the front matter and in the body, and recorded votes that meet rule 4 (C2). Today: `accepted` in the front matter, `Status: draft` in the body, 4 approve and 2 reject. Its author or the owner must correct it.
- **P1. Cooldown.** Rule 6 bars resubmitting a rejected RFC in substance for 10 nights. This draft resubmits RFC 0061. The orchestrator must supply the rejection date of RFC 0061. No vote may open until ten nights have passed from it (C3).

Merge conditions, not vote preconditions: the codes in `spec/errors.json`, and K1 in `spec/card.md` (C8).

Changes to conformance tests (`alters_tests: true`): RULES rule 4 then needs `supermajority_ratio` 0.75, which is five approvals of six (C1).

- **Added:** `conformance/kernel/put-one.test`, a run test. Source `fn main() io { put(1) }`, stdout `1`, status 0.
- **Altered, not edited:** `conformance/kernel/print-one.test` (source `fn main() io { print(1) }`). Under this RFC `print` is E0301, so it fails. Agents may not edit or delete it. One owner commit deletes it, recorded as a `rules_changed` event, with the implementing PR, which reports the red test until then.
- **RFC 0048's own tests.** `v4-comment` and `v4-grammar-text` print text and are E0200 here. Their author must rewrite them. They are not rewritten by this RFC.

Run tests (kind `run`). Each is a complete program. `put` is as in P1. Stderr is empty and status is 0 unless the row says otherwise.

| Test | Program | Expected stdout |
| --- | --- | --- |
| `put-one` | `fn main() io { put(1) }` | `1` |
| `print-int` | `fn main() io { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `let-var` | `fn main() io { let a = 1; var b = 2; b = b + a; put(b) }` | `3` |
| `let-bool` | `fn main() io { let b = 1 < 2; if b { put(1) } }` | `1` |
| `bool-ops` | `fn main() io { if 1 < 2 and not false { put(1) } else { put(2) } }` | `1` |
| `bool-or` | `fn main() io { if false or 1 < 2 { put(1) } }` | `1` |
| `short-circuit` | `fn side(): Bool io { put(9); ret true }`, `fn main() io { if false and side() { put(1) }; if true or side() { put(2) } }` | `2` |
| `cmp-ordering` | `fn main() io { if 2 > 1 { put(1) }; if 2 >= 2 { put(2) }; if 1 <= 2 { put(3) }; if 1 >= 2 { put(9) } }` | `1`, `2`, `3` |
| `cmp-eq` | `fn main() io { if 1 != 2 { put(3) }; if true == true { put(4) } }` | `3`, `4` |
| `arith` | `fn main() io { put(7 / -2); put(-7 % 3); put(2 * 3 + 4 * 5); put(-3 + 1); put((1 + 2) * 3) }` | `-3`, `-1`, `26`, `-2`, `9` |
| `eval-order` | `fn a(): Int io { put(1); ret 1 }`, `fn b(): Int io { put(2); ret 2 }`, `fn main() io { if a() < b() { put(3) } }` | `1`, `2`, `3` |
| `eval-order-ge` | the same `a` and `b`; `fn main() io { if b() >= a() { put(3) } }` | `2`, `1`, `3` |
| `fn-call` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { put(add(2, 3)) }` | `5` |
| `fn-result-io` | `fn sq(x: Int): Int io { put(x); ret x * x }`, `fn main() io { put(sq(3)) }` | `3`, `9` |
| `fn-bool-param` | `fn pick(b: Bool): Int { if b { ret 1 }; ret 2 }`, `fn main() io { put(pick(true)); put(pick(false)) }` | `1`, `2` |
| `fn-bool-result` | `fn pos(n: Int): Bool { ret 0 < n }`, `fn main() io { if pos(3) { put(1) }; if pos(0) { put(2) } }` | `1` |
| `fn-io` | `fn say(x: Int) io { put(x) }`, `fn main() io { say(4) }` | `4` |
| `fn-void` | `fn f() { }`, `fn main() io { f() }` | none |
| `fn-discard` | `fn g(): Int { ret 1 }`, `fn main() io { g() }` | none |
| `ret-bare` | `fn stop(n: Int) io { if 0 < n { ret }; put(n) }`, `fn main() io { stop(0); stop(5) }` | `0` |
| `fn-recursion` | `fn fact(n: Int): Int { if n <= 1 { ret 1 }; ret n * fact(n - 1) }`, `fn main() io { put(fact(10)) }` | `3628800` |
| `if-else-return` | `fn f(n: Int): Int { if n == 0 { ret 1 } else { ret 2 } }`, `fn main() io { put(f(0)); put(f(1)) }` | `1`, `2` |
| `wh-sum` | `fn main() io { var i = 0; var s = 0; wh i < 5 { i = i + 1; s = s + i }; put(s) }` | `15` |
| `if-else-chain` | `fn main() io { if false { put(1) } else { put(2) } }` | `2` |
| `layout` | `fn main() io {`, LF, `  let a = 1;`, LF, `  if a == 1 { put(a) }`, LF, `}` | `1` |
| `paren-nested` | `fn main() io { put(-((4))) }` | `-4` |
| `shadow` | `fn main() io { let a = 1; if true { let a = 2; put(a) }; put(a) }` | `2`, `1` |
| `example-ok` | `fn double(x: Int): Int { ret x * 2 } ex double(3) == 6 ex not false`, `fn main() io { put(double(4)) }` | `8` |
| `example-call-ok` | `fn fact(n: Int): Int { if n <= 1 { ret 1 }; ret n * fact(n - 1) } ex fact(5) == 120`, `fn main() io { put(fact(5)) }` | `120` |
| `step-ok` | `fn main() io { var i = 0; wh i < 1000 { i = i + 1 }; put(1) }` | `1` |
| `trap-min-mod` | `fn main() io { let m = -9223372036854775807 - 1; put(m % -1) }` | `0` |

Trap tests (kind `run`; stdout is listed, stderr and status are required):

| Test | Program | Stdout | Stderr | Status |
| --- | --- | --- | --- | --- |
| `trap-overflow` | `fn main() io { put(4611686018427387904 * 2) }` | none | `trap: overflow` | 1 |
| `trap-add` | `fn main() io { put(9223372036854775807 + 1) }` | none | `trap: overflow` | 1 |
| `trap-sub` | `fn main() io { put(-9223372036854775807 - 2) }` | none | `trap: overflow` | 1 |
| `trap-neg` | `fn main() io { let m = -9223372036854775807 - 1; put(-m) }` | none | `trap: overflow` | 1 |
| `trap-min` | `fn main() io { let m = -9223372036854775807 - 1; put(m / -1) }` | none | `trap: overflow` | 1 |
| `trap-div` | `fn main() io { put(1 / 0) }` | none | `trap: divide-by-zero` | 1 |
| `trap-mod` | `fn main() io { put(1 % 0) }` | none | `trap: divide-by-zero` | 1 |
| `trap-stack` | `fn f(n: Int): Int { ret f(n) }`, `fn main() io { put(f(1)) }` | none | `trap: stack-exhausted` | 1 |
| `trap-step` | `fn main() io { put(1); wh true { } }` | `1` | `trap: step-exhausted` | 1 |

Compile-error tests (kind `compile-error`). `glyphc check` exits 1, and its one record is compared by `code`, `span` and `fix` (RFC 0004 section 7). Every fix is `none`. Each program has only the error listed.

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-text-lit` | `fn main() io { let t = "a" }` | the `"a"` | E0200 |
| `err-text-put` | `fn main() io { put("a") }` | the `"a"` | E0200 |
| `err-text-if` | `fn main() io { if "a" { } }` | the `"a"` | E0200 |
| `err-text-op` | `fn main() io { put(1 + "a") }` | the `"a"` | E0200 |
| `err-text-name` | `fn main() io { let x = Text }` | the `Text` | E0301 |
| `err-text-param` | `fn f(t: Text) io { } fn main() io { }` | the `Text` | E0100 |
| `err-text-result` | `fn f(): Text io { } fn main() io { }` | the `Text` | E0100 |
| `err-type` | `fn main() io { if 1 { } }` | the `1` | E0200 |
| `err-cmp-type` | `fn main() io { if true < false { } }` | the `<` | E0200 |
| `err-cmp-ge-bool` | `fn main() io { if true >= false { } }` | the `>=` | E0200 |
| `err-bool-op` | `fn main() io { let a = 1 and true }` | the `and` | E0200 |
| `err-not` | `fn main() io { let a = not 1 }` | the `not` | E0200 |
| `err-put-bool` | `fn main() io { put(true) }` | the `true` | E0200 |
| `err-put-arity` | `fn main() io { put(1, 2) }` | the `put` | E0200 |
| `err-arity` | `fn add(a: Int, b: Int): Int { ret a + b } fn main() io { put(add(1)) }` | the `add` | E0200 |
| `err-void-value` | `fn f() io { } fn main() io { let x = f() }` | the call `f()` | E0200 |
| `err-ret-value` | `fn f() io { ret 1 } fn main() io { f() }` | the `1` | E0200 |
| `err-ret-bare` | `fn f(): Int io { ret } fn main() io { put(f()) }` | the `ret` | E0200 |
| `err-assign-type` | `fn main() io { var a = 1; a = true }` | the `true` | E0200 |
| `err-example-type` | `fn f(): Int { ret 1 } ex 1 fn main() io { put(f()) }` | the `1` after `ex` | E0200 |
| `err-main-sig` | `fn main(n: Int) io { }` | the `main` | E0200 |
| `err-main-result` | `fn main(): Int io { ret 0 }` | the `main` | E0200 |
| `err-missing-ret` | `fn f(n: Int): Int { if n == 0 { ret 1 } } fn main() io { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `err-if-else-partial` | `fn f(n: Int): Int io { if n == 0 { ret 1 } else { put(2) } } fn main() io { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `err-wh-return` | `fn f(): Int { wh false { ret 1 } } fn main() io { put(f()) }` | the closing `}` of `f` | E0201 |
| `err-example` | `fn f(): Int { ret 1 } ex 1 == 2 fn main() io { put(f()) }` | the example | E0202 |
| `err-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0 fn main() io { put(f()) }` | the example | E0202 |
| `err-example-budget` | `fn spin(): Int { wh true { }; ret 0 } ex spin() == 0 fn main() io { }` | the example | E0202 |
| `err-example-stack` | `fn f(n: Int): Bool { ret f(n) } ex f(1) fn main() io { }` | the example | E0202 |
| `err-dup` | `fn add(): Int { ret 1 } fn add(): Int { ret 2 } fn main() io { }` | the second `add` | E0300 |
| `err-dup-main` | `fn main() io { } fn main() io { }` | the second `main` | E0300 |
| `err-dup-param` | `fn f(a: Int): Int { let a = 1; ret a } fn main() io { put(f(1)) }` | the `a` of `let a` | E0300 |
| `err-dup-param-2` | `fn f(a: Int, a: Int) io { } fn main() io { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `err-reserved` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `err-fn-put` | `fn put(): Int { ret 1 } fn main() io { }` | the `put` | E0300 |
| `err-binding-fn` | `fn g(): Int { ret 1 } fn main() io { let g = 2 }` | the `g` | E0300 |
| `err-int-max` | `fn main() io { put(9223372036854775808) }` | the literal | E0500 |
| `err-int-min` | `fn main() io { put(-9223372036854775808) }` | the literal `9223372036854775808`, not the `-` | E0500 |
| `err-unknown` | `fn main() io { put(zz) }` | the `zz` | E0301 |
| `err-print` | `fn main() io { print(1) }` | the `print` | E0301 |
| `err-use-before` | `fn main() io { put(a); let a = 1 }` | the first `a` | E0301 |
| `err-type-value` | `fn main() io { let x = Int }` | the `Int` | E0301 |
| `err-fn-value` | `fn add(a: Int, b: Int): Int { ret a + b } fn main() io { let f = add }` | the `add` | E0301 |
| `err-main` | `fn f() { }` | the end-of-file token | E0302 |
| `err-assign-let` | `fn main() io { let a = 1; a = 2 }` | the `a` of `a = 2` | E0303 |
| `err-assign-param` | `fn f(n: Int) io { n = 2 } fn main() io { f(1) }` | the `n` of `n = 2` | E0303 |
| `err-effect` | `fn f() { put(1) } fn main() io { f() }` | the `put` | E0400 |
| `err-effect-call` | `fn g() io { } fn f() { g() } fn main() io { f() }` | the `g` | E0400 |
| `err-effect-example` | `fn say(): Int io { ret 1 } ex say() == 1 fn main() io { put(say()) }` | the `say` in the example | E0400 |

Syntax errors are RFC 0048's `v4-err-*` tests. `trap-step` and `err-example-budget` each run 10000000 steps, unmeasured.

## Open questions

1. **P0, P1, and RFC 0048's meaning source (blocking).** See the Test plan. RFC 0048 cites `kernel-v9` (rejected) for its meanings. RFC 0048's author or the owner must cite this draft instead.
2. **TR3 and TR4.** The per-call counter and the traps-outside-signatures exception need confirmation. If per-call counting is rejected, the group must still pick a loop bound (principle 7). The 10000000 limit is unmeasured.
3. **Title.** The assigned title names text output, which this draft does not provide (C4). The orchestrator may rename it.
4. **`?` is internal (E10).** The group should confirm that no program can name it.
5. **`print-one`.** It fails under this draft. Only the owner's retirement commit removes it (Test plan).
