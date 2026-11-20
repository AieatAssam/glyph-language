---
status: draft
votes: {}
---
# RFC draft: Kernel

Class: language
Slug: kernel-v4
Status: draft
Replaces: RFC 0015 (rejected). Builds on RFC 0014 (lexical-syntax-v3, accepted), which owns every token, lexical rule and lexical error code. Also depends on RFC 0004 (diagnostic records, code blocks, trap line) and RFC 0011 (the `.gl` source extension).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has three value types: `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound, assigned and printed, and nothing else. `print` writes an `Int` or a `Text` value and a newline. The kernel has `let` and `var` bindings; functions with an optional result type and an optional effect marker, the keyword `io`; `if`, `while` and `return`; and file-level `example` lines that the compiler runs during `check`.

A program has one defined result in every case. Integer overflow, division by zero, call-depth exhaustion and loop-step exhaustion each trap with a defined message and exit status 1. A program that keeps running is therefore always stopped by one of these traps, or by its own `return` from `main`.

The lexical rules are not restated here. Every token, every lexical rule and every lexical error code comes from RFC 0014. This RFC uses those tokens as they are.

## Motivation

Every later RFC (structs, arrays, modules, the standard library) builds on this base, so the base is settled first. It must also stand alone: an implementer who has read this file and RFC 0014 must be able to build it, and nothing else.

RFC 0015 was rejected. Each objection is answered here.

- **Non-termination (designer-min).** RFC 0015 let a program that never finishes have no result (NT1). Principle 7 requires one defined result on exhaustion. This draft adds a loop-step trap, `step-exhausted`, counted at each evaluation of a `while` condition (TR3). The count is the same kind of check that TR2 makes at each call. It costs one comparison per iteration.

  Why this is enough: every program is a finite tree of calls. A function body has no loop except `while`, so an infinite run must either keep calling deeper, which TR2 stops at depth 10000, or evaluate `while` conditions without end, which TR3 stops at 10^9. The two traps together cover every infinite run.
- **Leading zero (designer-prag).** This draft has no leading-zero rule of its own. The rule is RFC 0014 rule 8, which gives `007` the code E0006. RFC 0015 also gave E0006, so the conflict with the accepted RFC 0004 test `diag/fix-present.test`, which expects E0001, sits in RFC 0014 and RFC 0004, not here. Open question 1 records it. This draft does not change RFC 0014 or RFC 0004.
- **Lexing the effect marker (impl-1, tester, user-1, user-2).** RFC 0015 lexed `!io` as one token, and RFC 0014 removes that token. The effect marker is now the keyword `io`, which RFC 0014 defines. The result type is `:` followed by a type, as RFC 0014's Motivation describes. The lexical rules come from RFC 0014 by pointer, so there is one copy of them. The `->` and `!` tokens are gone, and no production here uses them.
- **Full text (impl-1).** The whole draft is given, including the Open questions.
- **Test paths (tester).** Every kernel test is under `conformance/kernel/`. None shares a name with a `conformance/lex/` test from RFC 0014, so no path needs two expectations.

## Design

Normative. "Must" and "is" are binding on implementers.

### Lexical structure

L1. The tokens, token kinds, whitespace, comments, identifiers, keywords, integer and text literals, punctuation, NEWLINE and EOF are exactly as RFC 0014 defines them. Lexical error codes are those RFC 0014 defines. This RFC adds no lexical rule.

L2. The words `Int`, `Bool`, `Text`, `print` and `main` are `IDENT` tokens. They are types or names by the rules below, not keywords.

L3. The effect marker is the keyword `io`. It is not a token of its own, and no `!` or `->` appears in Glyph source under this RFC.

### Grammar

Normative. Terminals are in quotes. `IDENT`, `INT`, `TEXT`, `NEWLINE` and `EOF` are token kinds from RFC 0014 rule 12. A token the grammar does not accept at a point is a syntax error, E0100 (RFC 0014 rule 13).

```
program     = { NEWLINE | fn_decl | example } EOF
fn_decl     = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" type ] [ "io" ] block
param       = IDENT ":" ptype
example     = "example" expr
block       = "{" { NEWLINE | stmt } "}"
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
and_expr    = eq_expr { "and" eq_expr }
eq_expr     = rel_expr [ ( "==" | "!=" ) rel_expr ]
rel_expr    = add_expr [ ( "<" | "<=" | ">" | ">=" ) add_expr ]
add_expr    = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr    = unary { ( "*" | "/" | "%" ) unary }
unary       = ( "-" | "not" ) unary | primary
primary     = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
type        = "Int" | "Bool" | "Text"
ptype       = "Int" | "Bool"
```

Every token in the kernel grammar is used by a production: `( ) { } , : = == != < <= > >= + - * /  %`, the keywords `fn let var if else while return true false and or not example io`, and the token kinds `IDENT`, `INT`, `TEXT`, `NEWLINE`, `EOF`.

The rules that go with the grammar:

G1. **Statements and items end at a line end.** A `stmt` is followed by NEWLINE or by `}`. An `fn_decl` or an `example` is followed by NEWLINE or by EOF. Any other next token is E0100. So two statements on one line need a NEWLINE between them, unless the second is the last one before `}`.

G2. **Grouping.** A line end inside `( )` is not a statement end (RFC 0014 rule 14). A call's arguments and a parenthesised expression may span lines.

G3. **Blocks.** A block's `{` is on the same line as the construct it opens. A NEWLINE between `)`, a result type, `io` and `{`, or between `if` or `while` and their condition and `{`, is E0100.

G4. **`else`.** `else` must follow the `}` of the `if` block on the same line. If a NEWLINE ends that `if` statement, a later `else` is E0100. `else` is followed by a block only; `else if` is E0100. The canonical layout is `} else {`.

G5. **Expression statements.** A statement that is an expression other than a call is E0100.

G6. **Placement.** `fn` is allowed only at the top level, so a function inside a block is E0100. An `example` is allowed only at the top level, directly after a function or after another example (G1 allows blank lines between them). Anywhere else it is E0100.

G7. **Comparisons do not chain.** `a < b < c` and `a == b == c` are E0100, by the grammar. Write `a < b and b < c`, or use parentheses.

G8. **Keywords in name positions.** A keyword where a name is needed, including `io` in `let io = 1`, is E0003 (RFC 0014 rule 7).

### Types

T1. **Int.** A signed 64-bit two's complement integer. An integer literal above `9223372036854775807` is E0500 wherever it appears, including after unary `-`, as RFC 0014 rule 8 says. The minimum `Int` is written `-9223372036854775807 - 1`.

T2. **Bool.** `true` or `false`.

T3. **Text.** An immutable sequence of UTF-8 bytes. A `Text` expression may appear only in these places: the initialiser of a `let` or `var`, the right side of an assignment to a `var` of type `Text`, and the argument of `print`. Any other place, such as an operator, a condition, a function argument, a `return` or a parameter, is E0200. A `Text` value has no operation in the kernel besides being bound, assigned and printed.

T4. **No implicit conversion** exists between any two types.

T5. **Unit.** There is no unit type. A function with no result clause returns nothing. Using a call to such a function as a value is E0200.

T6. **Parameter and result types** are written, and are `Int` or `Bool`. A `Text` parameter or result is E0200.

T7. **Type names.** `Int`, `Bool` and `Text` are types, not values. Using one as a value is E0301. Any other name in a type position, such as `Unit`, is E0301.

### Expressions

Precedence, loosest to tightest. Binary operators are left-associative, except for the comparisons, which do not chain (G7).

1. `or`
2. `and`
3. `==` `!=`
4. `<` `<=` `>` `>=`
5. `+` `-`
6. `*` `/` `%`
7. unary `-` and `not`
8. call, literal, name, parenthesised expression

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits. Otherwise they trap with `overflow`. Unary `-` on the minimum `Int` traps with `overflow`.

E2. `/` and `%` on `Int` truncate toward zero. The sign of `%` follows the dividend, so `-7 % 3` is `-1`. A zero divisor traps with `divide-by-zero`. `MIN / -1` traps with `overflow`. `MIN % -1` is `0`.

E3. `==` and `!=` take two `Int` operands, or two `Bool` operands. Otherwise the operands are E0200. `Text` has no equality.

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200.

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes a `Bool`. A non-`Bool` operand is E0200.

E6. Unary `-` takes an `Int`. Otherwise E0200. `+` is not a unary operator.

E7. The condition of `if` and `while` is `Bool`. Otherwise E0200.

E8. A call's argument count and argument types must match the parameters. A mismatch is E0200.

### Bindings

B1. `let NAME = expr` and `let NAME: T = expr` introduce an immutable binding. `var NAME = expr` and `var NAME: T = expr` introduce a mutable one. If `: T` is written, `expr` must have type `T`. Otherwise the binding has the type of `expr`. A mismatch is E0200.

B2. `NAME = expr` assigns to a `var`. Assigning to a `let` binding or to a parameter is E0303. Assigning to an unknown name is E0301. A type mismatch is E0200.

B3. A binding is visible from its declaration to the end of its enclosing block. A use before the declaration is E0301.

B4. The parameters of a function are in the scope of its body block. Declaring a name that is already declared in the same block, including a parameter, is E0300.

B5. An inner block may declare a name that an outer block declares. A `let`, `var` or parameter may not take the name of a function in the file, or the names `print`, `Int`, `Bool` or `Text`. Doing so is E0300.

### Functions and effects

F1. Form:

```
fn name(p1: T1, p2: T2): R io {
    return expr
}
```

The result clause `: R` and the effect keyword `io` are each optional. When both appear, `: R` comes first and `io` follows it. When there is no result clause, `io` follows the `)`. There is no other order. `fn f() io { }` is a valid declaration with no result.

F2. A function without `io` may not call a function with `io`, and may not call `print`. Either is E0400. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns when one of its statements is `return`, or when it is an `if` with an `else` whose two blocks both return. A function with a result clause whose body does not return is E0201 at the closing brace of the body.

F4. `return expr` needs a result clause and an expression of that type. A bare `return` is allowed only in a function with no result clause. Either mismatch is E0200.

F5. Recursion is allowed. Termination is not checked. Termination of every run is ensured by TR2 and TR3.

F6. Function names are unique in the file. A duplicate is E0300. Functions are visible throughout the file, and declaration order does not matter. A function name used without a call is E0100.

F7. Parameters are `Int` or `Bool` (T6). Functions cannot be nested (G6).

### Entry point

M1. A program has exactly one function `main`. It has no parameters and no result clause. It may have `io`. A missing `main` is E0302. A second `main` is E0300. A `main` with a parameter or a result clause is E0200.

### Built-in print

P1. `print` is a built-in function with two forms, `print(x: Int) io` and `print(x: Text) io`. The compiler chooses by the type of the argument. Any other argument, including a `Bool`, is E0200. A call with other than one argument is E0200. A program that declares its own `print` gets E0300 (B5).

P2. `print` writes its value and then one LF:
    - an `Int` is written in decimal, with a leading `-` if it is negative, and with no leading zeros and no plus sign. Zero is written as `0`;
    - a `Text` value is written as its UTF-8 bytes after escapes are applied, without the quotes.

P3. Output goes to standard output through WASI `fd_write`. Each `print` finishes writing before the next statement runs.

### Conditionals and loops

C1. `if cond block` and `if cond block else block`. The `else` part is a block only (G4).

C2. `if` and `while` are statements only. Using either where a value is expected is E0100, because `expr` has no production for them.

C3. `while cond block` repeats while `cond` is true. There is no `break` and no `continue`. Early exit uses `return`.

### Examples

EX1. An example is a line that starts with the keyword `example`, followed by one expression. It must follow the closing brace of a function, or another example that does (G6). It belongs to the function before it. The expression must be `Bool` (EX2).

EX2. An example may call only functions without `io`. A non-`Bool` example is E0200. Calling a function with `io` or `print` in an example is E0400.

EX3. `glyphc check` evaluates each example with the same semantics as at run time, including the call-depth limit (TR2) and the loop-step limit (TR3). One step is one function entry, or one evaluation of a `while` condition. An example that evaluates to `false`, traps, or takes more than 10,000,000 steps fails with E0202 at the example's span.

### Traps

TR1. A trap is a defined outcome, not a diagnostic. When a program traps, the runtime writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no code. Output written by `print` before the trap stays written.

| Kind | Cause |
| --- | --- |
| `overflow` | `Int` arithmetic does not fit in 64 bits (E1, E2) |
| `divide-by-zero` | `/` or `%` with a zero divisor (E2) |
| `stack-exhausted` | call depth exceeds 10000 (TR2) |
| `step-exhausted` | more than 1000000000 evaluations of `while` conditions in one run (TR3) |

TR2. The compiler inserts a depth check at each function entry. The limit is a fixed compile-time constant, 10000 calls deep, so the result does not depend on the host. Exceeding it traps with `stack-exhausted`.

TR3. The run has one loop counter. It starts at 0 when `main` starts. Each evaluation of a `while` condition adds 1 to it. Before the addition would make the counter exceed 1000000000, the program traps with `step-exhausted` instead. The check is one comparison per evaluation. The limit is a fixed compile-time constant, so the result does not depend on the host. Calls are not counted here, because TR2 already bounds them.

The counter is not reset when a loop or function ends. A program that runs a long loop in several parts shares one count.

### Stable addresses

A1. Each declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path as given on the command line, for example `main.gl::add`. Each example is addressed as `<file>::<name>#<n>`, where `<file>` and `<name>` are the function's, and `<n>` counts from 1 in source order among that function's examples.

### Compile-time diagnostics

Each diagnostic is a record in the form of RFC 0004 section 2. The lexical codes (E0001, E0003, E0005, E0006) and the syntax code E0100 are defined by RFC 0014 and are not repeated here. The other codes are below. Each is added to `spec/errors.json` by the first PR that emits it, as RFC 0004 section 4 requires.

| Code | Block | Meaning | Rules |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch: operand, condition, binding, assignment, return, argument, example or `print` argument; `Text` outside T3; `Text` as a parameter or result type; a call to a function with no result used as a value; `main` with a parameter or result | T3, T5, T6, E1 to E8, B1, B2, F4, M1, P1, EX2 |
| E0201 | types | A function with a result clause may reach its closing brace without returning | F3 |
| E0202 | types | An example is false, traps, or takes more than 10000000 steps at compile time | EX3 |
| E0300 | name | Duplicate declaration in one scope; a second `main`; a binding, parameter or function that takes a reserved name | B4, B5, F6, M1, P1 |
| E0301 | name | Unknown name: a value, a function, or a type; a use before declaration | T7, B2, B3 |
| E0302 | name | No `main` function | M1 |
| E0303 | name | Assignment to a `let` binding or to a parameter | B2 |
| E0400 | effects | Effect not declared: a call to an `io` function, or to `print`, from a function without `io` or from an example | F2, EX2 |
| E0500 | limits | Integer literal above `9223372036854775807`. Reported by the checker (RFC 0014 rule 8). | T1 |

Codes not in this table or in RFC 0014 are not used by this RFC.

## Alternatives

- **Keep NT1 and make non-termination a result of its own.** Rejected. The result would be a silent hang, which looks the same to a model as a slow program. TR3 gives it a trap and a message.
- **A step budget counting function entries and `while` conditions together.** Not chosen. Calls are already bounded by TR2, so counting them adds cost to every call without closing a case that TR2 leaves open.
- **A step budget per loop, reset on each loop entry.** Rejected. An infinite loop in `main` has one loop entry, so a per-loop counter would not stop the outer loop of a nested pair.
- **`!io` as the effect marker (RFC 0015).** Rejected. It needs the token `!`, which RFC 0014 removed. The keyword `io` is one token and needs no new rule.
- **`io` before the result clause.** Rejected. `: R` before `io` reads as "returns R, and has effect io", and the form matches the order a model reads in a signature.
- **Functions with `Text` parameters or results.** Rejected for the kernel. T3 restricts `Text` to bind, assign and print. Lifting that needs a memory decision, which the designer guidance assigns to a later RFC.
- **Unit type.** Rejected. A function with no result clause already gives nothing to bind, so a unit type adds a second way to say the same thing.
- **Lexical rules restated here (RFC 0015).** Rejected. Two copies of the same rules drift apart.

## Cost

Core spec: this RFC adds the grammar, rules G1 to G8, T1 to T7, E1 to E8, B1 to B5, F1 to F7, M1, P1 to P3, C1 to C3, EX1 to EX3, TR1 to TR3, A1 and the diagnostic table. The lexical rules come from RFC 0014, which is counted there. The estimate for this RFC alone is about 3,000 tokens. The tokeniser script gives the real figure, and the merge bot checks the 12,000-token limit. The checkout used for this draft has no `spec/` directory, so the script could not be run here.

Adds, measured against RFC 0015: the trap `step-exhausted` and rule TR3 (one counter and one comparison per `while` condition); the grammar form `io` for `!io`; rule G8.

Removes, measured against RFC 0015: rule NT1, the rule that let a non-terminating program have no result; the `!io` marker and its tokens; the lexical rules that are now in RFC 0014 (restated copies removed).

Keywords: this RFC adds no keyword. `io` is a keyword under RFC 0014, which counts it.

Spec card (`spec/card.md`, not present in this checkout): one line for the grammar's shape, one line for the value types, one line for the operator table with its non-chaining rule, one line for the four traps with status 1, one line for `: R io` order, and one line for the NEWLINE rule. About 700 tokens, under the 2,000-token card limit. Not measured.

Error codes: E0200, E0201, E0202, E0300, E0301, E0302, E0303, E0400 and E0500 are the codes RFC 0015 gave these meanings. RFC 0015 was rejected and no accepted PR emitted them, so their meanings are the same here. The orchestrator should confirm that no catalogue entry or PR uses them for another meaning.

## Test plan

Conformance tests live in `conformance/kernel/`. Each run test holds one program with its expected stdout, stderr and exit status. Each compile-error test lists the expected records as JSON, comparing `code`, `span` and `fix`, as RFC 0004 section 7 requires. Lexical tests are RFC 0014's and are not repeated here.

Run tests (each covers the production or rule named):

- `kernel/print-int.test`: `print(0)`, `print(-7)`, `print(9223372036854775807)`. Output `0`, `-7`, `9223372036854775807`, each with LF. Covers `print` (P2) and `Int`.
- `kernel/print-text.test`: `print("a\n\"b\"\\")`. Output is the decoded text and LF. Covers `Text` (T3) and P2.
- `kernel/let-var.test`: `let a = 1`, `var b: Int = 2`, `b = b + a`, `print(b)`. Output `3`. Covers `let_stmt`, `var_stmt`, `assign` (B1, B2).
- `kernel/bool-ops.test`: `print(true and not false)` is an error (E0200) in `print`, so print a Bool through `if`: `if 1 < 2 and not false { print(1) } else { print(2) }`. Output `1`. Covers `and`, `not`, `<`, `if_stmt` with `else` (E5, C1).
- `kernel/arith.test`: `print(7 / -2)`, `print(-7 % 3)`, `print(2 * 3 + 4 * 5)`. Output `-3`, `-1`, `26`. Covers E2 (truncation, sign of `%`) and precedence.
- `kernel/cmp-eq.test`: `print(1 == 1)` is E0200, so use `if 1 != 2 { print(3) }`. Output `3`. Covers E3.
- `kernel/fn-call.test`: `fn add(a: Int, b: Int): Int { return a + b }` and `print(add(2, 3))`. Output `5`. Covers `fn_decl` with result, `param`, `return_stmt`, `call`, and `args` (F1, E8).
- `kernel/fn-io.test`: `fn say(x: Int) io { print(x) }` called from `main() io`. Output as `print`. Covers the `io` form (F1, F2).
- `kernel/fn-void.test`: `fn f() { }` and `fn main() io { f() }`. Exit 0, no output. Covers a function with no result (T5, F1).
- `kernel/fn-recursion.test`: the function below and `fn main() io { print(fact(10)) }`. Output `3628800`. Covers recursion (F5) and `if` followed by `return` on the next line.

  ```
  fn fact(n: Int): Int {
      if n <= 1 {
          return 1
      }
      return n * fact(n - 1)
  }
  ```
- `kernel/while-sum.test`: `var i = 0`, `var s = 0`, then `while i < 5 {` with the body on separate lines `i = i + 1` and `s = s + i`, then `}`, then `print(s)`. Output `15`. Covers `while_stmt` and `var` assignment (C3, G1).
- `kernel/if-else-chain.test`: `if false { print(1) } else { print(2) }`. Output `2`. Covers `else` (G4).
- `kernel/example-ok.test`: `fn double(x: Int): Int { return x * 2 }` followed by `example double(3) == 6`, and `fn main() io { print(double(4)) }`. Output `8`. Covers `example` (EX1, EX3).
- `kernel/text-bind.test`: `var t: Text = "a"`, `t = "bc"`, `print(t)`. Output `bc`. Covers T3 assignment.
- `kernel/trap-overflow.test`: `print(4611686018427387904 * 2)`. Stdout empty, stderr `trap: overflow`, status 1. Covers E1.
- `kernel/trap-min.test`: `let m = -9223372036854775807 - 1` and `print(m / -1)`. Stderr `trap: overflow`, status 1. Covers E2 and T1.
- `kernel/trap-div.test`: `print(1 / 0)`. Stderr `trap: divide-by-zero`, status 1. Covers E2.
- `kernel/trap-stack.test`: `fn f(n: Int): Int { return f(n) }` and `fn main() io { print(f(1)) }`. Stdout empty, stderr `trap: stack-exhausted`, status 1. Covers TR2.
- `kernel/trap-step.test`: `fn main() io { print("before")` newline `while true { } }`. Stdout `before` and LF, stderr `trap: step-exhausted`, status 1. Covers TR3 and the defined result of a non-terminating loop.
- `kernel/step-ok.test`: a `while` loop with 1000 iterations, then `print(1)`. Output `1`, status 0. Shows TR3 does not fire for a finite loop.

Compile-error tests:

- `kernel/err-syntax.test` (E0100): `print(1 < 2 < 3)`; `let x = if true {`; the expression statement `1 + 2`. G5, G7, C2.
- `kernel/err-else-newline.test` (E0100): `else` on the line after `}`. G4.
- `kernel/err-fn-value.test` (E0100): `let f = add` where `add` is a function (F6); a `fn` inside a block (G6).
- `kernel/err-example-place.test` (E0100): an `example` at the start of the file, before any function (G6).
- `kernel/err-keyword-name.test` (E0003): `let io = 1`, and `fn io() { }`. G8.
- `kernel/err-literal.test` (E0500): `let a = 9223372036854775808`, and `let a = -9223372036854775808`, one per file. T1.
- `kernel/err-type.test` (E0200): `if 1 { }`. E7.
- `kernel/err-print-bool.test` (E0200): `print(true)`. P1.
- `kernel/err-text-op.test` (E0200): `print("a" == "b")`. E3, T3.
- `kernel/err-text-param.test` (E0200): a function with a `Text` parameter. T6.
- `kernel/err-arity.test` (E0200): `add(1)` for a two-parameter `add`. E8.
- `kernel/err-void-value.test` (E0200): `let x = f()` where `f` has no result clause. T5.
- `kernel/err-return.test` (E0200): a bare `return` in a function with a result, and `return 1` in one without. F4.
- `kernel/err-example-type.test` (E0200): an example that is an `Int`. EX2.
- `kernel/err-main-sig.test` (E0200): `main` with a parameter. M1.
- `kernel/err-missing-return.test` (E0201): a result function whose last statement is an `if` without `else`. F3.
- `kernel/err-example.test` (E0202): an example that is false, `example 1 == 2`. EX3.
- `kernel/err-example-budget.test` (E0202): an example that calls a function with `while true { }`. EX3.
- `kernel/err-dup.test` (E0300): two functions named `add`; a parameter redeclared in the body; a `let` named like a function. B4, B5, F6.
- `kernel/err-unknown.test` (E0301): an undeclared name; a use before declaration; the type `Unit`; `Int` used as a value. T7, B3.
- `kernel/err-main.test` (E0302): a file with no `main`. M1.
- `kernel/err-assign.test` (E0303): assignment to a `let` binding and to a parameter. B2.
- `kernel/err-effect.test` (E0400): a function without `io` calls `print`; a function without `io` calls an `io` function; an example calls an `io` function. F2, EX2.

Every grammar production above is exercised by at least one run or compile-error test. Every error code in this RFC is exercised by at least one compile-error test. Every trap kind is exercised by a trap test.

## Open questions

1. **Leading zero: RFC 0014 and RFC 0004 disagree.** RFC 0014 rule 8 gives `007` the code E0006. The accepted RFC 0004 test `diag/fix-present.test` expects E0001 with a fix for `007`. This kernel follows RFC 0014, since it must be built with it, and adds no leading-zero rule. The fix belongs in RFC 0014 or RFC 0004, not here. Designer-prag's requested change, E0001 in place of E0006, would be a change to RFC 0014. This draft does not make it.
2. **Value of the loop limit.** TR3 uses 1000000000 `while` evaluations. The value is a trade-off between wall time to trap and the longest honest loop a program may run. A different value changes which programs trap, so it becomes part of the contract once accepted. Reviewers may prefer a smaller value, such as 100000000.
3. **Finite but very slow programs.** A recursive program can make far more calls than it has `while` steps, for example naive `fib(60)`. Every such run still ends, so it has a defined result, and TR2 and TR3 do not stop it. Only a total step limit over calls and loops would, and that costs a check per call too. The draft does not add one. Reviewers should say if principle 7 needs it.
4. **Reused error codes.** E0200 to E0400 and E0500 have the meanings RFC 0015 gave them. The orchestrator should confirm they are unused in `spec/errors.json` and in accepted PRs.
5. **Limits not checked.** The core spec cap (12,000 tokens) and the card cap (2,000 tokens) could not be checked here, because `spec/` is absent from this checkout.
