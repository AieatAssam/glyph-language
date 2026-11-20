# RFC draft: Kernel

Class: language
Slug: kernel
Status: draft

## Summary

The kernel is the smallest part of Glyph that can run a useful program. It has two value types, `Int` and `Bool`, plus `Text` literals that can only be printed. It has immutable and mutable bindings, functions, `if`, `while`, `return`, and text output. Every function signature states whether it performs I/O. Integer overflow, division by zero and stack exhaustion trap with a defined message and exit status. Nothing is left undefined.

## Motivation

Every later RFC (structs, arrays, modules, the standard library) builds on this base, so the base has to be settled first. The purpose clause asks for few errors and tokens per program. A kernel with one way to write each construct is the cheapest thing a model can learn and repair. The explicit-effects and no-undefined-behaviour principles apply from the first program, so they are set here, not added later.

## Design

Normative. "Must" and "is" are binding on implementers.

### Lexical

1. Source files are UTF-8. Line endings are LF. Tab characters are a syntax error (E0100).
2. Comments start with `//` and run to end of line. There are no block comments.
3. Identifiers: a letter or `_`, then letters, digits or `_`. Keywords are not identifiers: `fn let var if else while return true false and or not example`.
4. Integer literals: decimal digits only. A literal must fit in a signed 64-bit value, otherwise E0106.
5. Text literals: double-quoted, no line breaks. Escapes are exactly `\n`, `\"` and `\\`. Any other escape is E0100.
6. Punctuation and operators: `( ) { } , : = -> ! + - * / % == != < <= > >=`. The effect marker `!io` is one token.

### Types

- `Int`: signed 64-bit two's complement.
- `Bool`: `true` or `false`.
- `Text`: an immutable sequence of UTF-8 bytes. A `Text` value exists only as a literal or as a binding of one. The kernel has no operation on `Text` except `print`.
- There is no `Unit` type you can write. A function with no `->` clause returns nothing, and calling it is a statement only. Writing `-> Unit` is E0100.
- Parameters and function return types are always written. Local `let` and `var` may omit the type; it is then the type of the initialiser.
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
- `/` and `%` on `Int` truncate toward zero; the sign of `%` follows the dividend. A zero divisor traps with `divide by zero`. `MIN / -1` traps with `overflow`.
- `==` and `!=` work on two `Int` operands or two `Bool` operands. Both operands must have the same type. `Text` has no equality in the kernel.
- `<`, `<=`, `>`, `>=` work on `Int` only.
- `and` and `or` short-circuit. `not` is logical negation. All of them take `Bool`.
- Operands are evaluated left to right.

### Bindings

- `let name = expr` or `let name: Type = expr` introduces an immutable binding.
- `var name = expr` introduces a mutable binding. `name = expr` assigns to it. Assigning to a `let` binding or to a parameter is E0104.
- A binding is visible from its declaration to the end of its enclosing block.
- An inner block may shadow an outer name. Declaring a name twice in the same block is E0108.

### Functions

```
fn name(p1: T1, p2: T2) -> R !io {
    ...
    return expr
}
```

- The `-> R` clause and the `!io` marker are each optional. When both appear, `-> R` comes first.
- A function without `!io` cannot make a direct call to a function with `!io`. Violations are E0105.
- A function with `-> R` must return on every path. A path that reaches the closing brace is E0103.
- `return expr` requires a `-> R` clause and an expression of type `R`, otherwise E0102. Bare `return` is allowed only in a function with no `->` clause.
- Recursion is allowed. The kernel does not check termination.
- Function names are unique in the file (E0108). Functions are visible throughout the file; declaration order does not matter.
- There are no nested functions and no closures.

### Conditionals and loops

- `if cond { ... }` and `if cond { ... } else { ... }`. The `else` part is a block only. To chain, nest an `if` inside the `else` block.
- `cond` must be `Bool`, otherwise E0102.
- `if` is a statement only. It is not an expression.
- `while cond { ... }` repeats while `cond` is true. There is no `break` or `continue`; early exit uses `return`.
- A loop need not terminate. A non-terminating loop is not an error and has no result.

### Text output

`print(x)` is a built-in with two signatures: `print(x: Int) !io` and `print(x: Text) !io`. The compiler picks the one that matches the argument type. It is the only name in the kernel with two signatures; users cannot declare overloads (E0108). `print` writes the value followed by a newline. An `Int` is written in decimal, with a leading `-` if negative. `Bool` is not accepted by `print` in the kernel.

Output goes to standard output through WASI `fd_write`.

### Entry point

A program has exactly one function `main` with no parameters and no `->` clause. It may have `!io`. A missing or duplicate `main` is E0107.

### Examples

A function declaration may be followed by zero or more example lines, each on its own line after the closing brace:

```
fn add(a: Int, b: Int) -> Int {
    return a + b
}
example add(2, 3) == 5
example add(-1, 1) == 0
```

- An example is a `Bool` expression. It may call only functions without `!io`.
- The compiler evaluates each example at compile time. An example that is `false` or traps fails with E0109 at the example's span.
- Examples are part of the declaration.

### Stable addresses

Each declaration is addressed as `<file>::<name>`, for example `main.glyph::add`. Each example is addressed as `<file>::<name>#<n>`, where `<n>` counts from 1 in source order.

### Traps (runtime)

A trap is a defined outcome, not a diagnostic. When a program traps, the runtime writes one line `trap: <kind>` to standard error and exits with status 3 through WASI `proc_exit`. The kinds are:

| Kind | Cause |
| --- | --- |
| `overflow` | `Int` arithmetic does not fit in 64 bits |
| `divide by zero` | `/` or `%` with a zero divisor |
| `stack exhausted` | call depth exceeds 10000 |

The compiler inserts a depth check at each function entry. The limit is a fixed compile-time constant, so the result does not depend on the host.

### Compile-time diagnostics

Each has a stable code. All are new in this RFC, since `spec/errors.json` has no entries yet.

| Code | Meaning |
| --- | --- |
| E0100 | Syntax error (includes bad escapes, tabs, `-> Unit`, chained comparison) |
| E0101 | Unknown name |
| E0102 | Type mismatch |
| E0103 | Function with a return type may reach its end without returning |
| E0104 | Assignment to a non-`var` binding or to a parameter |
| E0105 | Effect not declared: a direct call to an `!io` function from a pure function |
| E0106 | Integer literal out of range |
| E0107 | Missing or duplicate `main` |
| E0108 | Duplicate declaration in one scope, or user-declared overload of `print` |
| E0109 | Example is false or traps at compile time |

### Build and tools

- `glyphc check` reports diagnostics and runs examples.
- `glyphc run` checks, builds and executes `main`.
- `glyphc build -o out.wasm` produces a WebAssembly core module whose imports are only WASI preview 1 functions (`fd_write`, `proc_exit`).
- Output is byte-identical for identical source and compiler.

### Memory

The kernel adds no heap values. `Text` literals live in read-only module data. `Int` and `Bool` are values on the WebAssembly stack or in locals. No allocator is needed here. The bump allocator and arenas from the designer guidance belong to later RFCs that add heap values.

## Alternatives

- **Wrapping integer arithmetic.** Rejected. Wrap-around is defined, but it hides the bugs the purpose clause wants caught. A trap is also defined and needs one rule rather than a choice per operator.
- **Dynamic typing or unchecked `Text` operations.** Rejected by the static typing constraint.
- **`if` as an expression.** Rejected: it would give two ways to produce a value (`if` and `return`). An `if`-expression can come later together with a removal of something else.
- **Implicit return of the last expression.** Rejected: two ways to return, and a block's value would depend on a trailing expression.
- **`loop` with `break`.** Rejected for the kernel. `while` with `return` covers the same cases with fewer keywords.
- **`print` overloaded for every type.** Rejected. Only `Int` and `Text` are needed now.
- **Effect-polymorphic functions.** Rejected. `!io` is a plain marker, so local reasoning holds.

## Cost

Core spec: this RFC adds the sections above to the core spec. There is no spec yet, so the baseline is zero. The estimate is about 2,600 tokens for the core and 500 tokens for `spec/card.md`. The tokeniser script gives the real figure; the merge bot checks the 12,000-token core and 2,000-token card limits.

Removes: nothing, since the kernel is the base. Each rule is written as one short sentence to keep the core small.

Card: `spec/card.md` gets the grammar on one screen, the value types, the effect marker, the operator table and the trap kinds. It omits the diagnostic table and the examples section.

## Test plan

Conformance tests live in `conformance/kernel/`. Each test file holds one program and its expected stdout, stderr, exit status, or expected diagnostic code.

Run tests:

- `kernel/int-arith.test`: `+ - * / %`, truncation toward zero, sign of `%`.
- `kernel/int-compare.test`: comparisons and `==` on `Int`.
- `kernel/bool-ops.test`: `and`, `or`, `not`, short-circuit order.
- `kernel/bind-let-var.test`: `let`, `var`, assignment, shadowing in an inner block.
- `kernel/fn-call.test`: parameters, return values, recursion (factorial of 10).
- `kernel/if-while.test`: `if`, `else`, `while`, `return` from inside a loop.
- `kernel/print.test`: `print` of negative and positive `Int`, and of `Text`; newline placement.
- `kernel/examples.test`: a program whose examples all hold builds and prints nothing extra.
- `kernel/trap-overflow.test`: `4611686018427387904 * 2` traps; exit status 3; stderr `trap: overflow`.
- `kernel/trap-div.test`: division by zero and `MIN / -1`.
- `kernel/trap-stack.test`: unbounded recursion; stderr `trap: stack exhausted`.

Compile-error tests, one per code: `kernel/err-syntax.test` (E0100), `kernel/err-unknown.test` (E0101), `kernel/err-type.test` (E0102), `kernel/err-missing-return.test` (E0103), `kernel/err-assign.test` (E0104), `kernel/err-effect.test` (E0105), `kernel/err-literal.test` (E0106), `kernel/err-main.test` (E0107), `kernel/err-dup.test` (E0108), `kernel/err-example.test` (E0109).

Each grammar production in the kernel has at least one test above, so the coverage script passes.

## Open questions

1. Is 10000 the right stack depth limit, or should it depend on frame size? A fixed count is simpler and deterministic.
2. Exit status 3 for traps has no precedent in this repo. Reviewers may prefer another status.
3. `print` is the only overloaded name. A later RFC could replace it with one `print` on `Text` plus an `int_to_text` function.
4. `Text` has no equality or length in the kernel. The standard library RFC may add them.
