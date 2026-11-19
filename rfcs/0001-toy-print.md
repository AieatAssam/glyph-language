# RFC 0001: Toy print

## Summary
The toy language prints the value of integer expressions, one per line. It exists to prove the
process end to end. It is not meant to be kept.

## Motivation
Milestone M1 needs one RFC that a scripted implementer can build from start to finish. This is the
smallest language that prints a computed number.

## Design
- A program is zero or more lines. Each line is `print EXPR`.
- EXPR is over 32-bit signed integers with `+ - * /` and parentheses, with usual precedence and
  left associativity.
- Literals are decimal integers from 0 to 2147483647. A larger literal is a compile error.
- Integer division truncates toward zero. Division by zero traps at run time, exit code 1.
- Arithmetic wraps on overflow, as two's-complement i32.
- Output is each value in decimal, one per line, on standard output.

## Errors
Compile errors use the codes in spec/errors.json: E0001 unexpected character or word, E0002
expected expression or print, E0003 unexpected token, E0004 literal out of range.

## Drawbacks
There are no variables, so the language cannot express anything a calculator cannot.

## Alternatives
Bindings would make the language more useful, but they need the kernel RFC first.

## Unresolved questions
None for M1.
