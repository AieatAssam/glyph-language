# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v7
Status: draft
Replaces: RFC 0018 (kernel-v6, rejected). Builds on RFC 0014 (lexical-syntax-v3, accepted), which owns every token, lexical rule and lexical error code. Also depends on RFC 0004 (accepted: diagnostic records, code blocks, trap line) and RFC 0011 (accepted: the `.gl` source extension).

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has three value types: `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound, assigned and printed, and nothing else. `print` writes an `Int` or a `Text` value and a newline. The kernel has `let` and `var` bindings; functions with an optional result type and an optional effect keyword `io`; `if`, `while` and `return`; and file-level `example` lines that `check` evaluates.

The only ordering operator is `<`. `>`, `>=` and `<=` are syntax errors (E0100). The programmer writes the other orderings with `<` and `not`. For `>=` the compiler offers a fix that keeps the order of the operands. For `>` and `<=` the programmer reorders the calls by hand (Design E4).

Every run has one defined result. A run either returns from `main`, or ends with a trap: integer overflow, division by zero, call-depth exhaustion or loop-step exhaustion each trap with a defined message and exit status 1. A program that is not valid gets a diagnostic from `check` and is not run.

The lexical rules are not restated here. Every token, lexical rule and lexical error code comes from RFC 0014. The grammar in this RFC is the whole syntax of the kernel. Every rule that decides where a token may appear is in the grammar, so a token in the wrong place is E0100, as RFC 0014 rule 13 requires.

Scope: `Text` has no operations in the kernel. A kernel program cannot join, measure, index or parse text. That is a deliberate limit of this RFC. Text operations belong to the standard library RFC, which needs its own memory decision for new text values.

## Motivation

Every later RFC (structs, arrays, modules, the standard library) builds on this base, so the base is settled first. It must stand alone: an implementer who has read this file and RFC 0014 must be able to build it, and nothing else.

RFC 0018 was rejected. Each objection is answered here.

- **Synonym comparisons (designer-min, abstain).** RFC 0018 dropped `>`, `>=` and `<=` from the grammar and kept only `<`. This draft keeps that. The grammar accepts `<` alone. The three other tokens are E0100 (G8), so there is still one way to write each ordering. Min supported the written forms; this draft keeps them.
- **Operand order in the written forms (designer-prag).** RFC 0018 rewrote `a > b` as `b < a` and `a <= b` as `not (b < a)`. Those forms run the right operand first, and E10 makes that order observable when operands call `io` functions or trap. This draft changes three things. (a) The `>=` form is `not (a < b)`, which keeps the order, and it is offered as a fix on the E0100 for `>=` (G8). (b) `>` and `<=` are E0100 with a message that says to reorder the calls by hand (G8). (c) E4 states that the compiler never applies the `>` and `<=` forms itself. Prag's approval asked for the `>=` form to be accepted as a form. This draft offers it as an E0100 fix instead, so one token has one meaning. Open question 4 records that choice.
- **Test plan (tester, reject).** Three points. (a) The conflict with RFC 0014. RFC 0014's test plan lists `lex/tok-gt`, `lex/tok-ge` and `lex/tok-le` as run tests that use each token in a valid kernel position. Under G8 no such position exists, so those tests cannot pass. Each of the three is rewritten as a compile-error test expecting E0100 at the token, with the program and record of this RFC's `kernel/err-gt`, `kernel/err-ge` and `kernel/err-le`. The rewrite is a change to RFC 0014's test plan, which this RFC cannot make, because RFC 0014 is accepted. The Test plan section gives the exact change, and open question 1 makes it a condition of approval. (b) The test plan is complete in this draft. It ends at the Coverage section and the code map, and the open questions follow them. (c) Principle 3 says failure is visible in the signature, and traps are not. This draft now says so in Alternatives and in open question 3.
- **User limits (user-1, user-2, abstain).** Both asked whether text can be joined, formatted or parsed in the kernel. It cannot, by design. The Summary now states the limit, and the standard library RFC must cover text operations. The abstentions also said `spec/card.md` was missing from their copy. The checkout used for this draft has no `spec/` directory either, so the card is estimated in Cost and not measured.
- **Test plan and examples (earlier review, carried forward).** Compile-error tests state the expected record as JSON, as RFC 0004 section 7 requires. Open question 2 records the runner conflict. Example limits are tested as in RFC 0018: `kernel/example-call-ok.test`, `kernel/err-example-stack.test` and `kernel/err-example-budget.test`.
- **Reserved function names, Bool result, evaluation order.** All as in RFC 0018: F6 reserves `print`, `Int`, `Bool` and `Text` as function names; `kernel/fn-bool-result.test` covers a `Bool` result; E10 (evaluation order, formerly E11) is left to right.
- **Finite but very slow programs and the step limit.** Not changed. Open questions 4 and 5 record them.

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
rel_expr    = add_expr [ "<" add_expr ]
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

G8. **Other ordering tokens.** The tokens `>`, `>=` and `<=` are lexed (RFC 0014), but no production of this grammar accepts them. Where the parser reaches one, the error is E0100 at that token's span, with the message in the table below. The message for each token is the one given there; the other E0100 messages use the template in `spec/errors.json`.

| Token | Message | Fix |
| --- | --- | --- |
| `>` | no `>` operator; write `b < a` for `a > b`, and reorder the calls by hand so they run in the original order | none |
| `<=` | no `<=` operator; write `not (b < a)` for `a <= b`, and reorder the calls by hand so they run in the original order | none |
| `>=` | no `>=` operator; write `not (a < b)` for `a >= b` | see below |

The fix for `>=` replaces the bytes from the first token of the left operand to the last token of the right operand with `not (` followed by the source text of the left operand, ` < `, the source text of the right operand, and `)`. `>=` gets a fix because `not (a < b)` runs the operands in the order written. `>` and `<=` get none, because their written forms swap the operands (E4). Only one error is reported, at the first unaccepted token (RFC 0014 rule 13).

### Types

T1. **Int.** A signed 64-bit two's complement integer. An integer literal above `9223372036854775807` is E0500 wherever it appears, including after unary `-`, as RFC 0014 rule 8 says. The minimum `Int` is written `-9223372036854775807 - 1`.

T2. **Bool.** `true` or `false`.

T3. **Text.** An immutable sequence of UTF-8 bytes. A `Text` expression may appear only in these places: the initialiser of a `let` or `var`, the right side of an assignment to a `var` of type `Text`, and the argument of `print`. Any other place, such as an operator, a condition, a function argument or a `return`, is E0200. A `Text` value has no operation in the kernel besides being bound, assigned and printed.

T4. **No implicit conversion** exists between any two types.

T5. **Unit.** There is no unit type. A function with no result clause returns nothing. Using a call to such a function as a value is E0200.

T6. **Parameter and result types** are `ptype` and `rtype`: only `Int` or `Bool`. A `Text` parameter or result is E0100 at the `Text` token, because the grammar does not accept it there. `Text` is still allowed in a `let` or `var` annotation.

T7. **Type names and names as values.** `Int`, `Bool` and `Text` are types. Used as a value (for example `print(Int)`), they are E0301. A name in a type position other than these three (for example `let u: Unit = 1`) is E0100, because the grammar accepts only these three words there.

### Expressions

Precedence, loosest to tightest. Binary operators are left-associative, except for the comparison `<` and the equality operators, which do not chain (G6). The unary operators bind tighter than every binary operator, as the grammar's `unary` production says: `-a * b` is `(-a) * b`, and `not a == b` is `(not a) == b`.

1. `or`
2. `and`
3. `==` `!=`
4. `<`
5. `+` `-`
6. `*` `/` `%`
7. unary `-` and `not`
8. call, literal, name, parenthesised expression

E1. `+`, `-` and `*` on `Int` give the exact result when it fits in 64 bits. Otherwise they trap with `overflow`. Unary `-` on the minimum `Int` traps with `overflow`.

E2. `/` and `%` on `Int` truncate toward zero. The sign of `%` follows the dividend, so `-7 % 3` is `-1`. A zero divisor traps with `divide-by-zero`. `MIN / -1` traps with `overflow`. `MIN % -1` is `0`.

E3. `==` and `!=` take two `Int` operands, or two `Bool` operands. Otherwise the operands are E0200. `Text` has no equality.

E4. `<` takes two `Int` operands. Otherwise E0200. So `true < false` is E0200. `<` is the only ordering operator. The other orderings are written by the programmer with `<` and `not`:
    - `a >= b` is written `not (a < b)`. The operands keep their order, so the written form runs the calls in the order the programmer wrote them. `a >= b` itself is E0100, with the fix in G8.
    - `a > b` is written `b < a`, and `a <= b` is written `not (b < a)`. Each swaps the operands, so the calls in them run in the other order (E10). Their E0100 messages (G8) tell the programmer to reorder the calls by hand.

    The compiler never applies these forms itself. It offers the fix for `>=` only. When an operand calls an `io` function, may print, or may trap, the programmer chooses the order: a `>` or `<=` comparison is written with the operands bound by `let` first, in the order the calls must run.

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes a `Bool`. A non-`Bool` operand is E0200. So `1 and 2` and `not 1` are E0200.

E6. Unary `-` takes an `Int`. Otherwise E0200. `+` is not a unary operator, and the grammar does not accept it.

E7. The condition of `if` and `while` is `Bool`. Otherwise E0200.

E8. A call's argument count and argument types must match the parameters. A mismatch is E0200.

E9. Overflow and division by zero are run-time traps, not compile-time errors. The checker does not evaluate expressions outside examples, so `print(1 / 0)` compiles and traps when run.

E10. **Evaluation order** is left to right. For a binary operator, the left operand is evaluated before the right operand, and the operator is applied after both. For a call, the arguments are evaluated left to right, and then the call is made. A short-circuit `and` or `or` does not evaluate its right operand when the left one decides the result (E5). A trap in an earlier operand happens before a later operand is evaluated.

### Bindings

B1. `let NAME = expr` and `let NAME: T = expr` introduce an immutable binding. `var NAME = expr` and `var NAME: T = expr` introduce a mutable one. If `: T` is written, `expr` must have type `T`. Otherwise the binding has the type of `expr`. A mismatch is E0200.

B2. `NAME = expr` assigns to a `var`. Assigning to a `let` binding or to a parameter is E0303. Assigning to an unknown name is E0301. A type mismatch is E0200.

B3. A binding is visible from its declaration to the end of its enclosing block. A use before the declaration is E0301.

B4. The parameters of a function are in the scope of its body block. Declaring a name that is already declared in the same block, including a parameter, is E0300.

B5. An inner block may declare a name that an outer block declares. A `let`, `var` or parameter may not take the name of a function in the file, or one of the names `print`, `Int`, `Bool` or `Text`. Doing so is E0300.

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

F6. Function names are unique in the file. A second declaration of a name is E0300. A function named `print`, `Int`, `Bool` or `Text` is E0300 at the name. Functions are visible throughout the file, and declaration order does not matter. A function name, or `print`, used as a value without a call is E0301.

F7. Parameters are `ptype` (T6). Functions cannot be nested (G5).

### Entry point

M1. A program has exactly one function `main`. It has no parameters and no result clause. It may have `io`. A missing `main` is E0302. A second `main` is E0300. A `main` with a parameter or a result clause is E0200.

### Built-in print

P1. `print` is a built-in function with two forms, `print(x: Int) io` and `print(x: Text) io`. The compiler chooses the form from the type of the argument. Any other argument, including a `Bool`, is E0200. A call with other than one argument is E0200. A program that declares its own `print` gets E0300 (F6).

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

Each diagnostic is a record in the form of RFC 0004 section 2: `code`, `severity`, `message`, `span`, and `fix` where the rule below gives one. The lexical codes (E0001, E0003, E0005, E0006) and the syntax code E0100 are defined by RFC 0014 and are not repeated here, except for the messages in G8. The other codes are below. Each is added to `spec/errors.json` by the first PR that emits it, as RFC 0004 section 4 requires. This RFC adds no new code. Every code in the table below is in its block of RFC 0004 section 4. The accepted RFCs in `rfcs/` use these codes: RFC 0004 uses E0001 and E0003 in its test plan, RFC 0011 uses E0010, and RFC 0014 uses E0001 to E0006, E0100 and E0500. None of them gives a code of the table below a different meaning. Rejected drafts (RFCs 0013 to 0018) also use codes in this range. They are not in force, and the meanings in the table are this draft's own.

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

Codes that RFC 0014 defines and that this RFC uses: E0001, E0003, E0005, E0006 and E0100. E0100 is also given by G2 to G8, T6 and T7, through the grammar. Codes not in this table or in RFC 0014 are not used by this RFC.

## Alternatives

- **Keep `>`, `>=` and `<=` as synonyms (RFC 0017).** Rejected. Each is a synonym of `<` with operands swapped or negated. Written forms cover the same cases, and `>=` has a fix.
- **Accept `>=` in the grammar as an operator that means `not (a < b)`.** Considered, and rejected for this draft. It would give `>=` and `not (a < b)` as two ways to write one comparison, against principle 1. Open question 4 says what changes if the group prefers it.
- **Keep the step budget for examples at 10,000,000 (RFC 0016).** Rejected. It gives one program two meanings, one at `check` and one at `run`. Examples use the run-time limits.
- **Count function calls toward the step limit as well.** Rejected. TR2 already bounds calls, and counting them adds a check to every call without closing a case that TR2 leaves open.
- **A step budget per loop, reset on each loop entry (RFC 0016).** Rejected. An infinite outer loop has one entry, so a per-loop counter would not stop the outer loop of a nested pair.
- **`Text` as a parameter or result, rejected by the checker with E0200.** Rejected. RFC 0014 rule 13 ties E0100 to the grammar, so a rule the grammar can express belongs in the grammar. `Text` parameters need a memory decision, which a later RFC will make.
- **Type names as one `IDENT` production, resolved by the checker.** Rejected. It moves a grammar rule to the checker and makes `let u: Unit` an E0301 instead of an E0100. The three type names stay in the grammar.
- **Examples in the grammar anywhere in the file (RFC 0016).** Rejected. The grammar now says where examples may appear (G5).
- **Unit type.** Rejected. A function with no result clause already gives nothing to bind, so a unit type adds a second way to say the same thing.
- **`!io` as the effect marker (RFC 0015).** Rejected. It needs the token `!`, which RFC 0014 removed. The keyword `io` is one token and needs no new rule.
- **`io` before the result clause.** Rejected. `: R` before `io` reads as "returns R, and has effect io", and that is the order a model reads in a signature.
- **Lexical rules restated here (RFC 0015).** Rejected. Two copies of the same rules drift apart.
- **Unspecified operand order.** Rejected. An `io` call in an operand makes the output depend on the order, so the order must be stated (E10).
- **Traps visible in the signature (principle 3).** Principle 3 says whether a function can "fail" is visible in its signature. Traps are not. Two ways to make them visible were considered. (a) A marker such as `trap` on every function that does arithmetic, division or a call. Almost every function would carry it, so it would say nothing. (b) A result type such as `Int or Trap`. Every arithmetic expression would then need a handler, and the kernel has no way to write one. This draft keeps traps out of signatures. A trap is a defined end of the run, as principle 7 requires, and the program cannot catch it. Principle 3 applies to failures the program can act on, which are the diagnostics of principle 4. Open question 3 asks the group to confirm this exception.

## Cost

Core spec: this RFC adds the grammar, rules G1 to G8, T1 to T7, E1 to E10, B1 to B5, F1 to F7, M1, P1 to P3, C1 to C3, EX1 to EX3, TR1 to TR3, A1 and the diagnostic table. The lexical rules come from RFC 0014, which is counted there. The estimate for this RFC alone is about 3,200 tokens. The tokeniser script gives the real figure, and the merge bot checks the 12,000-token limit. The checkout used for this draft has no `spec/` directory, so the script could not be run here, and the count is not measured.

Removes, measured against RFC 0018: the unary-precedence rule (E10 in RFC 0018), which the grammar's `unary` production already states, so the precedence list now carries the two examples instead. The rule's text is about 30 tokens and is removed.

Adds, measured against RFC 0018: the fix for `>=` in G8 (about 60 tokens), the three E0100 messages (about 60 tokens), and the trade-off paragraph on traps in Alternatives (not core, but the group should read it). The net core change against RFC 0018 is about +90 tokens by estimate. No further offset is proposed. If the measured core is over 12,000 tokens, the next candidate for removal is the `Text` form of `print` (P1), only if the group first accepts a standard-library RFC for text output.

Keywords: this RFC adds no keyword. `io` is a keyword under RFC 0014, which counts it.

Diagnostics: this RFC adds no code and changes the message of three E0100 positions (G8). `spec/errors.json` gets the three messages as additional templates for E0100. They are messages, not codes, so the code list does not grow.

Spec card (`spec/card.md`, not present in this checkout): one line for the grammar's shape, one line for the value types, one line for the operator table with `<` as the only ordering and the non-chaining rule, one line for `>=` as `not (a < b)` with its fix, one line for the evaluation order (E10), one line for the four traps with status 1, one line for `: R io` order, and one line for the NEWLINE rule. About 800 tokens, under the 2,000-token card limit. Not measured.

## Test plan

Conformance tests live in `conformance/kernel/`. Each run test holds one program with its expected stdout, stderr and exit status. Each compile-error test holds one program with one error, and states the one expected record as JSON, comparing `code`, `span` and `fix`, as RFC 0004 section 7 requires. Lexical tests are RFC 0014's and are not repeated here, except for the three changes below.

Unless a program defines `main` itself, its statements are inside `fn main() io { }`. Each run test prints its results with `print`.

Run tests:

- `kernel/print-int.test`: `print(0)`, `print(-7)`, `print(9223372036854775807)`. Output `0`, `-7`, `9223372036854775807`, each with LF. Covers `print` (P2), `INT`, unary `-` (E6).
- `kernel/print-text.test`: `print("a\n\"b\"\\")`. Output is the decoded text and LF. Covers `TEXT` (T3), P2.
- `kernel/let-var.test`: `let a = 1`, `var b: Int = 2`, `b = b + a`, `print(b)`. Output `3`. Covers `let_stmt` without and with a type, `var_stmt`, `assign`, `add_expr`, `type` `Int` (B1, B2).
- `kernel/let-bool.test`: `let b: Bool = 1 < 2` and `if b { print(1) }`. Output `1`. Covers `type` `Bool`, `rel_expr` with `<`.
- `kernel/bool-ops.test`: `if 1 < 2 and not false { print(1) } else { print(2) }`. Output `1`. Covers `and_expr`, `unary` with `not`, `primary` `false`, `if_stmt` with `else` (E5, C1).
- `kernel/bool-or.test`: `if false or 1 < 2 { print(1) }`. Output `1`. Covers `or_expr` and `<` inside a condition.
- `kernel/cmp-ops.test`: four `if` lines in `main`, each with a comment giving the ordering it stands for:
  - `if 1 < 2 { print(1) }` (`1 < 2`), printing `1`;
  - `if not (2 < 2) { print(2) }` (`2 >= 2`), printing `2`;
  - `if not (2 < 1) { print(3) }` (`2 >= 1`), printing `3`;
  - `if 1 < 2 { print(4) }` (`2 > 1`, written by the programmer as `1 < 2`), printing `4`.

  Output `1`, `2`, `3`, `4`. Covers `<`, and `not` applied to `<` as the written form of `>=` (E4).
- `kernel/cmp-eq.test`: `if 1 != 2 { print(3) }` and `if true == true { print(4) }`. Output `3`, `4`. Covers `eq_expr` with `!=` and `==`, and `Bool` equality (E3).
- `kernel/arith.test`: `print(7 / -2)`, `print(-7 % 3)`, `print(2 * 3 + 4 * 5)`, `print(-3 + 1)`, `print((1 + 2) * 3)`. Output `-3`, `-1`, `26`, `-2`, `9`. Covers `/`, `%`, `*`, `+`, `-`, `( expr )` (E2, E10 precedence).
- `kernel/eval-order.test`: `fn a(): Int io {`, `print(1)`, `return 1`, `}`, and `fn b(): Int io {`, `print(2)`, `return 2`, `}`, then `if a() < b() { print(3) }`. Output `1`, `2`, `3`. Covers left-to-right evaluation of a binary operator's operands (E10).
- `kernel/eval-order-not.test`: the same `a` and `b`, then `if not (b() < a()) { print(3) }`. Output `2`, `1`, `3`: `b` runs first and prints `2`, then `a` prints `1`, then `not (2 < 1)` is true. Covers the order of the written form of `>=`, and of `not` applied to `<` (E4, E10).
- `kernel/fn-call.test`: `fn add(a: Int, b: Int): Int { return a + b }`, then `print(add(2, 3))`. Output `5`. Covers `fn_decl` with `rtype`, `param`, `return_stmt` with an expression, `call`, `args` (F1, E8).
- `kernel/fn-result-io.test`: `fn sq(x: Int): Int io {` with `print(x)` and `return x * x` on the next lines, and `print(sq(3))` in `main`. Output `3`, `9`. Covers the `: R io` form (F1).
- `kernel/fn-bool-param.test`: `fn pick(b: Bool): Int {`, then `if b {`, `return 1`, `}`, `return 2`, `}` on separate lines. `main` prints `pick(true)` and `pick(false)`. Output `1`, `2`. Covers `ptype` `Bool`, `if_stmt` without `else`, `return` on its own line (T6).
- `kernel/fn-bool-result.test`: `fn pos(n: Int): Bool {`, then `return 0 < n`, then `}`. `main` has `if pos(3) { print(1) }` and `if pos(0) { print(2) }` on separate lines. Output `1`. Covers `rtype` `Bool` (F1, F4).
- `kernel/fn-io.test`: `fn say(x: Int) io { print(x) }`, and `say(4)` in `main`. Output `4`. Covers the `io` form with no result (F1, F2).
- `kernel/fn-void.test`: `fn f() { }`, and `f()` in `main`. Exit 0, no output. Covers an empty `block`, a `call` statement, and a function with no result (T5).
- `kernel/return-bare.test`: `fn stop(n: Int) io {`, then `if 0 < n {`, `return`, `}`, `print(n)`, `}`. `main` calls `stop(0)` and `stop(5)`. Output `0`. Covers bare `return` (F4), `if` without `else`.
- `kernel/fn-recursion.test`: `fn fact(n: Int): Int {`, then `if not (1 < n) {`, `return 1`, `}`, `return n * fact(n - 1)`, `}` on separate lines. `main` prints `fact(10)`. Output `3628800`. Covers recursion (F5) and `not` applied to `<`.
- `kernel/while-sum.test`: `var i = 0`, `var s = 0`, `while i < 5 {`, `i = i + 1`, `s = s + i`, `}`, `print(s)`. Output `15`. Covers `while_stmt`, `var_stmt` without a type, `assign`.
- `kernel/if-else-chain.test`: `if false { print(1) } else { print(2) }`. Output `2`. Covers `else` (G3).
- `kernel/block-layout.test`: a `main` whose block starts with a blank line, then `let a = 1`, then `if a == 1 {`, `print(a)`, `}`. Output `1`. Covers the leading `NEWLINE` and the final statement before `}` (block).
- `kernel/paren-nested.test`: `print(-((4)))`. Output `-4`. Covers `( expr )` nested inside a unary (`primary` inside `unary`).
- `kernel/example-ok.test`: `fn double(x: Int): Int { return x * 2 }`, then `example double(3) == 6` and `example not false` on the next lines, then `fn main() io { print(double(4)) }`. Output `8`. Covers `example` after a function, a second example (EX1, EX3).
- `kernel/example-call-ok.test`: `fn fact(n: Int): Int {`, `if not (1 < n) {`, `return 1`, `}`, `return n * fact(n - 1)`, `}`, then `example fact(5) == 120`, then `fn main() io { print(fact(5)) }`. Output `120`. Covers an example that calls a recursive function and passes under TR2 (EX2, EX3).
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
- `kernel/err-gt.test` (E0100): `if 2 > 1 { }`. The record has `span` start 5, end 6 (the `>`), and no `fix`. Message as in G8. G8.
- `kernel/err-ge.test` (E0100): `if 2 >= 1 { }`. The record has `span` start 5, end 7 (the `>=`). The `fix` has `span` start 3, end 9 (the bytes `2 >= 1`) and `replacement` `not (2 < 1)`. G8, E4.
- `kernel/err-le.test` (E0100): `if 1 <= 2 { }`. The record has `span` start 5, end 7 (the `<=`), and no `fix`. G8.
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
- `kernel/err-example-stack.test` (E0202): `fn f(n: Int): Bool {`, `return f(n)`, `}`, then `example f(1)` on the next line, then `fn main() io { }`. The example traps with `stack-exhausted` under TR2, so it fails at the example's span. EX3.
- `kernel/err-dup.test` (E0300): two functions named `add`. F6.
- `kernel/err-dup-main.test` (E0300): two functions named `main`. M1.
- `kernel/err-dup-param.test` (E0300): `fn f(a: Int): Int {`, then `let a = 1`, then `return a`. B4.
- `kernel/err-reserved.test` (E0300): `let print = 1` in `main`. B5.
- `kernel/err-fn-print.test` (E0300): `fn print(): Int { return 1 }`, and `fn main() io { }`. The error is at `print`. F6.
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

Required change to RFC 0014's test plan. RFC 0014 lists three run tests that this RFC makes impossible. They must be rewritten as compile-error tests, with the programs and records of the three tests above:

- `lex/tok-gt.test`: becomes a compile-error test, the program `if 2 > 1 { }`, expecting E0100 at the `>` (start 5, end 6), no `fix`.
- `lex/tok-ge.test`: becomes a compile-error test, the program `if 2 >= 1 { }`, expecting E0100 at the `>=` (start 5, end 7), with the `fix` given in `kernel/err-ge.test`.
- `lex/tok-le.test`: becomes a compile-error test, the program `if 1 <= 2 { }`, expecting E0100 at the `<=` (start 5, end 7), no `fix`.

This RFC cannot make the change, because RFC 0014 is accepted. Approval of this RFC depends on it (open question 1). The change does not alter any token, rule or code of RFC 0014: each test still shows that the lexer produces the token, because the error is at that token's span and not E0001.

Coverage. Every production of the grammar above appears in at least one run test: `program`, `fn_decl` (with and without `rtype`, with and without `io`), `param` with `ptype` `Int` and `Bool`, `example`, `block` (empty, leading NEWLINE, final statement without NEWLINE), each `stmt` alternative, `let_stmt` and `var_stmt` with and without `type`, `type` `Int`, `Bool` and `Text`, `if_stmt` with and without `else`, `while_stmt`, `return_stmt` with and without an expression, `args`, every operator in `expr` (`or`, `and`, `==`, `!=`, `<`, `+`, `-`, `*`, `/`, `%`, unary `-` and `not`), and every `primary` form (`INT`, `TEXT`, `true`, `false`, a call, a name, `( expr )`).

Code to test map. Each code in the Design tables appears in at least one compile-error test, or in a run test for traps:

- E0100: `err-compare-chain`, `err-gt`, `err-ge`, `err-le`, `err-expr-stmt`, `err-if-expr`, `err-else-newline`, `err-else-if`, `err-if-brace-line`, `err-stmt-sep`, `err-fn-nested`, `err-example-place`, `err-text-param`, `err-text-result`, `err-unknown-type`. The three messages in G8 are not compared by the runner, because RFC 0004 section 6 says tests match on `code`, `span` and `fix` only.
- E0003: `err-keyword-let`, `err-keyword-fn`.
- E0200: `err-type`, `err-cmp-type` (E4, the reason for the `true < false` case), `err-bool-op`, `err-not`, `err-print-bool`, `err-print-arity`, `err-text-op`, `err-text-arg`, `err-arity`, `err-void-value`, `err-return-value`, `err-return-bare`, `err-let-type`, `err-assign-type`, `err-example-type`, `err-main-sig`.
- E0201: `err-missing-return`.
- E0202: `err-example`, `err-example-trap`, `err-example-budget`, `err-example-stack`.
- E0300: `err-dup`, `err-dup-main`, `err-dup-param`, `err-reserved`, `err-fn-print`.
- E0301: `err-unknown`, `err-use-before`, `err-type-value`, `err-fn-value`.
- E0302: `err-main`.
- E0303: `err-assign-let`, `err-assign-param`.
- E0400: `err-effect`, `err-effect-call`, `err-effect-example`.
- E0500: `err-literal`, `err-literal-neg`.
- Traps: `trap-overflow`, `trap-min`, `trap-div`, `trap-stack`, `trap-step`.

E10 is covered by `eval-order.test` and `eval-order-not.test`, and the written forms in E4 by `cmp-ops.test`. Every other rule that produces a diagnostic or an effect has at least one test above.

## Open questions

1. **RFC 0014's three ordering-token tests must change before this RFC can be approved.** `lex/tok-gt`, `lex/tok-ge` and `lex/tok-le` are run tests in RFC 0014 and cannot pass under G8. The change is in the Test plan above: each becomes a compile-error test. The owner of RFC 0014, or the orchestrator, must amend RFC 0014 for it to land. Until then, this RFC's kernel tests are correct and the three RFC 0014 tests fail by design.
2. **Expected record format.** RFC 0004 section 7 and this draft compare `code`, `span` and `fix` from a JSON record. `CONTRACTS.md` says `expect-errors` lines read `CODE LINE` and compare `(code, line)`, and the runner in `tools/check/conformance.py` does the same. The two cannot both be right. This draft follows RFC 0004. `tools/` is owned by the architect, so the runner must change before span and fix are checked. Until then the compile-error tests here are checked for code and line only.
3. **Traps and principle 3.** This draft keeps traps out of function signatures, for the reasons in Alternatives. The group should confirm that this is an exception to principle 3, and not a reason to add a trap marker. If the group wants a marker, it is a new RFC, and every arithmetic function changes.
4. **The `>=` form.** Designer-prag asked for `a >= b` to be an accepted form as `not (a < b)`. This draft offers it as an E0100 with a fix instead, to keep one way to write the comparison (designer-min). If the group prefers the accepted form, G8 and E4 change: `rel_expr` gains `>=`, its meaning is `not (a < b)`, `lex/tok-ge` stays a run test, and `kernel/err-ge.test` becomes a run test. That reverses the principle-1 choice, and the group should decide it.
5. **Finite but very slow programs.** A recursive program can make far more calls than it has `while` steps, for example naive `fib(60)`. Every such run still ends, so it has a defined result, and TR2 and TR3 do not stop it. Only a total step limit over calls and loops would, and that costs a check per call too. This draft does not add one. Reviewers should say if principle 7 needs it.
6. **Check time for long examples.** EX3 removes the separate example budget. An example that loops, such as `err-example-budget.test`, takes up to 1000000000 loop steps in `check`. This is a cost to the author, not a change in result. The loop reset across examples (EX3) is specified but not tested, because a test would take about 10^9 steps. Reviewers may want a smaller test limit, which would be a second value of TR3.
7. **Value of the loop limit.** TR3 uses 1000000000 `while` evaluations. The value trades wall time to trap against the longest honest loop a program may run. Once accepted it is part of the contract.
8. **Precedence of `not` and `==`.** The grammar's `unary` production makes `not a == b` read as `(not a) == b`. Reviewers who want `not` to bind looser would change the `unary` production, and the precedence list and the examples in the Expressions section with it.
9. **Leading zero: RFC 0014 and RFC 0004 disagree.** RFC 0014 rule 8 gives `007` the code E0006. RFC 0004's `diag/fix-present.test` expects `007` to give E0001. This draft does not use `007`. The fix belongs in RFC 0014 or RFC 0004, not here.
10. **Limits not checked.** The core spec cap (12,000 tokens) and the card cap (2,000 tokens) could not be checked, because `spec/` is absent from this checkout. The build and the conformance run could not be done here, so the expected outputs in the run tests are hand-derived, and the byte offsets in the compile-error tests are counted by hand.
11. **Text scope.** Text has no operations in the kernel (Summary). The standard library RFC must add text inspection and output formatting before a text-processing program can be written. This is a scope decision, not a defect, but the approval of user personas depends on that RFC existing.
