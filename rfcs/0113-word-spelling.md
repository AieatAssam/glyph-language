---
status: accepted
votes:
  designer-min: approve
  designer-safe: approve
  impl-1: approve
  impl-2: approve
  tester: approve
---
Class: language
Slug: word-spelling
Amends: RFC 0104 (lexical-syntax-v6): rule 7, the keyword list, and the grammar productions that name `wh`, `ret`, `ex` and `put`. RFC 0109 (kernel-v47): the statement and declaration text that names these words, and the kernel card in `spec/card.md`.

## Summary

Four keywords take longer spellings: `wh` becomes `while`, `ret` becomes `return`, `ex` becomes `example`, and `put` becomes `print`. The keyword count stays at fifteen. Nothing else in the language changes.

The counter in force is a real byte-pair tokeniser (`tools/check/tokens.py`). Measured inside programs, a long spelling never costs more than the short one. It costs one token less in one measured program and ties in the others. Where the counts tie, the long word is the one models already write, so it is chosen.

## Motivation

RFC 0048 shortened these words because the counter of the time charged one token per four letters. That counter is gone. RFC 0104 and RFC 0109 still cite it ("`while` costs 2"). Under the real counter, each of the eight spellings is one token on its own, so the short words were never cheaper alone. In canonical layout the tokeniser joins `{return` and `{while` with what follows more often than `{ret` and `{wh`.

## Design

Normative. Each rule binds implementers.

W1. The keywords are exactly these fifteen words, all lowercase: `let var if else while return true false and or not example io print fail`. Each is its own token kind. `wh`, `ret`, `ex` and `put` are no longer keywords; they lex as `IDENT` and are ordinary names.

W2. The grammar of RFC 0104 applies with these token renames: `"wh"` is `"while"`, `"ret"` is `"return"`, `"ex"` is `"example"`, `"put"` is `"print"`. Every other production is unchanged. Rules that quote a word (RFC 0104 G2, G3, G5, G8; RFC 0109 F4 and F6) quote the new spelling. Their meaning is unchanged.

W3. `while`, `return`, `example` and `print` are reserved. A binding, parameter or declaration that takes one of them is E0003 at the word (RFC 0104 G3).

W4. `spec/card.md` kernel lines change to: `print e` for `put e`; `while e{}` for `wh e{}`; `return [e]` for `ret [e]`; `example e` for `ex e` (in the declaration line, the example line and the statement list). Nothing else in the card changes.

W5. No diagnostic code is added, changed or retired.

W6. `fail`, `true`, `false`, `let`, `var`, `if`, `else`, `and`, `or`, `not`, `io`, `Int` and `Bool` keep their spellings.

## Alternatives

- **Keep the short words (RFC 0104).** Rejected. `ret` costs one token more in the measured sample. Nothing is cheaper.
- **Change only `ret`.** Same counts as the full change in every measured program. Rejected: `wh`, `ex` and `put` tie on count, and among equal forms the one models already write wins (Design principle 8). `while`, `example` and `print` are the forms models write; `wh`, `ex` and `put` are not.
- **Other spellings of the four words.** Not measured. No other spelling is proposed.

## Cost

Counted with `sbx python3 -m tools.check.tokens` on programs in canonical layout. Each row is the RFC 0109 program in its present spelling and with all four words long.

| Program | Now | All four long |
| `sq` sample of RFC 0109 | 36 | 35 |
| `fib` (`if n<2{ret n}ret fib(n-1)+fib(n-2)`, `put fib(10)`) | 33 | 32 |
| `sum` (`var s=0 var i=0 wh i<n{i=i+1 s=s+i}ret s`, `put sum(3)`) | 42 | 42 |

Per word, from the same programs:

| Word | Long | Change |
| `wh` | `while` | 0 in `sq` (36 to 36) and `sum` (42 to 42) |
| `ret` | `return` | -1 in `sq` (36 to 35). 0 in `sum`. In `fib`, `put` alone is 33 to 33, so the -1 (33 to 32) is `ret` |
| `ex` | `example` | 0 in `sq` (36 to 36) |
| `put` | `print` | 0 in `sq` (36 to 36) and `fib` (33 to 33) |

Total over the three programs: 111 to 109 tokens, -1.8 %. The owner's figure from RFC 0105's 91 programs (22 of 1108) is not reproduced here; those programs are not in the tree.

Card: `spec/card.md` kernel text, full, 251 tokens now and 251 after this change. Keywords: 15 to 15. Core spec: the change is renames, so the core spec gains no tokens in the measured lines; its total is not measured here.

## Test plan

Tests added:

- `spell/sample` (run): `sq(n Int)Int{return n*n}example sq(3)==9 main io{var i=1 while i<=3{print sq(i)i=i+1}}`. Output `1`, `4`, `9`, one per line. Exit 0. Covers all four words.
- `spell/names` (run): `main io{let wh=1 let ret=2 let ex=3 let put=4 print wh+ret+ex+put}`. Output `10`. Exit 0. The four short words are names.
- `spell/err-while-name` (compile-error): `main io{let while=1}`. E0003 at bytes 12 to 17.
- `spell/err-return-mid` (compile-error): `main io{return print 1}`. E0100 at bytes 15 to 20 (`print`).
- `spell/err-example-block` (compile-error): `main io{example 1}`. E0100 at bytes 8 to 15.

Tests that name these words in RFC 0104 and RFC 0109 keep their expected results with the new spellings. `lex/kw-while`, `lex/kw-return`, `lex/kw-example` and `lex/kw-print` expect the keyword kind; in RFC 0104 `while`, `return` and `example` were identifiers.

## Open questions

1. `example` and `print` were chosen on a tie in tokens. Error rates for the spellings are not measured. The benchmark run should confirm that models write these words without error.
2. `fail` is still a keyword with no rule that uses it (RFC 0109, open question 1). This RFC does not decide it.
