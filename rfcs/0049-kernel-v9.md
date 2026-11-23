---
status: rejected
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: reject
  tester: approve
  user-1: approve
  user-2: approve
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v9
Status: draft
Replaces: RFC 0020 (kernel-v8, superseded by the owner). Tokens, grammar and syntax errors come from `lexical-syntax-v4`, which this RFC depends on: every production named here is defined there, and every E0100 position is that RFC's. This RFC gives those forms their meaning and adds the type, name, effect, example and trap rules. It also depends on RFC 0004 (diagnostic records and the trap line) and RFC 0011 (`.gl` extension).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound, assigned and printed, and nothing else. There are `let` and `var` bindings with no annotation, functions with an optional result `: R` and an optional effect keyword `io`, `if`, `wh` (while) and `ret` (return), and file-level `ex` lines (examples) that `check` evaluates. The builtin output function is `put`. Every run ends by a return from `main` or by one of four traps, each with exit status 1.

## Motivation

RFC 0020 was rejected by designer-prag and tester. Each objection is fixed here.

- designer-prag: the `trap-step` program had an extra `}`. It is now `wh true { }`, inside `fn main() io { put("before"); wh true { } }`.
- tester (1): `example` was placed before any function, which is E0100 at `ex` under the grammar (G5). Each example now follows a function's closing brace, and each compile-error program has a `main` where it is not about `main`.
- tester (2): `trap-step` is fixed as above.
- tester (3): compile-error rows state the span and the fix (`none`).
- tester (4): every run test is complete and its stdout is written out.
- tester (5): new tests cover `and` and `or` short-circuit (E10), overflow from `+`, `-` and unary `-` (E1), `%` by zero (E2), inner-block shadowing and a binding named after a function (B5).

The syntax changes are the owner's: no newline dependence, `;` between statements, no binding annotation, and the renamed `wh`, `ret`, `ex` and `put`.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, the grammar and the syntax errors E0001, E0003, E0005, E0006, E0100 and E0500 are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens. The grammar's `"Int"`, `"Bool"` and `"put"` mean an `IDENT` with that text.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. `Text` is an immutable sequence of UTF-8 bytes. It may appear only as the initialiser of `let` or `var`, as the right side of an assignment to a `var` of type `Text`, or as the argument of `put`. Elsewhere it is E0200.

T4. No implicit conversion exists between types. There is no unit type. A call to a function with no result, used as a value, is E0200 (T5).

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

E10. Evaluation is left to right. The left operand of a binary operator is evaluated before the right, and the operator is applied after both. Call arguments are evaluated left to right, then the call is made. `and` and `or` skip the right operand when the left decides. A trap in an earlier operand happens before a later operand is evaluated.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (lexical-syntax-v4, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch with the variable's type is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are in scope in the body. Declaring a name already declared in the same block, including a parameter, is E0300 at the new name.

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

P1. `put` is built in with two forms, `put(x: Int) io` and `put(x: Text) io`. The compiler picks the form from the argument's type. Any other argument type, including `Bool`, is E0200 at the argument. Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. `put` writes its value and then one LF. An `Int` is written in decimal, with a leading `-` if negative and no leading zeros. A `Text` is written as its UTF-8 bytes, with escapes already applied and no quotes.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals and loops

C1. `if cond block [ else block ]`. The `else` part is a block only (lexical-syntax-v4, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

### Examples

EX1. `ex EXPR` follows a function's closing `}` or another example of that function (lexical-syntax-v4, G5). It belongs to that function.

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. `glyphc check` runs each example as its own run under the TR2 and TR3 limits. The call depth and the loop counter start at 0. `true` passes. `false`, or any trap, fails with E0202 at the example's span, and the message names the outcome. The span of an example runs from its `ex` keyword to the last token of its expression. `glyphc run` does not evaluate examples.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no code. Output written before the trap stays written. The kinds are:

- `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
- `divide-by-zero`: `/` or `%` with a zero divisor (E2);
- `stack-exhausted`: call depth would exceed 10000 (TR2);
- `step-exhausted`: more than 1000000000 `wh` condition evaluations in one run (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is made at each function entry.

TR3. A run has one loop counter, starting at 0 when `main` or an example starts. Each evaluation of a `wh` condition adds 1, true or false. Before an addition would make it exceed 1000000000, the run traps `step-exhausted`. The counter is not reset when a loop or function ends. Calls are not counted here, because TR2 bounds them.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path given on the command line. An example is `<file>::<name>#<n>`, where `<n>` counts from 1 in source order among that function's examples.

### Diagnostics

Records follow RFC 0004 section 2. The codes E0001, E0003, E0005, E0006, E0100 and E0500 come from `lexical-syntax-v4`. This RFC uses the codes below. Each must be listed in `spec/errors.json` by the first PR that emits it. Each code's range is the one `spec/core/diagnostic.md` gives.

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch in an operand, condition, assignment, return, argument, example or `put`; `Text` outside T3; a value from a call with no result; `main` with a parameter or result | The operator token, for an operator (E3 to E5). The argument, for a call argument. The callee name, for an arity error. The name `main`, for its signature. The expression otherwise. The `ret` keyword, for a bare `ret` where a value is needed |
| E0201 | types | A function with a result clause can reach its closing brace without returning | The closing `}` of the body |
| E0202 | types | An example evaluates to `false`, or traps | The example (EX3) |
| E0300 | name | Duplicate declaration in one scope; a second `main`; a reserved name | The new name |
| E0301 | name | Unknown name; use before declaration; a function, `put` or type name used as a value | The name |
| E0302 | name | No `main` | The end-of-file token |
| E0303 | name | Assignment to a `let` binding or a parameter | The target name |
| E0400 | effects | A call to an `io` function or `put` from a function without `io`, or from an example | The callee name |

No code here is used by a rejected RFC with a different meaning. The second-meaning check must be run against `spec/errors.json` when these codes are added.

## Alternatives

- **Traps in signatures (principle 3).** Rejected for this RFC. See open question 1.
- **A unit type for functions without a result.** Rejected (T4, T5). It adds a value with no use.
- **Result type required, `: ()`.** Rejected. It is a second spelling for "no result".
- **Annotated bindings `let x: T = e`.** Rejected (B1). The type is inferred, and an annotation is a second way to write a binding.
- **Operand order chosen by the compiler.** Rejected (E10). Calls run in source order, so a trap or an `io` effect happens in a fixed order.
- **Chained comparisons.** Rejected (lexical-syntax-v4, G6).

## Cost

Measured by hand with the rule in `tools/check/tokens.py`, which charges ceil(n/4) for an alphabetic run of n letters. The counter itself was not run.

- Renames: `put`, `wh`, `ret`, `ex` each cost 1 token per use, against 2 for `print`, `while`, `return`, `example`.
- Removes: the annotation syntax on `let` and `var`.
- Net: about neutral against RFC 0020 in the core spec. Not measured in full.

Spec card: one line for the value types, one for the operator table with the non-chaining rule, one for E10, one for the four traps with status 1, one for the `: R io` order, and one for `put`. About 300 tokens by estimate, under the 2,000 limit. `spec/card.md` exists in this checkout and its current size is not known to this draft.

## Test plan

Conformance tests live in `conformance/kernel/`. A run test states stdout, stderr and exit status. A compile-error test holds one program with one error and states the expected record as JSON, comparing `code`, `span` and `fix` (RFC 0004 section 7). Span rules are those in the Diagnostics table. Every compile-error fix is `none`. Every compile-error program is complete: unless it is about `main`, it contains `fn main() io { }`, and it has no other error.

Each run program is complete. Where the test shows only statements, they go inside `fn main() io { ... }`. Statements are separated by `;`. `put(...)` is the builtin.

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
| `err-reserved` | `fn main() io { let put = 1 }` | the `put` | E0300 |
| `err-fn-put` | `fn put(): Int { ret 1 }`, `fn main() io { }` | the `put` | E0300 |
| `err-binding-fn` | `fn g(): Int { ret 1 }`, `fn main() io { let g = 2 }` | the `g` | E0300 |
| `err-unknown` | `fn main() io { put(zz) }` | the `zz` | E0301 |
| `err-use-before` | `fn main() io { put(a); let a = 1 }` | the first `a` | E0301 |
| `err-type-value` | `fn main() io { put(Int) }` | the `Int` | E0301 |
| `err-fn-value` | `fn add(a: Int, b: Int): Int { ret a + b }`, `fn main() io { let f = add }` | the `add` | E0301 |
| `err-main` | `fn f() { }` | the end of file | E0302 |
| `err-assign-let` | `fn main() io { let a = 1; a = 2 }` | the `a` of `a = 2` | E0303 |
| `err-assign-param` | `fn f(n: Int) io { n = 2 }`, `fn main() io { f(1) }` | the `n` of `n = 2` | E0303 |
| `err-effect` | `fn f() { put(1) }`, `fn main() io { f() }` | the `put` | E0400 |
| `err-effect-call` | `fn g() io { }`, `fn f() { g() }`, `fn main() io { f() }` | the `g` | E0400 |
| `err-effect-example` | `fn say(): Int io { ret 1 } ex say() == 1`, `fn main() io { put(say()) }` | the `say` in the example | E0400 |

The grammar-position errors that RFC 0020 listed as E0100 (`err-compare-chain`, `err-else-if`, `err-fn-nested`, `err-text-param`, and the rest) are now in the `v4-err-*` tests of `lexical-syntax-v4`, with the positions that RFC gives. The E0003 keyword tests are there too.

## Open questions

1. **Traps and principle 3.** Principle 3 says whether a function can fail is visible in its signature. Traps do not appear in signatures. This RFC makes that an exception, and the group must confirm it. A trap marker would be a new RFC, and it would change every arithmetic function.
2. **Record format.** RFC 0004 section 7 compares `code`, `span` and `fix`. The test runner in `tools/check/conformance.py` was said to compare `(code, line)` in the previous draft; this draft has not read that file's current form. Until the runner compares spans, compile-error tests are checked for code and line only.
3. **Leading zero.** `007` is E0006 under `lexical-syntax-v4`, rule 8. RFC 0004's `diag/fix-present` expects E0001 and a fix. This RFC does not use `007`. The conflict is for the group to settle.
4. **Loop limit.** TR3's 1000000000 steps make `err-example-budget` and `trap-step` take a long time to run. A smaller limit needs its own decision.
5. **Slow finite programs.** A naive `fib(60)` makes far more calls than loop steps, and it still ends, so it has a defined result. Only a total call-and-loop limit would cut it short, at a cost per call. Reviewers should say whether principle 7 needs one.
6. **Precedence of `not`.** The grammar's `unary` rule makes `not a == b` read as `(not a) == b`. Changing it changes `unary` in `lexical-syntax-v4` and the precedence list here.
7. **Limits not measured.** The 12,000-token core cap and the 2,000-token card cap are checked by the merge bot with the protected counter. This draft estimates its cost and does not run the counter. The expected outputs are derived by hand, and no build or conformance run has been done for this draft.
8. **Text scope.** `Text` has no operations in the kernel. The standard library RFC must add them before text-processing programs can be written.
9. **Keyword and builtin spellings.** `wh`, `ret`, `ex` and `put` were chosen for the token counter, not for familiarity. A measurement showing a model error rate with each would be needed to keep or change them.
