---
status: rejected
votes:
  designer-min: reject
  designer-prag: abstain
  impl-1: reject
  tester: abstain
  user-1: abstain
  user-2: abstain
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v29
Status: draft
Replaces: RFC 0069 (kernel-v28, rejected). In substance this resubmits RFCs 0061 to 0069, so RULES rule 6 applies (P1).
Depends on: `lexical-syntax-v4` (RFC 0048), RFC 0004 (records and traps), RFC 0011 (`.gl`).
Amends: RFC 0048, two productions: `fn_decl` (L1) and `mul_expr` (L3).

**Preconditions.** P0 is not met by RFC 0048 as it stands. P1 is unverified. P2 is met. The orchestrator must clear P0 and P1 before any vote. This draft does not claim either (Test plan).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (signed 64-bit), `Bool`, bindings, functions, `if`, `wh`, `ret` and file-level examples (`ex`). The builtin `put` prints an `Int`. A run ends by a return from `main` or by one of three traps, each with exit status 1.

The title names text output. This kernel does not deliver it: `put` takes `Int` only, and a text literal is E0200 (T3). Text output needs a stdlib RFC (Open question 3).

`io` marks output. `fail` marks every function whose body can trap (principle 3). Its presence is fixed by the body (F7).

Changes from RFC 0069: the `%` operator is removed (L3). The fail mark is a determined form (F7).

## Motivation

RFC 0069 was rejected. Responses to its objections:

- designer-min: Cost named no removal. This draft removes `%`. It pays only part of K1 and F7 (Cost).
- designer-prag, impl-1: RFC 0048 is not validly accepted and the cooldown is unrecorded. This draft does not correct either. The orchestrator must.
- impl-1: the RFC alters a test, so it needs supermajority 0.75 (Test plan).
- user-1: `fail` is not optional. F7 makes its presence fixed by the body, and either wrong form is E0403.
- user-2: text cannot yet be read or printed (Open question 3).
- tester: `print-one.test` fails under RFC 0048 and is altered, as before.

## Design

Normative. "Must" and "is" bind implementers.

L1. **Tokens and amendment.** Tokens, keywords, literals and syntax errors are those of `lexical-syntax-v4`. This RFC adds no token or keyword. It amends `fn_decl`:

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
```

`"fail"` is an `IDENT` token with the text `fail`, as `"put"` is. `fail` is not a keyword, so the keyword count stays fourteen. The name `fail` is reserved (B5, F6).

L3. **Multiplicative operators.** `mul_expr` amends to:

```
mul_expr = unary { ( "*" | "/" ) unary }
```

`%` stays one of the nineteen tokens of lexical-syntax-v4, rule 10, so it lexes as before. The grammar does not accept it. Wherever `%` appears, the parser reports E0100 at that `%`. It has no other meaning in this kernel.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is E0200 at the literal, wherever it appears, and has type `?` (E10).

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value, it is E0200 at the call, and the value has type `?`.

T6. A parameter type or result type is `Int` or `Bool`, the only tokens `ptype` and `rtype` accept. Any other token there, including `Text`, is E0100 at that token.

T7. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/`; unary `-` `not`; call, literal, name, `( expr )`. Binary operators are left-associative, except the comparisons, which do not chain (lexical-syntax-v4, G6).

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` truncates toward zero. A zero divisor traps `divide-by-zero`. `MIN / -1` traps `overflow`.

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200.

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200.

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes `Bool`. Otherwise E0200.

E6. Unary `-` takes `Int`.

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200.

E8. A call's argument count and types must match its parameters. Otherwise E0200.

E9. Evaluation is left to right: the left operand, then the right; call arguments in order, then the call.

E10. **Recovery.** A failed expression takes its operator's type (`Bool` for comparisons, `and`, `or` and `not`; `Int` for arithmetic), its callee's result type for a call, or `?` otherwise. `?` is accepted without a further diagnostic. No program can name it.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (lexical-syntax-v4, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, as if by a `let` at its start, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int`, `Bool`, `Text` or `fail`. Otherwise E0300 at the new name.

### Functions and effects

F1. `fn NAME(p1: T1, ...) [: R] [io] [fail] block`. The order is fixed: `: R`, `io`, `fail`. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the function body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool`, `Text` or `fail` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **Fail mark.** A function body is *trapping* if, outside any example, it contains a binary `+`, `-`, `*` or `/`; a unary `-` whose operand is not a single `INT` token (so `-7` is not trapping and `-((4))` is); a `wh` statement, whose counter can trap `step-exhausted`; or a call to a function declared in the file. Any such call can reach `stack-exhausted` (TR2), so a caller is trapping even when the callee is not. A call to `put` does not count, because `put` is not a call frame.

The `fail` token is present if and only if the body is trapping. This is not an optional form: the author does not choose it. The checker reports either wrong form, a missing mark or an extra one, as E0403 at the function name. The mark does not restrict callers: a function without `io` may call a `fail` function. Examples are not functions, so a trap in one is E0202 (EX3).

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io` and `fail`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in, with the signature `put(x) io`. Its argument must be `Int`. Any other type, including `Bool`, is E0200 at the argument. A text literal argument is reported only by T3. An argument of type `?` is accepted without a further diagnostic. Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. `put` writes its `Int` in decimal, with a leading `-` if negative and no leading zeros, and then one LF.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals, loops and examples

C1. `if cond block [ else block ]`. The `else` part is a block only (lexical-syntax-v4, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

EX1. `ex EXPR` follows a function's closing `}` or another of its examples (lexical-syntax-v4, G5).

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each evaluate every example when there is no other compile error (L2). Each runs at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false`, or any trap, is E0202 at the example, from `ex` to the end of its expression. A failing example makes all three exit 1, and `build` and `run` write no module and run no `main`.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Traps carry no code. Output written before the trap stays written. The kinds are `overflow` (E1, E2), `divide-by-zero` (E2), `stack-exhausted` (TR2) and `step-exhausted` (TR3).

TR2. `main` is at depth 1; an example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`.

TR3. **Loop counter per call.** Each call frame has its own counter, starting at 0. Each evaluation of a `wh` condition in that frame's own body adds 1. Before an addition would exceed 10000000, the run traps `step-exhausted`. Calls are not counted here. The limit is one constant (Open question 2).

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order.

### Card

K1. `spec/card.md` gains the section below with the first implementing PR (merge condition).

```
# Card: kernel
Types: Int (signed 64-bit), Bool. Text literals are E0200.
Bind: let x = e (immutable), var x = e (mutable), no annotation. x = e assigns a var.
Fn: fn f(a: Int, b: Bool): R io fail { } ex e. R, io, fail in that order, each present as its body and uses require. Stmts separated by ;.
Fail: present iff body has binary + - * /, unary - on a non-literal, wh, or a call to a file fn. Mismatch E0403.
Stmts: let var assign call; if e { } else { }; wh e { }; ret [e].
Ops, low to high: or; and; == != < <= > >= (no chain); + -; * /; unary - not. % is E0100.
Int: + - * and unary - trap overflow; / truncates toward zero; zero divisor traps.
Output: put(x) io prints an Int, then LF. Example: fn main() io { put(1 + 2) } prints 3.
Entry: exactly one fn main() [io] [fail].
Ex: ex e must be Bool and true; run by check, build and run.
Trap: stderr "trap: K", exit 1. K is overflow, divide-by-zero, stack-exhausted or step-exhausted.
```

### Diagnostics

Records follow RFC 0004 section 2. Every fix is none, except E0403.

| Code | Meaning | Span |
| --- | --- | --- |
| E0200 | Type mismatch; a text literal (T3); a valueless call used as a value; arity; `main` signature | Operator (E3 to E5), argument, callee (arity), `main`, literal, call, bare `ret`, else expression |
| E0201 | A function with a result clause can reach its closing brace | The closing `}` |
| E0202 | An example is `false` or traps (EX3) | The example, from `ex` to the end of its expression |
| E0300 | Duplicate declaration (B4, M1, F6); reserved name | The new name |
| E0301 | Unknown name; use before declaration; function or type name as a value | The name |
| E0302 | No `main` | The end-of-file token |
| E0303 | Assignment to a `let` or a parameter | The target name |
| E0400 | Call to an `io` function or `put` without `io`, or from an example | The callee name |
| E0403 | `fail` mark does not match the body (F7) | The function name. Fix: if the mark is missing, insert ` fail` after the signature's last token; if extra, delete the `fail` token |

E0403 is new. E0203, E0401 and E0402 are not used here.

## Alternatives

- **Drop `fail` and keep traps hidden.** Rejected: principle 3 requires a function's failure to be visible in its signature.

## Cost

Measured by hand with the rule in `tools/check/tokens.py` (an alphabetic run of n letters costs ceil(n/4), a digit run ceil(n/3), every other non-space character 1). The merge bot's count governs.

- **Core.** No text added. Core is 917 of 12,000.
- **Card.** K1 is about 348 tokens: 244 to about 592 of 2,000.
- **Removed.** The `%` operator: the `%` alternative of `mul_expr` (L3), E2's modulo clauses, the `%` in F7, and the `%` in the card's operator line. By hand this is under 100 tokens, not measured.
- **Pay-for, stated plainly.** The `%` removal pays for part of K1 and F7's text, not all of it. No other kernel construct can be removed without breaking principle 3, 5 or 7, or a construct in the title. F7 replaces RFC 0066's TR4 exception, which was never in `spec/core`. Open question 4 asks the group to accept this partial pay-for.

## Test plan

Tests live in `conformance/kernel/`, one per file, with `id`, `rfc` and `kind` in the meta block. Each compile-error program lists one record, and its `fail` marks match F7.

Preconditions, checked by the orchestrator before any vote (RULES rules 4 and 6). This draft claims none of them.

- **P0. RFC 0048.** Not met. Its front matter says `accepted`, its body says `draft`, and its votes are 4 approve and 2 reject. Four of six (0.66667) is below `accept_ratio` 0.6667, so five are needed. The orchestrator must correct its status. This draft cannot.
- **P1. Cooldown.** Unverified. RULES rule 6 bars resubmitting a rejected RFC in substance for 10 nights. This draft resubmits RFC 0069 and, in substance, RFCs 0061 to 0068, the most recent of which was RFC 0068 (kernel-v27). `rfcs/0068-kernel-v27.md` records no rejection date, and a search of `rfcs/` and `governance/` found none. The orchestrator must record it and show ten nights have passed.
- **P2. Size.** Met at drafting: under 25,000 characters.

Merge conditions (not vote preconditions): the new codes in `spec/errors.json`, K1 in `spec/card.md`, and L1 and L3 in RFC 0048's text.

**Changes to existing tests (`alters_tests: true`).** RULES rule 4 then needs `supermajority_ratio` 0.75: five approvals of six.

- **Added:** `conformance/kernel/put-one.test`, a run test (below).
- **Altered, not edited:** `conformance/kernel/print-one.test` (`print(1)`) fails, since `print` is E0301 under RFC 0048. Agents may not edit or delete it; the owner's retirement commit removes it (`rules_changed` event).
- **RFC 0048's draft tests** are not yet in `conformance/`. Their author must make the program changes this RFC requires (text printing, and `fail` on trapping `main`s, both E0403 or E0200 otherwise).

Run tests (kind `run`): complete programs, with empty stderr and status 0 unless the row says otherwise.

| Test | Program | Expected stdout |
| --- | --- | --- |
| `put-one` | `fn main() io { put(1) }` | `1` |
| `print-int` | `fn main() io { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `let-var` | `fn main() io fail { let a = 1; var b = 2; b = b + a; put(b) }` | `3` |
| `let-bool` | `fn main() io { let b = 1 < 2; if b { put(1) } }` | `1` |
| `bool-ops` | `fn main() io { if 1 < 2 and not false { put(1) } else { put(2) } }` | `1` |
| `short-circuit` | `fn side(): Bool io { put(9); ret true }`, `fn main() io fail { if false and side() { put(1) }; if true or side() { put(2) } }` | `2` |
| `cmp-ordering` | `fn main() io { if 2 > 1 { put(1) }; if 2 >= 2 { put(2) }; if 1 <= 2 { put(3) }; if 1 >= 2 { put(9) } }` | `1`, `2`, `3` |
| `cmp-eq` | `fn main() io { if 1 != 2 { put(3) }; if true == true { put(4) } }` | `3`, `4` |
| `arith` | `fn main() io fail { put(7 / -2); put(2 * 3 + 4 * 5); put(-3 + 1); put((1 + 2) * 3) }` | `-3`, `26`, `-2`, `9` |
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

Trap tests (kind `run`; stdout empty unless stated):

| Test | Program | Stderr | Status |
| --- | --- | --- | --- |
| `trap-overflow` | `fn main() io fail { put(4611686018427387904 * 2) }` | `trap: overflow` | 1 |
| `trap-add` | `fn main() io fail { put(9223372036854775807 + 1) }` | `trap: overflow` | 1 |
| `trap-sub` | `fn main() io fail { put(-9223372036854775807 - 2) }` | `trap: overflow` | 1 |
| `trap-neg` | `fn main() io fail { let m = -9223372036854775807 - 1; put(-m) }` | `trap: overflow` | 1 |
| `trap-min` | `fn main() io fail { let m = -9223372036854775807 - 1; put(m / -1) }` | `trap: overflow` | 1 |
| `trap-div` | `fn main() io fail { put(1 / 0) }` | `trap: divide-by-zero` | 1 |
| `trap-stack` | `fn f(n: Int): Int fail { ret f(n) }`, `fn main() io fail { put(f(1)) }` | `trap: stack-exhausted` | 1 |
| `trap-step` | `fn main() io fail { put(1); wh true { } }`. Stdout `1`. | `trap: step-exhausted` | 1 |

Compile-error tests (kind `compile-error`). `glyphc check` exits 1 with exactly the one record listed, compared by `code`, `span` and `fix` (RFC 0004 section 7). The fix is none unless the row says otherwise.

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-mod` | `fn main() io { put(7 % 3) }` | the `%` | E0100 |
| `err-text-lit` | `fn main() io { let t = "a" }` | the `"a"` | E0200 |
| `err-text-put` | `fn main() io { put("a") }` | the `"a"` | E0200 |
| `err-text-if` | `fn main() io { if "a" { } }` | the `"a"` | E0200 |
| `err-text-op` | `fn main() io fail { put(1 + "a") }` | the `"a"` | E0200 |
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
| `err-example` | `fn f(): Int { ret 1 } ex 1 == 2 fn main() io fail { put(f()) }` | the example | E0202 |
| `err-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0 fn main() io fail { put(f()) }` | the example | E0202 |
| `err-example-stack` | `fn f(n: Int): Bool fail { ret f(n) } ex f(1) fn main() io { }` | the example | E0202 |
| `err-dup` | `fn add(): Int { ret 1 } fn add(): Int { ret 2 } fn main() io { }` | the second `add` | E0300 |
| `err-dup-main` | `fn main() io { } fn main() io { }` | the second `main` | E0300 |
| `err-dup-param` | `fn f(a: Int): Int { let a = 1; ret a } fn main() io fail { put(f(1)) }` | the `a` of `let a` | E0300 |
| `err-dup-param-2` | `fn f(a: Int, a: Int) io { } fn main() io fail { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `err-reserved` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `err-reserved-fail` | `fn main() io { let fail = 1 }` | the `fail` | E0300 |
| `err-fn-put` | `fn put(): Int { ret 1 } fn main() io { }` | the `put` | E0300 |
| `err-binding-fn` | `fn g(): Int { ret 1 } fn main() io { let g = 2 }` | the `g` | E0300 |
| `err-int-max` | `fn main() io { put(9223372036854775808) }` | the literal | E0500 |
| `err-int-min` | `fn main() io { put(-9223372036854775808) }` | the literal `9223372036854775808`, not the `-` | E0500 |
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
| `err-fail-order` | `fn main() fail io { }` | the `io`: the grammar accepts `fail` in its slot, then needs a block, and `io` is the first token it rejects | E0100 |

## Open questions

1. **P0 and P1 (blocking).** See Test plan.
2. **TR3 and the step limit.** Confirm per-frame counting. The limit of 10000000 is unmeasured.
3. **Text output.** The title names it, and this kernel does not deliver it: `put` takes `Int` only, and text literals are E0200, so programs cannot read or print text. A stdlib RFC must add it. The group decides whether the title should change or the stdlib RFC should be a precondition.
4. **Pay-for.** The `%` removal pays for part of K1 and F7's text, not all. The group decides whether a partial pay-for passes the designer rule, or whether another kernel construct must be named.
