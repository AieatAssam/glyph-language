---
status: superseded
votes:
  designer-prag: approve
  designer-safe: approve
  impl-1: approve
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC: Toy print

Status: draft
Class: language
Slug: toy-print
Milestone: M1 dry run

## Summary

A program is a list of lines. Each line prints the value of one integer expression. The language has `print`, the integers `i32`, the operators `+ - *`, and parentheses. Nothing else.

## Motivation

M1 needs a language small enough that a scripted toy implementation can be built and tested end to end. This RFC is the smallest one that covers the whole path: lexing, parsing, a checked result, and a run that produces output. It gives the implementer and the tester a shared base before any feature that needs memory, names or types.

## Design

### Text

1. A source file is a sequence of lines separated by `\n`. A final line may end without `\n`.
2. Characters are ASCII. Any other character is error E0001.
3. Spaces (U+0020) separate tokens and may appear before or after any token on a line. Tabs are error E0001.
4. An empty file is a valid program. It prints nothing.

### Tokens

1. Integer literal: one or more decimal digits `0`-`9`. Its value must be at most 2147483647. A larger value is error E0004. Leading zeros are allowed.
2. Operators: `+`, `-`, `*`.
3. Punctuation: `(` and `)`.
4. Keyword: `print`. Any other run of letters is error E0001.
5. End of line: `\n` or end of file.

### Grammar

```
program  = { line }
line     = "print" expr EOL
expr     = term { ("+" | "-") term }
term     = factor { "*" factor }
factor   = INT | "(" expr ")"
EOL      = "\n" | end of file
```

Every line must match `line`. A blank line is an error (E0002), because it has no `print`.

### Parsing rules

1. Parsing is by recursive descent over the grammar above.
2. `+` and `-` are left-associative. `*` binds tighter than `+` and `-`. `1-2-3` is `(1-2)-3`.
3. The parser stops at the first error. It reports that error only.
4. If a token is found where a rule needs a different one, the error code is the one listed in Errors for that case.

### Values and arithmetic

1. Every value has type `i32`. Each intermediate result is an `i32`.
2. `+`, `-` and `*` use two's-complement wrapping on 32 bits. For example `2147483647+1` is `-2147483648`. This is the one defined result for overflow; there is no runtime error.
3. Evaluation is left to right. There are no side effects other than output.

### Output

1. Each `print` writes the decimal form of its value, with a leading `-` if negative, then `\n`. No padding, no `+` sign.
2. Output is written to standard output in the order of the lines.
3. Output is produced only after the whole program has parsed. A program with an error prints nothing.

### Errors

| Code | When | Fix text |
| --- | --- | --- |
| E0001 | A character or word that is not in Tokens, such as a tab, `x`, or `prnt`. | Use digits, operators, parentheses and `print`. |
| E0002 | A line does not begin with `print`, a `print` has no expression after it, or a line is blank. | Write a value after `print`. |
| E0003 | After a complete expression on a line, the next token is not end of line, or a `(` is not closed. | Close the parenthesis or put the rest on its own line. |
| E0004 | An integer literal is larger than 2147483647. | Use a value at most 2147483647. |

Each error carries the line and column of the token where it was found. Each error has a machine-applicable fix only where the text above says a single edit is enough.

## Alternatives

- **Unary minus.** Rejected. `0-x` already covers it, and a new production would need its own test set.
- **Overflow as a runtime trap.** Rejected. It needs a second class of failure and a stack or message format. Wrapping is defined and needs no extra code.
- **Variables with `let`.** Deferred. It needs scope and name rules, which M1 does not need.
- **Multi-argument `print`.** Rejected. One expression per line is one construct; a list would be a second.

## Cost

Spec core: this RFC is the first language text, so it adds the grammar above, about 500 tokens. Nothing is removed, because nothing exists to remove. The cap is 12,000 tokens, so there is ample room. No later RFC may add a second print form without removing one of these.

Spec card: `spec/card.md` is created with the four error lines, the grammar in one block, and the rule that output is one decimal per line. About 150 tokens, well under 2,000.

Diagnostics added: E0001, E0002, E0003, E0004. Each must be new in `spec/errors.json`. This checkout has no `spec/errors.json`, so this check cannot be done from this RFC; the reviewer must run it before the RFC is accepted.

## Test plan

Run tests (conformance/toy/):

- `print-int.test`: `print 7` prints `7`. Covers `line`, `INT`.
- `print-zero-prefix.test`: `print 007` prints `7`. Covers leading zeros.
- `print-add-sub.test`: `print 1-2-3` prints `-4`. Covers left associativity.
- `print-precedence.test`: `print 1+2*3` prints `7`. Covers `term`.
- `print-parens.test`: `print (1+2)*3` prints `9`. Covers `factor` with parentheses.
- `print-wrap.test`: `print 2147483647+1` prints `-2147483648`. Covers wrapping.
- `print-multi.test`: two lines print two lines in order. Covers `program`.
- `empty.test`: an empty file prints nothing and succeeds. Covers the empty `program`.

Compile-error tests (conformance/toy/):

- `bad-character.test`: `print 1\t` fails with E0001 at the tab.
- `bad-word.test`: `prnt 1` fails with E0001.
- `blank-line.test`: `print 1` then an empty line fails with E0002.
- `missing-expr.test`: `print` alone fails with E0002.
- `unclosed-paren.test`: `print (1` fails with E0003.
- `extra-token.test`: `print 1 2` fails with E0003.
- `literal-range.test`: `print 2147483648` fails with E0004.
- `no-output-on-error.test`: `print 1` then `print )` fails with E0002 and prints nothing.

Each `factor`, `term`, `expr`, `line` and `program` production has a run test. Each error code has a compile-error test.

## Open questions

1. Should a blank line be an error (as written) or skipped? Writing it as an error keeps the grammar free of an optional line form. Skipping it is a one-line change to the grammar if the implementers find it awkward.
2. Does the card need the grammar block, or is the grammar only needed in the full core? The card needs only the error table and one example. The implementer should check the card against the 2,000-token cap once it is written.
