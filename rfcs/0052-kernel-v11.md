---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: abstain
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v11
Status: draft
Replaces: RFC 0051 (kernel-v10, rejected). Keeps every rule of RFC 0051 except those listed under Changes.
Depends on: `lexical-syntax-v4` (RFC 0048) for tokens, grammar and syntax errors. Its front matter says `accepted` and its body says `Status: draft`, so this RFC is not approvable until that is settled (Open question 1). RFC 0011 (`.gl`). Traps and records follow `spec/card.md` (Open questions 3 and 4).

## Summary

The kernel is the smallest part of Glyph that runs a useful program: `Int` (64-bit signed), `Bool` and `Text` (bound, assigned and passed to `put`, nothing else); `let` and `var` with no annotation; functions with optional `: R` and `io`; `if`, `wh` and `ret`; and file-level `ex` examples that `check` evaluates. The builtin output function is `put`. Every run ends by a return from `main` or by one of four traps, each with exit status 1.

## Motivation

RFC 0051 was rejected by three voters. Its owner-chosen syntax stays.

## Changes from RFC 0051

- **C1 (designer-min, designer-prag, impl-1).** The runner change for the retirement is precondition P1.
- **C2 (tester).** `err-text-op` and `err-type-value` give one error each; rule E11 states the recovery.
- **C3 (tester).** Cost: `example double(3) == 6` is 10 tokens and `ex double(3) == 6` is 9.
- **C4 (tester).** Traps and records cite `spec/card.md` (Open questions 3 and 4).
- **C5 (new).** Trap tests are `trap` kind; the runner's `run` kind fails on any trap.
- **C6 (new).** Compile-error tests use the `CODE LINE` form.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, the grammar and the syntax errors E0001, E0003, E0005, E0006, E0100 and E0500 are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens. The grammar's `"Int"`, `"Bool"` and `"put"` mean an `IDENT` with that text.

R1. **Retirement.** The conformance test `kernel/print-one` (file `conformance/kernel/print-one.test`, `rfc: 0020`) is retired by this RFC. Its program `fn main() io { print(1) }` uses `print`, which this RFC does not define, so it cannot pass. The file is not edited or deleted, as the base rules require. Its replacement is `kernel/put-one`. A retired test is not run and is not counted by a gate. The runner change that does this is precondition P1 in the Test plan.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. `Text` is an immutable sequence of UTF-8 bytes. It may appear only as the initialiser of `let` or `var`, as the right side of an assignment to a `var` of type `Text`, or as the argument of `put`. Elsewhere it is E0200.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call.

T6. Parameter and result types are `Int` or `Bool`. A `Text` there is E0100 at the token (lexical-syntax-v4, `ptype` and `rtype`).

T7. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first. Binary operators are left-associative, except the comparisons, which do not chain (lexical-syntax-v4, G6). Unary operators bind tighter than binary ones, as the grammar's `unary` says. `-a * b` is `(-a) * b`, and `not a == b` is `(not a) == b`.

1. `or`
2. `and`
3. `==` `!=` `<` `<=` `>` `>=`
4. `+` `-`
5. `*` `/` `%`
6. unary `-`, `not`
7. call, literal, name, `( expr )`

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` and `%` truncate toward zero. `%` takes the sign of the dividend, so `-7 % 3` is `-1`. A zero divisor traps `divide-by-zero`. `MIN / -1` traps `overflow`. `MIN % -1` is `0`.

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200. `Text` has no equality.

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200, so `true < false` is E0200.

E5. `and` and `or` take `Bool` operands and short-circuit: the right operand is not evaluated when the left decides the result. `not` takes `Bool`. Otherwise E0200.

E6. Unary `-` takes `Int`. `+` is not unary. The grammar rejects it with E0100.

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200.

E8. A call's argument count and types must match its parameters. Otherwise E0200.

E9. Overflow and division by zero are run-time traps. The checker evaluates expressions only in examples (EX3), so `put(1 / 0)` compiles and traps when run.

E10. Evaluation is left to right: the left operand before the right, call arguments in order, then the call. `and` and `or` skip the right operand when the left decides. A trap in an earlier operand happens first.

E11. **Recovery.** A failed expression keeps the result type its operator declares: comparisons, `and`, `or` and `not` give `Bool`; `+ - * / %` and unary `-` give `Int`. A failed call keeps its callee's declared result type. A rejected declaration (E0300, E0303) does not bind. A `let` with no type binds a name whose uses report nothing. So each test program produces exactly the errors it lists.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (lexical-syntax-v4, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch with the variable's type is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. **Parameters are declared in the body block.** Each parameter is declared as if it were a `let` at the start of the body, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int`, `Bool` or `Text`. Otherwise E0300 at the new name.

### Functions and effects

F1. `fn NAME(p1: T1, ...) [: R] [io] block`. `: R` comes before `io`, and both are optional. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the function body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. Every run ends by TR2, TR3, or a return from `main`.

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool` or `Text` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301 at the name.

F7. Functions cannot be nested (lexical-syntax-v4, G5).

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result, and it may have `io`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in with two forms, `put(x: Int) io` and `put(x: Text) io`. The compiler picks the form from the argument's type. Any other argument type, including `Bool`, is E0200 at the argument. Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name. The name `print` has no meaning: a use of it is E0301 at the name (R1).

P2. `put` writes its value and then one LF. An `Int` is written in decimal, with a leading `-` if negative and no leading zeros. A `Text` is written as its UTF-8 bytes, with escapes already applied and no quotes.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals and loops

C1. `if cond block [ else block ]`. The `else` part is a block only (lexical-syntax-v4, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

### Examples

EX1. `ex EXPR` follows a function's closing `}` or another example of that function (lexical-syntax-v4, G5). It belongs to that function.

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. `glyphc check` runs each example as its own run under the TR2 and TR3 limits, with depth and the loop counter at 0. `true` passes. `false`, or any trap, fails with E0202 at the example's span (from `ex` to the last token of its expression). `glyphc run` does not evaluate examples.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. This is the form `spec/card.md` gives. Traps carry no code. Output written before the trap stays written. The kinds are:

- `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
- `divide-by-zero`: `/` or `%` with a zero divisor (E2);
- `stack-exhausted`: call depth would exceed 10000 (TR2);
- `step-exhausted`: more than 1000000000 `wh` condition evaluations in one run (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is made at each function entry.

TR3. A run has one loop counter, starting at 0 when `main` or an example starts. Each evaluation of a `wh` condition adds 1. Before an addition would make it exceed 1000000000, the run traps `step-exhausted`. The counter is never reset. Calls are not counted; TR2 bounds them.

TR4. **Traps are not in signatures.** Principle 3 would put failure in signatures. This RFC does not, for the reasons below; the group must confirm (Open question 2).

- Nearly every function can trap (TR2, TR3), so a marker would sit on almost every function and say nothing.
- No kernel construct catches a trap, so a trap has one fixed result, as principle 7 asks.
- A marker needs propagation rules, which the open error model leaves to a later RFC.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` the repo-relative path. An example is `<file>::<name>#<n>`, `<n>` counting from 1 in source order.

### Diagnostics

Each code below must be listed in `spec/errors.json` by the first PR that emits it (precondition P2). Records follow the form in `spec/card.md`.

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch, including misuse of operators, `Text` outside T3, a value from a call with no result, arity, `main` with a parameter or result | The operator, argument, callee name, `main`, bare `ret` keyword, or else the expression |
| E0201 | types | A function with a result clause can reach its closing brace without returning | The closing `}` of the body |
| E0202 | types | An example evaluates to `false`, or traps | The example (EX3) |
| E0300 | name | Duplicate declaration in one scope, including a parameter (B4); a second `main`; a reserved name | The new name |
| E0301 | name | Unknown name, including `print`; use before declaration; a function, `put` or type name used as a value | The name |
| E0302 | name | No `main` | The end-of-file token |
| E0303 | name | Assignment to a `let` binding or a parameter | The target name |
| E0400 | effects | A call to an `io` function or `put` from a function without `io`, or from an example | The callee name |

## Alternatives

- **Traps in signatures (principle 3).** Rejected for this RFC. TR4.
- **A unit type, or a required `: ()`.** Rejected (T4, T5). Each adds a value or a spelling for "no result".
- **Annotated bindings `let x: T = e`.** Rejected (B1). A second way to write a binding.
- **`print` kept as an alias of `put`.** Rejected. Two spellings for one builtin (principle 1).

## Cost

Hand counts with the rules of `tools/check/tokens.py`: an alphabetic run of n letters costs ceil(n/4), a digit run ceil(n/3), and each other non-space character costs 1. The protected counter was not run; the merge bot's count governs.

| Form | RFC 0020 | This RFC | Change |
| --- | --- | --- | --- |
| `print(1)` | 5 | `put(1)` 4 | -1 per use |
| `while i < 5 {` | 6 | `wh i < 5 {` 5 | -1 per use |
| `return x * x` | 5 | `ret x * x` 4 | -1 per use |
| `example double(3) == 6` | 10 | `ex double(3) == 6` 9 | -1 per use |
| `let x: Int = 1` | 6 | `let x = 1` 4 | -2 per annotation |
| `var t: Text = "a"` | 8 | `var t = "a"` 6 | -2 per annotation |
| two statements on one line | 0 (line end not counted) | 1 (`;`) | +1 per boundary |

Whole program, this RFC's form: `fn fact(n: Int): Int { if n <= 1 { ret 1 }; ret n * fact(n - 1) } fn main() io { put(fact(10)) }`. Header 10, `if` statement 9, `;` 1, `ret` statement 9, `}` 1, `main` 14. Total 44.

Text. The Text rules (T3, the E3 clause, P1, P2) and the `TEXT` token stay, because the brief needs text output. Text operations move to the standard library RFC.

Core spec: not measured; the merge bot checks the 12,000-token cap. Spec card: P3 adds a kernel section, estimated at about 300 tokens against the 2,000 limit, not measured here.

## Test plan

Tests live in `conformance/kernel/`, one per file, with `id`, `rfc` and `kind` in `--- meta`.

Preconditions. The implementing PR does not merge until each holds.

- **P0.** RFC 0048 is accepted in its front matter and its body (Open question 1).
- **P1. Runner.** `tools/check/conformance.py` `discover()`, called by `tools/check/run.py`, skips any test whose `id` is listed in `conformance/retired.txt`, which lists `kernel/print-one`. `tools/` is outside agents' write scope, so the owner makes this change. Until it merges, the gate fails on `kernel/print-one`.
- **P2. Codes.** `spec/errors.json` gains E0200 to E0202, E0300 to E0303, E0400, and E0003 (RFC 0048).
- **P3. Card.** `spec/card.md` gains a kernel section (Cost) with the forms and the trap lines of TR1.

Retired: `kernel/print-one`. Not edited, not deleted, not run once P1 holds.

Replacement, `conformance/kernel/put-one.test`, kind `run`: `fn main() io { put(1) }`, stdout `1`, exit 0.

Run tests (kind `run`; each is a complete program; `put` as defined by Design P1):

| Test | Program | Expected stdout |
| --- | --- | --- |
| `print-int` | `fn main() io { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `put-text` | `fn main() io { put("a\n\"b\"\\") }` | `a`, `"b"\` |
| `let-var` | `fn main() io { let a = 1; var b = 2; b = b + a; put(b) }` | `3` |
| `let-bool` | `fn main() io { let b = 1 < 2; if b { put(1) } }` | `1` |
| `bool-ops` | `fn main() io { if 1 < 2 and not false { put(1) } else { put(2) } }` | `1` |
| `bool-or` | `fn main() io { if false or 1 < 2 { put(1) } }` | `1` |
| `short-circuit` | `fn side(): Bool io { put(9); ret true }`, `fn main() io { if false and side() { put(1) }; if true or side() { put(2) } }` | `2` |
| `cmp-ordering` | `fn main() io { if 2 > 1 { put(1) }; if 2 >= 2 { put(2) }; if 1 <= 2 { put(3) }; if 1 >= 2 { put(9) } }` | `1`, `2`, `3` |
| `cmp-eq` | `fn main() io { if 1 != 2 { put(3) }; if true == true { put(4) } }` | `3`, `4` |
| `arith` | `fn main() io { put(7 / -2); put(-7 % 3); put(2 * 3 + 4 * 5); put(-3 + 1); put((1 + 2) * 3) }` | `-3`, `-1`, `26`, `-2`, `9` |
| `eval-order` | `fn a(): Int io { put(1); ret 1 }`, `fn b(): Int io { put(2); ret 2 }`, `fn main() io { if a() < b() { put(3) } }` | `1`, `2`, `3` |
| `eval-order-ge` | as `eval-order`; `fn main() io { if b() >= a() { put(3) } }` | `2`, `1`, `3` |
| `fn-call` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { put(add(2, 3)) }` | `5` |
| `fn-result-io` | `fn sq(x: Int): Int io { put(x); ret x * x }`, `fn main() io { put(sq(3)) }` | `3`, `9` |
| `fn-bool-param` | `fn pick(b: Bool): Int { if b { ret 1 }; ret 2 }`, `fn main() io { put(pick(true)); put(pick(false)) }` | `1`, `2` |
| `fn-bool-result` | `fn pos(n: Int): Bool { ret 0 < n }`, `fn main() io { if pos(3) { put(1) }; if pos(0) { put(2) } }` | `1` |
| `fn-io` | `fn say(x: Int) io { put(x) }`, `fn main() io { say(4) }` | `4` |
| `fn-void` | `fn f() { }`, `fn main() io { f() }` | no output |
| `ret-bare` | `fn stop(n: Int) io { if 0 < n { ret }; put(n) }`, `fn main() io { stop(0); stop(5) }` | `0` |
| `fn-recursion` | the `fact` program in Cost, `put(fact(10))` | `3628800` |
| `wh-sum` | `fn main() io { var i = 0; var s = 0; wh i < 5 { i = i + 1; s = s + i }; put(s) }` | `15` |
| `if-else-chain` | `fn main() io { if false { put(1) } else { put(2) } }` | `2` |
| `layout` | `fn main() io {`, LF, `  let a = 1;`, LF, `  if a == 1 { put(a) }`, LF, `}` | `1` |
| `paren-nested` | `fn main() io { put(-((4))) }` | `-4` |
| `shadow` | `fn main() io { let a = 1; if true { let a = 2; put(a) }; put(a) }` | `2`, `1` |
| `example-ok` | `fn double(x: Int): Int { ret x * 2 } ex double(3) == 6 ex not false`, `fn main() io { put(double(4)) }` | `8` |
| `example-call-ok` | the `fact` program's `fact` with `ex fact(5) == 120`, `fn main() io { put(fact(5)) }` | `120` |
| `text-bind` | `fn main() io { let u = "x"; var t = "a"; t = "bc"; put(u); put(t) }` | `x`, `bc` |
| `step-ok` | `fn main() io { var i = 0; wh i < 1000 { i = i + 1 }; put(1) }` | `1` |
| `trap-min-mod` | `fn main() io { let m = -9223372036854775807 - 1; put(m % -1) }` | `0` |

Trap tests (kind `trap`: exit code must equal `expect-exit`, and `expect-stderr` must be a substring of stderr; stdout is not checked):

| Test | Program | expect-exit | expect-stderr |
| --- | --- | --- | --- |
| `trap-overflow` | `fn main() io { put(4611686018427387904 * 2) }` | 1 | `trap: overflow` |
| `trap-add` | `fn main() io { put(9223372036854775807 + 1) }` | 1 | `trap: overflow` |
| `trap-sub` | `fn main() io { put(-9223372036854775807 - 2) }` | 1 | `trap: overflow` |
| `trap-neg` | `fn main() io { let m = -9223372036854775807 - 1; put(-m) }` | 1 | `trap: overflow` |
| `trap-min` | `fn main() io { let m = -9223372036854775807 - 1; put(m / -1) }` | 1 | `trap: overflow` |
| `trap-div` | `fn main() io { put(1 / 0) }` | 1 | `trap: divide-by-zero` |
| `trap-mod` | `fn main() io { put(1 % 0) }` | 1 | `trap: divide-by-zero` |
| `trap-stack` | `fn f(n: Int): Int { ret f(n) }`, `fn main() io { put(f(1)) }` | 1 | `trap: stack-exhausted` |
| `trap-step` | `fn main() io { put("before"); wh true { } }` | 1 | `trap: step-exhausted` |

Compile-error tests (kind `compile-error`; `glyphc check` must exit 1, and `expect-errors` lists `CODE LINE` for each error, with the line of the span given in the Error at column; all programs are one line, so each line is 1 except `err-main`, where the line is that of the end-of-file token):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-type` | `fn main() io { if 1 { } }` | the `1` | E0200 |
| `err-cmp-type` | `fn main() io { if true < false { } }` | the `<` | E0200 |
| `err-cmp-ge-bool` | `fn main() io { if true >= false { } }` | the `>=` | E0200 |
| `err-bool-op` | `fn main() io { let a = 1 and true }` | the `and` | E0200 |
| `err-not` | `fn main() io { let a = not 1 }` | the `not` | E0200 |
| `err-put-bool` | `fn main() io { put(true) }` | the `true` | E0200 |
| `err-put-arity` | `fn main() io { put(1, 2) }` | the `put` | E0200 |
| `err-text-op` | `fn main() io { let c = "a" == "b" }` | the `==` | E0200 |
| `err-text-arg` | `fn f(n: Int) io { } fn main() io { f("a") }` | the `"a"` | E0200 |
| `err-arity` | `fn add(a: Int, b: Int): Int { ret a + b } fn main() io { put(add(1)) }` | the `add` | E0200 |
| `err-void-value` | `fn f() io { } fn main() io { let x = f() }` | the call `f()` | E0200 |
| `err-ret-value` | `fn f() io { ret 1 } fn main() io { f() }` | the `1` | E0200 |
| `err-ret-bare` | `fn f(): Int io { ret } fn main() io { put(f()) }` | the `ret` | E0200 |
| `err-assign-type` | `fn main() io { var a = 1; a = true }` | the `true` | E0200 |
| `err-example-type` | `fn f(): Int { ret 1 } ex 1 fn main() io { put(f()) }` | the `1` after `ex` | E0200 |
| `err-main-sig` | `fn main(n: Int) io { }` | the `main` | E0200 |
| `err-missing-ret` | `fn f(n: Int): Int { if n == 0 { ret 1 } } fn main() io { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `err-example` | `fn f(): Int { ret 1 } ex 1 == 2 fn main() io { put(f()) }` | the example | E0202 |
| `err-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0 fn main() io { put(f()) }` | the example | E0202 |
| `err-example-budget` | `fn spin(): Int { wh true { } ret 0 } ex spin() == 0 fn main() io { }` | the example | E0202 |
| `err-example-stack` | `fn f(n: Int): Bool { ret f(n) } ex f(1) fn main() io { }` | the example | E0202 |
| `err-dup` | `fn add(): Int { ret 1 } fn add(): Int { ret 2 } fn main() io { }` | the second `add` | E0300 |
| `err-dup-main` | `fn main() io { } fn main() io { }` | the second `main` | E0300 |
| `err-dup-param` | `fn f(a: Int): Int { let a = 1; ret a } fn main() io { put(f(1)) }` | the `a` of `let a` | E0300 |
| `err-dup-param-2` | `fn f(a: Int, a: Int) io { } fn main() io { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `err-reserved` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `err-fn-put` | `fn put(): Int { ret 1 } fn main() io { }` | the `put` | E0300 |
| `err-binding-fn` | `fn g(): Int { ret 1 } fn main() io { let g = 2 }` | the `g` | E0300 |
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

Syntax-error cases for `Text` in a type position, `->`, `let` annotations and chained comparisons are E0100 tests in RFC 0048's plan (`v4-err-*`), and are not repeated here.

Grammar coverage: every production of `lexical-syntax-v4` is reached by a run, trap or compile-error test here, or by an RFC 0048 test. `put-text` covers the escapes; `trap-step` covers `wh` with an empty block.

## Open questions

1. **RFC 0048's status (blocking).** Its front matter says `accepted` and its body says `Status: draft`, and its votes include two rejects. This RFC is written against its rules as they stand. The group must settle the status before a vote.
2. **Traps and principle 3.** TR4 is the trade-off. The group must confirm the exception.
3. **Trap form.** TR1 follows `spec/card.md`. RFC 0050's draft sets a JSON trap line and exit status 3, which cannot hold together with TR1. If RFC 0050 is accepted, TR1 and every trap test change in a new revision.
4. **Record form.** `spec/card.md` gives `span.line`; RFC 0050 drops it, so the `CODE LINE` form fails if RFC 0050 is adopted.
5. **Retirement without P1.** If the owner declines P1, the group must accept `kernel/print-one` failing for this milestone and record that.
6. **Card.** `spec/card.md` has no kernel syntax, so card-only readers cannot check the examples (user-1, user-2). P3 fixes this after the implementing PR; the group should decide whether the vote waits for it.
7. **Loop limit.** TR3's 1000000000 steps make `err-example-budget` and `trap-step` slow. A smaller limit needs its own decision.
8. **Leading zero.** `007` is E0006 here; RFC 0004's `diag/fix-present` expects E0001 (lexical-syntax-v4, open question 7). The group must settle it.
9. **Counter and build.** The protected counter was not run, and no build or conformance run has been done. Cost figures are hand counts under `tools/check/tokens.py`'s rules.
