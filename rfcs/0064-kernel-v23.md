---
alters_tests: true
status: rejected
votes:
  designer-min: abstain
  designer-prag: reject
  impl-1: reject
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v23
Status: draft
Replaces: RFC 0063 (kernel-v22, rejected). Resubmits RFC 0061 (kernel-v20) and RFC 0062 (kernel-v21), both rejected, in substance. See Changes.
Depends on: `lexical-syntax-v4` (RFC 0048); RFC 0004 (records and traps); RFC 0011 (`.gl`).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (signed 64-bit), `Bool`, bindings, functions, `if`, `wh`, `ret` and file-level examples (`ex`). The builtin `put` prints an `Int`. A run ends by a return from `main` or by one of four traps, each with exit status 1. A text literal parses but is E0200. Text belongs to a standard library RFC not yet written.

This RFC gives the meanings that RFC 0048 cites as `kernel-v9`, which RFC 0049 rejected (Open question 1).

No vote opens until the orchestrator has checked preconditions P0 and P1 (Test plan). The designer cannot make either hold.

## Motivation

- RFC 0061 to RFC 0063 were rejected. This draft keeps their design and fixes each objection a designer can fix (see Changes). P0 and P1 are orchestrator checks, and this draft does not claim they hold.

## Changes from RFC 0063

- **C1. Vote arithmetic.** Six non-abstaining votes need five approvals for 0.6667 and 0.75 (RULES rule 4). Four of six is 0.6666..., below 0.6667.
- **C2, C13. RFC 0048 (P0).** Its status conflict and votes stand as recorded. This designer cannot correct it, and this draft does not claim P0 holds.
- **C3, C12. Cooldown (P1).** The latest rejection is RFC 0062, so rule 6 counts from it. Its date is not in this repository.
- **C4 to C9.** Opening is not voting. Codes enter `spec/errors.json` with their first PR, and K1 lands with it.
- **C10. One-error rule (designer-min, tester).** New rule L2: a syntax error ends compilation. `err-text-result` gives E0100 only.
- **C11. Cost measured (designer-min).** See Cost.
- **C14. Card (user-1, user-2).** K1 is not in `spec/card.md` until merge. Its full text is below.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, grammar, and the lexical and syntax errors are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens. A text literal is a `TEXT` token.

L2. **Phases.** Lexing, then parsing, then checking. If lexing or parsing reports an error, the checker does not run and the compiler writes only that record (lexical-syntax-v4, rule 13 and G12). Checker codes (E0200 to E0202, E0300 to E0303, E0400, E0500) apply only to programs with no lexical or syntax error. This extends RFC 0004 section 3 (Open question 6).

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is E0200 at the literal, wherever it appears, and has type `?` (E10). It is reported once, by this rule.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value, it is E0200 at the call, and the value has type `?`. A call statement discards any result.

T6. A parameter type or result type is `Int` or `Bool`, the only tokens `ptype` and `rtype` accept. Any other token there, including `Text`, is E0100 at that token (L2: no other record).

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

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each evaluate every example when there is no other compile error (L2). Each example is its own run, at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false`, or any trap, is E0202 at the example. The span runs from the `ex` keyword to the last token of its expression. A failing example makes `check`, `build` and `run` each exit 1, and `build` and `run` then write no module and run no `main`.

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

Records follow RFC 0004 section 2. Codes are added to `spec/errors.json` by their first PR (C9).

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch; a text literal (T3); a valueless call used as a value; arity; `main` signature | Operator (E3 to E5), argument, callee (arity), `main`, literal, call, `ret` (bare), else the expression |
| E0201 | types | A function with a result clause can reach its closing brace | The closing `}` |
| E0202 | types | An example evaluates to `false`, or traps (EX3) | The example, from `ex` to the end of its expression |
| E0300 | name | Duplicate declaration (B4, M1, F6), reserved name | The new name |
| E0301 | name | Unknown name; use before declaration; a function or type name used as a value | The name |
| E0302 | name | No `main` | The end-of-file token |
| E0303 | name | Assignment to a `let` or a parameter | The target name |
| E0400 | effects | Call to an `io` function or `put` without `io`, or from an example | The callee name |

## Alternatives

- **Check-only examples, one run-wide loop counter, traps in signatures.** Rejected: EX3, TR3, TR4.
- **Checker after a syntax error.** Rejected (L2, C10).

## Cost

Measured: `sbx python3 -m tools.check.run` in this session reported, before this change, core 917 of 12000 and card 244 of 2000.

- **Core.** No file under `spec/` changes, so core stays at 917. The rule text the implementing PR adds to `spec/core` is not measured, because `tools/check/tokens.py` is not an allowed sandbox form. Each non-space character costs at most one token, so their count bounds it above. The merge bot measures the figure.
- **Card.** K1 is about 300 tokens by hand count (±15%); the card would be about 545 of 2000.
- **Removed** relative to RFC 0059: the `Text` arm of `put`, the text-value rules, and their error rows, tests and card clause. **Added:** L2.

## Test plan

Tests live in `conformance/kernel/`, one per file. The `rfc` field of each meta block is this RFC's number, assigned on publication. Each compile-error program is complete: unless it is about `main`, it contains `fn main() io { }`.

Preconditions, checked by the orchestrator before a vote opens (rules 4 and 6). The designer cannot make either hold:

- **P0. RFC 0048.** One status in front matter and body, and votes that meet rule 4 (C2, C13). Today: `accepted` and `Status: draft`, with 4 approve and 2 reject, below 0.6667. Its author or the owner must correct it.
- **P1. Cooldown.** Rule 6 bars resubmitting a rejected RFC in substance for 10 nights. This draft resubmits RFC 0061 and RFC 0062 (C12). No vote may open until ten nights have passed from RFC 0062's rejection, and the orchestrator must supply that date.

Merge conditions, not vote preconditions: the codes in `spec/errors.json`, and K1 in `spec/card.md` (C9).

Changes to conformance tests (`alters_tests: true`): RULES rule 4 then needs `supermajority_ratio` 0.75, which is five approvals of six (C1).

- **Added:** `conformance/kernel/put-one.test`, a run test. Source `fn main() io { put(1) }`, stdout `1`, status 0.
- **Altered, not edited:** `conformance/kernel/print-one.test` (`print(1)`) fails under this RFC, since `print` is E0301. Agents may not edit or delete it. The owner's retirement commit removes it, as a `rules_changed` event with the implementing PR.
- **RFC 0048's tests.** `v4-comment` and `v4-grammar-text` print text, so they are E0200 here. Their author rewrites them.

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

Compile-error tests (kind `compile-error`). `glyphc check` exits 1 with one record, compared by `code`, `span` and `fix` (RFC 0004 section 7). Every fix is `none`. Each program has only the error listed (L2 applies to syntax errors).

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-text-lit` | `fn main() io { let t = "a" }` | the `"a"` | E0200 |
| `err-text-put` | `fn main() io { put("a") }` | the `"a"` | E0200 |
| `err-text-if` | `fn main() io { if "a" { } }` | the `"a"` | E0200 |
| `err-text-op` | `fn main() io { put(1 + "a") }` | the `"a"` | E0200 |
| `err-text-name` | `fn main() io { let x = Text }` | the `Text` | E0301 |
| `err-text-param` | `fn f(t: Text) io { } fn main() io { }` | the `Text` | E0100 |
| `err-text-result` | `fn f(): Text io { } fn main() io { }` | the `Text`; no E0201 (L2) | E0100 |
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

1. **P0, P1, and the resubmission question (blocking).** RFC 0048 cites `kernel-v9` (rejected). P1 counts from RFC 0062 (C12). The orchestrator decides whether opening this draft during the cooldown is a resubmission in substance under rule 6. If it is, the draft should wait.
2. **TR3, TR4.** Confirm per-call counting and traps outside signatures. If per-call counting goes, a loop bound is still needed (principle 7). 10000000 is unmeasured.
3. **Title.** The assigned title names text output, which this draft lacks (C5). The orchestrator may rename it.
4. **`?`.** Confirm that no program can name it (E10).
5. **`print-one`.** Fails until the retirement commit (Test plan).
6. **Phase order (L2).** RFC 0004 section 3 stops only for lexical errors. If the group wants checker records after a syntax error, `err-text-result` must list two records.
