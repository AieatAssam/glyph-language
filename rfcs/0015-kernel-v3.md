---
status: draft
---
# RFC draft: Kernel

Class: language
Slug: kernel-v3
Status: draft
Replaces: RFC 0013 (rejected). Depends only on accepted RFCs: RFC 0004 (diagnostic records, code blocks, trap line) and RFC 0011 (the `.gl` source extension). The lexical rules the kernel needs are restated in the Design section, so this RFC does not depend on RFC 0002, 0003, 0005 or 0012.

## Summary

The kernel is the smallest part of Glyph that runs a useful program. It has three value types: `Int` (64-bit signed), `Bool` and `Text`. A `Text` value can be bound and printed, and nothing else. `print` writes an `Int` or a `Text` value and a newline. The kernel has `let` and `var` bindings, functions with an optional result type and an optional effect marker `!io`, `if`, `while`, `return`, and `example` lines that the compiler runs during `check`. Integer overflow, division by zero and call-depth exhaustion trap with a defined message and exit status 1.

## Motivation

Every later RFC (structs, arrays, modules, the standard library) builds on this base, so the base is settled first. It must also stand alone: an implementer who has read only this file must be able to build it.

The first three drafts were rejected for conflicts with RFCs 0003 and 0012 (which are themselves rejected), for error codes that did not match RFC 0012, and for a non-termination rule that the reviewers want decided under principle 7. This draft changes the following, one per objection:

- The lexical rules are restated in Design. They are RFC 0012's rules with the `[ ]` and `.` tokens removed and the `\t` escape removed (designer-min, designer-prag, impl-1, tester).
- Lexical error codes are RFC 0012's: E0001, E0003, E0005 and E0006 (impl-1, tester).
- The effect marker is the single token `!io`. `io` is not reserved, so it is an ordinary name (impl-1, tester).
- NEWLINE follows RFC 0012: the lexer emits one after any line end outside `( )`. The parser skips the NEWLINE that follows an operator or `{`, and the one before `}` (impl-1, tester).
- The `loop-forever` conformance test is dropped, because it depends on the harness killing the process. The non-termination rule is kept, but it is now an explicit reviewer decision (Open questions 1) (tester, impl-1).

## Design

Normative. "Must" and "is" are binding on implementers. The order is: bytes, tokens, grammar, meaning, output.

### Lexical

Terms: a *character* is a Unicode scalar value. A *span* is a byte range, as RFC 0004 section 2 defines it. Each error is reported at the span given in the table at the end of this part.

L1. **Encoding.** A source file is a byte sequence that must be valid UTF-8. Invalid UTF-8 is E0001 at the first invalid byte. A byte order mark is E0001 wherever it appears.

L2. **Forbidden control characters.** The control characters U+0000 to U+001F and U+007F are E0001 wherever they appear, including in comments and text literals. The exceptions are LF, and the CR of a CR LF pair (L3). Tab (U+0009) is one of the forbidden characters, so a tab anywhere is E0001.

L3. **Line ends.** A line end is LF, or CR LF taken as one line end. A CR that is not followed by LF is E0001 at that CR.

L4. **Whitespace.** Space (U+0020) and line ends separate tokens. They produce no token, except for the NEWLINE of L14.

L5. **Comments.** Outside a text literal, `//` starts a comment. It runs up to, not including, the next line end. There is no block comment. A comment produces no token.

L6. **Identifiers.** An identifier is one ASCII letter or `_`, followed by zero or more ASCII letters, digits or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal or a comment is E0001 at that character.

L7. **Keywords.** These thirteen words are keywords, all lowercase: `fn let var if else while return true false and or not example`. A keyword lexes as its own token kind, never as an identifier. A keyword in a position that needs a name is E0003, reported by the parser at the keyword's span. The words `io`, `Int`, `Bool`, `Text` and `print` are not keywords. They lex as identifiers.

L8. **Integer literals.** A decimal integer is `0`, or a digit from `1` to `9` followed by zero or more digits from `0` to `9`. A digit sequence with a leading zero, such as `007`, is E0006 at the literal. Underscores and signs are not part of a literal; a leading `-` is the unary operator. The range of the value is checked by T1, not by the lexer.

L9. **Text literals.** A text literal starts at `"` and ends at the next `"`. Between the quotes are:
    - any valid UTF-8 character except `"`, `\`, and the forbidden characters of L2 (each is E0001); and
    - the escapes `\n` (LF), `\"` (quote) and `\\` (backslash).

    Any other `\` sequence is E0005 at the backslash and the character after it. A line end, or the end of the file, before the closing quote is E0005 at the span from the opening quote to the end of that line, or to the end of the file. The value of the token is the decoded UTF-8 bytes. There is no other text form.

L10. **Punctuation.** The tokens are exactly: `( ) { } , : = -> ! + - * / % == != < <= > >=`. At each position the lexer takes the longest listed token that starts there. So `==`, `!=` and `<=` are one token each, and `=>` is two tokens (`=` then `>`).

L11. **Effect marker.** When `!` is followed by `io`, and the character after `io` is not an ASCII letter, digit or `_` (or the file ends there), the lexer emits the single token `!io`. Otherwise `!` is handled by L10. So `!ion` is the token `!` followed by the identifier `ion`.

L12. **Other characters.** A printable ASCII character that L5 to L11 do not cover is E0001 at that character. This includes `;`, `[`, `]`, `.`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` `` and `\` outside a text literal.

L13. **Token kinds.** Each token has exactly one kind. Each keyword, each punctuation token and `!io` has its own kind. The other kinds are IDENT, INT, TEXT, NEWLINE and EOF.

L14. **NEWLINE.** A line end emits one NEWLINE token, with the line end's span, if all three of these hold:
    - the parenthesis depth is zero, where `(` adds one and `)` subtracts one, and the depth never goes below zero (a `)` at depth zero is reported by the parser);
    - at least one token has already been emitted in this file; and
    - the last token emitted is not NEWLINE.

    A line end inside `( )` emits nothing. Blank lines produce at most one NEWLINE, and no NEWLINE comes before the first token.

L15. **End of file.** The last line is ended as if a line end were there, under L14. Then the lexer emits one EOF token. A file that ends inside `( )` gets no NEWLINE from that end, and the parser reports the open group as E0100.

L16. **Errors and lookahead.** The lexer reports the first lexical error and emits no token after it. It uses at most four characters of lookahead, for L11.

Lexical error table. The codes are those RFC 0004 section 4 places in the lexical block.

| Code | Meaning | Span | Rules |
| --- | --- | --- | --- |
| E0001 | Invalid or forbidden character: invalid UTF-8, byte order mark, control character (tab included), lone CR, non-ASCII outside text and comments, printable ASCII outside the token set | The character or byte | L1, L2, L3, L6, L9, L12 |
| E0003 | Keyword used where a name is required. Reported by the parser. | The keyword | L7 |
| E0005 | Malformed text literal: unknown escape, or a line end or end of file before the closing quote | See L9 | L9 |
| E0006 | Integer literal with a leading zero | The literal | L8 |

### Grammar

Normative. Terminals are in quotes. `IDENT`, `INT`, `TEXT`, `NEWLINE` and `EOF` are token kinds. A token the grammar does not accept at a point is a syntax error, E0100. The words `Int`, `Bool` and `Text` are `IDENT` tokens; they are types only in type positions (T7).

```
program     = { NEWLINE | fn_decl | example } EOF
fn_decl     = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" type ] [ "!io" ] block
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

The rules that go with the grammar:

G1. **Statements and items end at a line end.** A `stmt` is followed by NEWLINE or by `}`. An `fn_decl` or an `example` is followed by NEWLINE or by EOF. Any other next token is E0100. So two statements on one line need a NEWLINE between them, unless the second is the last one before `}`.

G2. **NEWLINE that the parser skips.** The parser skips a NEWLINE that directly follows any of these tokens: `=`, `not`, `and`, `or`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `%`, `{`. It also skips a NEWLINE that directly precedes `}`. Every other NEWLINE ends a statement or an item. This is the only way an expression spans lines, apart from parentheses.

G3. **Blocks.** A block's `{` is on the same line as the construct it opens. A NEWLINE between `)` or a result type and `{`, or between `if`, `while` and their condition and `{`, is E0100.

G4. **`else`.** `else` must follow the `}` of the `if` block on the same line. If a NEWLINE ends that `if` statement, a later `else` is E0100. `else` is followed by a block only; `else if` is E0100. The canonical layout is `} else {`.

G5. **Expression statements.** A statement that is an expression other than a call is E0100.

G6. **Placement.** `fn` is allowed only at the top level, so a function inside a block is E0100. An `example` is allowed only at the top level, directly after a function or after another example (G1 allows blank lines between them). Anywhere else it is E0100.

G7. **Comparisons do not chain.** `a < b < c` and `a == b == c` are E0100, by the grammar. Write `a < b and b < c`, or use parentheses.

### Types

T1. **Int.** A signed 64-bit two's complement integer. An integer literal above `9223372036854775807` is E0500 wherever it appears, including after unary `-`. The minimum `Int` is written `-9223372036854775807 - 1`.

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

E4. `<`, `<=`, `>`, `>=` take `Int` operands only.

E5. `and` and `or` take `Bool` operands and short-circuit. `not` takes a `Bool`. A non-`Bool` operand is E0200.

E6. Operands are evaluated left to right.

E7. The condition of `if` and `while` is `Bool`. Otherwise E0200.

E8. A call's type is its function's result type. A call to a function with no result clause has no type (T5).

E9. A call's argument count and argument types must match the parameters. A mismatch is E0200.

### Bindings and scope

B1. `let NAME = expr` and `let NAME: T = expr` introduce an immutable binding. `var NAME = expr` and `var NAME: T = expr` introduce a mutable one. If `: T` is written, `expr` must have type `T`. Otherwise the binding has the type of `expr`. A mismatch is E0200.

B2. `NAME = expr` assigns to a `var`. Assigning to a `let` binding or to a parameter is E0303. Assigning to an unknown name is E0301. A type mismatch is E0200.

B3. A binding is visible from its declaration to the end of its enclosing block. A use before the declaration is E0301.

B4. The parameters of a function are in the scope of its body block. Declaring a name that is already declared in the same block, including a parameter, is E0300.

B5. An inner block may declare a name that an outer block declares. A `let`, `var` or parameter may not take the name of a function in the file, or the names `print`, `Int`, `Bool` or `Text`. Doing so is E0300.

### Functions

F1. Form:

```
fn name(p1: T1, p2: T2): R !io {
    return expr
}
```

The result clause `: R` and the effect marker `!io` are each optional. When both appear, `: R` comes first and `!io` follows it. When there is no result clause, `!io` follows the `)`. There is no other order.

F2. A function without `!io` may not call a function with `!io`, and may not call `print`. Either is E0400. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns when one of its statements is `return`, or when it is an `if` with an `else` whose two blocks both return. A function with a result clause whose body does not return is E0201 at the closing brace of the body.

F4. `return expr` needs a result clause and an expression of that type. A bare `return` is allowed only in a function with no result clause. Either mismatch is E0200.

F5. Recursion is allowed. Termination is not checked (NT1).

F6. Function names are unique in the file. A duplicate is E0300. Functions are visible throughout the file, and declaration order does not matter. A function name used without a call is E0100.

F7. Parameters are `Int` or `Bool` (T6). Functions cannot be nested (G6).

### Entry point

M1. A program has exactly one function `main`. It has no parameters and no result clause. It may have `!io`. A missing `main` is E0302. A second `main` is E0300. A `main` with a parameter or a result clause is E0200.

### Built-in print

P1. `print` is a built-in function with two forms, `print(x: Int) !io` and `print(x: Text) !io`. The compiler chooses by the type of the argument. Any other argument, including a `Bool`, is E0200. A call with other than one argument is E0200. A program that declares its own `print` gets E0300 (B5).

P2. `print` writes its value and then one LF:
    - an `Int` is written in decimal, with a leading `-` if it is negative, and with no leading zeros and no plus sign. Zero is written as `0`;
    - a `Text` value is written as its UTF-8 bytes after escapes are applied, without the quotes.

P3. Output goes to standard output through WASI `fd_write`. Each `print` finishes writing before the next statement runs.

### Conditionals and loops

C1. `if cond block` and `if cond block else block`. The `else` part is a block only (G4).

C2. `if` and `while` are statements only. Using either where a value is expected is E0100, because `expr` has no production for them.

C3. `while cond block` repeats while `cond` is true. There is no `break` and no `continue`. Early exit uses `return`.

### Examples

EX1. An example is a line that starts with `example`, followed by one expression. It must follow the closing brace of a function, or another example that does (G6). It belongs to the function before it. The expression must be `Bool` (EX2).

EX2. An example may call only functions without `!io`. A non-`Bool` example is E0200. Calling a function with `!io` or `print` in an example is E0400.

EX3. `glyphc check` evaluates each example with the same semantics as at run time, including the call-depth limit. One step is one function entry, or one evaluation of a `while` condition. An example that evaluates to `false`, traps, or takes more than 10,000,000 steps fails with E0202 at the example's span.

### Non-termination

NT1. A program that never finishes has one defined result. It never finishes. It has no trap and no exit status. Its output is exactly the bytes its `print` calls wrote before it stopped. The kernel has no run-time step limit. This is a reviewer decision under principle 7 (Open questions 1).

### Traps

TR1. A trap is a defined outcome, not a diagnostic. When a program traps, the runtime writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no code.

| Kind | Cause |
| --- | --- |
| `overflow` | `Int` arithmetic does not fit in 64 bits (E1, E2) |
| `divide-by-zero` | `/` or `%` with a zero divisor (E2) |
| `stack-exhausted` | call depth exceeds 10000 |

TR2. The compiler inserts a depth check at each function entry. The limit is a fixed compile-time constant, so the result does not depend on the host.

### Stable addresses

A1. Each declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path as given on the command line, for example `main.gl::add`. Each example is addressed as `<file>::<name>#<n>`, where `<file>` and `<name>` are the function's, and `<n>` counts from 1 in source order among that function's examples.

### Compile-time diagnostics

Each diagnostic is a record in the form of RFC 0004 section 2. The lexical codes are in the table in Lexical. The other codes below are new in this RFC, and each is added to `spec/errors.json` by the first PR that emits it, as RFC 0004 section 4 requires.

| Code | Block | Meaning |
| --- | --- | --- |
| E0100 | syntax | Syntax error: a token the grammar does not accept, a chained comparison, `else` on a new line, `if` or `while` as a value, a function name as a value, a nested `fn`, a misplaced `example`, an expression statement, or a `->` or `!` token that no production accepts |
| E0200 | types | Type mismatch: operand, condition, binding, assignment, return, argument, example or `print` argument; `Text` outside T3; `Text` as a parameter or result type; a call to a function with no result used as a value; `main` with a parameter or result |
| E0201 | types | A function with a result clause may reach its closing brace without returning |
| E0202 | types | An example is false, traps, or takes more than 10,000,000 steps at compile time |
| E0300 | name | Duplicate declaration in one scope; a second `main`; a binding, parameter or function that takes a reserved name (B5) |
| E0301 | name | Unknown name: a value, a function, or a type; a use before declaration |
| E0302 | name | No `main` function |
| E0303 | name | Assignment to a `let` binding or to a parameter |
| E0400 | effects | Effect not declared: a call to an `!io` function, or to `print`, from a function without `!io` or from an example |
| E0500 | limits | Integer literal above `9223372036854775807` |

The codes in this RFC are new. The codes used by accepted RFCs are E0001 to E0006 (RFC 0004 and RFC 0011, lexical) and E0010 (RFC 0011). This RFC uses none of E0010. E0001 and E0003 were also used by the superseded RFC 0001 with the same meaning. No catalogue entry exists for them, so the orchestrator should confirm that this is not a reuse.

### Memory

The kernel adds no heap values. The bytes of `Text` literals are read-only module data. `Int` and `Bool` values live on the WebAssembly stack or in locals. No allocator is needed here. The bump allocator and arenas from the designer guidance belong to a later RFC that adds heap values.

### Build and tools

- `glyphc check` reports diagnostics as JSON Lines on standard error (RFC 0004), and runs the examples.
- `glyphc run` checks, builds and executes `main`.
- `glyphc build -o out.wasm` writes a WebAssembly core module. Its imports are only the WASI preview 1 functions `fd_write` and `proc_exit`.
- The same source and compiler give byte-identical output.

## Alternatives

- **Wrapping integer arithmetic.** Rejected. It hides the bugs that the purpose clause asks the compiler to catch. A trap is defined too, and needs one rule rather than a choice per operator.
- **Dynamic typing, or unchecked `Text` operations.** Rejected by the static typing requirement.
- **`if` or `while` as expressions.** Rejected. It would give two ways to produce a value, `if` and `return`.
- **Implicit return of the last expression.** Rejected. It is a second way to return, and a block's value would depend on a trailing expression.
- **`loop` with `break`.** Rejected. `while` with `return` covers the same cases with fewer keywords.
- **`->` for the result type and `!` for the effect.** Rejected. `:` is the result-type marker, and `!io` is one token (L11).
- **`io` as a reserved word (RFC 0013 draft).** Rejected. RFC 0012 makes `!io` one token, so `io` needs no reserved status. Keeping it a name lets programs use `io` as an identifier.
- **Block comments, semicolons, brackets that suppress NEWLINE, a `\t` escape.** Rejected. Each would add a second way to do something the kernel already does (L5, G1, L12, L9).
- **A `Bool` form of `print`.** Rejected for the kernel. `Int` and `Text` cover the first programs. `Bool` output can be written as `if` with two `print` calls of `Text` literals.
- **Effect-polymorphic functions.** Rejected. `!io` is a plain marker, so local reasoning holds.
- **A run-time step limit for non-terminating loops.** Not chosen in this draft. See Open questions 1. Examples do get a compile-time step budget (EX3).
- **`else` on a new line.** Rejected. It would be a second layout for the same statement, so it is E0100 (G4).

## Cost

Core spec: the sections above, about 4,000 tokens by estimate. This is not measured. The tokeniser script gives the real figure, and the merge bot checks the 12,000-token limit. No `spec/` directory exists in this checkout, so the figure could not be checked here.

Removes, compared with RFC 0013: the reserved word `io`, the `\t` escape, the lexed-but-unused `[ ]` and `.` tokens, and the statement-end NEWLINE rule of RFC 0013, which is replaced by the lexer rule of L14 and the parser rule of G2. Nothing is removed from the spec itself, because the spec is empty. The kernel is the base, so there is no earlier text to save.

Spec card (`spec/card.md`, not present in this checkout): adds the grammar on one screen, the thirteen keywords, the token set and `!io` in one line each, the value types, the operator table with its non-chaining rule, the trap table with status 1, the rule that `: R` comes before `!io`, and the NEWLINE rule in one line. It omits the diagnostic table and the examples section. Estimate: about 700 tokens, under the 2,000-token card limit. Not measured.

## Test plan

Conformance tests live in `conformance/lex/` (lexical) and `conformance/kernel/` (kernel). Each run test holds one program with its expected stdout, stderr and exit status. Each compile-error test lists the expected records as JSON, comparing `code`, `span` and `fix`, as RFC 0004 section 7 requires. Every grammar production above is exercised by at least one test below.

Run tests, lexical:

- `lex/ws-crlf.test`: a program with CRLF line ends prints the same output as its LF form.
- `lex/comment-line.test`: a `//` comment ends at the line end; a `//` inside a text literal is text.
- `lex/newline-in-group.test`: a call whose arguments span two lines, with no NEWLINE inside `( )`.
- `lex/newline-blank.test`: blank lines, and blank lines at the start of the file, give no extra NEWLINE.
- `lex/text-escape.test`: `\n`, `\"` and `\\` produce the expected bytes.
- `lex/effect-token.test`: `fn main() !io {` lexes `!io` as one token, and the program runs.
- `lex/ident-io.test`: `let io = 1` and `print(io)` run, printing `1`. This shows `io` is a name.
- `lex/punct-<token>.test`: one run test for each of the 18 tokens the kernel uses: `(`, `)`, `{`, `}`, `,`, `:`, `=`, `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `<=`, `>`, `>=`.

Compile-error tests, lexical:

- `lex/bad-utf8.test` (E0001): an invalid UTF-8 byte.
- `lex/bom.test` (E0001): a byte order mark at the start of the file.
- `lex/cr-alone.test` (E0001): a CR not followed by LF.
- `lex/tab.test` (E0001): three files, a tab in code, a tab in a comment, and a tab in a text literal.
- `lex/ident-ascii.test` (E0001): a non-ASCII letter in an identifier.
- `lex/punct-semicolon.test` (E0001): `;`.
- `lex/punct-bracket.test` (E0001): `[` and `.`, one per file.
- `lex/ident-keyword.test` (E0003): `let let = 1` gives E0003 at the first `let`.
- `lex/text-bad-escape.test` (E0005): `\t` and `\q`, one per file.
- `lex/text-unterminated.test` (E0005): a text literal that ends at a line end.
- `lex/int-leading-zero.test` (E0006): `007`.
- `lex/punct-arrow.test` (E0100): `->` where an expression is expected.
- `lex/bang-alone.test` (E0100): `let x = !true`.

Run tests, kernel:

- `kernel/int-arith.test`: `+ - * / %`, truncation toward zero, the sign of `%`, `MIN % -1` is `0`, `-9223372036854775807 - 1`, and unary `-`.
- `kernel/int-compare.test`: `< <= > >= == !=` on `Int`.
- `kernel/bool-ops.test`: `and`, `or`, `not`, and short-circuit order. The right operand is a call to a `!io` function that prints, so the order shows in the output.
- `kernel/bind-let-var.test`: `let`, `var`, `let x: Int = ...`, assignment, and shadowing in an inner block.
- `kernel/text-bind.test`: `let s = "a"`, `var t: Text = "b"`, `t = s`, and `print` of each.
- `kernel/fn-call.test`: parameters, result clauses, recursion (factorial of 10 is `3628800`), and a `!io` function called from a `!io` function.
- `kernel/if-while.test`: `if`, `} else {` on one line, `while`, and `return` from inside a loop.
- `kernel/stmt-newline.test`: a binary operator at a line end continues the expression; a `{` followed by a line end; a `}` followed by a line end.
- `kernel/print.test`: `print` of a negative, zero and positive `Int`; `print` of a `Text` with `\"` and `\\`; one newline after each call.
- `kernel/examples.test`: a program whose examples all hold builds, runs, and prints nothing extra.
- `kernel/trap-overflow.test`: `4611686018427387904 * 2` writes `trap: overflow` to stderr and exits with status 1.
- `kernel/trap-div.test`: `divide-by-zero`, and `MIN / -1` (overflow).
- `kernel/trap-stack.test`: unbounded recursion writes `trap: stack-exhausted` and exits with status 1.

Compile-error tests, kernel:

- `kernel/err-syntax.test` (E0100): `1 < 2 < 3`; `let x = if true {`; a bare expression statement `1 + 2`.
- `kernel/err-else-newline.test` (E0100): `else` on the line after `}`.
- `kernel/err-fn-value.test` (E0100): `let f = add` where `add` is a function; a `fn` inside a block.
- `kernel/err-example-place.test` (E0100): an `example` at the start of the file, before any function.
- `kernel/err-type.test` (E0200): `if 1 { }`.
- `kernel/err-print-bool.test` (E0200): `print(true)`.
- `kernel/err-text-op.test` (E0200): `"a" == "b"`.
- `kernel/err-text-param.test` (E0200): a function with a `Text` parameter.
- `kernel/err-arity.test` (E0200): `add(1)` for a two-parameter `add`.
- `kernel/err-void-value.test` (E0200): `let x = f()` where `f` has no result clause.
- `kernel/err-return.test` (E0200): a bare `return` in a function with a result, and `return 1` in one without.
- `kernel/err-example-type.test` (E0200): an example that is an `Int`.
- `kernel/err-missing-return.test` (E0201): a result function whose last statement is an `if` without `else`.
- `kernel/err-example.test` (E0202): an example that is false.
- `kernel/err-example-budget.test` (E0202): an example that calls a function with `while true { }`, which exceeds the budget.
- `kernel/err-dup.test` (E0300): two functions named `add`; a parameter redeclared in the body; a `let` named like a function.
- `kernel/err-unknown.test` (E0301): an undeclared name; a use before declaration; the type `Unit`; `Int` used as a value.
- `kernel/err-main.test` (E0302): a file with no `main`.
- `kernel/err-main-sig.test` (E0200): `main` with a parameter.
- `kernel/err-assign.test` (E0303): assignment to a `let` binding and to a parameter.
- `kernel/err-effect.test` (E0400): a function without `!io` calls `print`; a function without `!io` calls a `!io` function; an example calls a `!io` function.
- `kernel/err-literal.test` (E0500): `9223372036854775808`, and `-9223372036854775808`.

The `loop-forever` test from RFC 0013 is dropped. A program that never finishes cannot be a stable test, because the result depends on the harness stopping it (NT1).

## Open questions

1. **Non-termination and principle 7. Reviewer decision.** This draft keeps the rule that a program that never finishes has the result "never finishes", with no trap and no status (NT1). Principle 7 requires every program to have exactly one defined result "including on ... exhaustion". Reviewers must decide whether a program that never finishes counts as exhaustion. Option A, this draft: the result is "never finishes". It costs nothing at run time and needs no test. Option B: a run-time step-budget trap, for example `step-budget`, with a counter at each function entry and each loop back-edge. It costs run time and code size, needs a trap row, and needs a test with a fixed budget. Option B is the stricter reading of principle 7, because a silent hang looks the same to a model as a slow program. The draft text follows Option A so that the rest of the RFC is consistent. If the reviewers choose Option B, NT1, TR1, the trap table and the test plan change.
2. **Unused tokens `->` and `!`.** RFC 0012's token set includes these. No kernel production accepts them, so they are lexed and then rejected as E0100. Principles 1 and 8 would favour removing them, and then they would be E0001 under L12. They are kept here so the token set matches RFC 0012, which the reviewers have read. A later RFC can remove them.
3. **CR LF.** RFC 0005 says line ends are LF. This draft takes CR LF as one line end, as RFC 0012 does. If the reviewers prefer LF only, L3's CR clause and `lex/ws-crlf.test` are deleted.
4. **Stack depth.** Is 10000 the right limit, or should it depend on frame size? A fixed count is simpler and deterministic.
5. **Example step budget.** 10,000,000 steps is fixed so that a compile takes well under a second on the reference machine. A different value changes which examples pass, so it is part of the contract once accepted.
6. **Blocks of two codes.** E0003 is reported by the parser, but it sits in the lexical block because RFC 0004's record test expects it there. E0202 sits in the types block because an example is a checked `Bool` expression. If RFC 0004 gains a block for examples, E0202 moves before it is emitted. No code is reused either way.
7. **RFC 0012 and this RFC.** Lexical rules L1 to L16 are RFC 0012's, with the changes listed under Motivation. If RFC 0012 is revived, its lexical text and this RFC's Design must be merged into one copy. The merge bot must not accept both.
8. **Text in functions and in equality.** Parameters, results and `==` on `Text` are not in the kernel (T3, T6, E3). A later standard-library RFC can add text operations and `Text` parameters together.
