---
status: draft
---
# RFC draft: Integers, booleans and bytes (v3)

Class: language
Slug: integers-booleans-bytes-v3
Status: draft
Author: designer-min
Replaces: RFC 0021 (rejected). Does not amend RFC 0005 or RFC 0006. Lexical rules: RFC 0014 (accepted). Error catalogue: `spec/errors.json`.

## Summary

This RFC defines three value types: `Int`, a signed 64-bit integer; `Bool`; and `Byte`, an unsigned 8-bit integer. It gives their literals, their operators, two built-in conversions between `Int` and `Byte`, and the three run-time traps they can cause. It covers readiness item `integers-booleans-bytes` and nothing else.

## Motivation

Readiness item 1 requires "integers with defined overflow, booleans, bytes". Later items depend on it: text indexing needs `Int` and `Byte`, and the stage-0 lexer and the Wasm encoder work on bytes. The item is still open, and no compiler is on `main` yet, so nothing in this RFC can be tested by running it.

RFC 0021 (v2) was rejected by four reviewers and two users approved, and the vote lists give no reasons. This draft cannot know which objections were meant. It keeps the v2 design where the v2 text matches the accepted RFC 0014 and the errors catalogue, and it makes three changes, each stated in Cost:

- It drops the `Byte` order-operator rule and the leading-zero allowance, which the accepted RFC 0014 already settles (`007` is E0006).
- It writes result types with `:`, the form RFC 0014 names. RFC 0014 rule 10 lexes `->` as two tokens, so the v2 signature form would have reported E0100, not the intended error.
- It cuts the Alternatives section to the choices a reviewer is likely to contest.

Grounding: the readiness checklist (spec section 9, item 1). The open user issues do not name integers. Issue #361 records twelve rejections with no reasons, and this draft asks reviewers to say why they reject, so the next round can use the answer.

The purpose clause asks for few errors and few tokens. Three types, one rule each, and the smallest literal set that covers the checklist is the aim.

## Design

Normative. "Must" and "is" are binding on implementers.

### Types

1. `Int` is a signed 64-bit two's-complement integer, with values from -9223372036854775808 through 9223372036854775807.
2. `Bool` has the values `true` and `false`.
3. `Byte` is an unsigned 8-bit integer, with values 0 through 255.
4. Each type is written by its name wherever a type may be written: parameter types, the result type after `:`, and `let` and `var` annotations. A local `let` or `var` may omit the annotation and then has the type of its initialiser.
5. No implicit conversion exists between any two types.

### Literals

6. An integer literal is `0`, or a digit from `1` to `9` followed by zero or more digits. It has type `Int` and no sign (RFC 0014 rule 8).
7. A literal with a leading zero, such as `007`, is error E0006 (RFC 0014).
8. A literal above 9223372036854775807 is error E0500. The check applies to the literal before any unary `-`, so `-9223372036854775808` is also E0500. The smallest `Int` is written `-9223372036854775807 - 1`.
9. `-` before an expression is unary minus.
10. `true` and `false` are literals of type `Bool`.
11. There is no literal of type `Byte`. A `Byte` comes only from a call to `byte`.

### Operators

Precedence from loosest to tightest:

1. `or`
2. `and`
3. `==` `!=`
4. `<` `<=` `>` `>=`
5. `+` `-`
6. `*` `/` `%`
7. unary `-` and `not`
8. call, literal, name, parenthesised expression

12. Binary operators are left-associative. Comparisons do not chain: `1 < 2 < 3` is E0100 at the second `<`. Write `1 < 2 and 2 < 3`.
13. Both operands of a binary operator must have the same type. Otherwise the program is E0200.
14. Operands are evaluated left to right. The right operand of `and` and `or` is not evaluated when the left operand decides the result.

Rules by type:

15. `Int`: `+`, `-` and `*` give the exact result when it fits in 64 bits. Otherwise the program traps with `overflow`. Unary `-` applied to the minimum `Int` traps with `overflow`.
16. `Int`: `/` and `%` truncate toward zero, and the sign of `%` follows the dividend. A zero divisor traps with `divide by zero`. Dividing the minimum `Int` by `-1` with either `/` or `%` traps with `overflow`.
17. `Int`: `==`, `!=`, `<`, `<=`, `>` and `>=` compare by numeric value.
18. `Bool`: `==` and `!=` compare for equality. `and`, `or` and `not` are the logical operators. Any other operator on `Bool` is E0200.
19. `Byte`: `==` and `!=` compare for equality. Any other operator on `Byte` is E0200, including `+`, unary `-` and `<`. To order two bytes, convert them with `int` first.

### Conversions

20. Two built-in functions exist:
    - `byte(n: Int): Byte`. If `n` is between 0 and 255 inclusive, the result is `n` as a `Byte`. Otherwise the program traps with `byte out of range`.
    - `int(b: Byte): Int`. The result is the same number as an `Int`. It never traps.
21. The argument type must match exactly. `int(1)` and `byte(b)` with `b` a `Byte` are E0200.
22. Both built-ins are pure: they have no effect marker.
23. No `let`, `var`, parameter or top-level declaration may be named `byte` or `int`. Doing so is E0300. The built-ins cannot be shadowed, so no scope lookup is needed.

### Traps

24. A trap is a defined outcome, not a diagnostic. The runtime writes one line `trap: <kind>` to standard error and exits with status 3 through WASI `proc_exit`. The kinds are `overflow`, `divide by zero` and `byte out of range`. Output written before the trap is part of the result.
25. A trap happens only when the expression is evaluated at run time. The checker must not reject a program because one of its expressions would trap. `let a = 1 / 0` builds, and running it traps with `divide by zero`. Any constant folding must match the run-time behaviour exactly.

### Examples and addresses

26. A function may carry examples, as the kernel defines them. The examples in this RFC's tests use only the types and built-ins above.
27. The addresses are `type:Int`, `type:Bool`, `type:Byte`, `builtin:byte` and `builtin:int`.

### Diagnostics

| Code | Meaning | Status | Fix |
| --- | --- | --- | --- |
| E0006 | Integer literal with a leading zero | in `spec/errors.json` | Remove the leading zeros. |
| E0100 | Unexpected token, including a chained comparison | in `spec/errors.json` | Use `and`, or parentheses. |
| E0200 | Type mismatch: operands or argument of different types, or an operator not defined for the type | new | Wrap in `int(...)` or `byte(...)` if the intent is clear. |
| E0300 | A declaration or binding is named `byte` or `int` | new | Rename it. |
| E0500 | Integer literal above 9223372036854775807 | in `spec/errors.json` | Use a value in range, or compute it. |

E0200 and E0300 are absent from `spec/errors.json` as checked for this draft, and the reviewer must check again before acceptance. E0200 is the type-mismatch code. RFC 0005 and RFC 0010 use E0102 for this case, and they must change if this RFC is accepted. Type errors are checker errors, not syntax errors, so they do not belong in the E01xx syntax block.

## Alternatives

- **Type mismatch as E0102 (RFC 0005, RFC 0010).** Not chosen. E0102 sits in the syntax block next to E0100. A type error belongs with the checker codes, and E0200 is the first free one there.
- **`Byte` order operators (RFC 0009, RFC 0021 v2).** Rejected. `int(a) < int(b)` uses the `Int` rule, so the `Byte` case needs no rule of its own.
- **32-bit `Int`.** Not chosen. The checklist asks for defined overflow, not a width. A benchmark finding would reopen this.
- **Wrapping arithmetic.** Rejected. It hides the errors the purpose clause asks us to catch.
- **`Byte` as an alias of `Int`.** Rejected. It breaks the no-implicit-conversion rule.
- **A `Byte` literal such as `b'A'`.** Rejected for now. `byte(65)` covers the need, and the text RFC may revisit it.
- **Compile-time error for `byte(300)` or for `1 / 0`.** Rejected. Rule 25 keeps a trap a run-time event, so the checker stays simple.

## Cost

Core spec: about 600 tokens. This is an estimate. The protected tokeniser has not run on this text.

Removes, measured against RFC 0021 v2: the `Byte` order-operator row, the `->` result-type notation, the long Alternatives list, and the statement that leading zeros are allowed. About 150 tokens of text and one row of the operator table.

Adds, measured against RFC 0021 v2: nothing new in the language. The table now marks which codes are new.

Removes, measured against RFC 0005 and RFC 0006: nothing in this RFC removes their text. If this RFC and the kernel are accepted together, the `Int` and `Bool` parts of RFC 0005 and all of RFC 0006 are replaced by this text. The kernel RFC must remove its own copies.

Spec card: `spec/card.md` (currently 645 bytes) gains the three type names on the value-types line, the two built-in names, the precedence line and the three trap kinds. About 70 tokens. Its size stays far under the 2,000-token cap.

## Test plan

Conformance tests live in `conformance/ints-bytes/`. Printing is not part of this item, so run tests check values with `example` lines and check traps with exit status and stderr.

Run tests (exit status 0 unless stated):

- `ints/arith.test`: `example 7 / 2 == 3`, `example -7 / 2 == -3`, `example -7 % 2 == -1`, `example 7 % -2 == 1`. Builds and runs.
- `ints/bounds.test`: `example 9223372036854775807 > 0` and `example -9223372036854775807 - 1 < 0`. Builds and runs.
- `ints/overflow.test`: `let a = 9223372036854775807 + 1` at run time. Exit status 3; stderr `trap: overflow`.
- `ints/div-min.test`: `let a = (-9223372036854775807 - 1) / -1`. Exit status 3; stderr `trap: overflow`.
- `ints/divide.test`: `let a = 1 / 0`. Exit status 3; stderr `trap: divide by zero`.
- `ints/const-trap.test`: a valid program containing `let a = 1 / 0`. Builds, then exits 3 at run time (rule 25).
- `bool/short-circuit.test`: `example (false and (1 / 0 == 0)) == false` and `example (true or (1 / 0 == 0)) == true`. Builds and runs with no trap.
- `bytes/convert.test`: `example int(byte(200)) == 200` and `example byte(255) == byte(255)`. Builds and runs.
- `bytes/order-via-int.test`: `example int(byte(1)) < int(byte(2))`. Builds and runs.
- `bytes/trap-range.test`: `let a = byte(256)`. Exit status 3; stderr `trap: byte out of range`.

Compile-error tests (each names the expected code and span, per RFC 0004):

- `ints/err-literal.test`: `let a = 9223372036854775808` gives E0500 at the literal.
- `ints/err-leading-zero.test`: `let a: Int = 007` gives E0006 at `007` and no other record.
- `ints/err-mix.test`: `let a = 1 == true` gives E0200.
- `bool/err-chain.test`: `let a = 1 < 2 < 3` gives E0100 at the second `<`.
- `bytes/err-arith.test`: `let a = byte(1) + byte(2)` gives E0200.
- `bytes/err-order.test`: `let a = byte(1) < byte(2)` gives E0200.
- `bytes/err-arg.test`: `let a = int(1)` gives E0200.
- `decl/err-top-name.test`: a top-level `fn byte(n: Int): Byte` gives E0300.
- `decl/err-local-name.test`: `let int: Int = 1` inside `fn main()` gives E0300.

Every rule that produces a value, a trap or an error has at least one test above.

## Open questions

1. **Is 64 bits the right width for `Int`?** A reviewer who wants 32 bits should cite a benchmark.
2. **Is E0200 the right type-mismatch code?** Accepting it means RFC 0005 and RFC 0010 change from E0102.
3. **Does the kernel's `example` form allow `let` in a test program?** The trap tests use `let`. If the kernel forbids it, those tests need another form. The kernel RFC decides this.
4. **Why was v2 rejected?** Four reviewers rejected it with no reasons. A reviewer who rejects this draft should name the one change that would make them approve.
