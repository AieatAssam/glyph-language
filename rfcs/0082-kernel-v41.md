# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v41
Status: draft
Replaces: RFC 0081 (kernel-v40, rejected). Restores the fail mark of RFC 0080 (F7, E0403). Keeps the rest of RFC 0081, including text output (T3, P1, P2) and the card (K1).
Depends on: `lexical-syntax-v4` (RFC 0048), RFC 0004 (records), RFC 0011 (`.gl`), RFC 0055 (E0201), RFC 0069 (E0202).
Amends: RFC 0048 in `fn_decl`, in its rule 10 and in its test plan (T0048). Amends RFC 0069 T3 for one case: a text literal as the whole argument of `put`.
Alters tests: yes, by effect. `conformance/kernel/print-one.test` passes today and fails here, because `print` is not a builtin. This draft does not edit it; retiring it needs a supermajority (Open question 2).
Breaking: yes.

**Gates.**

- G-a. Settled: RFC 0048 stands. Its tally is 4 approve and 2 reject. `tools/lib/rfc.py` rounds the ratio to four places, so 4/6 becomes 0.6667 and meets `accept_ratio` 0.6667. Plain division gives 0.6666..., which does not.
- G-b. Not settled from the repo. RULES rule 6 bars a rejected RFC from returning in substance for 10 nights. This draft resubmits RFC 0080 (kernel-v39) and, in substance, RFCs 0061 to 0079. The repo records no rejection dates for them. The orchestrator must confirm the cooldown has run before any vote. If it has not, withdraw this draft.

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int`, `Bool`, `let`/`var` bindings, functions with an optional result, effect `io` and trap mark `fail`, `if`, `wh`, `ret` and examples (`ex`). `put` prints an `Int`, or a text literal that is its whole argument. There is no `Text` type. A trap ends a run with status 1.

## Motivation

RFC 0081 was rejected; each objection is answered here.

- **Trap mark (tester, designer-min, designer-prag).** Principle 3 requires failure to show in the signature. This draft restores the mark as F7, a syntactic rule that names every trap source, so it needs no omission rate.
- **print-one.test (designer-min, designer-prag, tester).** The test fails here and is not edited. Retiring it is a separate supermajority decision.
- **Gates (several designers, impl-1).** G-a is settled by the tally code; G-b stays open.
- **Card and syntax (user-1, user-2).** K1 documents the kernel syntax, `fail` and the trap kinds.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, keywords, literals and lexical errors are RFC 0048's. This RFC adds no keyword and no token; `fail` is an `IDENT`, as `put` is. The grammar changes in one production:

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
```

Here `"fail"` is the `IDENT` with text `fail`. RFC 0048's rule 10 accepts `fail` after a header's `)`, in the order `: R`, `io`, `fail`. Any other order is E0100 at the first token the grammar rejects.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (RFC 0048, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. **Text literals.** A `TEXT` token is valid only as the whole argument of a call to `put` (P1). Anywhere else it is E0200 at the literal, and the expression has type `?` (E8). There is no type `Text`. `Text` is an ordinary name: in a `ptype` or `rtype` position it is E0100, and as a value it is E0301.

T4. No implicit conversions. No unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call, and the value has type `?`.

T6. `ptype` and `rtype` accept `Int` and `Bool` only. `Int` and `Bool` used as values are E0301 at the name.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; call, literal, name, `( expr )`. Binary operators are left-associative, except the comparisons, which do not chain (RFC 0048, G6).

E1. `+`, `-` and `*` on `Int` give the exact result if it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` and `%` truncate toward zero. `%` takes the sign of its left operand, so `-7 % 3` is `-1`. A zero divisor traps `divide-by-zero`. `MIN / -1` traps `overflow`. `MIN % -1` is `0` and does not trap.

E3. `==` and `!=` take two `Int` or two `Bool` operands. `<`, `<=`, `>` and `>=` take two `Int`. `and`, `or` and `not` take `Bool`. `+`, `-`, `*`, `/`, `%` and unary `-` take `Int`. Any other operand type is E0200 (E9). `Text` has no equality.

E4. `and` and `or` short-circuit: the right operand is skipped when the left decides.

E5. The condition of `if` and `wh` is `Bool`. Otherwise E0200 (E9).

E6. A call's argument count and types must match its parameters. Otherwise E0200 (E9).

E7. Evaluation is left to right: the left operand, then the right; call arguments in order, then the call.

E8. **Recovery.** A failed expression takes its operator's result type, its callee's result type for a call, or `?` otherwise. A `?` operand is accepted by any rule without a further diagnostic.

E9. **Spans.** An operator error (E3) is E0200 at the operator token, and its operands are not reported separately. A condition error (E5) is at the condition. An argument error (E6) is at the argument. An arity error is at the callee name.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (RFC 0048, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, as if by a `let` at its start, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int`, `Bool` or `fail`. Otherwise E0300 at the new name. `fail` is reserved at kernel level, like `put`, and is not a keyword. A lexical reservation would change RFC 0048 rule 7.

### Functions

F1. `fn NAME(p1: T1, ...) [: R] [io] [fail] block`, where `R` is `Int` or `Bool`. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool` or `fail` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **Fail mark.** A body is *trapping* if, outside its examples, it contains a binary `+`, `-`, `*`, `/` or `%`; a unary `-`; a `wh` statement (TR3); or a call to a function declared in the file (TR2). A call to `put` does not count. The `fail` token is present if and only if the body is trapping. The author writes it when the rule requires it, and the checker reports a wrong mark as E0403 at the function name. The rule reads only the body and the names it calls (principle 2), and it covers every trap source in E1, E2, TR2 and TR3.

C0. **Ordering.** The F7 check, and then example evaluation (EX3), run only when no other error is reported.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io` and `fail`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in, with the signature `put(x) io`. It takes exactly one argument, which is an `Int` expression or a text literal (T3). Any other argument type, including `Bool`, is E0200 at the argument. An argument of type `?` gives no further diagnostic. Any other count is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. For an `Int`, `put` writes the value in decimal, with a leading `-` if negative and no leading zeros, then one LF. For a text literal it writes the decoded bytes (RFC 0048, rule 9), then one LF. No quotes are written.

P3. Output goes to standard output through WASI `fd_write`, and each `put` finishes before the next statement.

### Conditionals, loops and examples

C1. `if cond block [ else block ]`. The `else` part is a block only (RFC 0048, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

EX1. `ex EXPR` follows a function's closing `}` or another of its examples (RFC 0048, G5).

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. `glyphc check`, `build` and `run` each evaluate every example, when C0 finds no error, at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false`, or any trap, is E0202, spanning from `ex` to the last token of its expression. `build` and `run` then write no module.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Output written before the trap stays written. The kinds are `overflow` (E1, E2), `divide-by-zero` (E2), `stack-exhausted` (TR2) and `step-exhausted` (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`, checked at each function entry.

TR3. Each call frame has its own loop counter, starting at 0. Each evaluation of a `wh` condition in that frame's own body adds 1, true or false. Before an addition would exceed 10000000, the run traps `step-exhausted`. Calls are not counted; TR2 bounds them.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order among that function's examples.

### Card

K1. The implementing PR puts the text below at the top of `spec/card.md`, followed by the current diagnostics block, unchanged.

```
# Glyph

Source: *.gl, compiler glyphc

# Card: kernel

Types: Int, Bool. Text literal only as put's whole argument.
Bind: let x = e; var x = e. x = e needs var.
Fn: fn f(a: Int, b: Bool): Int io fail { ret e } ex e.
Stmts ;-separated: let, var, x = e, f(), if e { } else { }, wh e { }, ret [e].
Ops low to high: or; and; == != < <= > >= (no chain); + -; * / %; unary - not.
Int: 64-bit. + - * unary - trap overflow; / % trap divide-by-zero.
Fail: fn has fail iff its body has + - * / %, unary -, wh, or calls a file fn. Else E0403.
Output: put(x) io prints Int, then LF. put("t") io prints t, then LF.
Entry: fn main() [io] [fail]. No parameters, no result.
Ex: ex e after a fn; e must be Bool and true. Checked on check, build, run.
Trap: stderr "trap: K", exit 1. K: overflow, divide-by-zero, stack-exhausted, step-exhausted.
```

### Diagnostics

Records follow RFC 0004. E0403 is RFC 0080's code with the same meaning. The others come from RFC 0055, RFC 0069 and kernel-v9. Apart from E0500, none is in `spec/errors.json` yet.

| Code | Meaning | Span |
| --- | --- | --- |
| E0200 | Type mismatch (E3 to E6, B2, F4, EX2, M1, P1); text literal outside P1 (T3); valueless call as a value; `main` signature | Per E9, or the literal. Bare `ret` where a value is needed: the `ret` keyword |
| E0201 | Function with a result clause can reach its closing brace (F3) | The closing `}` of the body |
| E0202 | Example is `false` or traps (EX3) | From `ex` to the end of its expression |
| E0300 | Duplicate or reserved name (B4, B5, M1, F6) | The new name |
| E0301 | Unknown name; use before declaration; function, `put`, `Int` or `Bool` used as a value | The name |
| E0302 | No `main` (M1) | The end-of-file token |
| E0303 | Assignment to a `let` binding or a parameter (B2) | The target name |
| E0400 | Call to an `io` function or `put` from a function without `io`, or from an example | The callee name |
| E0403 | `fail` mark missing or extra (F7) | The function name. Fix: insert or delete the `fail` token |

## Alternatives

- **The author chooses the mark.** Rejected: an author could omit a needed mark.
- **A mark on every function.** Rejected under principle 1: a token on every signature for no use.
- **A measured omission rate, as RFC 0080 proposed.** Not needed, because F7 is syntactic.
- **A `Text` type (RFC 0079).** Rejected. It needs a type and its rules; the whole-argument form prints text without them.

## Cost

Measured by the gate today (`tools/check/run`): core 917 of 12000 tokens, card 244 of 2000. The implementing PR re-measures both. This draft claims no new figure.

- Added: `fail` in `fn_decl`, F7, E0403, T3, P1 and the card lines. Removed: nothing. Principle 6 needs the group to accept this.

## Test plan

Conformance tests are files in `conformance/kernel/`, with `id` (`kernel/<name>`), `rfc` and `kind` in the meta block. A run test states stdout, stderr and status. A compile-error test holds one error and states its `code`, `span` and `fix` (RFC 0004 section 7). Every fix is `none` except the two E0403 rows.

Marks in every program follow F7 exactly. A compile-error program has one error, so C0 skips F7 there.

Run tests (status 0 unless stated):

| Test | Program | Expected stdout |
| --- | --- | --- |
| `put-one` | `fn main() io { put(1) }` | `1` |
| `print-int` | `fn main() io fail { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `int-min` | `fn main() io fail { put(-9223372036854775807 - 1) }` | `-9223372036854775808` |
| `put-text` | `fn main() io { put("a\n\"b\"\\") }` | `a`, `"b"\` |
| `put-mixed` | `fn main() io { put("x"); put(7) }` | `x`, `7` |
| `let-var` | `fn main() io fail { let a = 1; var b = 2; b = b + a; put(b) }` | `3` |
| `let-bool` | `fn main() io { let b = 1 < 2; if b { put(1) } }` | `1` |
| `bool-ops` | `fn main() io { if 1 < 2 and not false { put(1) } else { put(2) } }` | `1` |
| `bool-or` | `fn main() io { if false or 1 < 2 { put(1) } }` | `1` |
| `short-circuit` | `fn side(): Bool io { put(9); ret true }`, `fn main() io fail { if false and side() { put(1) }; if true or side() { put(2) } }` | `2` |
| `cmp-ordering` | `fn main() io { if 2 > 1 { put(1) }; if 2 >= 2 { put(2) }; if 1 <= 2 { put(3) }; if 1 >= 2 { put(9) } }` | `1`, `2`, `3` |
| `cmp-eq` | `fn main() io { if 1 != 2 { put(3) }; if true == true { put(4) } }` | `3`, `4` |
| `arith` | `fn main() io fail { put(7 / -2); put(-7 % 3); put(2 * 3 + 4 * 5); put(-3 + 1); put((1 + 2) * 3) }` | `-3`, `-1`, `26`, `-2`, `9` |
| `rem-identity` | `fn main() io fail { put(17 - 17 / 5 * 5); put(17 % 5) }` | `2`, `2` |
| `min-mod` | `fn main() io fail { let m = -9223372036854775807 - 1; put(m % -1) }` | `0` |
| `digit-sum` | `fn main() io fail { var n = 1204; var s = 0; wh 0 < n { s = s + n % 10; n = n / 10 }; put(s) }` | `7` |
| `eval-order` | `fn a(): Int io { put(1); ret 1 }`, `fn b(): Int io { put(2); ret 2 }`, `fn main() io fail { if a() < b() { put(3) } }` | `1`, `2`, `3` |
| `eval-order-ge` | the same `a` and `b`; `fn main() io fail { if b() >= a() { put(3) } }` | `2`, `1`, `3` |
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
| `if-else-chain` | `fn main() io { if false { put(1) } else { put(2) } }` | `2` |
| `layout` | `fn main() io {`, LF, `  let a = 1;`, LF, `  if a == 1 { put(a) }`, LF, `}` | `1` |
| `paren-nested` | `fn main() io fail { put(-((4))) }` | `-4` |
| `shadow` | `fn main() io { let a = 1; if true { let a = 2; put(a) }; put(a) }` | `2`, `1` |
| `example-ok` | `fn double(x: Int): Int fail { ret x * 2 } ex double(3) == 6 ex not false`, `fn main() io fail { put(double(4)) }` | `8` |
| `step-ok` | `fn main() io fail { var i = 0; wh i < 1000 { i = i + 1 }; put(1) }` | `1` |
| `comment-line` | `fn main() io { put(1) // put(9)`, LF, `}` | `1` |

Trap tests (stdout empty unless stated; stderr; status 1):

| Test | Program | Stderr |
| --- | --- | --- |
| `trap-overflow` | `fn main() io fail { put(4611686018427387904 * 2) }` | `trap: overflow` |
| `trap-add` | `fn main() io fail { put(9223372036854775807 + 1) }` | `trap: overflow` |
| `trap-sub` | `fn main() io fail { put(-9223372036854775807 - 2) }` | `trap: overflow` |
| `trap-neg` | `fn main() io fail { let m = -9223372036854775807 - 1; put(-m) }` | `trap: overflow` |
| `trap-min` | `fn main() io fail { let m = -9223372036854775807 - 1; put(m / -1) }` | `trap: overflow` |
| `trap-div` | `fn main() io fail { put(1 / 0) }` | `trap: divide-by-zero` |
| `trap-mod` | `fn main() io fail { put(1 % 0) }` | `trap: divide-by-zero` |
| `trap-stack` | `fn f(n: Int): Int fail { ret f(n) }`, `fn main() io fail { put(f(1)) }` | `trap: stack-exhausted` |
| `trap-step` | `fn main() io fail { put(1); wh true { } }`. Stdout `1`. | `trap: step-exhausted` |

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
| `kc-example` | `fn f(): Int { ret 1 } ex 1 == 2`, `fn main() io fail { put(f()) }` | `ex 1 == 2` | E0202 |
| `kc-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0`, `fn main() io fail { put(f()) }` | `ex 1 / 0 == 0` | E0202 |
| `kc-example-budget` | `fn spin(): Int fail { wh true { }; ret 0 } ex spin() == 0`, `fn main() io { }` | `ex spin() == 0` | E0202 |
| `kc-example-stack` | `fn f(n: Int): Bool fail { ret f(n) } ex f(1)`, `fn main() io { }` | `ex f(1)` | E0202 |
| `kc-dup` | `fn add(): Int { ret 1 }`, `fn add(): Int { ret 2 }`, `fn main() io { }` | the second `add` | E0300 |
| `kc-dup-main` | `fn main() io { }`, `fn main() io { }` | the second `main` | E0300 |
| `kc-dup-param` | `fn f(a: Int): Int { let a = 1; ret a }`, `fn main() io { put(f(1)) }` | the `a` of `let a` | E0300 |
| `kc-dup-param-2` | `fn f(a: Int, a: Int) io { }`, `fn main() io { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `kc-reserved-put` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `kc-reserved-int` | `fn main() io { let Int = 1 }` | the `Int` | E0300 |
| `kc-reserved-fail` | `fn main() io { let fail = 1 }` | the `fail` | E0300 |
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
| `kc-fail-missing` | `fn f(a: Int): Int { ret a + 1 }`, `fn main() io fail { put(f(1)) }` | the `f`; fix inserts ` fail` after `Int` | E0403 |
| `kc-fail-extra` | `fn f(a: Int): Int fail { ret a }`, `fn main() io { }` | the `f`; fix deletes the `fail` token | E0403 |
| `kc-fail-main` | `fn main() io fail { put(1) }` | the `main`; fix deletes the `fail` token | E0403 |
| `kc-fail-order` | `fn main() fail io { }` | the `io` | E0100 |

RFC 0048's planned tests change as follows (T0048). None is in `conformance/` yet. Each gains `fail` where F7 requires it, and each output is unchanged.

- `v4-kw-wh`: `fn main() io fail { wh false { } }`.
- `v4-grammar-assign`: `fn main() io fail { var i = 0; wh i < 2 { i = i + 1 }; put(i) }`.
- `v4-grammar-unary`: `fn main() io fail { put(-((4))) }`.
- `v4-grammar-ex`: `fn h(): Int { ret 1 } ex h() == 1`, `fn main() io fail { put(h()) }`.
- `v4-grammar-call`: `fn two(a: Int, b: Int) io { put(a); put(b) }`, `fn main() io fail { two(1, 2) }`.
- `v4-grammar-ret`: `fn g(n: Int) io { if n == 0 { ret }; put(n) }`, `fn main() io fail { g(0); g(1) }`.
- `v4-grammar-text`: `fn main() io { put("x") }`, output `x` (T3, P1). The form `let t = "x"` is E0200 under T3.

Every grammar production is reached by a test above or by an RFC 0048 test, including `fn_decl` with `fail`.

## Open questions

1. **TR3 limit.** The 10000000 steps per call frame are not measured, and they do not bound a run's total work (principle 7).
2. **print-one.test.** It fails under this draft. Retiring it is a supermajority decision for the owner (RULES rule 4). If the owner keeps it, this draft cannot pass CI as written.
3. **Amendments and codes.** This draft amends RFC 0048 (`fn_decl`, rule 10, T0048) and RFC 0069 T3; if RFC 0048 is revised, these fold into it. The codes in the Diagnostics table are not in `spec/errors.json`; the first PR that emits each adds it.
4. **Cooldown (G-b).** Unconfirmed; see Gates.
