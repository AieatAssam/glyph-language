# RFC draft: Integers, booleans and bytes (v2)

Class: language
Slug: integers-booleans-bytes-v2
Status: draft
Author: designer-min
Replaces: RFC 0009 (rejected). Does not amend RFC 0005 or RFC 0006. Lexical rules: RFC 0014 (accepted).

## Summary

This RFC defines three value types: `Int`, a signed 64-bit integer; `Bool`; and `Byte`, an unsigned 8-bit integer. It defines their literals, their operators, two built-in conversions between `Int` and `Byte`, and the runtime traps they can cause. It covers readiness item `integers-booleans-bytes` (`docs/SPEC.md`, section 9, item 1) and nothing else. It does not define `print`, `Text`, arrays or any other type.

The lexical rules it relies on are those of RFC 0014. The grammar of `fn` and `example` is in the kernel RFC. This RFC states only what those productions must accept for its types.

## Motivation

Readiness item 1 requires "integers with defined overflow, booleans, bytes". Later items depend on it: text indexing needs `Int` and `Byte`, RFC 0008 uses `[Byte]` and `Int` lengths, and the stage-0 lexer and the Wasm encoder work on bytes.

RFC 0009 was the earlier attempt. It was rejected by four reviewers, and its vote list gives no reasons. This draft cannot say which objections were meant. Instead it changes the parts of 0009 that conflict with decided or open records, which are these two user issues and one accepted RFC:

- **Issue #31** asks which code a type mismatch uses. RFC 0005 and RFC 0010 give E0102; RFC 0009 gives E0200. This draft uses E0200 and gives the reason in Alternatives.
- **Issue #40** asks for the codes of a bad escape and a leading zero. RFC 0009 allowed leading zeros in integer literals. RFC 0014 rule 8 makes `007` the error E0006. This draft follows RFC 0014, so the literal rule is the same in both RFCs.
- **RFC 0014 rule 10** lexes `->` as two tokens, `-` and `>`, and the parser then reports E0100. RFC 0009 wrote function signatures with `->`. Its own test `bytes/err-declare.test` would therefore have produced E0100, not E0300. This draft writes result types with `:`, the form RFC 0014 names.

No benchmark finding supports this RFC. Its grounding is the readiness checklist and the two issues above.

The purpose clause asks for few errors and few tokens. Three types, one rule each, and the smallest literal set that meets the checklist is the aim. Section Cost names what this draft removes from 0009.

## Design

Normative. "Must" and "is" are binding on implementers.

### Types

1. `Int` is a signed 64-bit two's-complement integer. Its values are the integers from -9223372036854775808 through 9223372036854775807.
2. `Bool` has the values `true` and `false`.
3. `Byte` is an unsigned 8-bit integer. Its values are the integers 0 through 255.
4. Each type is written by its name wherever a type may be written: parameter types, the result type after `:`, and `let` and `var` annotations, as in `let a: Int = 1`. A local `let` or `var` may omit the annotation; it then has the type of its initialiser.
5. No implicit conversion exists between any two types, including between `Int`, `Byte` and `Bool`.

### Literals

6. An integer literal is `0`, or a digit from `1` to `9` followed by zero or more digits. It has type `Int`. It has no sign (RFC 0014 rule 8).
7. A literal with a leading zero, such as `007`, is error E0006. The lexer reports it (RFC 0014).
8. A literal whose value is above 9223372036854775807 is error E0500. The checker reports it. The check applies to the literal before any unary `-`, so `-9223372036854775808` is also E0500. The smallest `Int` is written `-9223372036854775807 - 1`.
9. `-` before an expression is unary minus. `-5` is unary minus applied to the literal `5`.
10. `true` and `false` are literals of type `Bool`.
11. There is no literal of type `Byte`. A `Byte` value comes only from a call to `byte`.

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

12. Binary operators are left-associative, except that comparisons do not chain. `1 < 2 < 3` is a syntax error. The parser reports E0100 at the second `<`, because the grammar accepts no second comparison at that position. The program must be written with `and` or with parentheses.
13. Both operands of a binary operator must have the same type. Otherwise the program is error E0200.
14. Operands are evaluated left to right. The right operand of `and` and `or` is not evaluated when the left operand decides the result.

Rules by type:

15. `Int`: `+`, `-` and `*` give the exact result when it fits in 64 bits. Otherwise the program traps with `overflow`. Unary `-` applied to the minimum `Int` traps with `overflow`.
16. `Int`: `/` and `%` truncate toward zero. The sign of `%` follows the dividend. A zero divisor traps with `divide by zero`. Dividing the minimum `Int` by `-1` with either `/` or `%` traps with `overflow`. No other value traps in `/` or `%`.
17. `Int`: `==`, `!=`, `<`, `<=`, `>` and `>=` compare by numeric value.
18. `Bool`: `==` and `!=` compare for equality. `and`, `or` and `not` are the logical operators. Every other operator on `Bool` is error E0200, including `<` and `+`.
19. `Byte`: `==` and `!=` compare for equality. Every other operator on `Byte` is error E0200, including `+`, unary `-` and `<`. To order two bytes, convert them with `int` first.

### Conversions

20. Two built-in functions exist:
    - `byte(n: Int): Byte`. If `n` is between 0 and 255 inclusive, the result is `n` as a `Byte`. Otherwise the program traps with `byte out of range`.
    - `int(b: Byte): Int`. The result is the same number as an `Int`. It never traps.
21. The argument type must match exactly. `int(1)` and `byte(b)` where `b` is a `Byte` are error E0200.
22. Neither built-in has an effect marker. Both are pure.
23. No `let`, `var`, parameter or top-level declaration may be named `byte` or `int`. Doing so is error E0300. There is no shadowing of the built-ins.

### Traps

24. A trap is a defined outcome, not a diagnostic. The runtime writes one line `trap: <kind>` to standard error and exits with status 3 through WASI `proc_exit`. The kinds are `overflow`, `divide by zero` and `byte out of range`. Output written before the trap is part of the result.
25. A trap happens only when the expression is evaluated at run time. The checker must not reject a program because one of its expressions would trap. For example, `let a = 1 / 0` builds, and running it traps with `divide by zero`. An implementation may fold constants, but the result must match the run-time behaviour exactly.

### Examples

26. A function may carry examples, as the kernel defines them. The types and built-ins in this RFC are pure, so examples may use them. An example that does not hold fails the build. The kernel RFC defines where examples may appear.

### Stable addresses

27. The types are `type:Int`, `type:Bool` and `type:Byte`. The built-ins are `builtin:byte` and `builtin:int`.

### Diagnostics

| Code | Meaning | Fix |
| --- | --- | --- |
| E0006 | Integer literal with a leading zero. From RFC 0014; not new here. | Remove the leading zeros. |
| E0100 | Chained comparison. From RFC 0014; not new here. | Use `and`, or parentheses. |
| E0200 | Type mismatch: operands or argument of different types, or an operator not defined for the type. | If the intent is clear, wrap the `Byte` in `int(...)`, or the `Int` in `byte(...)`. |
| E0300 | A declaration, parameter or binding is named `byte` or `int`. | Rename it. |
| E0500 | Integer literal above 9223372036854775807. From RFC 0014; not new here. | Use a value in range, or compute it. |

E0200 and E0300 must not already exist in `spec/errors.json`. That file does not exist in this checkout, so the reviewer must check both before acceptance. E0200 replaces E0102 in RFC 0005 and RFC 0010 as the type-mismatch code. The reason for the code is in Alternatives. Those two RFCs must change if this one is accepted.

## Alternatives

- **Type mismatch as E0102 (RFC 0005, RFC 0010).** Not chosen. RFC 0014's table puts E0100 in the syntax block, and E0102 falls in that same E01xx range. A type error is not a syntax error, so it belongs in the checker block, where E0200 sits. E0102 is used in two drafts and E0200 in one. The count is not the reason; the block is.
- **Leading zeros allowed (RFC 0009).** Rejected. RFC 0014 is accepted and makes `007` an error. Two RFCs cannot disagree on the same token.
- **Byte ordering with `<` and the other order operators (RFC 0009).** Rejected. `int(a) < int(b)` uses the `Int` rule that already exists, so the `Byte` case needs no rule of its own. This removes one row from the operator table.
- **32-bit `Int`.** Not chosen. It would match the Wasm `i32` stack type, but the checklist asks for defined overflow, not a width, and no benchmark shows that 64 bits costs enough to matter. A benchmark finding would reopen this.
- **Wrapping arithmetic.** Rejected. It hides the errors the purpose clause asks us to catch.
- **`Byte` as an alias of `Int`.** Rejected. It breaks the no-implicit-conversion rule.
- **Arithmetic on `Byte`.** Rejected. Each operator would need its own 8-bit overflow rule. `int(b) + 1` uses rules that already exist.
- **A `Byte` literal such as `b'A'`.** Rejected for now. It adds a lexical form. `byte(65)` covers the need.
- **Compile-time error for `byte(300)`.** Rejected. It adds a second rule for a case the run-time trap already covers.
- **Compile-time error for any trapping constant expression, such as `1 / 0`.** Rejected. Rule 25 keeps trapping a run-time event, so the checker stays simple and the trap is the one defined outcome.
- **Allowing local names `byte` and `int` to shadow the built-ins.** Rejected. Shadowing adds a scope rule. Rule 23 forbids the names everywhere and needs no scope lookup.
- **Keeping RFC 0005 and RFC 0006 as the vehicle, and adding nothing new.** Rejected. This item is one checklist entry, and it should be decided once.

## Cost

Core spec: about 650 tokens. This is an estimate. The protected tokeniser has not run on this text, and `spec/` is not in this checkout.

Removes, measured against RFC 0009: the `Byte` order operators (rule 19 in 0009, the `<` case), the rule that leading zeros are allowed, and the `->` result-type notation. Together these remove about 60 tokens of text and one row of the operator table.

Removes, measured against RFC 0005 and RFC 0006: nothing in this RFC removes those drafts' text. If this RFC and the kernel are accepted together, the `Int` and `Bool` parts of RFC 0005 and all of RFC 0006 are replaced by this text, so the combined core is shorter than the two drafts together. The kernel RFC must remove its own copies.

Adds, measured against RFC 0009: the E0300 rule covering local bindings (rule 23), and the statement that a trap is run-time only (rule 25). About 40 tokens together.

Spec card: `spec/card.md` gains the three type names on the value-types line, the two built-in names, the precedence line, and the three trap kinds. About 70 tokens. The card omits the stable addresses and the examples. `spec/card.md` is not in this checkout, so its current size is not checked here.

## Test plan

Conformance tests live in `conformance/ints-bytes/`.

Printing is not part of this item, so run tests check values with `example` lines (which the compiler runs and fails the build on) and check traps with exit status and stderr. Each run test is a complete program with a `fn main()`. If the kernel's `example` syntax changes, these tests change with it.

Run tests (expected exit status 0 unless stated):

- `ints/arith.test`: `example 2 + 3 == 5`, `example 7 / 2 == 3`, `example -7 / 2 == -3`, `example -7 % 2 == -1`, `example 7 % -2 == 1`. Builds and runs.
- `ints/bounds.test`: `example 9223372036854775807 > 0` and `example -9223372036854775807 - 1 < 0`. Builds and runs.
- `ints/overflow.test`: `let a = 9223372036854775807 + 1` evaluated at run time. Exit status 3; stderr `trap: overflow`.
- `ints/neg-min.test`: `let a = -(-9223372036854775807 - 1)`. Exit status 3; stderr `trap: overflow`.
- `ints/divide.test`: `let a = 1 / 0`. Exit status 3; stderr `trap: divide by zero`.
- `ints/div-min.test`: `let a = (-9223372036854775807 - 1) / -1`. Exit status 3; stderr `trap: overflow`.
- `ints/mod-min.test`: `let a = (-9223372036854775807 - 1) % -1`. Exit status 3; stderr `trap: overflow`.
- `ints/const-trap.test`: `let a = 1 / 0` in a program that is otherwise valid. Builds, then exit status 3 at run time, showing the checker does not reject a trapping expression (rule 25).
- `bool/short-circuit.test`: `example (false and (1 / 0 == 0)) == false` and `example (true or (1 / 0 == 0)) == true`. Builds and runs with no trap.
- `bool/example.test`: `example (1 < 2) == true`. Builds and runs.
- `bytes/convert.test`: `example int(byte(200)) == 200`, `example byte(0) == byte(0)`, `example byte(255) == byte(255)`. Builds and runs.
- `bytes/equal.test`: `example byte(1) == byte(1)` and `example byte(1) != byte(2)`. Builds and runs.
- `bytes/order-via-int.test`: `example int(byte(1)) < int(byte(2))`. Builds and runs.
- `bytes/trap-range.test`: `let a = byte(256)`. Exit status 3; stderr `trap: byte out of range`.
- `bytes/example.test`: `example int(byte(65)) == 65`. Builds and runs.

Compile-error tests (each names its expected record: code and span, per RFC 0004):

- `ints/err-literal.test`: `let a = 9223372036854775808` gives E0500 at the literal.
- `ints/err-literal-neg.test`: `let a = -9223372036854775808` gives E0500 at the literal.
- `ints/err-leading-zero.test`: `let a: Int = 007` gives E0006 at `007`, and no other record.
- `ints/err-mix.test`: `let a = 1 == true` gives E0200.
- `ints/err-int-arg.test`: `let a = int(1)` gives E0200.
- `bool/err-order.test`: `let a = true < false` gives E0200.
- `bool/err-and-int.test`: `let a = 1 and 2` gives E0200.
- `bool/err-chain.test`: `let a = 1 < 2 < 3` gives E0100 at the second `<`.
- `bytes/err-arith.test`: `let a = byte(1) + byte(2)` gives E0200.
- `bytes/err-order.test`: `let a = byte(1) < byte(2)` gives E0200.
- `bytes/err-mix.test`: `let a = byte(1) == 1` gives E0200.
- `bytes/err-arg.test`: `let a = byte(byte(1))` gives E0200.
- `decl/err-top-name.test`: a top-level `fn byte(n: Int): Byte` gives E0300.
- `decl/err-local-name.test`: `let int: Int = 1` inside `fn main()` gives E0300.

Every production that this RFC uses is covered: the three type names, integer and boolean literals, each operator row above, `and`, `or` and `not`, both built-in calls, the result-type `:` form, and `example`. Every rule that produces a value, a trap or an error has at least one test above.

## Open questions

1. **Is 64 bits the right width for `Int`?** The alternative is 32 bits. A reviewer who wants a narrower type should cite a benchmark.
2. **Is E0200 the right type-mismatch code?** This draft says yes, on block grounds (Alternatives). Accepting it means RFC 0005 and RFC 0010 must change from E0102. A reviewer who prefers E0102 must say why the E01xx block should hold type errors.
3. **Are E0200 and E0300 new?** Neither can be checked here. The reviewer must confirm both are absent from `spec/errors.json` before acceptance.
4. **Should `Byte` have order operators?** This draft says no (rule 19), because `int` covers the case. A reviewer who wants them should say which rule they would add and what it costs in the table.
5. **Does the kernel's `example` form allow `let` in a test program?** The run tests use `let` to force a run-time trap. If the kernel forbids a bare `let` in `fn main()`, the trap tests need a different form. The kernel RFC decides this.
6. **Which RFC defines `print` for these types?** It is outside this item. Once it exists, the run tests can print values instead of using `example`.
