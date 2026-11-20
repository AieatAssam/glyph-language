# 1. Toy language (version 0.1.0)

Normative. Milestone M1 only: a scripted language used to test the toolchain.

## Lexical structure

- Integer literals: decimal digits. The value must fit in i32 (at most 2147483647). Error E0004 otherwise.
- Operators: `+ - * /`. Parentheses: `( )`.
- Keyword: `print`. Any other word is error E0001.
- Spaces, tabs and carriage returns separate tokens and are otherwise ignored.
- A newline ends a statement. Blank lines are allowed.

## Statements

A program is a sequence of statements. Each statement is `print EXPR` followed by a newline or the end of the file.

## Expressions

- Operands are i32 values. Precedence: `* /` bind tighter than `+ -`. Operators associate to the left.
- Arithmetic wraps on overflow (WebAssembly i32 semantics).
- `/` truncates toward zero. Division by zero traps at run time and exits with status 1.

## Output

Each `print` writes the value in decimal, with a leading `-` if negative, then a newline, to standard output. The program exits 0 after its last statement.

## Diagnostics

Every error has a code in `spec/errors.json`. Only the first error is reported.
