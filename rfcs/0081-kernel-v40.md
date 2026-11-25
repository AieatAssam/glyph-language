---
status: rejected
votes:
  designer-min: abstain
  designer-prag: reject
  impl-1: abstain
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v40
Status: draft
Replaces: RFC 0080 (kernel-v39, rejected). Keeps its design. Removes the fail mark (F7, E0403, rule C0). Adds text output as a text literal that is the whole argument of `put` (T3, P1, P2).
Depends on: `lexical-syntax-v4` (RFC 0048), RFC 0004 (diagnostic records), RFC 0011 (`.gl` extension), RFC 0055 (E0201), RFC 0069 (E0202, and the text-literal rule).
Amends: RFC 0069 T3, for one case: a text literal as the whole argument of `put`. Amends RFC 0048's test plan: `v4-grammar-text` (T0048).
Alters tests: yes. `conformance/kernel/print-one.test` (rfc 0020) runs `fn main() io { print(1) }`. `print` is not a builtin in this RFC, so that test fails. This draft does not edit or delete it. Retiring it changes a conformance test, so it needs a supermajority (RULES rule 4), and the decision is for the owner (Open question 4).
Breaking: yes.

**Gates.** Nothing here is voted on until both are settled.

- G-a. RFC 0048 is in force. Its front matter says `accepted`, but its tally is 4 approve and 2 reject. 4/6 is 0.6666..., below `accept_ratio` 0.6667. The orchestrator must settle whether RFC 0048 stands. This draft builds on its grammar.
- G-b. RULES rule 6. This draft resubmits RFC 0080 and RFCs 0061 to 0079 in substance. Their rejection dates are not recorded here, so the 10-night cooldown cannot be confirmed. If the orchestrator finds it has not run, withdraw this draft and do not vote.

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` and `Bool` values, `let` and `var` bindings, functions with an optional result `: R` and an optional effect `io`, `if`, `wh`, `ret`, and file-level examples (`ex`). `put` prints an `Int`, or the bytes of a text literal. There is no `Text` type. Traps end a run with status 1. No function carries a trap mark.

## Motivation

RFC 0080 was rejected. Each objection is answered here.

- **Test breakage (designer-min).** The header says `Alters tests: yes` and names `print-one.test`. Retirement is left to the owner.
- **Fail mark (designer-min, designer-prag).** Its omission rate was never measured, and it added a token and a code (E0403). This draft removes both. Open question 1 covers principle 3.
- **Gates and cooldown (designer-prag, impl-1, tester).** Gates G-a and G-b must be settled before any vote.
- **Text output (user-1, user-2).** Text is printed with `put("...")`. It is not a type.
- **Card (user-2).** The card shows `Int`, `Bool`, `put`, `if`, `wh`, `ret`, `ex` and `io`.
- **Counts (designer-min).** Card and core counts are hand counts, labelled as such in Cost.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, keywords, literals and lexical errors are those of RFC 0048. The grammar is RFC 0048's `program` through `primary` productions, unchanged. There is no `fail` token: `fail` is an ordinary identifier. The keyword count stays at fourteen.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (RFC 0048, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. **Text literals.** A `TEXT` token is valid only as the whole argument of a call to `put` (P1). Anywhere else, including a binding, an operand, a condition, an argument to any other function, and a result, it is E0200 at the literal, and the expression has type `?` (E10). There is no type `Text`. `Text` is an ordinary name: in a `ptype` or `rtype` position it is E0100 (RFC 0048), and as a value it is E0301.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value, it is E0200 at the call, and the value has type `?`.

T6. `ptype` and `rtype` accept `Int` and `Bool` only (RFC 0048). Any other token there is E0100.

T7. `Int` and `Bool` used as values are E0301 at the name.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; call, literal, name, `( expr )`. Binary operators are left-associative, except the comparisons, which do not chain (RFC 0048, G6).

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` truncates toward zero. `%` takes the sign of its left operand, so `-7 % 3` is `-1`. A zero divisor for `/` or `%` traps `divide-by-zero`. `MIN / -1` traps `overflow`. `MIN % -1` is `0` and does not trap.

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200 (E11).

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200 (E11).

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes `Bool`. Otherwise E0200 (E11).

E6. `+`, `-`, `*`, `/`, `%` and unary `-` take `Int` operands. Otherwise E0200 (E11).

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200 (E11).

E8. A call's argument count and types must match its parameters. Otherwise E0200 (E11).

E9. Evaluation is left to right: the left operand, then the right; call arguments in order, then the call.

E10. **Recovery.** A failed expression takes its operator's type (`Bool` for comparisons, `and`, `or` and `not`; `Int` for arithmetic), its callee's result type for a call, or `?` otherwise. A `?` operand is accepted by any rule without a further diagnostic.

E11. **Spans.** An operator error (E3 to E6) is E0200 at the operator token; its operands are not reported separately. A condition error (E7) is at the condition. An argument error (E8) is at the argument. An arity error is at the callee name.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (RFC 0048, G10). A text literal here is T3.

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, as if by a `let` at its start, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int` or `Bool`. Otherwise E0300 at the new name. `Text` and `fail` are not reserved.

### Functions

F1. `fn NAME(p1: T1, ...) [: R] [io] block`. `: R` comes before `io`, and both are optional. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int` or `Bool` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **No trap mark.** A function's signature does not show whether its body can trap. The author writes no mark, and the compiler checks none. Open question 1 records this against principle 3.

C0. **Ordering.** Examples (EX3) are evaluated only when no other error is reported.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in, with the signature `put(x) io`. It takes exactly one argument. The argument is an `Int` expression, or a text literal (T3). Any other argument type, including `Bool`, is E0200 at the argument. An argument of type `?` is accepted without a further diagnostic. Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. For an `Int`, `put` writes the value in decimal, with a leading `-` if negative and no leading zeros, then one LF. For a text literal, `put` writes the decoded bytes (RFC 0048, rule 9), then one LF. No quote is written.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals, loops and examples

C1. `if cond block [ else block ]`. The `else` part is a block only (RFC 0048, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

EX1. `ex EXPR` follows a function's closing `}` or another example of that function (RFC 0048, G5).

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each evaluate every example when C0 finds no error, at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false`, or any trap, is E0202, spanning from `ex` to the last token of its expression. `build` and `run` then write no module.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Earlier output stays written. The kinds are `overflow` (E1, E2), `divide-by-zero` (E2), `stack-exhausted` (TR2) and `step-exhausted` (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is made at each function entry.

TR3. **Loop counter per call.** Each call frame has its own counter, starting at 0. Each evaluation of a `wh` condition in that frame's own body adds 1, true or false. Before an addition would exceed 10000000, the run traps `step-exhausted`. Calls are not counted here, because TR2 bounds them. The limit is Open question 2.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order among that function's examples.

### Card

K1. The implementing PR replaces `spec/card.md` with the text below, followed by the existing diagnostics block, unchanged.

```
# Glyph

Source: *.gl, compiler glyphc

# Card: kernel

Types: Int, Bool. Text literal only as put's whole argument.
Bind: let x = e; var x = e. x = e needs var.
Fn: fn f(a: Int, b: Bool): Int io { ret e } ex e.
Stmts ;-separated: let, var, x = e, f(), if e { } else { }, wh e { }, ret [e].
Ops low to high: or; and; == != < <= > >= (no chain); + -; * / %; unary - not.
Int: 64-bit. + - * unary - trap overflow; / % trap divide-by-zero.
Output: put(x) io prints Int, then LF. put("t") io prints t, then LF.
Entry: fn main() [io]. No parameters, no result.
Ex: ex e after a fn; e must be Bool and true. Checked on check, build, run.
Trap: stderr "trap: K", exit 1. K: overflow, divide-by-zero, stack-exhausted, step-exhausted.
```

### Diagnostics

Records follow RFC 0004 section 2. This draft adds no code. The codes below are those of RFC 0055, RFC 0069 and kernel-v9's table, and none is in `spec/errors.json` yet (only E0500 is).

| Code | Meaning | Span |
| --- | --- | --- |
| E0200 | Type mismatch (E3 to E8, B2, F4, EX2, M1, P1); a text literal outside P1 (T3); a valueless call as a value; `main` signature | Per E11, or the literal. For a bare `ret` where a value is needed, the `ret` keyword |
| E0201 | Function with a result clause can reach its closing brace (F3) | The closing `}` of the body |
| E0202 | Example is `false` or traps (EX3) | From `ex` to the end of its expression |
| E0300 | Duplicate or reserved name (B4, B5, M1, F6) | The new name |
| E0301 | Unknown name; use before declaration; function, `put`, `Int` or `Bool` used as a value | The name |
| E0302 | No `main` (M1) | The end-of-file token |
| E0303 | Assignment to a `let` binding or a parameter (B2) | The target name |
| E0400 | Call to an `io` function or `put` from a function without `io`, or from an example | The callee name |

## Alternatives

- **Keep the fail mark (RFC 0080, F7).** Rejected for this draft: its omission rate is unmeasured, and it adds a token and a code. A later RFC may add it with a measurement.
- **A `Text` type (RFC 0079), or a bindable `Text` value.** Rejected. Either needs a type and its rules, and the whole-argument form prints text without one (Open question 3).
- **Text literal as E0100, as RFC 0069 has it.** Rejected. The kernel could not print text, and the assigned title asks for it.
- **Keep `print` as a synonym of `put`.** Rejected under principle 1.

## Cost

**Measurement.** These are hand counts with the rule of `tools/check/tokens.py` (alphabetic run of n letters ceil(n/4), digit run ceil(n/3), other character 1). The protected counter was not run.

- **Card.** The gate's protected counter reports the current card at 244 of 2,000 (rule 9). The K1 kernel block adds about 280 by hand, so the card is about 520, under the cap.
- **Core.** The gate reports the current core at 917 of 12,000. The kernel's normative text goes into `spec/core` in the implementing PR, which must count it. This draft claims no core figure.
- **Removed, relative to RFC 0080:** the `fail` production and card words; F7, C0 and E0403; the tests that use `fail`.
- **Added:** T3 and P1 for text literals, the P2 text clause, one card line, and the text tests.

## Test plan

Each conformance test is a file in `conformance/kernel/`, with `id` (`kernel/<name>`), `rfc` (the number the publisher assigns) and `kind` in its meta block. A run test states stdout, stderr and status. A compile-error test holds one error and states the expected record's `code`, `span` and `fix` (RFC 0004 section 7). Every fix is `none`.

Run tests (status 0 unless stated):

| Test | Program | Expected stdout |
| --- | --- | --- |
| `put-one` | `fn main() io { put(1) }` | `1` |
| `print-int` | `fn main() io { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `int-min` | `fn main() io { put(-9223372036854775807 - 1) }` | `-9223372036854775808` |
| `put-text` | `fn main() io { put("a\n\"b\"\\") }` | `a`, `"b"\` |
| `put-mixed` | `fn main() io { put("x"); put(7) }` | `x`, `7` |
| `let-var` | `fn main() io { let a = 1; var b = 2; b = b + a; put(b) }` | `3` |
| `let-bool` | `fn main() io { let b = 1 < 2; if b { put(1) } }` | `1` |
| `bool-ops` | `fn main() io { if 1 < 2 and not false { put(1) } else { put(2) } }` | `1` |
| `bool-or` | `fn main() io { if false or 1 < 2 { put(1) } }` | `1` |
| `short-circuit` | `fn side(): Bool io { put(9); ret true }`, `fn main() io { if false and side() { put(1) }; if true or side() { put(2) } }` | `2` |
| `cmp-ordering` | `fn main() io { if 2 > 1 { put(1) }; if 2 >= 2 { put(2) }; if 1 <= 2 { put(3) }; if 1 >= 2 { put(9) } }` | `1`, `2`, `3` |
| `cmp-eq` | `fn main() io { if 1 != 2 { put(3) }; if true == true { put(4) } }` | `3`, `4` |
| `arith` | `fn main() io { put(7 / -2); put(-7 % 3); put(2 * 3 + 4 * 5); put(-3 + 1); put((1 + 2) * 3) }` | `-3`, `-1`, `26`, `-2`, `9` |
| `rem-identity` | `fn main() io { put(17 - 17 / 5 * 5); put(17 % 5) }` | `2`, `2` |
| `min-mod` | `fn main() io { let m = -9223372036854775807 - 1; put(m % -1) }` | `0` |
| `digit-sum` | `fn main() io { var n = 1204; var s = 0; wh 0 < n { s = s + n % 10; n = n / 10 }; put(s) }` | `7` |
| `eval-order` | `fn a(): Int io { put(1); ret 1 }`, `fn b(): Int io { put(2); ret 2 }`, `fn main() io { if a() < b() { put(3) } }` | `1`, `2`, `3` |
| `fn-call` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { put(add(2, 3)) }` | `5` |
| `fn-result-io` | `fn sq(x: Int): Int io { put(x); ret x * x }`, `fn main() io { put(sq(3)) }` | `3`, `9` |
| `fn-bool-param` | `fn pick(b: Bool): Int { if b { ret 1 }; ret 2 }`, `fn main() io { put(pick(true)); put(pick(false)) }` | `1`, `2` |
| `fn-bool-result` | `fn pos(n: Int): Bool { ret 0 < n }`, `fn main() io { if pos(3) { put(1) }; if pos(0) { put(2) } }` | `1` |
| `fn-io` | `fn say(x: Int) io { put(x) }`, `fn main() io { say(4) }` | `4` |
| `fn-void` | `fn f() { }`, `fn main() io { f() }` | none |
| `fn-discard` | `fn g(): Int { ret 1 }`, `fn main() io { g() }` | none |
| `fail-is-name` | `fn fail(): Int { ret 1 }`, `fn main() io { put(fail()) }` | `1` |
| `ret-bare` | `fn stop(n: Int) io { if 0 < n { ret }; put(n) }`, `fn main() io { stop(0); stop(5) }` | `0` |
| `fn-recursion` | `fn fact(n: Int): Int { if n <= 1 { ret 1 }; ret n * fact(n - 1) }`, `fn main() io { put(fact(10)) }` | `3628800` |
| `if-else-return` | `fn f(n: Int): Int { if n == 0 { ret 1 } else { ret 2 } }`, `fn main() io { put(f(0)); put(f(1)) }` | `1`, `2` |
| `wh-sum` | `fn main() io { var i = 0; var s = 0; wh i < 5 { i = i + 1; s = s + i }; put(s) }` | `15` |
| `if-else-chain` | `fn main() io { if false { put(1) } else { put(2) } }` | `2` |
| `layout` | `fn main() io {`, LF, `  let a = 1;`, LF, `  if a == 1 { put(a) }`, LF, `}` | `1` |
| `paren-nested` | `fn main() io { put(-((4))) }` | `-4` |
| `shadow` | `fn main() io { let a = 1; if true { let a = 2; put(a) }; put(a) }` | `2`, `1` |
| `example-ok` | `fn double(x: Int): Int { ret x * 2 } ex double(3) == 6 ex not false`, `fn main() io { put(double(4)) }` | `8` |
| `step-ok` | `fn main() io { var i = 0; wh i < 1000 { i = i + 1 }; put(1) }` | `1` |
| `comment-line` | `fn main() io { put(1) // put(9)`, LF, `}` | `1` |

Trap tests (stdout empty unless stated; stderr; status 1):

| Test | Program | Stderr |
| --- | --- | --- |
| `trap-overflow` | `fn main() io { put(4611686018427387904 * 2) }` | `trap: overflow` |
| `trap-add` | `fn main() io { put(9223372036854775807 + 1) }` | `trap: overflow` |
| `trap-sub` | `fn main() io { put(-9223372036854775807 - 2) }` | `trap: overflow` |
| `trap-neg` | `fn main() io { let m = -9223372036854775807 - 1; put(-m) }` | `trap: overflow` |
| `trap-min` | `fn main() io { let m = -9223372036854775807 - 1; put(m / -1) }` | `trap: overflow` |
| `trap-div` | `fn main() io { put(1 / 0) }` | `trap: divide-by-zero` |
| `trap-mod` | `fn main() io { put(1 % 0) }` | `trap: divide-by-zero` |
| `trap-stack` | `fn f(n: Int): Int { ret f(n) }`, `fn main() io { put(f(1)) }` | `trap: stack-exhausted` |
| `trap-step` | `fn main() io { put(1); wh true { } }`. Stdout `1`. | `trap: step-exhausted` |

Compile-error tests (one error each; the span is the one named):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `kc-text-let` | `fn main() io { let t = "x" }` | the `"x"` | E0200 |
| `kc-text-op` | `fn main() io { put(1 == "b") }` | the `"b"` | E0200 |
| `kc-text-arg` | `fn f(n: Int) io { }`, `fn main() io { f("a") }` | the `"a"` | E0200 |
| `kc-put-bool` | `fn main() io { put(true) }` | the `true` | E0200 |
| `kc-put-arity` | `fn main() io { put(1, 2) }` | the `put` | E0200 |
| `kc-type` | `fn main() io { if 1 { } }` | the `1` | E0200 |
| `kc-cmp-type` | `fn main() io { if true < false { } }` | the `<` | E0200 |
| `kc-bool-op` | `fn main() io { let a = 1 and true }` | the `and` | E0200 |
| `kc-arity` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { put(add(1)) }` | the `add` | E0200 |
| `kc-void-value` | `fn f() io { }`, `fn main() io { let x = f() }` | the call `f()` | E0200 |
| `kc-ret-value` | `fn f() io { ret 1 }`, `fn main() io { f() }` | the `1` | E0200 |
| `kc-ret-bare` | `fn f(): Int io { ret }`, `fn main() io { put(f()) }` | the `ret` | E0200 |
| `kc-assign-type` | `fn main() io { var a = 1; a = true }` | the `true` | E0200 |
| `kc-example-type` | `fn f(): Int { ret 1 } ex 1`, `fn main() io { put(f()) }` | the `1` after `ex` | E0200 |
| `kc-main-sig` | `fn main(n: Int) io { }` | the `main` | E0200 |
| `kc-int-max` | `fn main() io { put(9223372036854775808) }` | the literal | E0500 |
| `kc-int-min` | `fn main() io { put(-9223372036854775808) }` | the literal `9223372036854775808`, not the `-` | E0500 |
| `kc-missing-ret` | `fn f(n: Int): Int { if n == 0 { ret 1 } }`, `fn main() io { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `kc-if-else-partial` | `fn f(n: Int): Int io { if n == 0 { ret 1 } else { put(2) } }`, `fn main() io { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `kc-wh-return` | `fn f(): Int { wh false { ret 1 } }`, `fn main() io { put(f()) }` | the closing `}` of `f` | E0201 |
| `kc-example` | `fn f(): Int { ret 1 } ex 1 == 2`, `fn main() io { put(f()) }` | `ex 1 == 2` | E0202 |
| `kc-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0`, `fn main() io { put(f()) }` | `ex 1 / 0 == 0` | E0202 |
| `kc-example-budget` | `fn spin(): Int { wh true { }; ret 0 } ex spin() == 0`, `fn main() io { }` | `ex spin() == 0` | E0202 |
| `kc-example-stack` | `fn f(n: Int): Bool { ret f(n) } ex f(1)`, `fn main() io { }` | `ex f(1)` | E0202 |
| `kc-dup` | `fn add(): Int { ret 1 }`, `fn add(): Int { ret 2 }`, `fn main() io { }` | the second `add` | E0300 |
| `kc-dup-main` | `fn main() io { }`, `fn main() io { }` | the second `main` | E0300 |
| `kc-dup-param` | `fn f(a: Int): Int { let a = 1; ret a }`, `fn main() io { put(f(1)) }` | the `a` of `let a` | E0300 |
| `kc-dup-param-2` | `fn f(a: Int, a: Int) io { }`, `fn main() io { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `kc-reserved-put` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `kc-reserved-int` | `fn main() io { let Int = 1 }` | the `Int` | E0300 |
| `kc-fn-put` | `fn put(): Int { ret 1 }`, `fn main() io { }` | the `put` | E0300 |
| `kc-binding-fn` | `fn g(): Int { ret 1 }`, `fn main() io { let g = 2 }` | the `g` | E0300 |
| `kc-unknown` | `fn main() io { put(zz) }` | the `zz` | E0301 |
| `kc-use-before` | `fn main() io { put(a); let a = 1 }` | the first `a` | E0301 |
| `kc-type-value` | `fn main() io { put(Int) }` | the `Int` | E0301 |
| `kc-fn-value` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { let f = add }` | the `add` | E0301 |
| `kc-no-main` | `fn f() { }` | the end-of-file token | E0302 |
| `kc-assign-let` | `fn main() io { let a = 1; a = 2 }` | the `a` of `a = 2` | E0303 |
| `kc-assign-param` | `fn f(n: Int) io { n = 2 }`, `fn main() io { f(1) }` | the `n` of `n = 2` | E0303 |
| `kc-effect` | `fn f() { put(1) }`, `fn main() io { f() }` | the `put` | E0400 |
| `kc-effect-call` | `fn g() io { }`, `fn f() { g() }`, `fn main() io { f() }` | the `g` | E0400 |
| `kc-effect-example` | `fn say(): Int io { ret 1 } ex say() == 1`, `fn main() io { put(say()) }` | the `say` in the example | E0400 |

T0048. RFC 0048's planned tests change as follows. None is in `conformance/` yet.

- `v4-grammar-text` becomes `fn main() io { put("x") }`, output `x` (T3, P1). The old form `let t = "x"` is E0200 under T3.
- The other RFC 0048 tests are unchanged. None uses `fail`, so none needs the mark removed. Its `v4-err-text-param` and `v4-err-text-result` remain as they are and cover T6.

Every grammar production is reached by a run or compile-error test above, or by an RFC 0048 test: `fn_decl` with and without a result and `io`, `param`, `ptype`, `rtype`, `block`, all seven `stmt` forms, `args`, each expression level, and `primary` with `INT`, `TEXT`, `true`, `false`, a call, a name and parentheses.

## Open questions

1. **Trap marks and principle 3.** Principle 3 says a function's failure is visible in its signature. Traps are not visible in signatures in this draft. That is a trade-off against principle 3, and the group must confirm it. A trap mark needs a measured omission rate in its own RFC, and it would change every function that divides or adds.
2. **TR3 limit.** The limit of 10000000 loop steps per call frame is not measured.
3. **Text beyond the literal.** A text type, its operations and its binding rules belong to a standard-library RFC. Until then, `put` takes a text literal only.
4. **`print-one.test`.** It fails under this draft. Retiring it is a supermajority decision (RULES rule 4) for the owner. If the owner keeps it, this draft cannot pass as written.
5. **Amendments.** RFC 0069 T3 and the RFC 0048 test plan are amended here. If RFC 0048 is revised, T0048 moves into it.
6. **Codes.** E0200 to E0202, E0300 to E0303, E0400 and RFC 0048's E0003 are not in `spec/errors.json`. The first PR that emits each adds it.
7. **Cooldown (G-b).** Unconfirmed, as stated in the gates.
