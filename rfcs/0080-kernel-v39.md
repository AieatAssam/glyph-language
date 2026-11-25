---
status: draft
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v39
Status: draft
Replaces: RFC 0079 (kernel-v38, rejected). Keeps its design, cuts the Text additions (no Text type; a text literal is E0200, as RFC 0069 T3 says), and keeps the Gates.
Depends on: `lexical-syntax-v4` (RFC 0048), RFC 0004, RFC 0011, RFC 0069 (T3).
Amends: RFC 0048, in its `fn_decl` production, its rule 10 and its test plan (T0048).
Alters tests: no. `conformance/kernel/print-one.test` uses `print`; retiring it is for the owner (Open question 4).

**Gates.** This draft claims no vote precondition. Each open condition must be settled before the implementing PR opens:

- G-a. RFC 0048 is accepted or its amendments are folded in. Its front matter says `accepted`, but its tally is 4 approve, 2 reject; 4/6 = 0.66666 is below `accept_ratio` 0.6667.
- G-b. The rule 6 cooldown does not apply, or has run out (Open question 7).
- G-c. The fail-mark omission rate is measured (Open question 1).

## Summary

The kernel: `Int` and `Bool` values, bindings, functions, `if`, `wh`, `ret` and examples (`ex`). `put` prints an `Int`. `io` marks output. `fail` marks every function whose body can trap; the body fixes the mark (F7). There is no `Text` type; a text literal is E0200 (T3).

## Motivation

RFC 0079 was rejected on the Text additions, the fail mark, the card and the gates.

- **Text.** RFC 0079 re-added a `Text` type and removed nothing to pay for it. RFC 0060 had removed it. RFC 0069 already makes a text literal E0200; this draft keeps that and drops the rest.
- **Preconditions.** As vote conditions they stopped every vote. They are now the Gates.
- **Fail mark.** Principle 3 requires a function's failure to show in its signature. RFC 0077 dropped it unmeasured.
- **Card and spans.** K1 shows the kernel, updated for the Text cut (user-1, user-2). E11 and EX3 give exact spans.

## Design

Normative. "Must" and "is" bind implementers.

L1. **Tokens and grammar.** Tokens, keywords, literals and lexical errors are those of RFC 0048. The grammar is RFC 0048's with one change: `fn_decl` gains the optional `"fail"` mark, and rule 10 accepts `fail` after a function header's `)`. `"fail"` is an `IDENT` with the text `fail`, as `"put"` is. The keyword count stays fourteen.

```
program   = { fn_decl } EOF
fn_decl   = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
param     = IDENT ":" ptype
ptype     = "Int" | "Bool"
rtype     = "Int" | "Bool"
block     = "{" [ stmt { ";" stmt } ] "}"
stmt      = "let" IDENT "=" expr
          | "var" IDENT "=" expr
          | IDENT "=" expr
          | IDENT "(" [ args ] ")"
          | "if" expr block [ "else" block ]
          | "wh" expr block
          | "ret" [ expr ]
args      = expr { "," expr }
expr      = or_expr
or_expr   = and_expr { "or" and_expr }
and_expr  = cmp_expr { "and" cmp_expr }
cmp_expr  = add_expr [ cmp_op add_expr ]
cmp_op    = "==" | "!=" | "<" | "<=" | ">" | ">="
add_expr  = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr  = unary { ( "*" | "/" | "%" ) unary }
unary     = ( "-" | "not" ) unary | primary
primary   = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
```

The syntax rules G1 to G12 of RFC 0048 apply unchanged. They give E0100 and E0003 for the token positions the grammar rejects. `TEXT` in `primary` parses; its meaning is T3.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (RFC 0048, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. **Text literals.** A `TEXT` token used as an expression is E0200 at the literal, wherever it appears (RFC 0069, T3). It has type `?` (E10). There is no `Text` type in the kernel: no binding, parameter, result or operator takes text.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value, it is E0200 at the call, and the value has type `?`.

T6. The tokens `ptype` and `rtype` accept are `Int` and `Bool`. Any other token there, including the name `Text`, is E0100 at that token (RFC 0048, G12).

T7. `Int` and `Bool` used as values are E0301 at the name. `Text` is an ordinary name in the kernel, so using it as a value is E0301 as for any undeclared name.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; call, literal, name, `( expr )`. Binary operators are left-associative, except the comparisons, which do not chain (RFC 0048, G6).

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` truncates toward zero. `a % b` has the sign of `a`, so `a == (a / b) * b + a % b` holds whenever `a / b` does not trap. A zero divisor for `/` or `%` traps `divide-by-zero`. `MIN / -1` traps `overflow`. `MIN % -1` is `0` and does not trap.

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200 (E11).

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200 (E11).

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes `Bool`. Otherwise E0200 (E11).

E6. `+`, `-`, `*`, `/`, `%` and unary `-` take `Int` operands. Otherwise E0200 (E11).

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200 (E11).

E8. A call's argument count and types must match its parameters. Otherwise E0200 (E11).

E9. Evaluation is left to right: the left operand, then the right; call arguments in order, then the call.

E10. **Recovery.** A failed expression takes its operator's type (`Bool` for comparisons, `and`, `or` and `not`; `Int` for arithmetic), its callee's result type for a call, or `?` otherwise. `?` gives no further diagnostic.

E11. **Spans.** An operator error (E3 to E6) is E0200 at the operator token; its operands are not reported separately. A condition error (E7) is at the condition. An argument type error (E8) is at the argument. An arity error is at the callee name.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (RFC 0048, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, as if by a `let` at its start, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int`, `Bool` or `fail`. Otherwise E0300 at the new name.

### Functions and effects

F1. `fn NAME(p1: T1, ...) [: R] [io] [fail] block`. The order is fixed: `: R`, `io`, `fail`. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the function body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool` or `fail` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **Fail mark.** A function body is *trapping* if, outside its examples, it contains any of: a binary `+`, `-`, `*`, `/` or `%`; a unary `-`; a `wh` statement, whose counter can trap `step-exhausted` (TR3); or a call to a function declared in the file, which can trap `stack-exhausted` (TR2). A call to `put` does not count.

The `fail` token is present if and only if the body is trapping. The author does not choose it. A missing or extra mark is E0403 at the function name. The rule reads only the body and the names it calls (principle 2).

C0. **Ordering.** The fail check (F7), then example evaluation (EX3), run only when no other error is reported.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io` and `fail`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in, with the signature `put(x) io`. Its argument must be `Int`. Any other type, including `Bool`, is E0200 at the argument. A text literal argument is reported only by T3. An argument of type `?` is accepted without a further diagnostic. Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. For an `Int`, `put` writes the value in decimal, with a leading `-` if negative and no leading zeros. It is followed by one LF.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals, loops and examples

C1. `if cond block [ else block ]`. The `else` part is a block only (RFC 0048, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

EX1. `ex EXPR` follows a function's closing `}` or another of its examples (RFC 0048, G5).

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each evaluate every example when C0 finds no error, at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false`, or any trap, is E0202, spanning from `ex` to the end of its expression. `build` and `run` then write no module.

### Traps

TR1. A trap writes `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Earlier output stays. Kinds: `overflow`, `divide-by-zero`, `stack-exhausted` (TR2), `step-exhausted` (TR3).

TR2. `main` is at depth 1; an example's expression is at depth 0. A call making the depth 10001 traps `stack-exhausted`.

TR3. **Loop counter per call.** Each call frame has its own counter, starting at 0. Each evaluation of a `wh` condition in that frame's own body adds 1. Before an addition would exceed 10000000, the run traps `step-exhausted`. Calls are not counted here. The limit is one constant (Open question 2).

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order.

### Card

K1. The implementing PR rewrites `spec/card.md` to the text below; diagnostics lines move to `spec/core/diagnostic.md`.

```
# Glyph

Source: *.gl, compiler glyphc

# Card: kernel
Types: Int, Bool. Text literal is E0200.
Bind: let x = e; var x = e. x = e needs var.
Fn: fn f(a: Int): Int io fail { } ex e.
Fail: body with + - * / %, unary -, wh or file call needs fail.
Stmts ;-separated: let, var, x = e, call, if e { } else { }, wh e { }, ret [e].
Ops low to high: or; and; cmp (no chain); + -; * / %; unary - not.
Int: + - * unary - trap overflow; / % trap divide-by-zero.
Output: put(x) io prints Int, then LF.
Entry: one fn main() [io] [fail].
Ex: ex e, a Bool, must be true.
Trap: stderr "trap: K", exit 1.
Diagnostics: spec/core/diagnostic.md.
```

### Diagnostics

| Code | Meaning | Span |
| --- | --- | --- |
| E0200 | Type mismatch (E3 to E8, B2, F4, EX2, M1, P1); a text literal (T3); a valueless call as value; `main` signature | Per E11, or the literal |
| E0201 | Function with a result clause can reach its closing brace | The closing `}` |
| E0202 | Example is `false` or traps (EX3) | From `ex` to the end of its expression |
| E0300 | Duplicate or reserved name (B4, B5, M1, F6) | The new name |
| E0301 | Unknown name, use before declaration, function or `Int`/`Bool` as value | The name |
| E0302 | No `main` | The end-of-file token |
| E0303 | Assignment to a `let` or parameter | The target name |
| E0400 | Call to an `io` function or `put` without `io`, or from an example | The callee name |
| E0403 | `fail` mark does not match the body (F7) | The function name. Fix: insert ` fail` after the signature's last token if missing; delete the `fail` token if extra |

E0500 is in `spec/errors.json`; the other codes are added by the first PR that emits each. Meanings follow RFC 0055 (E0201) and RFC 0069 (E0202, E0403, text literal).

## Alternatives

- **Keep the `Text` type in the kernel (RFC 0079).** Rejected by designer-min: a type, operators and output with no removal to pay for it.
- **Text literal as E0100.** Rejected: RFC 0069 fixes E0200, and changing it reopens that RFC.
- **Mark by call-graph analysis, or let the author choose the mark.** Rejected: the first breaks principle 2, the second breaks principle 1.

## Cost

**Current spec.** RFC 0079 reported core 917 of 12,000 and card 244 of 2,000. Not re-measured here.

**Card, by hand.** The K1 card is about 243 tokens: the RFC 0079 figure, plus about 4 for the text-literal line, less about 4 for the Text words. Not run by the protected counter. **Core** is measured in the implementing PR.

**Removed:** the Text type, the Text clauses of T6, T7, B5, P1 and P2, the card's Text words, and seven of RFC 0079's nine Text tests. **Added:** the `fail` production, F7, C0, E11, E0403, and the T3 tests.

## Test plan

Tests live in `conformance/kernel/`, one per file, with `id`, `rfc` and `kind` in the meta block. The fail marks of the run programs match F7 (checked by reading).

Run tests (kind `run`): complete programs, with empty stderr and status 0 unless the row says otherwise.

| Test | Program | Expected stdout |
| --- | --- | --- |
| `put-one` | `fn main() io { put(1) }` | `1` |
| `print-int` | `fn main() io fail { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `let-var` | `fn main() io fail { let a = 1; var b = 2; b = b + a; put(b) }` | `3` |
| `let-bool` | `fn main() io { let b = 1 < 2; if b { put(1) } }` | `1` |
| `bool-ops` | `fn main() io { if 1 < 2 and not false { put(1) } else { put(2) } }` | `1` |
| `short-circuit` | `fn side(): Bool io { put(9); ret true }`, `fn main() io fail { if false and side() { put(1) }; if true or side() { put(2) } }` | `2` |
| `cmp-ordering` | `fn main() io { if 2 > 1 { put(1) }; if 2 >= 2 { put(2) }; if 1 <= 2 { put(3) }; if 1 >= 2 { put(9) } }` | `1`, `2`, `3` |
| `cmp-eq` | `fn main() io { if 1 != 2 { put(3) }; if true == true { put(4) } }` | `3`, `4` |
| `arith` | `fn main() io fail { put(7 / -2); put(2 * 3 + 4 * 5); put(-3 + 1); put((1 + 2) * 3) }` | `-3`, `26`, `-2`, `9` |
| `rem-mod` | `fn main() io fail { let m = -9223372036854775807 - 1; put(7 % 3); put(-7 % 2); put(7 % -2); put(m % -1) }` | `1`, `-1`, `1`, `0` |
| `rem-identity` | `fn main() io fail { put(17 - 17 / 5 * 5); put(17 % 5) }` | `2`, `2` |
| `digit-sum` | `fn main() io fail { var n = 1204; var s = 0; wh 0 < n { s = s + n % 10; n = n / 10 }; put(s) }` | `7` |
| `eval-order` | `fn a(): Int io { put(1); ret 1 }`, `fn b(): Int io { put(2); ret 2 }`, `fn main() io fail { if a() < b() { put(3) } }` | `1`, `2`, `3` |
| `fn-call` | `fn add(a: Int, b: Int): Int fail { ret a + b }`, `fn main() io fail { put(add(2, 3)) }` | `5` |
| `fn-result-io` | `fn sq(x: Int): Int io fail { put(x); ret x * x }`, `fn main() io fail { put(sq(3)) }` | `3`, `9` |
| `fn-bool-param` | `fn pick(b: Bool): Int { if b { ret 1 }; ret 2 }`, `fn main() io fail { put(pick(true)); put(pick(false)) }` | `1`, `2` |
| `fn-bool-result` | `fn pos(n: Int): Bool { ret 0 < n }`, `fn main() io fail { if pos(3) { put(1) }; if pos(0) { put(2) } }` | `1` |
| `fn-io` | `fn say(x: Int) io { put(x) }`, `fn main() io fail { say(4) }` | `4` |
| `fn-void` | `fn f() { }`, `fn main() io fail { f() }` | none |
| `fn-discard` | `fn g(): Int { ret 1 }`, `fn main() io fail { g() }` | none |
| `ret-bare` | `fn stop(n: Int) io { if 0 < n { ret }; put(n) }`, `fn main() io fail { stop(0); stop(5) }` | `0` |
| `fn-recursion` | `fn fact(n: Int): Int fail { if n <= 1 { ret 1 }; ret n * fact(n - 1) }`, `fn main() io fail { put(fact(10)) }` | `3628800` |
| `if-else-return` | `fn f(n: Int): Int { if n == 0 { ret 1 } else { ret 2 } }`, `fn main() io fail { put(f(0)); put(f(1)) }` | `1`, `2` |
| `wh-sum` | `fn main() io fail { var i = 0; var s = 0; wh i < 5 { i = i + 1; s = s + i }; put(s) }` | `15` |
| `paren-nested` | `fn main() io fail { put(-((4))) }` | `-4` |
| `shadow` | `fn main() io { let a = 1; if true { let a = 2; put(a) }; put(a) }` | `2`, `1` |
| `example-ok` | `fn double(x: Int): Int fail { ret x * 2 } ex double(3) == 6 ex not false`, `fn main() io fail { put(double(4)) }` | `8` |
| `step-ok` | `fn main() io fail { var i = 0; wh i < 1000 { i = i + 1 }; put(1) }` | `1` |
| `kc-comment` | `fn main() io { put(1) // put(9)` then a line `}` | `1` |

Trap tests (kind `run`; stdout empty unless stated; status 1):

| Test | Program | Stderr | Status |
| --- | --- | --- | --- |
| `trap-overflow` | `fn main() io fail { put(4611686018427387904 * 2) }` | `trap: overflow` | 1 |
| `trap-add` | `fn main() io fail { put(9223372036854775807 + 1) }` | `trap: overflow` | 1 |
| `trap-sub` | `fn main() io fail { put(-9223372036854775807 - 2) }` | `trap: overflow` | 1 |
| `trap-neg` | `fn main() io fail { let m = -9223372036854775807 - 1; put(-m) }` | `trap: overflow` | 1 |
| `trap-min` | `fn main() io fail { let m = -9223372036854775807 - 1; put(m / -1) }` | `trap: overflow` | 1 |
| `trap-div` | `fn main() io fail { put(1 / 0) }` | `trap: divide-by-zero` | 1 |
| `trap-mod` | `fn main() io fail { put(1 % 0) }` | `trap: divide-by-zero` | 1 |
| `trap-stack` | `fn f(n: Int): Int fail { ret f(n) }`, `fn main() io fail { put(f(1)) }` | `trap: stack-exhausted` | 1 |
| `trap-step` | `fn main() io fail { put(1); wh true { } }`. Stdout `1`. | `trap: step-exhausted` | 1 |

Compile-error tests (kind `compile-error`): `glyphc check` yields exactly the one record, compared by `code`, `span` and `fix` (RFC 0004 section 7). The fix is none unless stated.

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `kc-text-lit` | `fn main() io { put("x") }` | the `"x"` | E0200 |
| `kc-text-recover` | `fn main() io { let t = "x"; put(t) }` | the `"x"` | E0200 |
| `err-text-param` | `fn f(t: Text) io { } fn main() io { }` | the `Text` | E0100 |
| `err-text-result` | `fn f(): Text io { } fn main() io { }` | the `Text` | E0100 |
| `err-type` | `fn main() io { if 1 { } }` | the `1` | E0200 |
| `err-cmp-type` | `fn main() io { if true < false { } }` | the `<` | E0200 |
| `err-bool-op` | `fn main() io { let a = 1 and true }` | the `and` | E0200 |
| `err-not` | `fn main() io { let a = not 1 }` | the `not` | E0200 |
| `err-put-bool` | `fn main() io { put(true) }` | the `true` | E0200 |
| `err-put-arity` | `fn main() io { put(1, 2) }` | the `put` | E0200 |
| `err-arity` | `fn add(a: Int, b: Int): Int fail { ret a + b } fn main() io fail { put(add(1)) }` | the `add` | E0200 |
| `err-void-value` | `fn f() io { } fn main() io fail { let x = f() }` | the call `f()` | E0200 |
| `err-ret-value` | `fn f() io { ret 1 } fn main() io fail { f() }` | the `1` | E0200 |
| `err-ret-bare` | `fn f(): Int io { ret } fn main() io fail { put(f()) }` | the `ret` | E0200 |
| `err-assign-type` | `fn main() io { var a = 1; a = true }` | the `true` | E0200 |
| `err-example-type` | `fn f(): Int { ret 1 } ex 1 fn main() io fail { put(f()) }` | the `1` after `ex` | E0200 |
| `err-main-sig` | `fn main(n: Int) io { }` | the `main` | E0200 |
| `err-missing-ret` | `fn f(n: Int): Int { if n == 0 { ret 1 } } fn main() io fail { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `err-if-else-partial` | `fn f(n: Int): Int io { if n == 0 { ret 1 } else { put(2) } } fn main() io fail { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `err-wh-return` | `fn f(): Int fail { wh false { ret 1 } } fn main() io fail { put(f()) }` | the closing `}` of `f` | E0201 |
| `err-example` | `fn f(): Int { ret 1 } ex 1 == 2 fn main() io fail { put(f()) }` | `ex 1 == 2` | E0202 |
| `err-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0 fn main() io fail { put(f()) }` | `ex 1 / 0 == 0` | E0202 |
| `err-example-stack` | `fn f(n: Int): Bool fail { ret f(n) } ex f(1) fn main() io { }` | `ex f(1)` | E0202 |
| `err-dup` | `fn add(): Int { ret 1 } fn add(): Int { ret 2 } fn main() io { }` | the second `add` | E0300 |
| `err-dup-main` | `fn main() io { } fn main() io { }` | the second `main` | E0300 |
| `err-dup-param` | `fn f(a: Int): Int { let a = 1; ret a } fn main() io fail { put(f(1)) }` | the `a` of `let a` | E0300 |
| `err-dup-param-2` | `fn f(a: Int, a: Int) io { } fn main() io fail { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `err-reserved` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `err-reserved-fail` | `fn main() io { let fail = 1 }` | the `fail` | E0300 |
| `err-fn-put` | `fn put(): Int { ret 1 } fn main() io { }` | the `put` | E0300 |
| `err-binding-fn` | `fn g(): Int { ret 1 } fn main() io { let g = 2 }` | the `g` | E0300 |
| `err-int-max` | `fn main() io { put(9223372036854775808) }` | the literal | E0500 |
| `err-int-min` | `fn main() io fail { put(-9223372036854775808) }` | the literal `9223372036854775808`, not the `-` | E0500 |
| `err-unknown` | `fn main() io { put(zz) }` | the `zz` | E0301 |
| `err-use-before` | `fn main() io { put(a); let a = 1 }` | the first `a` | E0301 |
| `err-type-value` | `fn main() io { let x = Int }` | the `Int` | E0301 |
| `err-fn-value` | `fn add(a: Int, b: Int): Int fail { ret a + b } fn main() io { let f = add }` | the `add` | E0301 |
| `err-main` | `fn f() { }` | the end-of-file token | E0302 |
| `err-assign-let` | `fn main() io { let a = 1; a = 2 }` | the `a` of `a = 2` | E0303 |
| `err-assign-param` | `fn f(n: Int) io { n = 2 } fn main() io fail { f(1) }` | the `n` of `n = 2` | E0303 |
| `err-effect` | `fn f() { put(1) } fn main() io fail { f() }` | the `put` | E0400 |
| `err-effect-call` | `fn g() io { } fn f() fail { g() } fn main() io fail { f() }` | the `g` | E0400 |
| `err-effect-example` | `fn say(): Int io { ret 1 } ex say() == 1 fn main() io fail { put(say()) }` | the `say` in the example | E0400 |
| `err-fail-missing` | `fn f(a: Int): Int { ret a + 1 } fn main() io fail { put(f(1)) }` | the `f`; fix inserts ` fail` after the `Int` | E0403 |
| `err-fail-extra` | `fn f(a: Int): Int fail { ret a } fn main() io { }` | the `f`; fix deletes the `fail` token | E0403 |
| `err-fail-main` | `fn main() io fail { put(1) }` | the `main`; fix deletes the `fail` token | E0403 |
| `err-fail-order` | `fn main() fail io { }` | the `io`, the first token the grammar rejects | E0100 |

T0048. RFC 0048's planned tests (none is in `conformance/` yet) change as follows.

- `v4-kw-wh`, `v4-grammar-assign`, `v4-grammar-unary`, `v4-grammar-ex`, `v4-grammar-call` and `v4-grammar-ret` gain `fail` on `main` (L1, F7). Output is unchanged.
- `v4-grammar-text` becomes `fn main() io { let t = 1; put(t) }`, output `1` (T3).
- `v4-comment` is replaced by `kc-comment` above.

The other RFC 0048 run tests are unchanged.

## Open questions

1. **Fail mark (G-c).** Its omission rate is unmeasured; no benchmark runner is available here. Not a condition on this vote.
2. **TR3 step limit.** The limit of 10000000 is unmeasured.
3. **Text beyond the literal.** The `Text` type, its operators and text output belong to a stdlib RFC. Until then `Text` is an ordinary name, and that RFC would reserve it.
4. **`print-one.test`.** See Alters tests in the header.
5. **Amendments to RFC 0048.** L1, rule 10 and T0048 move to RFC 0048 if it is revised instead.
6. **F7 is conservative.** Any file call marks its caller, even with no reachable trap.
7. **RULES rule 6 (G-b).** This draft resubmits RFCs 0061 to 0079 in substance, which rule 6 bars for 10 nights after rejection. I searched `rfcs/` and `governance/` and found no rejection dates for RFCs 0078 or 0079. The orchestrator must confirm them. If the cooldown has not run, withdraw this draft and do not vote on it.
8. **Title.** The assigned title names "text output", which this draft does not have (it prints `Int` only). The orchestrator should change the title.
