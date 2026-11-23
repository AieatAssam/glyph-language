# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v10
Status: draft
Replaces: RFC 0049 (kernel-v9, rejected). Keeps every rule of RFC 0049 except those listed under Changes. Tokens, grammar and syntax errors come from `lexical-syntax-v4` (RFC 0048, accepted), which this RFC depends on. Also depends on RFC 0004 (diagnostic records and the trap line) and RFC 0011 (`.gl` extension). Retires the conformance test `kernel/print-one` (RFC 0020).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound, assigned and passed to `put`, and nothing else. There are `let` and `var` bindings with no annotation, functions with an optional result `: R` and an optional effect keyword `io`, `if`, `wh` (while) and `ret` (return), and file-level `ex` lines (examples) that `check` evaluates. The builtin output function is `put`. Every run ends by a return from `main` or by one of four traps, each with exit status 1.

Changes from kernel-v9 (RFC 0049):

- **C1.** Cost gives hand counts against RFC 0020 (designer-min). **C2.** Cost names what the Text rules remove and move (designer-min).
- **C3.** `kernel/print-one` is retired by R1; `kernel/put-one` replaces it (designer-safe, impl-1).
- **C4.** B4: parameters are declared in the body block (designer-safe). **C5.** TR4 states the trap trade-off (impl-1).

## Motivation

RFC 0049 was rejected by designer-min, designer-safe and impl-1. C1 to C5 answer them. The owner's syntax changes stay: `;` between statements, no binding annotation, and `wh`, `ret`, `ex` and `put`.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, the grammar and the syntax errors E0001, E0003, E0005, E0006, E0100 and E0500 are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens. The grammar's `"Int"`, `"Bool"` and `"put"` mean an `IDENT` with that text.

R1. **Retirement.** The conformance test `kernel/print-one` (file `conformance/kernel/print-one.test`, `rfc: 0020`) is retired by this RFC. Its program `fn main() io { print(1) }` uses `print`, which this RFC does not define, so it cannot pass under these rules. The file is not edited or deleted, as the base rules require. Its replacement is `kernel/put-one` (Test plan). A retired test is not run and is not counted by a gate. How the runner reads this list is Open question 2.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. `Text` is an immutable sequence of UTF-8 bytes. It may appear only as the initialiser of `let` or `var`, as the right side of an assignment to a `var` of type `Text`, or as the argument of `put`. Elsewhere it is E0200.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call.

T6. Parameter and result types are `Int` or `Bool`. A `Text` there is E0100 at the token (lexical-syntax-v4, G9 and the `ptype` and `rtype` productions).

T7. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first. Binary operators are left-associative, except the comparisons, which do not chain (lexical-syntax-v4, G6). Unary operators bind tightest of the operators, as the grammar's `unary` says. `-a * b` is `(-a) * b`, and `not a == b` is `(not a) == b`.

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

F7. Parameters are `Int` or `Bool` (T6). Functions cannot be nested (lexical-syntax-v4, G5).

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result, and it may have `io`. Missing is E0302 at the end of file. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

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

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no code. Output written before the trap stays written. The kinds are:

- `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
- `divide-by-zero`: `/` or `%` with a zero divisor (E2);
- `stack-exhausted`: call depth would exceed 10000 (TR2);
- `step-exhausted`: more than 1000000000 `wh` condition evaluations in one run (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is made at each function entry.

TR3. A run has one loop counter, starting at 0 when `main` or an example starts. Each evaluation of a `wh` condition adds 1, true or false. Before an addition would make it exceed 1000000000, the run traps `step-exhausted`. The counter is not reset when a loop or function ends. Calls are not counted here, because TR2 bounds them.

TR4. **Traps are not in signatures.** Principle 3 asks that a function's failure be visible in its signature. This RFC does not do that for traps, for three reasons, and the group must confirm the trade-off (Open question 1).

- Nearly every function can trap: any call can reach `stack-exhausted` (TR2), and any `wh` can reach `step-exhausted` (TR3). A marker would sit on almost every function and say nothing.
- No kernel construct catches a trap, so no caller can act on one. A trap has one fixed result, which principle 7 asks for.
- A marker costs a token per function and needs propagation rules. The constitution leaves the error model open, so a marker belongs to a later RFC.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path given on the command line. An example is `<file>::<name>#<n>`, where `<n>` counts from 1 in source order among that function's examples.

### Diagnostics

Records follow RFC 0004 section 2. The codes E0001, E0003, E0005, E0006, E0100 and E0500 come from `lexical-syntax-v4`. This RFC uses the codes below. Each must be listed in `spec/errors.json` by the first PR that emits it. Each code's range is the one `spec/core/diagnostic.md` gives.

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch; `Text` outside T3; value from a call with no result; `main` with a parameter or result | The operator (E3 to E5); the argument; the callee name (arity); the name `main`; the `ret` keyword (bare `ret` where a value is needed); else the expression |
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
- **Parameters in their own scope above the body.** Rejected (B4). It needs a second scope rule.
- **Compiler-chosen operand order; chained comparisons.** Rejected (E10; lexical-syntax-v4 G6).
- **`print` kept as an alias of `put`.** Rejected. Two spellings for one builtin (principle 1).

## Cost

Hand counts with the rule in `tools/check/tokens.py` (C1). The protected counter was not run (Open question 7). The merge bot's count governs.

Per form, RFC 0020 (kernel-v8) against this RFC:

| Form | RFC 0020 | This RFC | Change |
| --- | --- | --- | --- |
| `print(1)` | 5 | `put(1)` 4 | -1 per use |
| `while i < 5 {` | 6 | `wh i < 5 {` 5 | -1 per use |
| `return x * x` | 5 | `ret x * x` 4 | -1 per use |
| `example double(3) == 6` | 9 | `ex double(3) == 6` 8 | -1 per use |
| `let x: Int = 1` | 6 | `let x = 1` 4 | -2 per annotation |
| `var t: Text = "a"` | 8 | `var t = "a"` 6 | -2 per annotation |
| two statements on one line | 0 (line end not counted) | 1 (`;`) | +1 per boundary |

Whole program, recursive `fact` with `main` printing `fact(10)`. RFC 0020 form: 10 + 10 + 10 + 1 + 15 = 46. This RFC: 10 + 9 + 1 + 9 + 1 + 14 = 44.

Net change on this program: -2 (-4%). Renames save a token per use. Each `;` between statements on one line costs one token. Line ends cost nothing under the counter, so the saving from removing them is in the rules text only.

Removed against RFC 0020: the `let`/`var` annotation (2 tokens per binding). Added: the `;` token (lexical-syntax-v4).

Text. The Text rules are T3, the no-equality clause of E3, the Text form of `put` (P1, P2), and the `TEXT` token. The brief needs text output, so they stay. This RFC removes the `: Text` annotation (2 tokens per binding, via B1). Text operations (equality, length, concatenation, indexing, comparison, conversion to `Int`) are not in the kernel and move to the standard library RFC.

Core spec: not measured. The 12,000-token cap is checked by the merge bot. Spec card: estimated at about 300 tokens, against the 2,000 limit. `spec/card.md`'s current size is not known to this draft.

## Test plan

Tests live in `conformance/kernel/`. Each compile-error test has one error, a fix of `none`, and a span from the Diagnostics table. Unless it is about `main`, its program contains `fn main() io { }`. Where a run row shows only statements, they go inside `fn main() io { ... }`. Each new `--- meta` block holds `id`, `rfc` and `kind`; `rfc` is this RFC's number as the publisher assigns it (0050 if that is the next free number).

Retired test (R1): `kernel/print-one` (`conformance/kernel/print-one.test`). Not edited, not deleted, not run once the runner honours R1.

Replacement run test, file `conformance/kernel/put-one.test`:

| Test | Program | Expected |
| --- | --- | --- |
| `kernel/put-one` | `fn main() io { put(1) }` | `1`, status 0 |

Run tests:

| Test | Program | Expected |
| --- | --- | --- |
| `print-int` | `fn main() io { put(0); put(-7); put(9223372036854775807) }` | `0`, `-7`, `9223372036854775807` |
| `put-text` | `fn main() io { put("a\n\"b\"\\") }` | stdout `a`, LF, `"b"\`, LF |
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
| `fn-void` | `fn f() { }`, `fn main() io { f() }` | no output, status 0 |
| `ret-bare` | `fn stop(n: Int) io { if 0 < n { ret }; put(n) }`, `fn main() io { stop(0); stop(5) }` | `0` |
| `fn-recursion` | `fn fact(n: Int): Int { if n <= 1 { ret 1 }; ret n * fact(n - 1) }`, `fn main() io { put(fact(10)) }` | `3628800` |
| `wh-sum` | `fn main() io { var i = 0; var s = 0; wh i < 5 { i = i + 1; s = s + i }; put(s) }` | `15` |
| `if-else-chain` | `fn main() io { if false { put(1) } else { put(2) } }` | `2` |
| `layout` | `fn main() io {`, LF, `  let a = 1;`, LF, `  if a == 1 { put(a) }`, LF, `}` | `1` |
| `paren-nested` | `fn main() io { put(-((4))) }` | `-4` |
| `shadow` | `fn main() io { let a = 1; if true { let a = 2; put(a) }; put(a) }` | `2`, `1` |
| `example-ok` | `fn double(x: Int): Int { ret x * 2 } ex double(3) == 6 ex not false`, `fn main() io { put(double(4)) }` | `8` |
| `example-call-ok` | `fn fact` as in `fn-recursion`, `ex fact(5) == 120`, `fn main() io { put(fact(5)) }` | `120` |
| `text-bind` | `fn main() io { let u = "x"; var t = "a"; t = "bc"; put(u); put(t) }` | `x`, `bc` |
| `step-ok` | `fn main() io { var i = 0; wh i < 1000 { i = i + 1 }; put(1) }` | `1`, status 0 |
| `trap-overflow` | `fn main() io { put(4611686018427387904 * 2) }` | stderr `trap: overflow`, status 1 |
| `trap-add` | `fn main() io { put(9223372036854775807 + 1) }` | stderr `trap: overflow`, status 1 |
| `trap-sub` | `fn main() io { put(-9223372036854775807 - 2) }` | stderr `trap: overflow`, status 1 |
| `trap-neg` | `fn main() io { let m = -9223372036854775807 - 1; put(-m) }` | stderr `trap: overflow`, status 1 |
| `trap-min` | `fn main() io { let m = -9223372036854775807 - 1; put(m / -1) }` | stderr `trap: overflow`, status 1 |
| `trap-min-mod` | `fn main() io { let m = -9223372036854775807 - 1; put(m % -1) }` | `0`, status 0 |
| `trap-div` | `fn main() io { put(1 / 0) }` | stderr `trap: divide-by-zero`, status 1 |
| `trap-mod` | `fn main() io { put(1 % 0) }` | stderr `trap: divide-by-zero`, status 1 |
| `trap-stack` | `fn f(n: Int): Int { ret f(n) }`, `fn main() io { put(f(1)) }` | stderr `trap: stack-exhausted`, status 1 |
| `trap-step` | `fn main() io { put("before"); wh true { } }` | stdout `before`, LF; stderr `trap: step-exhausted`; status 1 |

Every grammar production appears in at least one run test, or in a `lexical-syntax-v4` test (`v4-` prefix). `put-text` covers the escapes; `trap-step` covers `wh` with an empty block.

Compile-error tests (code, span and fix; the fix is `none` for each):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-type` | `fn main() io { if 1 { } }` | the `1` | E0200 |
| `err-cmp-type` | `fn main() io { if true < false { } }` | the `<` | E0200 |
| `err-cmp-ge-bool` | `fn main() io { if true >= false { } }` | the `>=` | E0200 |
| `err-bool-op` | `fn main() io { let a = 1 and true }` | the `and` | E0200 |
| `err-not` | `fn main() io { let a = not 1 }` | the `not` | E0200 |
| `err-put-bool` | `fn main() io { put(true) }` | the `true` | E0200 |
| `err-put-arity` | `fn main() io { put(1, 2) }` | the `put` | E0200 |
| `err-text-op` | `fn main() io { put("a" == "b") }` | the `==` | E0200 |
| `err-text-arg` | `fn f(n: Int) io { }`, `fn main() io { f("a") }` | the `"a"` | E0200 |
| `err-arity` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { put(add(1)) }` | the `add` | E0200 |
| `err-void-value` | `fn f() io { }`, `fn main() io { let x = f() }` | the call `f()` | E0200 |
| `err-ret-value` | `fn f() io { ret 1 }`, `fn main() io { f() }` | the `1` | E0200 |
| `err-ret-bare` | `fn f(): Int io { ret }`, `fn main() io { put(f()) }` | the `ret` | E0200 |
| `err-assign-type` | `fn main() io { var a = 1; a = true }` | the `true` | E0200 |
| `err-example-type` | `fn f(): Int { ret 1 } ex 1`, `fn main() io { put(f()) }` | the `1` after `ex` | E0200 |
| `err-main-sig` | `fn main(n: Int) io { }` | the `main` | E0200 |
| `err-missing-ret` | `fn f(n: Int): Int { if n == 0 { ret 1 } }`, `fn main() io { put(f(0)) }` | the closing `}` of `f` | E0201 |
| `err-example` | `fn f(): Int { ret 1 } ex 1 == 2`, `fn main() io { put(f()) }` | the `ex` example | E0202 |
| `err-example-trap` | `fn f(): Int { ret 1 } ex 1 / 0 == 0`, `fn main() io { put(f()) }` | the `ex` example | E0202 |
| `err-example-budget` | `fn spin(): Int { wh true { }; ret 0 } ex spin() == 0`, `fn main() io { }` | the `ex` example | E0202 |
| `err-example-stack` | `fn f(n: Int): Bool { ret f(n) } ex f(1)`, `fn main() io { }` | the `ex` example | E0202 |
| `err-dup` | `fn add(): Int { ret 1 }`, `fn add(): Int { ret 2 }`, `fn main() io { }` | the second `add` | E0300 |
| `err-dup-main` | `fn main() io { }`, `fn main() io { }` | the second `main` | E0300 |
| `err-dup-param` | `fn f(a: Int): Int { let a = 1; ret a }`, `fn main() io { put(f(1)) }` | the `a` of `let a` | E0300 |
| `err-dup-param-2` | `fn f(a: Int, a: Int) io { }`, `fn main() io { f(1, 1) }` | the second `a` of the parameters | E0300 |
| `err-reserved` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `err-fn-put` | `fn put(): Int { ret 1 }`, `fn main() io { }` | the `put` | E0300 |
| `err-binding-fn` | `fn g(): Int { ret 1 }`, `fn main() io { let g = 2 }` | the `g` | E0300 |
| `err-unknown` | `fn main() io { put(zz) }` | the `zz` | E0301 |
| `err-print` | `fn main() io { print(1) }` | the `print` | E0301 |
| `err-use-before` | `fn main() io { put(a); let a = 1 }` | the first `a` | E0301 |
| `err-type-value` | `fn main() io { put(Int) }` | the `Int` | E0301 |
| `err-fn-value` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { let f = add }` | the `add` | E0301 |
| `err-main` | `fn f() { }` | the end of file | E0302 |
| `err-assign-let` | `fn main() io { let a = 1; a = 2 }` | the `a` of `a = 2` | E0303 |
| `err-assign-param` | `fn f(n: Int) io { n = 2 }`, `fn main() io { f(1) }` | the `n` of `n = 2` | E0303 |
| `err-effect` | `fn f() { put(1) }`, `fn main() io { f() }` | the `put` | E0400 |
| `err-effect-call` | `fn g() io { }`, `fn f() { g() }`, `fn main() io { f() }` | the `g` | E0400 |
| `err-effect-example` | `fn say(): Int io { ret 1 } ex say() == 1`, `fn main() io { put(say()) }` | the `say` in the example | E0400 |

## Open questions

1. **Traps and principle 3.** TR4 is the trade-off. The group must confirm the exception.
2. **Retirement mechanism.** R1 says a retired test is not run, but the runner does not read a retired list, and `tools/` is outside agents' write scope. Until it does, `kernel/print-one` fails. The group must add the runner change or accept the failure (also lexical-syntax-v4, open question 3).
3. **Record format.** Until the runner's comparison of `code`, `span` and `fix` is confirmed, compile-error tests are checked for code and line only.
4. **Leading zero.** `007` is E0006 here and E0001 in RFC 0004's `diag/fix-present` (lexical-syntax-v4, open question 7). The group must settle it.
5. **Loop limit.** TR3's 1000000000 steps make `err-example-budget` and `trap-step` slow. A smaller limit needs its own decision.
6. **Slow finite programs.** Reviewers should say whether principle 7 needs a total call-and-loop limit.
7. **Counter not run.** The protected counter was not run here: the command was not on the allowed list. The Cost figures are hand counts, and the merge bot's count governs. No build or conformance run has been done for this draft.
8. **Spellings.** `wh`, `ret`, `ex` and `put` were chosen for the token counter. A measured error rate would be needed to keep or change them.
