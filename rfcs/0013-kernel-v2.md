# RFC draft: Kernel

Class: language
Slug: kernel-v2
Status: draft
Replaces: RFC 0005 (rejected). Depends on RFC 0003 (lexical rules), RFC 0004 (diagnostic records, blocks, trap exit status).

## Summary

The kernel is the smallest part of Glyph that can run a useful program. It has three value types: `Int` (64-bit signed), `Bool`, and `Text`. A `Text` value is a literal or a binding of one, and it can only be printed. `print` writes an `Int` or a `Text` value and a newline. `Bool` cannot be printed in the kernel. The kernel has immutable and mutable bindings, functions, `if`, `while`, `return`, and `example` declarations that the compiler checks. Every function states whether it performs I/O with the marker `io`. Integer overflow, division by zero and stack exhaustion trap with a defined message and exit status 1. Nothing is left undefined.

## Motivation

Every later RFC (structs, arrays, modules, the standard library) builds on this base, so the base has to be settled first. The purpose clause asks for few errors and tokens per program. A kernel with one way to write each construct is the cheapest thing a model can learn and repair. The explicit-effects and no-undefined-behaviour principles apply from the first program, so they are set here, not added later.

The first draft was rejected for four groups of reasons: it did not say how a statement ends; its lexical rules, error codes, trap status and file extension did not agree with RFCs 0002, 0003 and 0004; its non-termination rule did not give one defined result; and it did not show how an `Int` reaches output. This draft fixes each of these. Section by section, the changes are listed in the Alternatives and Open questions sections.

## Design

Normative. "Must" and "is" are binding on implementers.

### Lexical

1. The lexical rules are those of RFC 0003, sections 1 to 12, without change, except for the reserved words in (2). Source files end in `.gl` (RFC 0002).
2. Reserved words are exactly: `fn let var if else while return true false and or not example io`. This replaces the list in RFC 0003 section 7. The three words `var`, `example` and `io` are new. No other word is reserved.
3. The punctuation set is exactly the set in RFC 0003 section 10. The kernel uses `( ) { } , : = == != < <= > >= + - * / %`. The tokens `[ ] .` are lexed but have no kernel production, so any use is E0100.
4. An integer literal is a decimal digit string with no sign and no leading zero, from `0` to `9223372036854775807` inclusive. A literal above that range is E0500, including one written directly after unary `-`. The minimum `Int` is therefore written as `-9223372036854775807 - 1`.
5. Text literal escapes are those of RFC 0003 section 9: `\n`, `\t`, `\"`, `\\`.

### Statements and blocks

1. A NEWLINE token ends a statement. It is emitted (RFC 0003 section 6) after a token that can end a statement: an identifier, an integer literal, a text literal, `true`, `false`, `)`, `}` or `return`. No NEWLINE is emitted inside `( )` or `[ ]`.
2. A line may therefore end with a binary operator or a comma, and the expression continues on the next line. This is the only way an expression spans lines.
3. A block is `{`, zero or more statements, and `}`. `}` closes a block.
4. After a `}` that ends an `if` statement, `else` must be on the same line as that `}`. Writing `else` on a later line is E0100. The one canonical layout is `} else {`.
5. A statement is one of: a binding, an assignment, a call, `if`, `while`, `return`. A statement that is an expression other than a call is E0100.

### Types

- `Int`: signed 64-bit two's complement.
- `Bool`: `true` or `false`.
- `Text`: an immutable sequence of UTF-8 bytes. A `Text` value exists only as a literal or as a binding of one. There is no operation on `Text` in the kernel except `print`, and no equality or length.
- A type name other than `Int`, `Bool` or `Text` is E0301 (unknown name).
- `Text` cannot be a parameter type or a result type. Using it there is E0200.
- There is no `Unit`. A function with no result type returns nothing, and a call to it is a statement only. Using a call of such a function as a value is E0200.
- Parameter types and result types are always written. A local `let` or `var` may omit its type; it then has the type of its initialiser.
- No implicit conversion exists between any two types.

### Expressions

Precedence from loosest to tightest:

1. `or`
2. `and`
3. `==` `!=`
4. `<` `<=` `>` `>=`
5. `+` `-`
6. `*` `/` `%`
7. unary `-` and `not`
8. call, literal, name, parenthesised expression

Binary operators are left-associative, except that comparisons do not chain. `a < b < c` is E0100 and must be written with `and` or parentheses.

Semantics:

- `+`, `-`, `*` on `Int` give the exact result when it fits in 64 bits. Otherwise they trap with `overflow`. Unary `-` on the minimum `Int` traps with `overflow`.
- `/` and `%` on `Int` truncate toward zero; the sign of `%` follows the dividend. A zero divisor traps with `divide-by-zero`. `MIN / -1` traps with `overflow`.
- `==` and `!=` take two `Int` operands or two `Bool` operands. Both operands must have the same type; otherwise E0200.
- `<`, `<=`, `>`, `>=` take `Int` only.
- `and` and `or` short-circuit. `not` is logical negation. All of them take `Bool`.
- Operands are evaluated left to right.
- `if` and `while` take a `Bool` condition; otherwise E0200.

### Bindings

- `let name = expr` or `let name: Type = expr` introduces an immutable binding.
- `var name = expr` introduces a mutable binding. `name = expr` assigns to it.
- Assigning to a `let` binding or to a parameter is E0303. Assigning to an unknown name is E0301.
- A binding is visible from its declaration to the end of its enclosing block. Use before declaration is E0301.
- Parameters belong to the block scope of the function body. Declaring a name that is already declared in the same block, including a parameter name, is E0300.
- An inner block may shadow a name of an outer block, except that a binding may not take the name of a function declared in the file (E0300).

### Functions

```
fn name(p1: T1, p2: T2): R io {
    ...
    return expr
}
```

- The result clause `: R` and the effect marker `io` are each optional. When both appear, `: R` comes first, and `io` is on the same line as the `)` or the result type. When no result clause is written, `io` follows the `)`.
- Parameter and result types are `Int` or `Bool`.
- A function without `io` cannot make a direct call to a function with `io`. Violations are E0400.
- A function with `: R` must return on every path. A path that reaches the closing brace is E0201.
- `return expr` requires a result clause and an expression of type `R`. A bare `return` is allowed only in a function with no result clause. Either mismatch is E0200.
- Recursion is allowed. The kernel does not check termination.
- Function names are unique in the file (E0300). Functions are visible throughout the file; declaration order does not matter.
- Functions cannot be nested, and a function name used without a call is E0100.

### Conditionals and loops

- `if cond { ... }` and `if cond { ... } else { ... }`. The `else` part is a block only. To chain, nest an `if` inside the `else` block.
- `if` is a statement only. Using it where a value is expected is E0100.
- `while cond { ... }` repeats while `cond` is true. There is no `break` or `continue`; early exit uses `return`.
- A `while` loop that never ends is a defined outcome: the program never finishes. It writes no status, produces no trap, and its output is exactly the bytes its `print` calls wrote before the loop was entered and while it ran. The compiler does not promise to detect it. This is not undefined behaviour, because the outcome is fixed by the program text, the input and the rules here. A step budget at run time would cost a counter on every loop and would turn a halting question into a trap the author did not write. Examples have a separate, compile-time budget (see Examples).

### Text output

`print` is a built-in name with exactly two signatures: `print(x: Int) io` and `print(x: Text) io`. The compiler chooses the one whose parameter type matches the argument. Any other argument type, including `Bool`, is E0200. A program that declares its own `print` gets E0300.

`print` writes its value followed by a newline (LF):

- An `Int` is written in decimal, with a leading `-` if negative, and no leading zeros or plus sign. Zero is written as `0`.
- A `Text` value is written as the UTF-8 bytes of the text after escapes are applied, without the quotes.

Output goes to standard output through WASI `fd_write`. Each `print` call writes its bytes before the next statement runs.

### Entry point

A program has exactly one function `main` with no parameters and no result clause. It may have `io`. A missing `main` is E0302. A second `main` is E0300.

### Examples

- An example is a line that starts with the keyword `example`, followed by one `Bool` expression. It must follow the closing brace of the function declaration it belongs to, or another example of that function. An example anywhere else is E0100.
- An example may call only functions without `io`. Calling `print` or any `io` function in an example is E0400. An example that is not `Bool` is E0200.
- The compiler evaluates each example during `glyphc check`, with the same semantics as at run time, including the call-depth limit. Each function entry and each evaluation of a `while` condition counts as one step. An example that is `false`, traps, or exceeds 10,000,000 steps fails with E0202 at the example's span.

### Stable addresses

Each declaration is addressed as `<file>::<name>`, where `<file>` is the repo-relative path as given on the command line, for example `main.gl::add`. Each example is addressed as `<file>::<name>#<n>`, where `<n>` counts from 1 in source order.

### Traps (runtime)

A trap is a defined outcome, not a diagnostic. When a program traps, the runtime writes one line `trap: <kind>` to standard error and exits with status 1 through WASI `proc_exit`, as RFC 0004 section 5 requires. Traps carry no diagnostic code. The kinds are:

| Kind | Cause |
| --- | --- |
| `overflow` | `Int` arithmetic does not fit in 64 bits |
| `divide-by-zero` | `/` or `%` with a zero divisor |
| `stack-exhausted` | call depth exceeds 10000 |

The compiler inserts a depth check at each function entry. The limit is a fixed compile-time constant, so the result does not depend on the host.

### Compile-time diagnostics

Each diagnostic is a record in the form of RFC 0004 section 2. Codes sit in the blocks of RFC 0004 section 4. E0001 and E0003 are already defined by RFC 0003 and are used here unchanged. The other codes are new in this RFC, and each is added to `spec/errors.json` by the first PR that emits it.

| Code | Block | Meaning |
| --- | --- | --- |
| E0001 | lexical | Lexical error, as in RFC 0003 (bad escape, leading zero, BOM, non-ASCII identifier, unknown character) |
| E0003 | lexical | Reserved word used as a name |
| E0100 | syntax | Syntax error: unexpected token, chained comparison, `else` on a new line, function as a value, `if` as a value, misplaced `example`, unused punctuation token |
| E0200 | types | Type mismatch: operands, condition, return value, example type, `print` argument, `Text` as parameter or result type |
| E0201 | types | Function with a result clause may reach its closing brace without returning |
| E0202 | types | Example is false, traps, or exceeds the step budget at compile time |
| E0300 | name | Duplicate declaration in one scope: function name, `main`, parameter, or binding that shares a function name or `print` |
| E0301 | name | Unknown name: a value name, a function name, or a type name |
| E0302 | name | No `main` function |
| E0303 | name | Assignment to a `let` binding or to a parameter |
| E0400 | effects | Effect not declared: a call to an `io` function from a function without `io`, or from an example |
| E0500 | limits | Integer literal out of range |

E0202 sits in the types block because an example is a typed `Bool` expression checked by the compiler. RFC 0004 gives no better block for it.

### Memory

The kernel adds no heap values. `Text` literals live in read-only module data. `Int` and `Bool` are values on the WebAssembly stack or in locals. No allocator is needed here. The bump allocator and arenas from the designer guidance belong to later RFCs that add heap values.

### Build and tools

- `glyphc check` reports diagnostics as JSON Lines on standard error (RFC 0004 section 1) and runs examples.
- `glyphc run` checks, builds and executes `main`.
- `glyphc build -o out.wasm` produces a WebAssembly core module whose imports are only WASI preview 1 functions (`fd_write`, `proc_exit`).
- Output is byte-identical for identical source and compiler.

## Alternatives

- **Wrapping integer arithmetic.** Rejected. Wrap-around is defined, but it hides the bugs the purpose clause wants caught. A trap is also defined and needs one rule rather than a choice per operator.
- **Dynamic typing or unchecked `Text` operations.** Rejected by the static typing constraint.
- **`if` as an expression.** Rejected: it would give two ways to produce a value (`if` and `return`).
- **Implicit return of the last expression.** Rejected: two ways to return, and a block's value would depend on a trailing expression.
- **`loop` with `break`.** Rejected for the kernel. `while` with `return` covers the same cases with fewer keywords.
- **`->` for the result type and `!` for effects.** Rejected: RFC 0003 forbids `->` and `!` as tokens. `:` for the result type is the form RFC 0003 section 10 already anticipates, and `io` is a word.
- **A `Bool` form of `print`, or `print` on every type.** Rejected for the kernel. `Int` and `Text` cover the needs of the first programs. `Bool` output can be written as `if` with two `print` calls of `Text` literals, and a later RFC can add more.
- **Effect-polymorphic functions.** Rejected. `io` is a plain marker, so local reasoning holds.
- **Fuel or step trap for non-terminating loops at run time.** Rejected for the reason in the Design section. Examples get a compile-time budget instead, because a compiler that hangs on a bad example fails the principle of a defined result for the tool itself.

## Cost

Core spec: the sections above, about 3,000 tokens by estimate. The tokeniser script gives the real figure; the merge bot checks the 12,000-token core limit. The spec has no earlier text for this section, so the baseline is zero.

Removes: nothing, since the kernel is the base. Each rule is one short sentence to keep the core small.

Adds to RFC 0003 section 7: three reserved words (`var`, `example`, `io`). This RFC supersedes that section's keyword list. RFC 0003 must be revised to match, or this RFC's keyword list must be accepted in its place (Open questions, item 1).

Card: `spec/card.md` gets the grammar on one screen, the value types, the effect marker `io`, the operator table, the reserved words, the trap kinds with status 1, and the rule that `: R` comes before `io`. It omits the diagnostic table and the examples section. Estimate: about 600 tokens, well under the 2,000-token card limit.

## Test plan

Conformance tests live in `conformance/kernel/`. Each run test holds one program with its expected stdout, stderr and exit status. Each compile-error test states the expected records as JSON, comparing `code`, `span` and `fix` (RFC 0004 section 7).

Run tests:

- `kernel/int-arith.test`: `+ - * / %`, truncation toward zero, sign of `%`, `MIN / -1` written as `-9223372036854775807 - 1`.
- `kernel/int-compare.test`: comparisons and `==` on `Int`.
- `kernel/bool-ops.test`: `and`, `or`, `not`, short-circuit order.
- `kernel/bind-let-var.test`: `let`, `var`, assignment, shadowing in an inner block.
- `kernel/fn-call.test`: parameters, `: R` results, recursion (factorial of 10).
- `kernel/if-while.test`: `if`, `} else {` on one line, `while`, `return` from inside a loop.
- `kernel/stmt-newline.test`: a binary operator at line end continues the expression; a line inside `( )` continues without NEWLINE.
- `kernel/print.test`: `print` of negative, zero and positive `Int`; `print` of `Text` with `\n`, `\t`, `\"`, `\\` escapes; newline after each call.
- `kernel/examples.test`: a program whose examples all hold builds and prints nothing extra.
- `kernel/trap-overflow.test`: `4611686018427387904 * 2` traps; exit status 1; stderr `trap: overflow`.
- `kernel/trap-div.test`: `divide-by-zero`, and `MIN / -1`.
- `kernel/trap-stack.test`: unbounded recursion; stderr `trap: stack-exhausted`; exit status 1.
- `kernel/loop-forever.test`: a program that prints one line and then loops forever is stopped by the test harness; the test checks that the printed line is the whole output and that no trap line is written.

Compile-error tests, one per new code:

- `kernel/err-lex.test` (E0001): a `$` outside a comment.
- `kernel/err-keyword-name.test` (E0003): `let while = 1`.
- `kernel/err-syntax.test` (E0100): chained comparison `1 < 2 < 3`.
- `kernel/err-else-newline.test` (E0100): `else` on the line after `}`.
- `kernel/err-type.test` (E0200): `if 1 { }`.
- `kernel/err-print-bool.test` (E0200): `print(true)`.
- `kernel/err-missing-return.test` (E0201): a result function whose last statement is an `if` without `else`.
- `kernel/err-example.test` (E0202): an example that is false.
- `kernel/err-example-budget.test` (E0202): an example that calls a function with `while true { }` and exceeds the budget.
- `kernel/err-dup.test` (E0300): two functions named `add`, and a parameter redeclared in the body.
- `kernel/err-unknown.test` (E0301): use of an undeclared name, and a type name `Unit`.
- `kernel/err-main.test` (E0302): a file with no `main`.
- `kernel/err-assign.test` (E0303): assignment to a `let` binding and to a parameter.
- `kernel/err-effect.test` (E0400): a pure function calls `print`, and an example calls a function with `io`.
- `kernel/err-literal.test` (E0500): `9223372036854775808`, also after unary `-`.

Each grammar production in the kernel has at least one test above, so the coverage script passes.

## Open questions

1. Reserved words. `var`, `example` and `io` are not in RFC 0003 section 7. This RFC needs either that RFC revised to list them, or this list accepted as the kernel's replacement. The architect should decide which; the rest of the design does not depend on the choice.
2. Stack depth limit. Is 10000 the right limit, or should it depend on frame size? A fixed count is simpler and deterministic.
3. Example step budget. 10,000,000 steps is a fixed count chosen so that a compile takes well under a second on the reference machine. A different value changes which examples pass, so it is part of the contract once accepted.
4. Non-termination. The kernel defines a program that never finishes as having a defined outcome (no trap, no status, output so far). A reviewer who reads principle 7 more strictly may want a run-time fuel limit. That would add a counter to every loop and is a larger change than this RFC makes.
5. Block for E0202. Example failure sits in the types block. If RFC 0004 gains a block for checked examples, the code moves before it is emitted; no code is reused either way.
6. `Text` in functions. Parameters and results cannot be `Text` in the kernel. The standard library RFC can add text operations and `Text` parameters together.
