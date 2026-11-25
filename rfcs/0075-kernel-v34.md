# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v34
Status: draft
Replaces: RFC 0074 (kernel-v33, rejected). In substance this resubmits RFCs 0061 to 0073, so RULES rule 6 applies (P1).
Depends on: `lexical-syntax-v4` (RFC 0048), kernel-v9 (RFC 0049, `put`), RFC 0004, RFC 0011.
Amends: RFC 0048, one production: `fn_decl` (L1). No other production changes.
Alters tests: yes. `conformance/kernel/print-one.test` uses `print`, which RFC 0048 removes. The owner's retirement commit deletes it. This draft deletes nothing. The front matter says `alters_tests: true`, so `supermajority_ratio` 0.75 applies (RULES rule 4).

**Preconditions.** Not claimed here. P0 to P3 (Test plan) are for the orchestrator to settle before any vote.

## Summary

The kernel is the smallest part of Glyph that runs a useful program: `Int`, `Bool`, bindings, functions, `if`, `wh`, `ret` and examples (`ex`). `put` prints an `Int`. Text output needs a stdlib RFC (Open question 3). `io` marks output. `fail` marks every function whose body can trap, and the body fixes the mark (F7). A run ends by a return from `main` or by one of four traps.

## Motivation

RFC 0074 was rejected by designer-min (card growth), designer-prag and impl-1 and tester (preconditions and fail-mark benchmark), and user-1 and user-2 (card coverage). Answers:

- **Card growth (designer-min).** v33 added about 230 tokens with no paying removal. v34 removes the diagnostics card's content, which `spec/core/diagnostic.md` already holds (record fields, code ranges, the no-error rule, the trap rule). It keeps a one-line pointer. Removed 231, added 234, net +3 by hand count (K1). Gate figures measured now: core 917 of 12,000, card 244 of 2,000 (rule 9).
- **Preconditions (designer-prag, impl-1, tester).** P0 to P3 are listed and none is claimed. P0 fails by arithmetic (see Test plan). P2 was not run, because this session has no benchmark runner.
- **Card coverage (user-1, user-2).** K1 now names the value types, bindings, `fn` with `io` and `fail`, `if`, `wh`, `ret`, `ex`, `put`, and the trap line.
- **Alters tests.** The header now says so, and the owner's commit is named.

No rule or test changed from v33 except the card text, the header and the preconditions. The test plan is carried over unchanged.

## Design

Normative. "Must" and "is" bind implementers.

L1. **Tokens and amendment.** Tokens, keywords, literals and syntax errors are those of `lexical-syntax-v4`. This RFC adds no token or keyword. It amends `fn_decl`:

```
fn_decl = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
```

`"fail"` is an `IDENT` token with the text `fail`, as `"put"` is. `fail` is not a keyword, so the keyword count stays fourteen. The name `fail` is reserved (B5, F6).

L2. **Grammar.** `mul_expr` is `unary { ( "*" | "/" | "%" ) unary }`, as in RFC 0048. Nothing else in RFC 0048 changes.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is E0200 at the literal, wherever it appears, and has type `?` (E10).

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value, it is E0200 at the call, and the value has type `?`.

T6. A parameter type or result type is `Int` or `Bool`, the only tokens `ptype` and `rtype` accept. Any other token there, including `Text`, is E0100 at that token.

T7. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; call, literal, name, `( expr )`. Binary operators are left-associative, except the comparisons, which do not chain (lexical-syntax-v4, G6).

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` truncates toward zero. `a % b` is the remainder with the sign of `a`, so `a == (a / b) * b + a % b` holds whenever `a / b` does not trap. A zero divisor for `/` or `%` traps `divide-by-zero`. `MIN / -1` traps `overflow`. `MIN % -1` is `0` and does not trap.

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200.

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200.

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes `Bool`. Otherwise E0200.

E6. Unary `-` takes `Int`.

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200.

E8. A call's argument count and types must match its parameters. Otherwise E0200.

E9. Evaluation is left to right: the left operand, then the right; call arguments in order, then the call.

E10. **Recovery.** A failed expression takes its operator's type (`Bool` for comparisons, `and`, `or` and `not`; `Int` for arithmetic), its callee's result type for a call, or `?` otherwise. `?` gives no further diagnostic.

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

F7. **Fail mark.** A function body is *trapping* if, outside any example, it contains a binary `+`, `-`, `*`, `/` or `%`; a unary `-`; a `wh` statement, whose counter can trap `step-exhausted`; or a call to a function declared in the file. A call to `put` does not count, because `put` is not a call frame.

The `fail` token is present if and only if the body is trapping. The author does not choose it. The checker reports a missing or extra mark as E0403 at the function name. Examples are not functions, so a trap in one is E0202 (EX3).

A call to a file function is itself trapping, so the mark never restricts a caller. It is fully determined by the body; E0403 keeps the signature true to it.

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

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each evaluate every example when there is no other compile error, at depth 0 with a new loop counter (TR2, TR3). `true` passes. `false` or any trap is E0202 at the example; `build` and `run` then write no module and run no `main`.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. Traps carry no code. Output written before the trap stays written. The kinds are `overflow` (E1, E2), `divide-by-zero` (E2), `stack-exhausted` (TR2) and `step-exhausted` (TR3).

TR2. `main` is at depth 1; an example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`.

TR3. **Loop counter per call.** Each call frame has its own counter, starting at 0. Each evaluation of a `wh` condition in that frame's own body adds 1. Before an addition would exceed 10000000, the run traps `step-exhausted`. Calls are not counted here. The limit is one constant (Open question 2).

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order.

### Card

K1. `spec/card.md` is rewritten by the first implementing PR to the text below. The diagnostics section is replaced by a one-line pointer. The removed lines are the record fields, the code ranges, the no-error rule and the trap sentence, all of which `spec/core/diagnostic.md` gives in full (Cost).

```
# Glyph

Source: *.gl, compiler glyphc

# Card: kernel
Types: Int, Bool.
Bind: let x = e; var x = e (mutable). x = e needs var.
Fn: fn f(a: Int, b: Bool): R io fail { } ex e.
Fail: body with + - * / %, unary -, wh or file call needs fail.
Stmts ;-separated: let, var, x = e, call, if e { } else { }, wh e { }, ret [e].
Ops low to high: or; and; comparisons (no chain); + -; * / %; unary - not.
Int: + - * unary - trap overflow; / % trap divide-by-zero.
Output: put(x) io prints Int then LF. Entry: one fn main() [io] [fail].
Ex: ex e, a Bool, must be true.
Trap: stderr "trap: K", exit 1.
Diagnostics: spec/core/diagnostic.md.
```

### Diagnostics

Records follow RFC 0004 section 2. Each code below must be listed in `spec/errors.json` by the first PR that emits it. Each code's range is the one `spec/core/diagnostic.md` gives.

| Code | Meaning | Span |
| --- | --- | --- |
| E0200 | Type mismatch, text literal (T3), valueless call as value, arity, `main` signature | The offending token or expression |
| E0201 | A function with a result clause can reach its closing brace | The closing `}` |
| E0202 | An example is `false` or traps (EX3) | The example |
| E0300 | Duplicate or reserved name (B4, B5, M1, F6) | The new name |
| E0301 | Unknown name, use before declaration, function or type as value | The name |
| E0302 | No `main` | The end-of-file token |
| E0303 | Assignment to a `let` or parameter | The target name |
| E0400 | Call to an `io` function or `put` without `io`, or from an example | The callee name |
| E0403 | `fail` mark does not match the body (F7) | The function name. Fix: insert ` fail` after the signature if missing; delete the `fail` token if extra |

None of E0200 to E0202, E0300 to E0303, E0400 or E0403 is in `spec/errors.json`. The first PR that emits each adds it.

## Alternatives

- **Drop `fail`, or derive it unwritten.** Rejected. Principle 3 requires that a function's ability to fail is visible in its signature.
- **Let the author add or omit the mark.** Rejected. Optional syntax breaks principle 1; a wrong mark breaks principle 3.
- **Keep the diagnostics card (RFC 0074).** Rejected by designer-min: net +230 with no paying removal.
- **Remove the diagnostics card entirely.** Rejected. A model repairing a program needs to know where the record format is. The pointer costs 14 tokens.

## Cost

**Measured now (rule 9, this checkout):** core 917 of 12,000; card 244 of 2,000.

**Card, by hand** (alphabetic run of n letters: ceil(n/4); digit run: ceil(n/3); other character: 1). The protected counter has not been run on the new card; the implementing PR's rule 9 figure is the check (P3).

| Item | Tokens |
| --- | --- |
| Old card, all of it except the `# Glyph` header (13) | 231 removed |
| New kernel section, heading included (K1 lines) | 220 added |
| New diagnostics pointer | 14 added |
| **Net** | **+3** (card about 247 of 2,000) |

The removed 231 duplicate `spec/core/diagnostic.md`, which holds the record fields, code ranges, the no-error rule and the trap rule (lines 5 to 15, 21 to 34, 42). The residual +3 is not paid by removal. It is within counting error, and P3 settles it.

**Core.** The kernel text goes into `spec/core` in the implementing PR. Headroom is about 11,083. The E0403 row adds about 60 tokens by hand.

## Test plan

Tests live in `conformance/kernel/`, one per file, with `id`, `rfc` and `kind` in the meta block. Each compile-error program yields one record. Each program's `fail` marks match F7; the table is checked row by row for this.

Preconditions, checked by the orchestrator before any vote. This draft claims none.

- **P0. RFC 0048.** Not met. Front matter says `accepted`; body says `Status: draft`; the assignment says `implementing`. Votes are 4 approve and 2 reject. 4/6 is 0.66667, which is below `accept_ratio` 0.6667, so the status is not clear under rule 4. This draft amends RFC 0048. The orchestrator must settle it.
- **P1. Cooldown.** Unverified. RULES rule 6 bars resubmission in substance for 10 nights, and this draft resubmits RFCs 0061 to 0073. No rejection dates are recorded in `rfcs/` or `governance/`.
- **P2. Fail-mark benchmark.** Not run. It must show that models do not omit the mark more often with it than without.
- **P3. Card gate.** The implementing PR's rule 9 card figure must be at most 250, with the removals of K1 made.

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

Trap tests (kind `run`; stdout empty unless stated):

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

Compile-error tests (kind `compile-error`). `glyphc check` exits 1 with exactly the one record listed, compared by `code`, `span` and `fix` (RFC 0004 section 7). The fix is none unless the row says otherwise.

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-mod-text` | `fn main() io fail { put("a" % 3) }` | the `"a"` | E0200 |
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
| `err-fail-order` | `fn main() fail io { }` | the `io`: the grammar accepts `fail` in its slot, then needs a block, and `io` is the first token it rejects | E0100 |

## Open questions

1. **Card residual.** The card is +3 by hand over 244. The group must accept it, or name a one-for-one removal. None is named here.
2. **TR3 and the step limit.** The per-frame counter and the 10000000 limit are unmeasured.
3. **Text output.** Absent here; a stdlib RFC adds it.
4. **Fail mark error rate.** Unmeasured. P2 is the benchmark.
