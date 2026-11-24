---
status: draft
alters_tests: true
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v16
Status: draft
Replaces: RFC 0056 (kernel-v15, rejected). Keeps every rule of RFC 0056 except those under Changes.
Depends on: `lexical-syntax-v4` (RFC 0048), which must be accepted first (P0); RFC 0011 (`.gl`); RFC 0004 (records).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (64-bit signed), `Bool`, and `Text`, where a `Text` value exists only as a text literal given to `put`. It has `let` and `var` bindings with no annotation, functions with optional `: R` and `io`, `if`, `wh`, `ret`, and file-level `ex` examples. The builtin `put` prints an `Int` or a `Text`. Every run ends by a return from `main` or by one of four traps, each with exit status 1. This RFC cannot be accepted until RFC 0048 is accepted (C1).

## Motivation

- RFC 0055 was rejected because the kernel could not print text. This draft restores text output in the smallest form that does it.
- RFC 0056 was rejected. Its `Text` rules added tokens with no removal, it had a `Text` binding type and a second `put` form, P0 was unmet, and four cases had no test.

## Changes from RFC 0056

- **C1. Precondition P0 is not met.** RFC 0048's front matter says `accepted`, its body says `Status: draft`, and its votes are 4 approve and 2 reject, below `accept_ratio` 0.6667 (`governance/RULES.md`). This RFC cannot be accepted until RFC 0048 is fixed and voted accepted. This draft does not edit RFC 0048.
- **C2. `Text` is literal-only.** A `Text` value cannot be bound, assigned, passed, returned, compared or operated on (T3).
- **C3. One `put`** with the signature `put(x) io`. The output form follows the argument's type (P1, P2).
- **C4. Removals** are listed under Cost.
- **C5. Tests added:** an `if` whose blocks both return (F3), a `wh` not counting toward F3, `fn main(): Int io`, and the `Int` literal bounds.
- **C6. `kernel/print-one` is altered, not edited** (Test plan). RULES item 4 applies.
- **C7. Resubmission** (Open question 2).

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens, the grammar and the lexical and syntax errors are those of `lexical-syntax-v4`. This RFC adds no token, keyword or production. `Int`, `Bool`, `Text`, `put` and `main` are `IDENT` tokens.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical-syntax-v4, rule 8), including after unary `-`. The minimum is written `-9223372036854775807 - 1`.

T2. `Bool` is `true` or `false`.

T3. A text literal has type `Text`. Its value is the decoded bytes (lexical-syntax-v4, rule 9). It is valid only as the whole argument of `put`, where grouping parentheses are allowed. Elsewhere it is E0200 at the literal, and its type is `?` (E11). `Text` is not a parameter, result or binding type, and no operator takes it.

T4. No implicit conversion exists between types. There is no unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call, and the value has type `?`.

T6. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first. Binary operators are left-associative, except the comparisons, which do not chain (lexical-syntax-v4, G6). Unary operators bind tighter than binary ones.

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

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200.

E5. `and` and `or` take `Bool` operands and short-circuit: the right operand is not evaluated when the left decides the result. `not` takes `Bool`. Otherwise E0200.

E6. Unary `-` takes `Int`.

E7. The condition of `if` and `wh` is `Bool`. Otherwise E0200.

E8. A call's argument count and types must match its parameters. Otherwise E0200.

E9. Overflow and division by zero are run-time traps (TR1), not compile errors.

E10. Evaluation is left to right: the left operand before the right, call arguments in order, then the call. `and` and `or` skip the right operand when the left decides. A trap in an earlier operand happens first.

E11. **Recovery.** A failed expression takes the type its operator declares: comparisons, `and`, `or` and `not` give `Bool`, and arithmetic gives `Int`. A failed call takes its callee's result type, or `?` if the callee has none. A failed name, a text literal outside `put` (T3) and a call with no result used as a value have type `?`. `?` is accepted without a further diagnostic everywhere, and no program can name it. So each test program yields exactly the errors it lists.

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

F5. Recursion is allowed. Termination is not checked. Every run ends by a return from `main`, or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named `put`, `Int`, `Bool` or `Text` is E0300 at its name. Declaration order does not matter. A function name, or `put`, used as a value is E0301 at the name.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result, and it may have `io`. Missing is E0302 at the end-of-file token. A second is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put` is built in, with the signature `put(x) io`. Its argument must be `Int` or `Text`. The output form follows the argument's type. Any other type, including `Bool`, is E0200 at the argument. Any count other than one is E0200 at `put`. A program declaring its own `put` gets E0300 at the name.

P2. `put` writes its value and then one LF. An `Int` is written in decimal, with a leading `-` if negative and no leading zeros. A `Text` is written as its bytes with escapes already applied, and no quotes.

P3. Output goes to standard output through WASI `fd_write`. Each `put` finishes before the next statement runs.

### Conditionals and loops

C1. `if cond block [ else block ]`. The `else` part is a block only (lexical-syntax-v4, G7).

C2. `wh cond block`. There is no `break` or `continue`. Early exit uses `ret`.

### Examples

EX1. `ex EXPR` follows a function's closing `}` or another example of that function (lexical-syntax-v4, G5). It belongs to that function.

EX2. `EXPR` must be `Bool`, otherwise E0200 at the expression. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. **Examples run in every compiling command.** `glyphc check`, `build` and `run` each run every example when the program has no other compile error. Each example runs as its own run: its expression is at depth 0 and starts with new loop counters (TR2, TR3). `true` passes. `false`, or any trap, fails with E0202 at the example's span (`ex` to the last token of its expression). A failing example makes `build` and `run` exit 1 without writing a module or running `main` (principle 5).

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`. This is the form `spec/card.md` gives. Traps carry no code. Output written before the trap stays written. The kinds are:

- `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
- `divide-by-zero`: `/` or `%` with a zero divisor (E2);
- `stack-exhausted`: call depth would exceed 10000 (TR2);
- `step-exhausted`: more than 1000000000 `wh` condition evaluations in one call frame (TR3).

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is made at each function entry.

TR3. **Loop counter per call. Voted on its own, a change from RFC 0054.** Each call frame has its own loop counter, starting at 0 when the frame starts. Each evaluation of a `wh` condition in that frame's own body adds 1 to that frame's counter. Before an addition would make it exceed 1000000000, the run traps `step-exhausted`. Loops in a callee are counted in the callee's frame. Calls are not counted here; TR2 bounds their depth.

TR4. **Traps are not in signatures. Voted on its own.** A trap marker would sit on nearly every function, and no RFC gives its propagation rules (Open question 3).

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` the repo-relative path. An example is `<file>::<name>#<n>`, `<n>` counting from 1 in source order.

### Diagnostics

Each code must be listed in `spec/errors.json` by the first PR that emits it (P1). None is listed today, so each is new.

| Code | Block | Meaning | Span |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch; text literal outside `put` (T3); call with no result used as a value; arity; `main` signature | Operator, argument, callee, `main`, bare `ret`, literal, or else the expression |
| E0201 | types | A function with a result clause can reach its closing brace | The closing `}` |
| E0202 | types | An example evaluates to `false`, or traps (EX3) | The example |
| E0300 | name | Duplicate declaration (B4, M1, F6), reserved name | The new name |
| E0301 | name | Unknown name; use before declaration; function or type name as a value | The name |
| E0302 | name | No `main` | The end-of-file token |
| E0303 | name | Assignment to a `let` or a parameter | The target name |
| E0400 | effects | Call to an `io` function or `put` without `io`, or from an example | The callee name |

## Alternatives

- **Text bindings, parameters and results (RFC 0056).** Rejected: three more rules for a claim the title does not need. The standard library RFC can add text values (Open question 4).
- **Two `put` forms.** Rejected (C3, principle 1).
- **Keep `print` as an alias, or skip `print-one` in the runner.** Rejected. Principle 1, and tests are never edited or deleted.
- **Examples under `check` only; one run-wide loop counter; no loop limit; traps in signatures.** Rejected or not chosen for the reasons in EX3, TR3, principle 7 and TR4.

## Cost

Hand estimates under `tools/check/tokens.py` rules (an alphabetic run of n letters costs ceil(n/4)). The protected counter was not run; the merge bot's count governs the 12,000-token cap.

Baseline: RFC 0055 (kernel-v14), the text voters last saw.

- **Added:** T3's text rule, P1's `Text` argument, and P2's text sentence. About 90 tokens.
- **Removed:** T6 (restates `ptype` and `rtype`, which give E0100 already); L1's code list; F7 (G5 of lexical-syntax-v4); E6's second sentence (the grammar rejects `+`); the examples in E4 and E9; the P1 sentence on `print` (an undeclared name is E0301 already); and the P1 sentence on the kernel-v9 `Text` form. About 150 tokens.

Net: about 60 tokens fewer than RFC 0055, so the `Text` rules are paid for in the same spec text. Spec card: one line for the value types and the text literal rule, one for `put`, the TR1 trap lines, and a note that the loop counter is per call. Card removals: none.

## Test plan

Tests live in `conformance/kernel/`, one per file, with `id`, `rfc` and `kind` in `--- meta`. Compile-error tests use the runner's `CODE LINE` form. Each program is one line, except where a row says otherwise.

Preconditions, which the implementing PR must satisfy before it merges:

- **P0. RFC 0048.** Accepted, with one status in front matter and body. Not met today (C1). Its author must revise it, and the group must vote it accepted under `governance/RULES.md`. This RFC does not edit it.
- **P1. Codes.** `spec/errors.json` gains E0003 (from RFC 0048), E0200 to E0202, E0300 to E0303 and E0400, in the first PR that emits each.
- **P2. Card.** `spec/card.md` gains a kernel section with the forms, the text literal rule and the trap lines of TR1.

Changes to conformance tests (`alters_tests: true`, so RULES item 4 applies and the vote needs `supermajority_ratio`):

- **Added:** `conformance/kernel/put-one.test`, kind `run`, `rfc` as the publisher assigns it. Source `fn main() io { put(1) }`. Expected stdout `1`, exit 0.
- **Altered, not edited:** `conformance/kernel/print-one.test` (C6). Its source is `fn main() io { print(1) }`, and it passes today because `compiler/stage0/src/codegen.ts:22` accepts `print`. After this RFC `print` is E0301, so the test fails. The implementing PR reports the red test in its body. Only an owner commit that removes the file retires it, recorded as a `rules_changed` event.
- **RFC 0048's tests.** `v4-comment` (`put("a//b")`) and `v4-grammar-text` (`let t = "x"; put(t)`) are rewritten by RFC 0048's author. That is outside this RFC. Under this RFC the first is valid as written and the second is E0200.

Run tests (kind `run`; each is a complete program; `put` as in P1):

| Test | Program | Expected stdout |
| --- | --- | --- |
| `put-one` | `fn main() io { put(1) }` | `1` |
| `put-text` | `fn main() io { put("a\n\"b\"\\") }` | `a`, then `"b"\` |
| `text-slash` | `fn main() io { put("a//b") }` | `a//b` |
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
| `fn-void` | `fn f() { }`, `fn main() io { f() }` | no output, status 0 |
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

Compile-error tests (kind `compile-error`; `glyphc check` exits 1 and `expect-errors` lists `CODE LINE` per error. Each row yields only the error listed, checked by hand):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `err-text-lit` | `fn main() io { let t = "a" }` | the `"a"` | E0200 |
| `err-text-var` | `fn main() io { var t = "a"; put(t) }` | the `"a"` | E0200 |
| `err-text-if` | `fn main() io { if "a" { } }` | the `"a"` | E0200 |
| `err-text-op` | `fn main() io { put(1 + "a") }` | the `"a"` | E0200 |
| `err-text-param` | `fn f(t: Text) io { } fn main() io { }` | the `Text` | E0100 |
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
| `err-wh-return` | `fn f(): Int { wh false { ret 1 } } fn main() io { put(f()) }` | the `}` that closes `f`, after the `wh` block | E0201 |
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
| `err-int-max` | `fn main() io { put(9223372036854775808) }` | the literal | E0500 |
| `err-int-min` | `fn main() io { put(-9223372036854775808) }` | the literal `9223372036854775808`, not the `-` | E0500 |
| `err-unknown` | `fn main() io { put(zz) }` | the `zz` | E0301 |
| `err-print` | `fn main() io { print(1) }` | the `print` | E0301 |
| `err-use-before` | `fn main() io { put(a); let a = 1 }` | the first `a` | E0301 |
| `err-type-value` | `fn main() io { let x = Int }` | the `Int` | E0301 |
| `err-fn-value` | `fn add(a: Int, b: Int): Int { ret a + b } fn main() io { let f = add }` | the `add` | E0301 |
| `err-main` | `fn f() { }` | the end-of-file token, on line 1 | E0302 |
| `err-assign-let` | `fn main() io { let a = 1; a = 2 }` | the `a` of `a = 2` | E0303 |
| `err-assign-param` | `fn f(n: Int) io { n = 2 } fn main() io { f(1) }` | the `n` of `n = 2` | E0303 |
| `err-effect` | `fn f() { put(1) } fn main() io { f() }` | the `put` | E0400 |
| `err-effect-call` | `fn g() io { } fn f() { g() } fn main() io { f() }` | the `g` | E0400 |
| `err-effect-example` | `fn say(): Int io { ret 1 } ex say() == 1 fn main() io { put(say()) }` | the `say` in the example | E0400 |

Syntax errors are RFC 0048's `v4-err-*` tests, not repeated here. Run time: `trap-step` and `err-example-budget` run 1000000000 loop steps each. This is not measured yet.

## Open questions

1. **P0 (blocking).** RFC 0048 must have one status and be voted accepted (C1). This RFC cannot fix that.
2. **Cooldown (blocking for the vote).** RULES item 6 bars resubmitting a rejected RFC in substance for 10 nights. This draft resubmits RFC 0056, and its `Text` rules came from RFC 0049 (kernel-v9), also rejected. This RFC does not claim the cooldown has passed. The orchestrator should check the rejection dates before a vote.
3. **TR3 and TR4 (votes on their own).** If per-call counting is rejected, the group must still pick a loop bound (principle 7). A trap marker in signatures needs a later RFC.
4. **Text values.** A program cannot store or compare text here. The standard library RFC decides that.
5. **`?` is internal (E11).** The group should confirm no program can name it.
6. **RFC 0050.** If accepted, its JSON trap line and exit status 3 change TR1 and every trap test.
7. **Leading zero.** `007` is E0006 here, as in RFC 0048; RFC 0004 expects E0001.
