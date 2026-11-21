---
status: accepted
votes:
  designer-min: approve
  designer-prag: reject
  impl-1: approve
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v8
Status: draft
Replaces: RFC 0019 (kernel-v7, rejected). Builds on RFC 0014 (lexical-syntax-v3, accepted), which owns every token, lexical rule and lexical error code. Depends on RFC 0004 (diagnostic records, code blocks, trap line) and RFC 0011 (`.gl` extension).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound, assigned and printed, and nothing else. There are `let` and `var` bindings, functions with an optional result `: R` and an optional effect keyword `io`, `if`, `while` and `return`, and file-level `example` lines that `check` evaluates. The six comparison tokens are all operators, and they do not chain. Every run ends by a return from `main` or by one of four traps, each with exit status 1. Lexing is RFC 0014's. A token the grammar does not accept is E0100.

## Motivation

RFC 0019 was rejected. Its fixes:

- It made `>`, `>=` and `<=` syntax errors everywhere. That made RFC 0014's run tests `lex/tok-gt`, `lex/tok-ge` and `lex/tok-le` impossible, and this RFC cannot amend an accepted RFC. Here all six comparison tokens are operators with Int operands, so each RFC 0014 test has a valid position and RFC 0014 is unchanged.
- The open gap (`a == b >= c`, `a < b >= c`) is now defined: comparisons do not chain (G6), so the second operator is E0100.
- The Test plan is complete, with run and compile-error tests.
- Revision 2 adds parser rules PO1 to PO5 and NEWLINE and `else` error positions, so the statement parser can be built from this text. It changes no meaning.

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens and lexical rules are RFC 0014's. This RFC adds none. `Int`, `Bool`, `Text`, `print` and `main` are `IDENT` tokens; `"Int"` in the grammar means an `IDENT` with that text. The effect marker is the keyword `io`.

### Grammar

```
program     = { fn_decl } EOF
fn_decl     = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] block NEWLINE { example NEWLINE }
param       = IDENT ":" ptype
example     = "example" expr
block       = "{" [ NEWLINE ] { stmt NEWLINE } [ stmt ] "}"
stmt        = let_stmt | var_stmt | assign | call | if_stmt | while_stmt | return_stmt
let_stmt    = "let" IDENT [ ":" type ] "=" expr
var_stmt    = "var" IDENT [ ":" type ] "=" expr
assign      = IDENT "=" expr
call        = IDENT "(" [ args ] ")"
if_stmt     = "if" expr block [ "else" block ]
while_stmt  = "while" expr block
return_stmt = "return" [ expr ]
args        = expr { "," expr }
expr        = or_expr
or_expr     = and_expr { "or" and_expr }
and_expr    = cmp_expr { "and" cmp_expr }
cmp_expr    = add_expr [ cmp_op add_expr ]
cmp_op      = "==" | "!=" | "<" | "<=" | ">" | ">="
add_expr    = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr    = unary { ( "*" | "/" | "%" ) unary }
unary       = ( "-" | "not" ) unary | primary
primary     = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
type        = "Int" | "Bool" | "Text"
ptype       = "Int" | "Bool"
rtype       = "Int" | "Bool"
```

A NEWLINE inside `( )` is never emitted (RFC 0014 rule 14). Nothing else spans lines. Each block line ends in NEWLINE, except that the last statement may be followed by `}`.

PO1. The parser stops at the first syntax error and reports it. On failure it returns no tree.
PO2. Each tree node has a kind, the grammar nonterminal it comes from (for example `let_stmt` or `cmp_expr`), and a span: the byte offsets of its first and last token. Children are in source order.
PO3. A statement that starts with `IDENT "="` is an `assign`. Otherwise an expression statement is a `call` only if it is exactly `IDENT "(" [ args ] ")"`. Any other expression statement is G4.
PO4. After a statement, the next token must be NEWLINE or `}`. Any other token is E0100 at that token. For `print(1) print(2)` that token is the second `print`, as G7 says.
PO5. `return` takes an expression unless the next token is NEWLINE or `}`. `let_stmt` and `var_stmt` accept `type` as the grammar gives it; any other name there is E0100 (T7).

G1. After `fn`, as a parameter name, or after `let` or `var`, a keyword is E0003 (RFC 0014 rule 7). Any other token the grammar rejects is E0100.
G2. A NEWLINE between `)` and `{`, between `if` or `while` and its block, or inside such a header outside `( )`, is E0100. So is a line end after a binary operator outside `( )`.
G3. `else` follows the `}` of its `if` on the same line. A NEWLINE before `else`, or `else if`, is E0100.
G4. An expression statement other than `let`, `var`, assignment, call, `if`, `while` or `return` is E0100 at its first token.
G5. `fn` is allowed only at top level; a `fn` in a block is E0100 at `fn`. `example` is allowed only directly after a function's closing brace or after another example of that function. Elsewhere it is E0100 at `example`.
G6. Comparisons do not chain. After one `cmp_expr`, a second comparison operator is E0100 at that operator. So `a < b < c`, `a == b >= c` and `a < b >= c` are each E0100 at the second operator.
G7. A second statement on one line in a block is E0100 at its first token.

Positions. A NEWLINE error is at that NEWLINE token, whose span is the line break. G3 is at `else`, or at the `if` after `else`. Every other error in this section is at the token named in its rule.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above `9223372036854775807` is E0500, including after unary `-`. The minimum is written `-9223372036854775807 - 1`.
T2. `Bool` is `true` or `false`.
T3. `Text` is an immutable sequence of UTF-8 bytes. It may appear only as the initialiser of `let` or `var`, the right side of an assignment to a `Text` `var`, or the argument of `print`. Elsewhere it is E0200.
T4. No implicit conversion exists between types. There is no unit type (T5): a call to a function with no result, used as a value, is E0200.
T6. Parameter and result types are `Int` or `Bool`. A `Text` there is E0100 at the token.
T7. `Int`, `Bool` and `Text` used as values are E0301. Any other name in a type position is E0100.

### Expressions

Precedence, loosest first. Binary operators are left-associative, except the comparisons, which do not chain (G6). Unary operators bind tightest of the operators, as `unary` says: `-a * b` is `(-a) * b`, and `not a == b` is `(not a) == b`.

1. `or`
2. `and`
3. `==` `!=` `<` `<=` `>` `>=`
4. `+` `-`
5. `*` `/` `%`
6. unary `-`, `not`
7. call, literal, name, `( expr )`

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.
E2. `/` and `%` truncate toward zero. `%` takes the sign of the dividend (`-7 % 3` is `-1`). A zero divisor traps `divide-by-zero`. `MIN / -1` traps `overflow`; `MIN % -1` is `0`.
E3. `==` and `!=` take two `Int` or two `Bool` operands. Otherwise E0200. `Text` has no equality.
E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200, so `true < false` is E0200. Each operator means what it says. None is rewritten, so the operands run in the order written.
E5. `and` and `or` take `Bool` and short-circuit. `not` takes `Bool`. Otherwise E0200.
E6. Unary `-` takes `Int`. `+` is not unary, so the grammar rejects it (E0100).
E7. The condition of `if` and `while` is `Bool`. Otherwise E0200.
E8. A call's argument count and types must match its parameters. Otherwise E0200.
E9. Overflow and division by zero are run-time traps. The checker evaluates expressions only in examples (EX3), so `print(1 / 0)` compiles and traps when run.
E10. Evaluation is left to right. The left operand of a binary operator is evaluated before the right, and the operator is applied after both. Call arguments are evaluated left to right, then the call is made. `and` and `or` skip the right operand when the left decides. A trap in an earlier operand happens before a later operand is evaluated.

### Bindings

B1. `let NAME [: T] = expr` is immutable; `var` is mutable. With `: T`, `expr` must have type `T`; otherwise the binding has the type of `expr`. Mismatch is E0200.
B2. Assignment `NAME = expr` needs a `var`. Assigning to a `let` or a parameter is E0303. An unknown name is E0301. A type mismatch is E0200.
B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301.
B4. Parameters are in scope in the body. Declaring a name already declared in the same block, including a parameter, is E0300.
B5. An inner block may declare a name an outer block declares. A binding or parameter may not take the name of a function in the file, or `print`, `Int`, `Bool` or `Text`. Otherwise E0300.

### Functions and effects

F1. `fn NAME(p1: T1, ...) [: R] [io] block`. `: R` comes before `io`. Both are optional. `fn f() io { }` is valid and has no result.
F2. A function without `io` may not call an `io` function or `print`. Either is E0400. An example may call neither (EX2).
F3. A function with a result clause must return on every path. A block returns if one of its statements is `return`, or if it is an `if` with an `else` whose two blocks both return. A `while` never counts. Otherwise E0201 at the closing brace.
F4. `return expr` needs a result clause and a matching type. A bare `return` is allowed only without a result clause. Otherwise E0200.
F5. Recursion is allowed. Termination is not checked. Every run ends by TR2, TR3, or a return from `main`.
F6. Function names are unique in the file (E0300). A function named `print`, `Int`, `Bool` or `Text` is E0300. Declaration order does not matter. A function name, or `print`, used as a value is E0301.
F7. Parameters are `Int` or `Bool` (T6). Functions cannot be nested (G5).

### Entry point and print

M1. A program has exactly one `main` with no parameters and no result, and it may have `io`. Missing is E0302. A second is E0300. A `main` with a parameter or result is E0200.
P1. `print` is built in with two forms, `print(x: Int) io` and `print(x: Text) io`. The compiler picks the form from the argument's type. Any other argument type, including `Bool`, or any count other than one, is E0200. A program declaring its own `print` gets E0300.
P2. `print` writes its value and then one LF. An `Int` is written in decimal, with a leading `-` if negative and no leading zeros. A `Text` is written as its UTF-8 bytes, with escapes already applied and no quotes.
P3. Output goes to standard output through WASI `fd_write`. Each `print` finishes before the next statement runs.

### Conditionals and loops

C1. `if cond block [else block]`. The `else` part is a block only (G3).
C2. `if` and `while` are statements. Where an expression is expected they are E0100 at that token.
C3. `while cond block`. There is no `break` or `continue`; early exit uses `return`.

### Examples

EX1. `example EXPR` follows a function's closing brace or another example of that function (G5), and belongs to that function.
EX2. `EXPR` must be `Bool`, otherwise E0200. It may call only functions without `io`. Calling an `io` function or `print` is E0400.
EX3. `glyphc check` runs each example as its own run under the TR2 and TR3 limits. The call depth and the loop counter start at 0. `true` passes. `false`, or any trap, fails with E0202 at the example's span, and the message names the outcome. `glyphc run` does not evaluate examples.

### Traps

TR1. A trap writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no code. Output written before the trap stays written. The kinds are:
   - `overflow`: `Int` arithmetic does not fit in 64 bits (E1, E2);
   - `divide-by-zero`: `/` or `%` with a zero divisor (E2);
   - `stack-exhausted`: call depth would exceed 10000 (TR2);
   - `step-exhausted`: more than 1000000000 `while` condition evaluations in one run (TR3).
TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`. The check is inserted at each function entry.
TR3. A run has one loop counter, starting at 0 when `main` or an example starts. Each evaluation of a `while` condition adds 1, true or false. Before an addition would make it exceed 1000000000, the run traps `step-exhausted`. The counter is not reset when a loop or function ends. Calls are not counted here, because TR2 bounds them.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path given on the command line. An example is `<file>::<name>#<n>`, where `<n>` counts from 1 in source order among that function's examples.

### Diagnostics

Records follow RFC 0004 section 2. The codes E0001, E0003, E0005, E0006, E0100 and E0500 come from RFC 0014. This RFC uses:

| Code | Block | Meaning |
| --- | --- | --- |
| E0200 | types | Type mismatch in an operand, condition, binding, assignment, return, argument, example or `print` argument; `Text` outside T3; a value from a call with no result; `main` with a parameter or result |
| E0201 | types | A function with a result clause can reach its closing brace without returning |
| E0202 | types | An example evaluates to `false`, or traps |
| E0300 | name | Duplicate declaration in one scope; a second `main`; a reserved name |
| E0301 | name | Unknown name; use before declaration; a function, `print` or type name used as a value |
| E0302 | name | No `main` |
| E0303 | name | Assignment to a `let` binding or a parameter |
| E0400 | effects | A call to an `io` function or `print` from a function without `io`, or from an example |

Codes E0200 to E0202, E0300 to E0303 and E0400 were also used by rejected RFCs 0013 to 0019 with the same or close meanings. None is in `spec/errors.json`, which is absent from this checkout, so none is retired.

## Alternatives

- **`>`, `>=`, `<=` as errors with fixes (RFC 0019).** Rejected. It makes RFC 0014's three run tests impossible.
- **Only `<`, with swapped or negated forms (RFC 0017, RFC 0018).** Rejected. It has the same conflict, and swapped operands run calls out of order (E10).
- **Chained comparisons.** Rejected. A chain needs its own meaning table; non-chaining is one rule.
- **Traps in signatures (principle 3).** Rejected for now; see open question 1.
- **Unit type, `!io`, `io` before `: R`, unspecified operand order, `Text` parameters.** Rejected as in RFC 0019. `!io` needs `!`, which RFC 0014 removed.

## Cost

Core spec: the grammar, PO1 to PO5, G1 to G7, T1 to T7, E1 to E10, B1 to B5, F1 to F7, M1, P1 to P3, C1 to C3, EX1 to EX3, TR1 to TR3, A1 and the diagnostic table. About 3,000 tokens by estimate. Compared with RFC 0019, this adds `<=`, `>` and `>=` to `cmp_op` (about 40 tokens) and removes the E0100 message table and the `>=` fix (about 150 tokens). PO1 to PO5 and the position rule add about 250 tokens. Net change is about +150 tokens. No keyword or code is added.

Spec card: one line each for the grammar's shape, the value types, the operator table with the non-chaining rule, E10, the four traps with status 1, the `: R io` order and the NEWLINE rule. About 700 tokens, under the 2,000 limit.

Neither figure is measured; `spec/` is absent.

## Test plan

Conformance tests live in `conformance/kernel/`. A run test states stdout, stderr and exit status. A compile-error test holds one program with one error and states the expected record as JSON, comparing `code`, `span` and `fix` (RFC 0004 section 7). Unless a program defines its own `main`, its statements go inside `fn main() io { }`. RFC 0014's `lex/*` tests, including `lex/tok-gt`, `lex/tok-ge` and `lex/tok-le`, are unchanged and run as written. Every grammar production appears in a run test. `cmp-ordering` covers `>`, `>=` and `<=`, `cmp-eq` covers `==` and `!=`, and `let-bool` covers `<`.

Run tests:

| Test | Program | Expected |
| --- | --- | --- |
| `print-int` | `print(0)`, `print(-7)`, `print(9223372036854775807)` | `0`, `-7`, `9223372036854775807` |
| `print-text` | `print("a\n\"b\"\\")` | the decoded text, LF |
| `let-var` | `let a = 1`, `var b: Int = 2`, `b = b + a`, `print(b)` | `3` |
| `let-bool` | `let b: Bool = 1 < 2`, `if b { print(1) }` | `1` |
| `bool-ops` | `if 1 < 2 and not false { print(1) } else { print(2) }` | `1` |
| `bool-or` | `if false or 1 < 2 { print(1) }` | `1` |
| `cmp-ordering` | `if 2 > 1 { print(1) }`, `if 2 >= 2 { print(2) }`, `if 1 <= 2 { print(3) }`, `if 1 >= 2 { print(9) }` | `1`, `2`, `3` |
| `cmp-eq` | `if 1 != 2 { print(3) }`, `if true == true { print(4) }` | `3`, `4` |
| `arith` | `print(7 / -2)`, `print(-7 % 3)`, `print(2 * 3 + 4 * 5)`, `print(-3 + 1)`, `print((1 + 2) * 3)` | `-3`, `-1`, `26`, `-2`, `9` |
| `eval-order` | `a()` prints 1 and returns 1; `b()` prints 2 and returns 2; `if a() < b() { print(3) }` | `1`, `2`, `3` |
| `eval-order-ge` | the same `a` and `b`; `if b() >= a() { print(3) }` | `2`, `1`, `3` |
| `fn-call` | `fn add(a: Int, b: Int): Int { return a + b }`, `print(add(2, 3))` | `5` |
| `fn-result-io` | `fn sq(x: Int): Int io`, which prints `x` and returns `x * x`; `print(sq(3))` | `3`, `9` |
| `fn-bool-param` | `fn pick(b: Bool): Int` with `if b { return 1 }` then `return 2`; `pick(true)`, `pick(false)` | `1`, `2` |
| `fn-bool-result` | `fn pos(n: Int): Bool { return 0 < n }`; `if pos(3) { print(1) }`, `if pos(0) { print(2) }` | `1` |
| `fn-io` | `fn say(x: Int) io { print(x) }`, `say(4)` | `4` |
| `fn-void` | `fn f() { }`, `f()` | no output, status 0 |
| `return-bare` | `fn stop(n: Int) io {`, then on separate lines `if 0 < n { return }` and `print(n)`, then `}`; `stop(0)`, `stop(5)` | `0` |
| `fn-recursion` | `fn fact(n: Int): Int {`, then on separate lines `if n <= 1 { return 1 }` and `return n * fact(n - 1)`, then `}`; `print(fact(10))` | `3628800` |
| `while-sum` | `var i = 0`, `var s = 0`, `while i < 5 {`, then `i = i + 1` and `s = s + i` on separate lines, then `}`, `print(s)` | `15` |
| `if-else-chain` | `if false { print(1) } else { print(2) }` | `2` |
| `block-layout` | `main` whose block starts with a blank line; `let a = 1`; `if a == 1 { print(a) }` | `1` |
| `paren-nested` | `print(-((4)))` | `-4` |
| `example-ok` | `fn double(x: Int): Int { return x * 2 }`, `example double(3) == 6`, `example not false`, `fn main() io { print(double(4)) }` | `8` |
| `example-call-ok` | `fact` from `fn-recursion`, `example fact(5) == 120`, `print(fact(5))` | `120` |
| `text-bind` | `let u: Text = "x"`, `var t: Text = "a"`, `t = "bc"`, `print(u)`, `print(t)` | `x`, `bc` |
| `step-ok` | `var i = 0`, `while i < 1000 { i = i + 1 }`, `print(1)` | `1`, status 0 |
| `trap-overflow` | `print(4611686018427387904 * 2)` | stderr `trap: overflow`, status 1 |
| `trap-min` | `let m = -9223372036854775807 - 1`, `print(m / -1)` | stderr `trap: overflow`, status 1 |
| `trap-min-mod` | the same `m`, `print(m % -1)` | `0`, status 0 |
| `trap-div` | `print(1 / 0)` | stderr `trap: divide-by-zero`, status 1 |
| `trap-stack` | `fn f(n: Int): Int { return f(n) }`, then `fn main() io { print(f(1)) }` | stderr `trap: stack-exhausted`, status 1 |
| `trap-step` | `print("before")`, then `while true { }` in `main` | stdout `before`, stderr `trap: step-exhausted`, status 1 |

Compile-error tests (record code, span and fix; the rule is in brackets):

| Test | Program, error position | Code |
| --- | --- | --- |
| `err-compare-chain` | `print(1 < 2 < 3)`, at the second `<` [G6] | E0100 |
| `err-compare-chain-ge` | `if 1 == 1 >= 0 { }`, at `>=` [G6] | E0100 |
| `err-expr-stmt` | statement `1 + 2`, at `1` [G4] | E0100 |
| `err-if-expr` | `let x = if true {`, at `if` [C2] | E0100 |
| `err-else-newline` | `else` on the line after `}`, at `else` [G3] | E0100 |
| `err-else-if` | `} else if true {`, at `if` [G3] | E0100 |
| `err-if-brace-line` | `if true` and `{ print(1) }` on the next line, at the NEWLINE [G2] | E0100 |
| `err-stmt-sep` | `print(1) print(2)` in `main`, at the second `print` [G7] | E0100 |
| `err-fn-nested` | `fn f() { }` inside `main`, at `fn` [G5] | E0100 |
| `err-example-place` | `example` before the first function, at `example` [G5] | E0100 |
| `err-text-param` | `fn f(t: Text) io { }`, at `Text` [T6] | E0100 |
| `err-text-result` | `fn f(): Text io { }`, at `Text` [T6] | E0100 |
| `err-unknown-type` | `let u: Unit = 1`, at `Unit` [T7] | E0100 |
| `err-keyword-let` | `let io = 1`, at `io` [G1] | E0003 |
| `err-keyword-fn` | `fn io() { }`, at `io` [G1] | E0003 |
| `err-literal` | `let a = 9223372036854775808` [T1] | E0500 |
| `err-literal-neg` | `let a = -9223372036854775808` [T1] | E0500 |
| `err-type` | `if 1 { }` [E7] | E0200 |
| `err-cmp-type` | `if true < false { }` [E4] | E0200 |
| `err-cmp-ge-bool` | `if true >= false { }` [E4] | E0200 |
| `err-bool-op` | `let a = 1 and true` [E5] | E0200 |
| `err-not` | `let a = not 1` [E5] | E0200 |
| `err-print-bool` | `print(true)` [P1] | E0200 |
| `err-print-arity` | `print(1, 2)` [P1] | E0200 |
| `err-text-op` | `print("a" == "b")` [E3, T3] | E0200 |
| `err-text-arg` | `f("a")` where `fn f(n: Int) io` [T3, E8] | E0200 |
| `err-arity` | `add(1)` for a two-parameter `add` [E8] | E0200 |
| `err-void-value` | `let x = f()`, where `f` has no result [T5] | E0200 |
| `err-return-value` | `return 1` in a function with no result [F4] | E0200 |
| `err-return-bare` | bare `return` in a function with a result [F4] | E0200 |
| `err-let-type` | `let a: Bool = 1` [B1] | E0200 |
| `err-assign-type` | `var a = 1`, then `a = true` [B2] | E0200 |
| `err-example-type` | `example 1` [EX2] | E0200 |
| `err-main-sig` | `fn main(n: Int) io { }` [M1] | E0200 |
| `err-missing-return` | a `: Int` function whose only `return` is inside an `if` without `else`, at its closing brace [F3] | E0201 |
| `err-example` | `example 1 == 2` [EX3] | E0202 |
| `err-example-trap` | `example 1 / 0 == 0` [EX3] | E0202 |
| `err-example-budget` | `fn spin(): Int {`, then `while true { }` and `return 0` on separate lines, then `}`, then `example spin() == 0`; runs to `step-exhausted` [EX3] | E0202 |
| `err-example-stack` | `fn f(n: Int): Bool { return f(n) }`, then `example f(1)`, then `fn main() io { }` [EX3] | E0202 |
| `err-dup` | two functions named `add` [F6] | E0300 |
| `err-dup-main` | two functions named `main` [M1] | E0300 |
| `err-dup-param` | `fn f(a: Int): Int {`, then `let a = 1` and `return a` on separate lines, then `}` [B4] | E0300 |
| `err-reserved` | `let print = 1` in `main` [B5] | E0300 |
| `err-fn-print` | `fn print(): Int { return 1 }`, at `print` [F6] | E0300 |
| `err-unknown` | `print(zz)` [B3] | E0301 |
| `err-use-before` | `print(a)`, then `let a = 1` on the next line [B3] | E0301 |
| `err-type-value` | `print(Int)` [T7] | E0301 |
| `err-fn-value` | `let f = add`, where `add` is a function [F6] | E0301 |
| `err-main` | a file with no `main` [M1] | E0302 |
| `err-assign-let` | assignment to a `let` binding [B2] | E0303 |
| `err-assign-param` | assignment to a parameter [B2] | E0303 |
| `err-effect` | a function without `io` calls `print` [F2] | E0400 |
| `err-effect-call` | a function without `io` calls an `io` function [F2] | E0400 |
| `err-effect-example` | `fn say(): Int io { return 1 }`, `example say() == 1` [EX2] | E0400 |

## Open questions

1. **Traps and principle 3.** Traps are not in signatures. The group should confirm this as an exception to principle 3. A trap marker would be a new RFC, and it would change every arithmetic function.
2. **Record format.** RFC 0004 section 7 compares `code`, `span` and `fix`. `CONTRACTS.md` and `tools/check/conformance.py` compare `(code, line)`. This draft follows RFC 0004. Until the runner changes, compile-error tests are checked for code and line only.
3. **Leading zero.** RFC 0014 rule 8 gives `007` E0006. RFC 0004's `diag/fix-present.test` expects E0001. This draft does not use `007`. The conflict belongs to RFC 0014 or RFC 0004.
4. **Loop limit.** TR3's 1000000000 steps may make `err-example-budget` slow in `check`. Reviewers may want a smaller value, which needs its own decision.
5. **Slow finite programs.** A naive `fib(60)` makes far more calls than loop steps. It still ends, so it has a defined result. Only a total call-and-loop limit would cut it short, at a cost per call. Reviewers should say whether principle 7 needs one.
6. **Precedence of `not`.** The `unary` rule makes `not a == b` read as `(not a) == b`. Changing it changes `unary` and the precedence list.
7. **Limits not checked.** The token caps could not be checked, since `spec/` is absent. No build or conformance run was done here.
8. **Text scope.** `Text` has no operations in the kernel. The standard library RFC must add them before text-processing programs can be written.
