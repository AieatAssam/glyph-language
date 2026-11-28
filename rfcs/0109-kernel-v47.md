---
status: accepted
votes:
  designer-min: approve
  designer-prag: approve
  impl-1: approve
  impl-2: approve
  tester: approve
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v47
Replaces: RFC 0105 (kernel-v46).
Amends: RFC 0104 (lexical-syntax-v6), its `decl` production and its rule G10: the `fail` mark is removed (L1, F7). Its keyword set and every other rule stand.
Meaning of every form here is given by this RFC and by RFC 0104 as amended. Diagnostic records follow `spec/core/diagnostic.md`. Codes are listed in `spec/errors.json`.

## Summary

The kernel is the smallest part of Glyph that runs a useful program: `Int` and `Bool`, bindings, functions with an optional result, the `io` mark, `if`, `wh`, `ret`, examples (`ex`), and `put`. Statements take no separator, and the syntax is that of RFC 0104. Text is printed only (T3). Any function may trap, and no mark in its signature says so (F7). A trap writes one line `trap: <kind>` and exits with status 1 (TR1).

Against RFC 0105 this RFC removes the `fail` mark, its check (F7) and its code (E0403). Every other decision of RFC 0105 stays, restated here where a superseded RFC would otherwise be cited.

The kernel card, which K1 puts at the top of `spec/card.md`:

```
# Card: kernel
Types: Int, Bool. Text literal only as the whole argument of put.
Stmts, no separator: let x=e | var x=e | x=e (var only) | f(a) | put e | if e{}else{} | wh e{} | ret [e] (last in a block).
Decl: name [(p T,...)] [R] [io] {block} [ex e]. Params: name T. No parameters: no parentheses.
Ops low to high: or; and; == != < <= > >= (no chain); + -; * / %; unary - not.
Int: 64-bit. + - * unary - trap overflow; / % trap divide-by-zero; MIN/-1 traps overflow; MIN%-1 is 0.
Any function may trap. No mark says so.
put e: Int in decimal, or text bytes; then LF.
Entry: main [io]. No parameters, no result.
Ex: ex e after a decl; e is Bool; calls no io function.
Trap: stderr "trap: K" and LF, exit 1. K: overflow, divide-by-zero, stack-exhausted, step-exhausted.
```

The complete program that uses every form (`io`, `var`, `wh`, `put`, an example, a call). It prints `1`, `4`, `9`:

```
sq(n Int)Int{ret n*n}ex sq(3)==9 main io{var i=1 wh i<=3{put sq(i)i=i+1}}
```

## Motivation

Attempt 47. RFC 0105 (kernel-v46) was superseded. Each finding of the owner's measurement is answered here.

- **Process text.** This RFC writes no gate, prerequisite or status line. Retiring `conformance/kernel/print-one.test` is a step of the implementing PR (Test plan).
- **`fail` (finding 1).** The counter gives one token per `fail` mark. The owner measured 39 of RFC 0105's 1108 tokens on its 91 programs; the sample in this RFC loses 2 of 38 tokens (Cost). The mark is a fact the compiler derives from the body (F7 checked it, and E0403 rejected a wrong mark). Principle 3 exempts such a mark, and also a mark that nearly every function would carry: a function that adds, loops or calls another function is the common case. The mark tells a reader nothing the body does not. The rare case, a function that cannot trap, is left unmarked too, because a second mark for it would be one more token on a few functions and one more rule to check. Principle 7 still holds: a trap is a defined outcome (TR1), not an undefined one.
- **`io` (finding 1, same test).** `io` stays. It is not carried by most functions: a function that writes no output is the unmarked case. More importantly, rules F2 and EX2 decide whether a call is allowed from the callee's signature alone (principle 2). If `io` were derived from the body, a caller would have to read the callee's body. Trapping changes no rule that a caller or an example follows, so the `fail` mark had no reader. Its only checker was F7, which polices the mark itself.
- **Spellings (finding 2).** The forms are those of RFC 0104: `wh`, `ret`, `ex`, `put`. No spelling is decided here.
- **Standard input (finding 3).** The kernel has no way to read standard input. A later RFC adds it (owner brief `input`). This RFC neither adds an input form nor reserves a name for one.
- **Superseded rules (finding 4).** No rule is cited from RFCs 0050, 0086 or 0093. The reserved names (B5) and the codes (Diagnostics) are restated. The trap line (TR1) is stated once, here: no diagnostic RFC in force defines one. RFC 0050 is superseded, and RFCs 0101, 0106 and 0107 are rejected.
- **Length (finding 5).** The RFC is under 25,000 characters. The test plan is kept whole.

## Design

Normative. "Must" and "is" bind implementers.

L1. Syntax is the grammar of RFC 0104, with one change. A declaration is:

`IDENT [ "(" param { "," param } ")" ] [ rtype ] [ "io" ] block { "ex" expr }`

The `fail` alternative is removed from `decl`, and rule G10 of RFC 0104 reads "the marks come in this order: result type, then `io`". `fail` is still a keyword (RFC 0104 rule 7). So a `fail` where a mark or a block is expected is E0100 at it (RFC 0104 G3). No other rule of RFC 0104 changes.

L2. A statement starts with `let`, `var`, `put`, `if`, `wh` or a name, never with an operator, `(` or a literal. `ret` is not a statement: it is the optional last item of a block (RFC 0104 `block`). After a name at the start of a statement, `=` begins an assignment and `(` begins a call; any other token there is E0100 at it. So `put a put b` is two statements, in `put a-1` the `-` is binary, and `put-7` is `put` with the unary `-7` (`put` is a keyword, not an operand). A statement that starts with a literal, `(` or an operator, such as `1+2`, is E0100 at that first token.

L3. At top level a declaration starts with a name. `fn main io{}` is E0100 at `main` (RFC 0104 G12).

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (RFC 0104 rule 8), including after unary `-`. The minimum is written `-9223372036854775807-1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is valid only as the whole argument of `put`, with no parentheses around it: `put"a"`. Anywhere else (`let t="a"`, `put("a")`, `f("a")`, `1=="a"`) it is E0200 at the literal, and the expression has type `?` (E8). `Text` is not a type: in a type position it is E0100 at the name (RFC 0104 G4), and as a value it is E0301.

T4. No implicit conversions. No unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call, and the value has type `?`.

T6. A type position accepts `Int` and `Bool` only. `Int` and `Bool` used as values are E0301 at the name.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; then call, literal, name, and `( expr )`. Binary operators are left-associative. Comparisons do not chain (RFC 0104 G6).

Parsing. The parser implements the productions `expr`, `and_expr`, `cmp_expr`, `add_expr`, `mul_expr`, `unary` and `primary` of RFC 0104, and nothing else. A `TEXT` token is a `primary` wherever an expression may stand, so the parser accepts it and T3 is checked afterwards. `put(e)` parses as `put` followed by the group `(e)`, which is the same statement as `put e`. An expression ends where the grammar stops. If the next token neither continues the expression nor can begin a statement or is the block's `}`, that token is E0100. An expression that is required where the next token cannot begin one (`put}`, `let a=}`) is E0100 at that token.

E1. `+`, `-` and `*` on `Int` give the exact result if it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` and `%` truncate toward zero. `%` takes the sign of its left operand, so `-7%3` is `-1`. A zero divisor traps `divide-by-zero`. `MIN/-1` traps `overflow`. `MIN%-1` is `0` and does not trap.

E3. `==` and `!=` take two `Int` or two `Bool`. `<`, `<=`, `>` and `>=` take two `Int`. `and`, `or` and `not` take `Bool`. `+ - * / %` and unary `-` take `Int`. Any other operand type is E0200 at the operator (E9). `Text` has no equality.

E4. `and` and `or` short-circuit.

E5. The condition of `if` and `wh` is `Bool`, else E0200 at the condition.

E6. A call's argument count and types must match its parameters. Otherwise E0200 at the argument, or at the callee name for a count error.

E7. Evaluation is left to right: the left operand before the right; call arguments in order, then the call.

E8. **Recovery.** A failed expression takes its operator's or callee's result type, or `?`, with no further diagnostic.

E9. **Spans.** An operator error (E3) is E0200 at the operator. A condition error is at the condition; an argument error, at the argument.

### Bindings

B1. `let NAME=expr` is immutable. `var NAME=expr` is mutable. The binding has the type of `expr`. There is no annotation (RFC 0104 G11).

B2. Assignment `NAME=expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, in order, as if by a `let` at its start. A `let` of a parameter's name in the body, or a second parameter with the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take `Int`, `Bool`, a function name, or one of the reserved names `Byte`, `byte` and `int`. Each is E0300 at the new name. `put` and `fail` are keywords, so a binding with either name is E0003 (RFC 0104 G3).

### Functions

F1. `NAME [ "(" p1 T1 , ... ")" ] [ R ] [ "io" ] block`, where `R` is `Int` or `Bool`. A declaration with no parameters has no parentheses: `f{}` declares a function with no parameters, no result and no `io`. `f()` is never a declaration (RFC 0104 G9).

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name (for `put`, at the keyword). An example may call neither (EX2).

F3. A block *returns* if its last item is `ret`, or if its last item is an `if` with an `else` whose two blocks both return. A `wh` never returns. A function with a result clause whose body does not return is E0201 at the closing `}` of the body.

F4. `ret e` needs a result clause and an `e` of its type. A mismatch, or a value returned from a function with no result, is E0200 at `e`. `ret` with no expression in a function with a result clause is E0200 at `ret`. A bare `ret` in a function with no result leaves it at once (C2).

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file: a second declaration of a name is E0300 at its name. A function named `put` or `fail` is E0003 (RFC 0104 G3). Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **Traps.** Any function may trap (TR1). A declaration carries no mark for this, and there is no rule about it. A function that cannot trap is not marked either: the kernel has no such mark.

C0. **Ordering.** Example evaluation (EX3) runs only when no other error is reported.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io`. Missing is E0302 at the end-of-file token. A second `main` is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put e` is a statement with the effect `io`. `e` is one expression of type `Int`, or a text literal (T3). Any other type, including `Bool`, is E0200 at `e`. `put` takes exactly one expression: `put 1 2` is E0100 at `2`, and `put(1,2)` is E0100 at `,`.

P2. `put` of an `Int` writes decimal with a leading `-` if negative, then LF. Of a text literal it writes the decoded bytes (RFC 0104 rule 9), then LF. Output is WASI `fd_write` to standard output. Each `put` finishes before the next statement.

### Conditionals, loops and examples

C1. `if e block [else block]`. The `else` part is a block only (RFC 0104 G7).

C2. `wh e block`. There is no `break` or `continue`. A function with a result leaves early with `ret e`. A function with no result, `main` included, leaves early with bare `ret`. Either may sit in an `if` or `wh` body, since a block's `ret` is its last item.

EX1. `ex e` follows a declaration's closing `}` or another of its examples. Any other `ex` is E0100 at `ex` (RFC 0104 G5).

EX2. `e` must be `Bool`, else E0200 at `e`. It may call only functions without `io`. Calling an `io` function is E0400 at the callee name. `put` cannot appear in an expression, so it is E0100 there.

EX3. `glyphc check`, `build` and `run` each evaluate every example, when C0 finds no error, at depth 0 with a new loop counter. `true` passes. `false`, or a trap, is E0202 from `ex` to the end of `e`.

### Traps

TR1. A trap writes one line to standard error, `trap: <kind>`, then LF, and exits with status 1 through WASI `proc_exit`. The line is plain text, not JSON, and the run writes nothing else to standard error. Output written before the trap stays written. The kinds are `overflow` (E1, E2), `divide-by-zero` (E2), `stack-exhausted` (TR2) and `step-exhausted` (TR3). No diagnostic RFC in force defines a trap line, so this rule defines it, and it matches the card.

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`, checked at each function entry.

TR3. Each call frame has its own loop counter, starting at 0. Each evaluation of a `wh` condition in that frame's body adds 1. Before an addition would exceed 10000000, the run traps `step-exhausted`.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order among that function's examples.

### Card

K1. The implementing PR puts the kernel card from the Summary at the top of `spec/card.md`. The diagnostics card already states the trap line and needs no change.

### Diagnostics

Records follow `spec/core/diagnostic.md`. The codes below are restated in full; none of E0200 to E0500 that this RFC uses is yet in `spec/errors.json`, and the first PR that emits each adds it there with a message and a meaning.

| Code | Meaning and rules | Span |
| --- | --- | --- |
| E0001, E0002, E0005, E0006, E0100 | lexical and syntax, as RFC 0104 defines them, and the parse rules of L2 and the Expressions section | per RFC 0104 |
| E0003 | keyword where a name is required (`put` and `fail` as a binding or function name; RFC 0104 G3) | the keyword |
| E0200 | type mismatch (E3 to E6, B2, F4, EX2, M1, P1, T3, T5) | per E9, or the literal |
| E0201 | result clause, body does not return (F3) | the closing `}` |
| E0202 | example false or traps (EX3) | `ex` to end of `e` |
| E0300 | duplicate or reserved name (B4, B5, F6, M1) | the new name |
| E0301 | unknown name, or a type or function name used as a value | the name |
| E0302 | no `main` (M1) | end-of-file token |
| E0303 | assignment to a `let` or a parameter (B2) | the target name |
| E0400 | `io` call or `put` from a function without `io`, or from an example (F2, EX2) | the callee name, or `put` |
| E0500 | integer literal above the `Int` range (T1) | the literal |

E0403 is retired. No rule of this RFC emits it, and it is not reused.

## Alternatives

- **Keep the `fail` mark (RFC 0105, RFC 0104 G10).** Rejected. It costs one token on each trapping function (Cost), and its only checker, F7, polices the mark and no caller's rule.
- **Mark only the functions that cannot trap.** Rejected. A second mark needs a rule to check it, and the check would reject the same bodies that F7 rejects. The reader gains nothing a rule uses.
- **Infer `io` from the body.** Rejected. Then F2 and EX2 need the callee's body, not its signature (principle 2).
- **Keep `;`, `fn`, `n:Int`, `):Int` or `main()` (RFC 0085, RFC 0103).** Rejected. Each costs tokens and removes no ambiguity. RFC 0104 removes them.
- **Trap as one JSON line with status 3 (RFC 0050, RFC 0103).** Rejected. It gives standard error a second format, and it costs more tokens per trap.
- **Infer the result type from `ret`.** Rejected: a mutually recursive pair with no result clause would need its types solved together.

## Cost

Measured with `sbx python3 -m tools.check.tokens` on scratch files in `out/scratch/` (not repo files). The counts are those of the protected counter as it is now.

| Snippet | With `fail` (RFC 0105 form) | This RFC |
| --- | --- | --- |
| sample (`sample-v46.txt`, `sample-v47.txt`) | 38 | 36 |
| fib with its marks (`fib-v46.txt`, `fib-v47.txt`) | 35 | 33 |
| kernel card (`card-v46.txt`, `card-v47.txt`) | 263 | 251 |
| `io` mark (`io-mark.txt` with `main io{}`, `io-none.txt` with `main{}`) | not applicable | 3 and 2: the mark costs 1 token, and is kept |

- Each trapping function saves one token: the `fail` mark. The owner's measure on RFC 0105's 91 programs was 39 of 1108 tokens.
- The card loses the `fail` line and the `[fail]` of the declaration line. It gains "Any function may trap. No mark says so." The card is far below the 2,000-token cap.
- The core spec is capped at 12,000 tokens, checked by the merge bot. Its total is not measured here. The change to it is the removal of the `fail` production and of F7, and the addition of TR1's trap line and F7's sentence.
- Removed relative to RFC 0105: the `fail` mark, rule F7, code E0403.
- The parse rules added here (L2, Expressions, Parsing) add no tokens to any program. They fix where E0100 is reported.

## Test plan

Conformance tests live in `conformance/kernel/`. Test ids are `kernel/<name>`. Every program is in canonical layout (RFC 0104 rule 4): one line, no separator, no comments. A run test expects exit 0 and the stated stdout. A trap test expects exit 1 and the stated stderr line. A compile-error test expects one record with the stated code and span (RFC 0004 section 7). "Error at" names the token the span covers.

Run tests (status 0; stdout as stated):

| Test | Program | Stdout |
| --- | --- | --- |
| `put-one` | `main io{put 1}` | `1` |
| `print-int` | `main io{put 0 put-7 put 9223372036854775807}` | `0`, `-7`, `9223372036854775807` |
| `int-min` | `main io{put-9223372036854775807-1}` | `-9223372036854775808` |
| `put-text` | `main io{put"a\"b\"\\"}` | `a"b"\` |
| `let-var` | `main io{let a=1 var b=2 b=b+a put b}` | `3` |
| `bool-ops` | `main io{if 1<2 and not false{put 1}else{put 2}}` | `1` |
| `short-circuit` | `side Bool io{put 9 ret true}` and `main io{if false and side(){put 1}if true or side(){put 2}}` | `2` |
| `cmp-ordering` | `main io{if 2>1{put 1}if 2>=2{put 2}if 1<=2{put 3}if 1>=2{put 9}}` | `1`, `2`, `3` |
| `arith` | `main io{put 7/-2 put-7%3 put 2*3+4*5 put-3+1 put 3*(1+2)}` | `-3`, `-1`, `26`, `-2`, `9` |
| `min-mod` | `main io{let m=-9223372036854775807-1 put m%-1}` | `0` |
| `digit-sum` | `main io{var n=1204 var s=0 wh 0<n{s=s+n%10 n=n/10}put s}` | `7` |
| `fn-call` | `add(a Int,b Int)Int{ret a+b}` and `main io{put add(2,3)}` | `5` |
| `fn-result-io` | `sq(x Int)Int io{put x ret x*x}` and `main io{put sq(3)}` | `3`, `9` |
| `fn-bool-param` | `pick(b Bool)Int{if b{ret 1}ret 2}` and `main io{put pick(true)put pick(false)}` | `1`, `2` |
| `fn-io` | `say(x Int)io{put x}` and `main io{say(4)}` | `4` |
| `fn-void` | `f{}` and `main io{f()}` | none |
| `fn-recursion` | `fact(n Int)Int{if n<=1{ret 1}ret n*fact(n-1)}` and `main io{put fact(10)}` | `3628800` |
| `if-else-return` | `f(n Int)Int{if n==0{ret 1}else{ret 2}}` and `main io{put f(0)put f(1)}` | `1`, `2` |
| `ret-bare` | `g(n Int)io{if n==0{ret}put n}` and `main io{g(0)g(1)}` | `1` |
| `shadow` | `main io{let a=1 if true{let a=2 put a}put a}` | `2`, `1` |
| `example-ok` | `double(x Int)Int{ret x*2}ex double(3)==6 ex not false` and `main io{put double(4)}` | `8` |
| `sample` | the Summary's sample program | `1`, `4`, `9` |

Trap tests (exit 1; the stated stdout; the stated stderr line):

| Test | Program | Stdout | Stderr |
| --- | --- | --- | --- |
| `trap-overflow` | `main io{put 4611686018427387904*2}` | none | `trap: overflow` |
| `trap-add` | `main io{put 9223372036854775807+1}` | none | `trap: overflow` |
| `trap-min` | `main io{let m=-9223372036854775807-1 put m/-1}` | none | `trap: overflow` |
| `trap-div` | `main io{put 1/0}` | none | `trap: divide-by-zero` |
| `trap-pure` | `f(n Int)Int{ret 4611686018427387904*n}` and `main io{put f(2)}` | none | `trap: overflow` |
| `trap-stack` | `f(n Int)Int{ret f(n)}` and `main io{put f(1)}` | none | `trap: stack-exhausted` |
| `trap-step` | `main io{put 1 wh true{}}` | `1` | `trap: step-exhausted` |

Compile-error tests (one error each; the record is the code and the span named):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `kc-text-let` | `main io{let t="x"}` | the `"x"` | E0200 |
| `kc-text-cmp` | `main io{if 1==true{}}` | the `==` | E0200 |
| `kc-put-paren` | `main io{put("a")}` | the `"a"` | E0200 |
| `kc-put-bool` | `main io{put true}` | the `true` | E0200 |
| `kc-put-comma` | `main io{put(1,2)}` | the `,` | E0100 |
| `kc-put-two` | `main io{put 1 2}` | the `2` | E0100 |
| `kc-put-empty` | `main io{put}` | the `}` | E0100 |
| `kc-expr-stmt` | `main io{1+2}` | the `1` | E0100 |
| `kc-cmp-chain` | `main io{put 1<2<3}` | the second `<` | E0100 |
| `kc-type` | `main io{if 1{}}` | the `1` | E0200 |
| `kc-bool-op` | `main io{let a=1 and true}` | the `and` | E0200 |
| `kc-arity` | `add(a Int,b Int)Int{ret a+b}` and `main io{put add(1)}` | the `add` of the call | E0200 |
| `kc-void-value` | `f{}` and `main io{let x=f()}` | the call `f()` | E0200 |
| `kc-ret-value` | `f io{ret 1}` and `main io{f()}` | the `1` | E0200 |
| `kc-assign-type` | `main io{var a=1 a=true}` | the `true` | E0200 |
| `kc-example-type` | `f Int{ret 1}ex 1 main io{put f()}` | the `1` after `ex` | E0200 |
| `kc-main-sig` | `main(n Int)io{}` | the `main` | E0200 |
| `kc-ret-bare` | `f Int io{ret}` and `main io{put f()}` | the `ret` | E0200 |
| `kc-fn-word` | `fn main io{}` | the `main` | E0100 |
| `kc-fail-after-io` | `main io fail{put 1}` | the `fail` | E0100 |
| `kc-fail-after-name` | `main fail{}` | the `fail` | E0100 |
| `kc-int-max` | `main io{put 9223372036854775808}` | the literal | E0500 |
| `kc-int-min` | `main io{put-9223372036854775808}` | the literal | E0500 |
| `kc-missing-ret` | `f(n Int)Int{if n==0{ret 1}}` and `main io{put f(0)}` | the closing `}` of `f` | E0201 |
| `kc-if-else-partial` | `f(n Int)Int io{if n==0{ret 1}else{put 2}}` and `main io{put f(0)}` | the closing `}` of `f` | E0201 |
| `kc-wh-return` | `f Int{wh false{ret 1}}` and `main io{put f()}` | the closing `}` of `f` | E0201 |
| `kc-example` | `f Int{ret 1}ex 1==2 main io{put f()}` | `ex 1==2` | E0202 |
| `kc-example-trap` | `f Int{ret 1}ex 1/0==0 main io{put f()}` | `ex 1/0==0` | E0202 |
| `kc-example-budget` | `spin Int{wh true{}ret 0}ex spin()==0 main io{}` | `ex spin()==0` | E0202 |
| `kc-example-stack` | `f(n Int)Bool{ret f(n)}ex f(1)main io{}` | `ex f(1)` | E0202 |
| `kc-dup` | `add Int{ret 1}add Int{ret 2}main io{}` | the second `add` | E0300 |
| `kc-dup-main` | `main io{}main io{}` | the second `main` | E0300 |
| `kc-dup-param` | `f(a Int)Int{let a=1 ret a}` and `main io{put f(1)}` | the `a` of `let a` | E0300 |
| `kc-dup-param-2` | `f(a Int,a Int)io{}` and `main io{f(1,1)}` | the second `a` | E0300 |
| `kc-reserved-int` | `main io{let Int=1}` | the `Int` | E0300 |
| `kc-reserved-byte` | `main io{let byte=1}` | the `byte` | E0300 |
| `kc-reserved-put` | `main io{let put=1}` | the `put` | E0003 |
| `kc-reserved-fail` | `main io{let fail=1}` | the `fail` | E0003 |
| `kc-fn-put` | `put Int{ret 1}main io{}` | the `put` | E0003 |
| `kc-unknown` | `main io{put zz}` | the `zz` | E0301 |
| `kc-use-before` | `main io{put a let a=1}` | the first `a` | E0301 |
| `kc-type-value` | `main io{put Int}` | the `Int` | E0301 |
| `kc-fn-value` | `add(a Int,b Int)Int{ret a+b}` and `main io{let f=add}` | the `add` | E0301 |
| `kc-no-main` | `f{}` | the end-of-file token (offset 3) | E0302 |
| `kc-assign-let` | `main io{let a=1 a=2}` | the `a` of `a=2` | E0303 |
| `kc-assign-param` | `f(n Int)io{n=2}` and `main io{f(1)}` | the `n` of `n=2` | E0303 |
| `kc-effect` | `f{put 1}` and `main io{f()}` | the `put` | E0400 |
| `kc-effect-call` | `g io{}f{g()}` and `main io{f()}` | the `g` | E0400 |
| `kc-effect-example` | `say Int io{ret 1}ex say()==1 main io{put say()}` | the `say` in the example | E0400 |

Every grammar production of RFC 0104 as amended is reached by a `kernel` test or by an RFC 0104 test. The `decl` production without `fail` is reached by `kc-fail-after-io` and `kc-fail-after-name`. The `put` statement and the parse rules of L2 and the Expressions section are reached by `kc-put-comma`, `kc-put-two`, `kc-put-empty`, `kc-expr-stmt` and `kc-cmp-chain`.

Retirement and changes to other tests:

- `kernel/print-one` (`print(1)`, `fn main`) uses forms that RFC 0104 removes. The implementing PR retires it.
- RFC 0104's test plan lists programs with a `fail` mark. Those tests are not yet in the tree. The lexical implementing PR writes them without the mark and keeps their expectations. `lex/v6-fail-mark` (`main io fail{put 1+1}`) instead expects E0100 at the `fail` (bytes 8 to 12).
- `lex/kw-fail` is unchanged: `fail` stays a keyword.

## Open questions

1. **`fail` as a keyword.** RFC 0104 rule 7 keeps `fail` reserved. With no mark it has no use, so the lexical owner may drop it from the keyword set, which makes `fail` an ordinary name. This RFC needs only that `decl` has no `fail` alternative, so it works either way.
2. **Standard input.** The kernel has no input form. Owner brief `input` adds one in a later RFC. This RFC neither adds nor reserves a name for it.
3. **TR3 limit.** The 10000000 steps are per call frame and do not bound a run's total work.
4. **Text type.** Staged for the standard library RFC.
5. **Codes E0200 to E0500 not in `spec/errors.json`.** The first PR that emits each adds it there (RFC 0004 section 7).
