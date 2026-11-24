---
status: draft
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v14
Status: draft
Replaces: RFC 0054 (kernel-v13, rejected). Keeps every rule of RFC 0054 except those listed under Changes.
Depends on: `lexical-syntax-v4` (RFC 0048), which must be accepted first (P0); RFC 0011 (`.gl`); RFC 0004 (records).

## Summary

The kernel is the smallest part of Glyph that runs a useful program: `Int` (64-bit signed) and `Bool`, `let` and `var` with no annotation, functions with optional `: R` and `io`, `if`, `wh`, `ret`, and file-level `ex` examples. The builtin output function is `put`, and it takes an `Int`.

**The kernel cannot print text.** It has no `Text` type, and a text literal is E0200 (E12). Text output belongs to the standard library, in a later RFC that is not yet written. Until then a program can print only `Int` values.

Every run ends by a return from `main` or by one of four traps, each with exit status 1.

This RFC cannot be accepted until its precondition P0, RFC 0048, is accepted (C1).

## Motivation

RFC 0054 was rejected. This draft keeps its design and fixes each objection: `fact` is defined (C5), `print-one` is not retired (C2), RFC 0048's status is stated as unmet (C1), failed names are typed (C4), and the loop counter is per call (C3).

## Changes from RFC 0054

- **C1. Precondition P0 is not met.** RFC 0048's front matter says `accepted`, and its body says `Status: draft`. Its votes are 4 approve and 2 reject. `governance/RULES.md` sets `accept_ratio` to 0.6667, and 4 of 6 is 0.6666…, below it. So RFC 0048 is not accepted, and this RFC cannot be accepted until its author fixes that. This draft does not edit RFC 0048.
- **C2. `kernel/print-one` is not retired.** Existing conformance tests are never edited or deleted, so RFC 0054's P1 is removed. `print-one.test` stays red, because `print` is E0301. The implementing PR reports it in its body. `put-one` is added as a new test.
- **C3. Loop counter per call (TR3).** RFC 0054's counter is shared across calls. Here each call frame has its own counter. TR3 is voted on its own.
- **C4. Failed names have type `?` (E11).** So `put(zz)`, `let x = Int` and `let f = add` each give exactly one error.
- **C5. `fact` is defined.** The program is written out in full in the Test plan, and each test that uses it contains the full text.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, the grammar and the syntax errors E0001, E0003, E0005, E0006, E0100 and E0500 are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens. The grammar's `"Int"`, `"Bool"` and `"put"` mean an `IDENT` with that text.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. The kernel has two types, `Int` and `Bool`. There is no `Text` type, no unit type and no other type. A text literal is E12.

T4. No implicit conversion exists between types.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call, and the value has type `?`.

T6. Parameter and result types are `Int` or `Bool`. A `Text` there is E0100 at the token (lexical-syntax-v4, `ptype` and `rtype`).

T7. `Int` and `Bool` used as values are E0301. Any other name in a type position is E0100.

E12. **Text literals.** A text literal `"..."` is valid syntax (lexical-syntax-v4, rule 9), but the kernel gives it no type. A text literal in an expression is E0200 at the literal. Its type is `?` (E11).

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

E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200.

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200, so `true >= false` is E0200 at `>=`.

E5. `and` and `or` take `Bool` operands and short-circuit: the right operand is not evaluated when the left decides the result. `not` takes `Bool`. Otherwise E0200.

E6. Unary `-` takes `Int`. `+` is not unary. The grammar rejects it with E0100.

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200.

E8. A call's argument count and types must match its parameters. Otherwise E0200.

E9. Overflow and division by zero are run-time traps, so `put(1 / 0)` compiles and traps when run.

E10. Evaluation is left to right: the left operand before the right, call arguments in order, then the call. `and` and `or` skip the right operand when the left decides. A trap in an earlier operand happens first.

E11. **Recovery.** A failed expression takes the type its operator declares: comparisons, `and`, `or` and `not` give `Bool`, and arithmetic gives `Int`. A failed call takes its callee's result type, or `?` if the callee has none. A failed name, a text literal and a call with no result used as a value have type `?`. `?` is accepted without a further diagnostic by every operator, condition, argument, assignment and position. A binding of a `?` expression has type `?`. `?` is internal: no program can name it. So each test program produces exactly the errors it lists.

### Bindings

B1. `let NAME = expr` is immutable. `var NAME = expr` is mutable. The binding has the type of `expr`. There is no annotation (lexical-syntax-v4, G10).

B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch with the variable's type is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. **Parameters are declared in the body block.** Each parameter is declared as if it were a `let` at the start of the body, in order. A `let` of a parameter's name in the body, or a second parameter of the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take the name of a function in the file, or of `put`, `Int`, `Bool` or `Text`. Otherwise E0300 at the new name. `Text` is reserved for the standard library RFC.

### Functions and effects

F1. `fn NAME(p1: T1, ...) [: R] [io] block`. `: R` comes before `io`, and both are optional. `fn f() io { }` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the function body.

F4. `ret expr` needs a result clause and a matching type. A bare `ret` is allowed only without a result clause. Otherwise E0200: at the expression for a mismatch, and at the `ret` keyword for a bare `ret` where a value is needed.

F5. Recursion is allowed. Termination is not checked. Every run ends by a return from `main`, or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool` or `Text` is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301 at the name.

F7. Functions cannot be nested (lexical-syntax-v4, G5).

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result, and it may have `io`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in with one form, `put(x: Int) io`. Its argument must be `Int`. Any other argument type, including `Bool`, is E0200 at the argument. A text literal argument gets only the error of E12, and `put` reports nothing more (E11). Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name. The name `print` has no meaning: a use of it is E0301 at the name. This narrows the `put` of kernel-v9, which also had a `Text` form.

P2. `put` writes its `Int` value in decimal, with a leading `-` if negative and no leading zeros, and then one LF.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals and loops

C1. `if cond block [ else block ]`. The `else` part is a block only (lexical-syntax-v4, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

### Examples

EX1. `ex EXPR` follows a function's closing `}` or another example of that function (lexical-syntax-v4, G5). It belongs to that function.

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. **Examples run in every compiling command.** `glyphc check`, `glyphc build` and `glyphc run` each run every example when the program has no other compile error. Each example runs as its own run: its expression is at depth 0 and starts with new loop counters (TR2, TR3). `true` passes. `false`, or any trap, fails with E0202 at the example's span (`ex` to the last token of its expression). A failing example makes `build` and `run` exit 1 without writing a module or running `main` (principle 5).

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. This is the form `spec/card.md` gives. Traps carry no code. Output written before the trap stays written. The kinds are:

- `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
- `divide-by-zero`: `/` or `%` with a zero divisor (E2);
- `stack-exhausted`: call depth would exceed 10000 (TR2);
- `step-exhausted`: more than 1000000000 `wh` condition evaluations in one call frame (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is made at each function entry.

TR3. **Loop counter per call. This is a change from RFC 0054, voted on its own.** Each call frame has its own loop counter, starting at 0 when the frame starts. Each evaluation of a `wh` condition in that frame's own body adds 1 to that frame's counter. Before an addition would make it exceed 1000000000, the run traps `step-exhausted`. Loops in a callee are counted in the callee's frame. A frame's counter is not read or changed by any other frame. Calls are not counted here; TR2 bounds their depth.

TR4. **Traps are not in signatures. This is a trade-off, voted on its own.** Principle 3 asks for visible failure, but principle 7 requires one defined result for overflow and exhaustion. A trap marker would sit on nearly every function, and no RFC yet gives its propagation rules (Open question 2).

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` the repo-relative path. An example is `<file>::<name>#<n>`, `<n>` counting from 1 in source order.

### Diagnostics

Each code must be listed in `spec/errors.json` by the first PR that emits it (P1).

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch, text literal (E12), value of a call with no result, arity, `main` signature | Operator, argument, callee, `main`, bare `ret`, literal, or else the expression |
| E0201 | types | A function with a result clause can reach its closing brace | The closing `}` |
| E0202 | types | An example evaluates to `false`, or traps (EX3) | The example |
| E0300 | name | Duplicate declaration (B4, M1, F6), reserved name | The new name |
| E0301 | name | Unknown name, including `print`; use before declaration; function, `put` or type name as a value | The name |
| E0302 | name | No `main` | The end-of-file token |
| E0303 | name | Assignment to a `let` or a parameter | The target name |
| E0400 | effects | Call to an `io` function or `put` without `io`, or from an example | The callee name |

## Alternatives

- **Keep `Text` and `put(Text)` in the kernel.** Rejected (T3). They belong to the standard library.
- **Retire `kernel/print-one` (RFC 0054 P1).** Rejected. Existing conformance tests are never edited or deleted (C2). A skip list in the runner is also rejected: it hides a failing test.
- **Examples under `check` only.** Rejected (EX3).
- **One run-wide loop counter (RFC 0054 TR3).** Rejected: state shared across calls (principle 2).
- **No loop limit.** Rejected: a `wh` that never ends has no defined result (principle 7).
- **Traps in signatures.** Not chosen for this milestone (TR4).

## Cost

Hand counts under `tools/check/tokens.py` rules (the protected counter was not run; the merge bot's count governs). Hand counts: `print(1)` 5 becomes `put(1)` 4, `while i < 5 {` 6 becomes `wh i < 5 {` 5, `return x * x` 5 becomes `ret x * x` 4, `example double(3) == 6` 10 becomes `ex double(3) == 6` 9, and `let x: Int = 1` 6 becomes `let x = 1` 4. A statement boundary costs 1 (`;`).

Removed: the `Text` type and the text form of `put`. The `TEXT` token stays. The TR3 change is wording only. Core spec and card figures are not measured here; the merge bot checks the caps (12,000 and 2,000 tokens). Spec card: remove the text lines and say in the traps line that the loop counter is per call.

## Test plan

Tests live in `conformance/kernel/`, one per file, with `id`, `rfc` and `kind` in `--- meta`. Compile-error tests use the runner's `CODE LINE` form.

Preconditions, which the implementing PR must satisfy before it merges:

- **P0. RFC 0048.** Accepted, with one status in front matter and body. Not met today (C1). Its author must revise it, and the group must vote it accepted under `governance/RULES.md`. This RFC does not edit it.
- **P1. Codes.** `spec/errors.json` gains E0003 (from RFC 0048) and E0200 to E0202, E0300 to E0303 and E0400, in the first PR that emits each.
- **P2. Card.** `spec/card.md` gains a kernel section with the forms and the trap lines of TR1, and no text line.

Changes to conformance tests:

- **Added:** `conformance/kernel/put-one.test`, kind `run`, `rfc` as the publisher assigns it. Source: `fn main() io { put(1) }`. Expected stdout `1`, exit 0.
- **Not changed:** `conformance/kernel/print-one.test` (C2). It stays red after this RFC. Its source is `fn main() io { print(1) }`, and `print` gives E0301. The implementing PR reports this in its body as a failure outside its change.
- **RFC 0048's tests.** RFC 0048's test plan lists `v4-comment` as `put("a//b")` and `v4-grammar-text` as `put(t)` over a text literal. Both print text, so under this RFC both give E0200. Their author must rewrite them in RFC 0048: `v4-comment` becomes `fn main() io { // put(9)` LF `put(2) }` with stdout `2`, and `v4-grammar-text` becomes `fn main() io { let t = 1; put(t) }` with stdout `1`. The `//`-in-text case moves to `err-text-slash` below. Neither file exists under `conformance/lex/` yet, so no existing test is edited.

Run tests (kind `run`; each is a complete program; `put` as defined in Design rule P1):

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
| `eval-order-ge` | `fn a(): Int io { put(1); ret 1 }`, `fn b(): Int io { put(2); ret 2 }`, `fn main() io { if b() >= a() { put(3) } }` | `2`, `1`, `3` |
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
| `example-call-ok` | `fn fact(n: Int): Int { if n <= 1 { ret 1 }; ret n * fact(n - 1) } ex fact(5) == 120`, `fn main() io { put(fact(5)) }` | `120` |
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
| `trap-step` | `fn main() io { put(1); wh true { } }` | 1 | `trap: step-exhausted` |

Compile-error tests (kind `compile-error`; `glyphc check` exits 1 and `expect-errors` lists `CODE LINE` per error. Every program is one line, except `err-main`, whose line is that of the end-of-file token):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-text-lit` | `fn main() io { let t = "a" }` | the `"a"` | E0200 |
| `err-text-slash` | `fn main() io { let t = "a//b" }` | the `"a//b"` | E0200 |
| `err-text-put` | `fn main() io { put("a") }` | the `"a"` | E0200 |
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

Each program was checked by hand against the rules above and yields only the error listed.

Syntax errors are RFC 0048's `v4-err-*` tests, not repeated here.

## Open questions

1. **P0 (blocking).** RFC 0048 must be revised to one status and voted under `governance/RULES.md` (C1).
2. **TR4 (vote).** A reject means a later RFC adds a failure marker to signatures.
3. **TR3 (vote on its own).** If the group rejects per-call counting, it must still pick a loop bound, because principle 7 forbids a `wh` with no defined result.
4. **RFC 0050.** If accepted, its JSON trap line and exit status 3 change TR1 and every trap test.
5. **`?` is internal (E11).** No program can name it. The group should confirm this.
6. **Run time.** The 1000000000-step limit makes `trap-step` and `err-example-budget` slow. Not measured.
7. **Text output.** Users cannot print text until the standard library RFC is written (user-1, user-2).
8. **Leading zero.** `007` is E0006 here, as in RFC 0048; RFC 0004 expects E0001 (RFC 0048, open question 7).
