# RFC draft: Kernel

Class: language
Slug: kernel-v5
Status: draft
Replaces: RFC 0016 (rejected). Builds on RFC 0014 (lexical-syntax-v3, accepted), which owns every token, lexical rule and lexical error code. Also depends on RFC 0004 (diagnostic records, code blocks, trap line) and RFC 0011 (the `.gl` source extension), as RFC 0016 did.

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has three value types: `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound, assigned and printed, and nothing else. `print` writes an `Int` or a `Text` value and a newline. The kernel has `let` and `var` bindings; functions with an optional result type and an optional effect keyword `io`; `if`, `while` and `return`; and file-level `example` lines that `check` evaluates.

Every run has one defined result. A run either returns from `main`, or ends with a trap: integer overflow, division by zero, call-depth exhaustion or loop-step exhaustion each trap with a defined message and exit status 1. A program that is not valid gets a diagnostic from `check` and is not run.

The lexical rules are not restated here. Every token, lexical rule and lexical error code comes from RFC 0014. The grammar in this RFC is the whole syntax of the kernel. Every rule that decides where a token may appear is in the grammar, so a token in the wrong place is always E0100, as RFC 0014 rule 13 requires.

## Motivation

Every later RFC (structs, arrays, modules, the standard library) builds on this base, so the base is settled first. It must stand alone: an implementer who has read this file and RFC 0014 must be able to build it, and nothing else.

RFC 0016 was rejected. Each objection is answered here.

- **Examples and step counting (designer-min, impl-1, tester).** RFC 0016 counted function entries as steps for examples (EX3) but not at run time (TR3), and gave examples a separate budget of 10,000,000 steps. The same program could pass `check` and behave differently in `run`. This draft removes both. An example runs under exactly the run-time limits: TR2 for call depth and TR3 for loop steps, each starting at zero for that example. TR3 counts only `while` condition evaluations, in both places. Calls are not counted by TR3; TR2 bounds them.
- **Bare function name (impl-1, tester).** RFC 0016 said a function name used as a value is E0100. The grammar accepts a bare name as a `primary`, so the parser cannot reject it, and RFC 0014 rule 13 defines E0100 as a token the grammar does not accept. This draft uses E0301 (unknown name, where the name is not a value). Rule F6 and T7 say so.
- **Grammar and rules disagreed (tester, impl-1 in part).** RFC 0016's grammar accepted `example` before the first function, and accepted `Text` as a parameter or result type, while its rules said E0100 and E0200. This draft moves those rules into the grammar. A `Text` parameter or result is now E0100, not E0200. An `example` before the first function, a `fn` inside a block, and two statements on one line are all E0100 by the grammar. Two v4 results change because of this, and both are listed in the Cost section.
- **Missing tests (tester).** The test plan now has a run or compile-error test for each production that RFC 0016 left out: `or`, `>`, `>=`, `( expr )`, `Bool` in `type`, and `Bool` in `ptype` (a `Bool` parameter). It also covers the items impl-1 listed as minor: non-`Int` comparisons (E4), non-`Bool` operands (E5), and `: R io` (F1).
- **Finite but very slow programs (tester, open question 3).** Not fixed here. A finite run with no practical result is still a defined result under principle 7, so this RFC leaves it open for the reviewers. It is listed under Open questions.
- **Readability and the missing card (user-2).** The complete kernel behaviour is in Design: the output format, the trap kinds and messages, the call-depth and loop limits, and the `io` marker. This checkout has no `spec/card.md` and no working compiler, so the size checks and the conformance runs could not be done here. Cost says so.
- **Keyword as a name.** Where the grammar needs a name and finds a keyword, the error is E0003, as RFC 0014 rule 7 says. This was already the case in RFC 0016 (G8) and is kept.

## Design

Normative. "Must" and "is" are binding on implementers.

### Lexical structure

L1. The tokens, token kinds, whitespace, comments, identifiers, keywords, integer and text literals, punctuation, NEWLINE and EOF are exactly as RFC 0014 defines them. Lexical error codes are those RFC 0014 defines. This RFC adds no lexical rule.

L2. The words `Int`, `Bool`, `Text`, `print` and `main` are `IDENT` tokens. In the grammar below, a quoted word such as `"Int"` stands for an `IDENT` token with that text. The checker resolves what the word means.

L3. The effect marker is the keyword `io`. No `!` or `->` appears in Glyph source under this RFC.

### Grammar

Normative. Terminals in quotes are keywords or punctuation, or (for `"Int"`, `"Bool"`, `"Text"`) `IDENT` tokens with that text. `IDENT`, `INT`, `TEXT`, `NEWLINE` and `EOF` are token kinds from RFC 0014 rule 12. A token the grammar does not accept at a point is E0100 (RFC 0014 rule 13), except where G1 says E0003.

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
and_expr    = eq_expr { "and" eq_expr }
eq_expr     = rel_expr [ ( "==" | "!=" ) rel_expr ]
rel_expr    = add_expr [ ( "<" | "<=" | ">" | ">=" ) add_expr ]
add_expr    = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr    = unary { ( "*" | "/" | "%" ) unary }
unary       = ( "-" | "not" ) unary | primary
primary     = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
type        = "Int" | "Bool" | "Text"
ptype       = "Int" | "Bool"
rtype       = "Int" | "Bool"
```

Each line of a block ends in NEWLINE, except the last statement, which may be followed directly by `}`. A NEWLINE inside `( )` is never emitted (RFC 0014 rule 14), so a call's arguments and a parenthesised expression may span lines. Nothing else may span lines.

Grammar rules that go with it:

G1. **Keyword where a name is needed.** After `fn`, as a parameter name, and after `let` or `var`, the grammar needs an `IDENT`. If the token is a keyword, the error is E0003 at the keyword (RFC 0014 rule 7). Anywhere else, a keyword the grammar does not accept is E0100. So `let io = 1` and `fn io() { }` are E0003; `if io {` is E0100.

G2. **Line ends.** A statement in a block ends at a NEWLINE or at `}`. A top-level function ends at a NEWLINE, and examples follow it on their own lines. A NEWLINE between `)` and `{`, between `if` or `while` and its block, or inside an `if` or `while` header outside `( )`, is E0100. So is a line end after a binary operator outside `( )`, for example `a and` at the end of a line.

G3. **`else`.** `else` must follow the `}` of its `if` block on the same line: `} else {`. If a NEWLINE ends the `if` statement, a later `else` is E0100. `else if` is E0100, because `else` takes a block only.

G4. **Expression statements.** A statement is `let`, `var`, an assignment, a call, `if`, `while` or `return`. Any other expression as a statement is E0100 at its first token. So `1 + 2` is E0100 at `1`, and a bare name followed by a line end is E0100 at the line end.

G5. **Placement.** `fn` is allowed only at the top level. A function inside a block is E0100 at `fn`. An `example` is allowed only directly after a function's block, or after another example of that function. An `example` before the first function is E0100 at `example`.

G6. **Comparisons do not chain.** `a < b < c` and `a == b == c` are E0100 at the second operator. Write `a < b and b < c`, or use parentheses.

G7. **Statements on one line.** Two statements on one line in a block are E0100 at the second one's first token, because a statement must end at a NEWLINE or at `}`.

### Types

T1. **Int.** A signed 64-bit two's complement integer. An integer literal above `9223372036854775807` is E0500 wherever it appears, including after unary `-`, as RFC 0014 rule 8 says. The minimum `Int` is written `-9223372036854775807 - 1`.

T2. **Bool.** `true` or `false`.

T3. **Text.** An immutable sequence of UTF-8 bytes. A `Text` expression may appear only in these places: the initialiser of a `let` or `var`, the right side of an assignment to a `var` of type `Text`, and the argument of `print`. Any other place, such as an operator, a condition, a function argument or a `return`, is E0200. A `Text` value has no operation in the kernel besides being bound, assigned and printed.

T4. **No implicit conversion** exists between any two types.

T5. **Unit.** There is no unit type. A function with no result clause returns nothing. Using a call to such a function as a value is E0200.

T6. **Parameter and result types** are `ptype` and `rtype`: only `Int` or `Bool`. A `Text` parameter or result is E0100 at the `Text` token, because the grammar does not accept it there. `Text` is still allowed in a `let` or `var` annotation.

T7. **Type names and names as values.** `Int`, `Bool` and `Text` are types. Used as a value (for example `print(Int)`), they are E0301. A name in a type position other than these three (for example `let u: Unit = 1`) is E0100, because the grammar accepts only these three words there.

### Expressions

Precedence, loosest to tightest. Binary operators are left-associative, except for the comparisons, which do not chain (G6).

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

E4. `<`, `<=`, `>` and `>=` take two `Int` operands. Otherwise E0200. So `true < false` is E0200.

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes a `Bool`. A non-`Bool` operand is E0200. So `1 and 2` and `not 1` are E0200.

E6. Unary `-` takes an `Int`. Otherwise E0200. `+` is not a unary operator, and the grammar does not accept it.

E7. The condition of `if` and `while` is `Bool`. Otherwise E0200.

E8. A call's argument count and argument types must match the parameters. A mismatch is E0200.

E9. Overflow and division by zero are run-time traps, not compile-time errors. The checker does not evaluate expressions outside examples, so `print(1 / 0)` compiles and traps when run.

E10. Unary `-` and `not` bind tighter than every binary operator. So `-a * b` is `(-a) * b`, and `not a == b` is `(not a) == b`.

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

The result clause `: R` and the effect keyword `io` are each optional. When both appear, `: R` comes first and `io` follows it. When there is no result clause, `io` follows the `)`. There is no other order. `fn f() io { }` is a valid declaration with no result. `R`, `T1` and `T2` are `rtype` and `ptype`.

F2. A function without `io` may not call a function with `io`, and may not call `print`. Either is E0400. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns when one of its statements is `return`, or when it is an `if` with an `else` whose two blocks both return. A `while` never counts as returning. A function with a result clause whose body does not return is E0201 at the closing brace of the body.

F4. `return expr` needs a result clause and an expression of that type. A bare `return` is allowed only in a function with no result clause. Either mismatch is E0200.

F5. Recursion is allowed. Termination is not checked. Every run ends, by TR2 or TR3, or by its `return` from `main`.

F6. Function names are unique in the file. A duplicate is E0300. Functions are visible throughout the file, and declaration order does not matter. A function name, or `print`, used as a value without a call is E0301.

F7. Parameters are `ptype` (T6). Functions cannot be nested (G5).

### Entry point

M1. A program has exactly one function `main`. It has no parameters and no result clause. It may have `io`. A missing `main` is E0302. A second `main` is E0300. A `main` with a parameter or a result clause is E0200.

### Built-in print

P1. `print` is a built-in function with two forms, `print(x: Int) io` and `print(x: Text) io`. The compiler chooses the form from the type of the argument. Any other argument, including a `Bool`, is E0200. A call with other than one argument is E0200. A program that declares its own `print` gets E0300 (B5).

P2. `print` writes its value and then one LF:
    - an `Int` is written in decimal, with a leading `-` if it is negative, with no leading zeros and no plus sign. Zero is written as `0`;
    - a `Text` value is written as its UTF-8 bytes after escapes are applied, without the quotes.

P3. Output goes to standard output through WASI `fd_write`. Each `print` finishes writing before the next statement runs.

### Conditionals and loops

C1. `if cond block` and `if cond block else block`. The `else` part is a block only (G3).

C2. `if` and `while` are statements only. Used where an expression is expected, they are E0100, because `primary` does not accept them.

C3. `while cond block` repeats while `cond` is true. There is no `break` and no `continue`. Early exit uses `return`.

### Examples

EX1. An example is a line that starts with the keyword `example`, followed by one expression. It follows the closing brace of a function, or another example of that function (G5). It belongs to the function before it. The grammar says where it may appear.

EX2. The expression must be `Bool`. A non-`Bool` example is E0200. An example may call only functions without `io`. Calling a function with `io`, or `print`, in an example is E0400.

EX3. `glyphc check` evaluates each example as its own run, under the same limits as `run`: the call depth starts at 0 at the example's expression (TR2), and the loop counter starts at 0 (TR3). An example passes if it evaluates to `true`. If it evaluates to `false`, or traps with any trap kind, it fails with E0202 at the example's span. The message names the outcome: `false`, or the trap kind. No other step limit applies. `glyphc run` does not evaluate examples. An example that runs long delays `check`, up to the TR3 limit, but its result is still defined.

### Traps

TR1. A trap is a defined outcome, not a diagnostic. When a program traps, the runtime writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no code. Output written by `print` before the trap stays written.

| Kind | Cause |
| --- | --- |
| `overflow` | `Int` arithmetic does not fit in 64 bits (E1, E2) |
| `divide-by-zero` | `/` or `%` with a zero divisor (E2) |
| `stack-exhausted` | call depth would exceed 10000 (TR2) |
| `step-exhausted` | more than 1000000000 evaluations of `while` conditions in one run (TR3) |

TR2. A run's call depth is the number of function calls active at once. The call to `main` is depth 1. In an example, the expression is evaluated at depth 0. A call that would make the depth 10001 traps with `stack-exhausted`. The compiler inserts the check at each function entry. The limit is a fixed compile-time constant, so the result does not depend on the host.

TR3. The run has one loop counter. It starts at 0 when `main` starts (or when an example starts). Each evaluation of a `while` condition adds 1 to it, whether the condition is true or false. Before an addition would make the counter exceed 1000000000, the program traps with `step-exhausted` instead. The check is one comparison per evaluation. The limit is a fixed compile-time constant. Calls are not counted here, because TR2 already bounds them.

The counter is not reset when a loop or function ends. A program that runs a long loop in several parts shares one count.

### Stable addresses

A1. Each declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path as given on the command line, for example `main.gl::add`. Each example is addressed as `<file>::<name>#<n>`, where `<file>` and `<name>` are the function's, and `<n>` counts from 1 in source order among that function's examples.

### Compile-time diagnostics

Each diagnostic is a record in the form of RFC 0004 section 2. The lexical codes (E0001, E0003, E0005, E0006) and the syntax code E0100 are defined by RFC 0014 and are not repeated here. The other codes are below. Each is added to `spec/errors.json` by the first PR that emits it, as RFC 0004 section 4 requires.

| Code | Block | Meaning | Rules |
| --- | --- | --- | --- |
| E0200 | types | Type mismatch: operand, condition, binding, assignment, return, argument, example or `print` argument; `Text` outside T3; a call to a function with no result used as a value; `main` with a parameter or result | T3, T5, E1 to E8, B1, B2, F4, M1, P1, EX2 |
| E0201 | types | A function with a result clause may reach its closing brace without returning | F3 |
| E0202 | types | An example evaluates to `false`, or traps (EX3) | EX3 |
| E0300 | name | Duplicate declaration in one scope; a second `main`; a binding, parameter or function that takes a reserved name | B4, B5, F6, M1, P1 |
| E0301 | name | Unknown name: a value or a function; a use before declaration; a function name, `print`, or a type name (`Int`, `Bool`, `Text`) used as a value | T7, B2, B3, F6 |
| E0302 | name | No `main` function | M1 |
| E0303 | name | Assignment to a `let` binding or to a parameter | B2 |
| E0400 | effects | Effect not declared: a call to an `io` function, or to `print`, from a function without `io` or from an example | F2, EX2 |
| E0500 | limits | Integer literal above `9223372036854775807`. Reported by the checker (RFC 0014 rule 8). | T1 |

Codes that RFC 0014 defines and that this RFC uses: E0001, E0003, E0005, E0006 and E0100. E0100 is also given by G2 to G7 and T6 and T7, through the grammar. Codes not in this table or in RFC 0014 are not used by this RFC.

## Alternatives

- **Keep the step budget for examples at 10,000,000 (RFC 0016).** Rejected. It gives one program two meanings, one at `check` and one at `run`. Examples now use the run-time limits.
- **Count function calls toward the step limit as well.** Rejected, as in RFC 0016. TR2 already bounds calls, and counting them adds a check to every call without closing a case that TR2 leaves open.
- **A step budget per loop, reset on each loop entry (RFC 0016).** Rejected. An infinite outer loop has one entry, so a per-loop counter would not stop the outer loop of a nested pair.
- **`Text` as a parameter or result, rejected by the checker with E0200.** Rejected. RFC 0014 rule 13 ties E0100 to the grammar, so a rule that the grammar cannot express should be a grammar rule. `Text` parameters need a memory decision, which the designer guidance assigns to a later RFC.
- **Type names as one `IDENT` production, resolved by the checker.** Rejected. It moves a grammar rule to the checker and makes `let u: Unit` an E0301 instead of an E0100. The three type names stay in the grammar.
- **Examples in the grammar anywhere in the file (RFC 0016).** Rejected. RFC 0016's grammar accepted an example before any function, and its rule G6 then said E0100 for the same case. The grammar now says where examples may appear.
- **Unit type.** Rejected. A function with no result clause already gives nothing to bind, so a unit type adds a second way to say the same thing.
- **`!io` as the effect marker (RFC 0015).** Rejected. It needs the token `!`, which RFC 0014 removed. The keyword `io` is one token and needs no new rule.
- **`io` before the result clause.** Rejected. `: R` before `io` reads as "returns R, and has effect io", and that is the order a model reads in a signature.
- **Lexical rules restated here (RFC 0015).** Rejected. Two copies of the same rules drift apart.

## Cost

Core spec: this RFC adds the grammar, rules G1 to G7, T1 to T7, E1 to E10, B1 to B5, F1 to F7, M1, P1 to P3, C1 to C3, EX1 to EX3, TR1 to TR3, A1 and the diagnostic table. The lexical rules come from RFC 0014, which is counted there. The estimate for this RFC alone is about 3,200 tokens. The tokeniser script gives the real figure, and the merge bot checks the 12,000-token limit. The checkout used for this draft has no `spec/` directory, so the script could not be run here.

Adds, measured against RFC 0016: the rule that a `Text` parameter or result is E0100 by the grammar (T6, a change of code from E0200); the rule that a type name other than the three is E0100 (T7); the rule that a function name used as a value is E0301 (F6); and E10, which states the precedence of unary operators.

Removes, measured against RFC 0016: the example step budget of 10,000,000 and the second meaning of a step in EX3; the EX3 count of function entries; the code E0100 for a bare function name.

Keywords: this RFC adds no keyword. `io` is a keyword under RFC 0014, which counts it.

Spec card (`spec/card.md`, not present in this checkout): one line for the grammar's shape, one line for the value types, one line for the operator table with its non-chaining rule, one line for the four traps with status 1, one line for `: R io` order, and one line for the NEWLINE rule. About 700 tokens, under the 2,000-token card limit. Not measured.

## Test plan

Conformance tests live in `conformance/kernel/`. Each run test holds one program with its expected stdout, stderr and exit status. Each compile-error test lists the expected records as JSON, comparing `code`, `span` and `fix`, as RFC 0004 section 7 requires. Each compile-error test file contains one error, so the expected records are exactly one. Lexical tests are RFC 0014's and are not repeated here.

Unless a program defines `main` itself, its statements are inside `fn main() io { }`. Each run test prints its results with `print`.

Run tests:

- `kernel/print-int.test`: `print(0)`, `print(-7)`, `print(9223372036854775807)`. Output `0`, `-7`, `9223372036854775807`, each with LF. Covers `print` (P2), `INT`, unary `-` (E6).
- `kernel/print-text.test`: `print("a\n\"b\"\\")`. Output is the decoded text and LF. Covers `TEXT` (T3), P2.
- `kernel/let-var.test`: `let a = 1`, `var b: Int = 2`, `b = b + a`, `print(b)`. Output `3`. Covers `let_stmt` without and with a type, `var_stmt`, `assign`, `add_expr`, `type` `Int` (B1, B2).
- `kernel/let-bool.test`: `let b: Bool = 1 < 2` and `if b { print(1) }`. Output `1`. Covers `type` `Bool`, `rel_expr` with `<`.
- `kernel/bool-ops.test`: `if 1 < 2 and not false { print(1) } else { print(2) }`. Output `1`. Covers `and_expr`, `unary` with `not`, `primary` `false`, `if_stmt` with `else` (E5, C1).
- `kernel/bool-or.test`: `if false or 2 > 1 { print(1) }`. Output `1`. Covers `or_expr`, and `>` (E4).
- `kernel/cmp-ops.test`: `if 1 < 2 { print(1) }`, `if 2 > 1 { print(2) }`, `if 2 >= 2 { print(3) }`, `if 1 <= 1 { print(4) }`, each on its own line. Output `1`, `2`, `3`, `4`. Covers `<`, `>`, `>=`, `<=` (E4).
- `kernel/cmp-eq.test`: `if 1 != 2 { print(3) }` and `if true == true { print(4) }`. Output `3`, `4`. Covers `eq_expr` with `!=` and `==`, and `Bool` equality (E3).
- `kernel/arith.test`: `print(7 / -2)`, `print(-7 % 3)`, `print(2 * 3 + 4 * 5)`, `print(-3 + 1)`, `print((1 + 2) * 3)`. Output `-3`, `-1`, `26`, `-2`, `9`. Covers `/`, `%`, `*`, `+`, `-`, `( expr )` (E2, E10).
- `kernel/fn-call.test`: `fn add(a: Int, b: Int): Int { return a + b }`, then `print(add(2, 3))`. Output `5`. Covers `fn_decl` with `rtype`, `param`, `return_stmt` with an expression, `call`, `args` (F1, E8).
- `kernel/fn-result-io.test`: `fn sq(x: Int): Int io {` with `print(x)` and `return x * x` on the next lines, and `print(sq(3))` in `main`. Output `3`, `9`. Covers the `: R io` form (F1).
- `kernel/fn-bool-param.test`: `fn pick(b: Bool): Int {`, then `if b {`, `return 1`, `}`, `return 2`, `}` on separate lines. `main` prints `pick(true)` and `pick(false)`. Output `1`, `2`. Covers `ptype` `Bool`, `if_stmt` without `else`, `return` on its own line (T6).
- `kernel/fn-io.test`: `fn say(x: Int) io { print(x) }`, and `say(4)` in `main`. Output `4`. Covers the `io` form with no result (F1, F2).
- `kernel/fn-void.test`: `fn f() { }`, and `f()` in `main`. Exit 0, no output. Covers an empty `block`, a `call` statement, and a function with no result (T5).
- `kernel/return-bare.test`: `fn stop(n: Int) io {`, then `if n > 0 {`, `return`, `}`, `print(n)`, `}`. `main` calls `stop(0)` and `stop(5)`. Output `0`. Covers bare `return` (F4), `if` without `else`, `>`.
- `kernel/fn-recursion.test`: `fn fact(n: Int): Int` with `if n <= 1 { return 1 }` on separate lines, and `return n * fact(n - 1)`. `main` prints `fact(10)`. Output `3628800`. Covers recursion (F5) and `<=`.
- `kernel/while-sum.test`: `var i = 0`, `var s = 0`, `while i < 5 {`, `i = i + 1`, `s = s + i`, `}`, `print(s)`. Output `15`. Covers `while_stmt`, `var_stmt` without a type, `assign`.
- `kernel/if-else-chain.test`: `if false { print(1) } else { print(2) }`. Output `2`. Covers `else` (G3).
- `kernel/block-layout.test`: a `main` whose block starts with a blank line, then `let a = 1`, then `if a == 1 {`, `print(a)`, `}`. Output `1`. Covers the leading `NEWLINE` and the final statement before `}` (block).
- `kernel/paren-nested.test`: `print(-((4)))`. Output `-4`. Covers `( expr )` nested inside a unary (`primary` inside `unary`).
- `kernel/example-ok.test`: `fn double(x: Int): Int { return x * 2 }`, then `example double(3) == 6` and `example not false` on the next lines, then `fn main() io { print(double(4)) }`. Output `8`. Covers `example` after a function, a second example (EX1, EX3).
- `kernel/text-bind.test`: `let u: Text = "x"`, `var t: Text = "a"`, `t = "bc"`, `print(u)`, `print(t)`. Output `x`, `bc`. Covers `type` `Text`, `TEXT` in a binding and an assignment (T3).
- `kernel/step-ok.test`: `var i = 0`, `while i < 1000 { i = i + 1 }`, `print(1)`. Output `1`, status 0. Shows TR3 does not fire for a finite loop.
- `kernel/trap-overflow.test`: `print(4611686018427387904 * 2)`. Stdout empty, stderr `trap: overflow`, status 1. Covers E1 at run time (E9).
- `kernel/trap-min.test`: `let m = -9223372036854775807 - 1` and `print(m / -1)`. Stderr `trap: overflow`, status 1. Covers E2 and T1.
- `kernel/trap-min-mod.test`: the same `m`, then `print(m % -1)`. Output `0`, status 0. Covers E2 (`MIN % -1` is `0`).
- `kernel/trap-div.test`: `print(1 / 0)`. Stderr `trap: divide-by-zero`, status 1. Covers E2 and E9.
- `kernel/trap-stack.test`: `fn f(n: Int): Int { return f(n) }` and `fn main() io { print(f(1)) }`. Stdout empty, stderr `trap: stack-exhausted`, status 1. Covers TR2.
- `kernel/trap-step.test`: `fn main() io {`, then `print("before")` on its own line, then `while true { } }`. Stdout `before` and LF, stderr `trap: step-exhausted`, status 1. Covers TR3 and the defined result of a non-terminating loop.

Compile-error tests:

- `kernel/err-compare-chain.test` (E0100): `print(1 < 2 < 3)`, at the second `<`. G6.
- `kernel/err-expr-stmt.test` (E0100): the statement `1 + 2`, at `1`. G4.
- `kernel/err-if-expr.test` (E0100): `let x = if true {`, at `if`. C2.
- `kernel/err-else-newline.test` (E0100): `else` on the line after `}`. G3.
- `kernel/err-else-if.test` (E0100): `} else if true {`. G3.
- `kernel/err-if-brace-line.test` (E0100): `if true` on one line and `{ print(1) }` on the next. G2.
- `kernel/err-stmt-sep.test` (E0100): `print(1) print(2)` on one line in `main`, at the second `print`. G7.
- `kernel/err-fn-nested.test` (E0100): `fn f() { }` inside the block of `main`, at `fn`. G5.
- `kernel/err-example-place.test` (E0100): an `example` line before the first function, at `example`. G5.
- `kernel/err-text-param.test` (E0100): `fn f(t: Text) io { }`, at `Text`. T6.
- `kernel/err-text-result.test` (E0100): `fn f(): Text io { }`, at `Text`. T6.
- `kernel/err-unknown-type.test` (E0100): `let u: Unit = 1`, at `Unit`. T7.
- `kernel/err-keyword-let.test` (E0003): `let io = 1`, at `io`. G1.
- `kernel/err-keyword-fn.test` (E0003): `fn io() { }`, at `io`. G1.
- `kernel/err-literal.test` (E0500): `let a = 9223372036854775808`. T1.
- `kernel/err-literal-neg.test` (E0500): `let a = -9223372036854775808`. T1.
- `kernel/err-type.test` (E0200): `if 1 { }`. E7.
- `kernel/err-cmp-type.test` (E0200): `if true < false { }`. E4.
- `kernel/err-bool-op.test` (E0200): `let a = 1 and true`. E5.
- `kernel/err-not.test` (E0200): `let a = not 1`. E5.
- `kernel/err-print-bool.test` (E0200): `print(true)`. P1.
- `kernel/err-print-arity.test` (E0200): `print(1, 2)`. P1.
- `kernel/err-text-op.test` (E0200): `print("a" == "b")`. E3, T3.
- `kernel/err-text-arg.test` (E0200): `fn f(n: Int) io { }`, and `f("a")` in `main`. T3, E8.
- `kernel/err-arity.test` (E0200): `add(1)` for a two-parameter `add`. E8.
- `kernel/err-void-value.test` (E0200): `let x = f()` where `f` has no result clause. T5.
- `kernel/err-return-value.test` (E0200): `return 1` in a function with no result clause. F4.
- `kernel/err-return-bare.test` (E0200): a bare `return` in a function with a result clause. F4.
- `kernel/err-let-type.test` (E0200): `let a: Bool = 1`. B1.
- `kernel/err-assign-type.test` (E0200): `var a = 1` then `a = true`. B2.
- `kernel/err-example-type.test` (E0200): `example 1`. EX2.
- `kernel/err-main-sig.test` (E0200): `fn main(n: Int) io { }`. M1.
- `kernel/err-missing-return.test` (E0201): a function with `: Int` whose only `return` is inside an `if` without `else`, at its closing brace. F3.
- `kernel/err-example.test` (E0202): `example 1 == 2`. EX3.
- `kernel/err-example-trap.test` (E0202): `example 1 / 0 == 0`. EX3.
- `kernel/err-example-budget.test` (E0202): `fn spin(): Int {`, then `while true { }`, then `return 0`, on separate lines; `example spin() == 0`. Runs until TR3 traps `step-exhausted`. EX3.
- `kernel/err-dup.test` (E0300): two functions named `add`. F6.
- `kernel/err-dup-main.test` (E0300): two functions named `main`. M1.
- `kernel/err-dup-param.test` (E0300): `fn f(a: Int): Int {`, then `let a = 1`, then `return a`. B4.
- `kernel/err-reserved.test` (E0300): `let print = 1` in `main`. B5.
- `kernel/err-unknown.test` (E0301): `print(zz)`. T7, B3.
- `kernel/err-use-before.test` (E0301): `print(a)` on one line, then `let a = 1` on the next. B3.
- `kernel/err-type-value.test` (E0301): `print(Int)`. T7.
- `kernel/err-fn-value.test` (E0301): `let f = add`, where `add` is a function. F6.
- `kernel/err-main.test` (E0302): a file with no `main`. M1.
- `kernel/err-assign-let.test` (E0303): assignment to a `let` binding. B2.
- `kernel/err-assign-param.test` (E0303): assignment to a parameter. B2.
- `kernel/err-effect.test` (E0400): a function without `io` calls `print`. F2.
- `kernel/err-effect-call.test` (E0400): a function without `io` calls an `io` function. F2.
- `kernel/err-effect-example.test` (E0400): `fn say(): Int io { return 1 }`, and `example say() == 1`. EX2.

Coverage. Every production of the grammar above appears in at least one run test: `program`, `fn_decl` (with and without `rtype`, with and without `io`), `param` with `ptype` `Int` and `Bool`, `example`, `block` (empty, leading NEWLINE, final statement without NEWLINE), each `stmt` alternative, `let_stmt` and `var_stmt` with and without `type`, `type` `Int`, `Bool` and `Text`, `if_stmt` with and without `else`, `while_stmt`, `return_stmt` with and without an expression, `args`, every operator in `expr` (`or`, `and`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `%`, unary `-` and `not`), and every `primary` form (`INT`, `TEXT`, `true`, `false`, a call, a name, `( expr )`). Every error code in this RFC appears in at least one compile-error test. Every trap kind appears in a trap test.

## Open questions

1. **Check time for long examples.** EX3 removes the 10,000,000-step example budget. An example that loops, such as `err-example-budget.test`, takes up to 1000000000 loop steps in `check`. This is a cost to the author, not a change in result. Reviewers may prefer a per-example limit that is smaller than TR3. A smaller limit would be a second meaning for steps, which this draft does not allow.
2. **Value of the loop limit.** TR3 uses 1000000000 `while` evaluations. The value trades wall time to trap against the longest honest loop a program may run. A different value changes which programs trap, so it becomes part of the contract once accepted. Reviewers may prefer a smaller value, such as 100000000.
3. **Finite but very slow programs.** A recursive program can make far more calls than it has `while` steps, for example naive `fib(60)`. Every such run still ends, so it has a defined result, and TR2 and TR3 do not stop it. Only a total step limit over calls and loops would, and that costs a check per call too. This draft does not add one. Reviewers should say if principle 7 needs it.
4. **Unary precedence.** E10 makes `not a == b` read as `(not a) == b`, and `-a * b` as `(-a) * b`. This follows the table, and the table is what the grammar encodes. Reviewers may prefer `not` to bind looser than `==`, which would change the grammar's `unary` production.
5. **Leading zero: RFC 0014 and RFC 0004.** RFC 0014 rule 8 gives `007` the code E0006. RFC 0016 said the accepted RFC 0004 test `diag/fix-present.test` expects E0001 for the same input. This was not re-checked in this session, because `conformance/` is absent from this checkout. The fix belongs in RFC 0014 or RFC 0004, not here, and this draft adds no leading-zero rule.
6. **Reused error codes.** E0200 to E0400 and E0500 have the meanings RFC 0015 and RFC 0016 gave them. The orchestrator should confirm that `spec/errors.json` and accepted PRs do not use them for other meanings. `spec/errors.json` is absent from this checkout.
7. **Limits not checked.** The core spec cap (12,000 tokens) and the card cap (2,000 tokens) could not be checked here, because `spec/` is absent from this checkout.
