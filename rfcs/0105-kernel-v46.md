# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v46
Status: draft (attempt 46)
Replaces: RFC 0085 (kernel-v44, accepted). Keeps its decisions except where Summary and Motivation say otherwise.
Depends on: `lexical-syntax-v6` (Gate G-d: tokens, keywords, layout and grammar); RFC 0086 (accepted; reserved `Byte`, `byte`, `int`); RFC 0093 (accepted; meanings of E0200 to E0403).
Amends: RFC 0050 section 5 (trap line). A trap is `trap: <kind>` with exit status 1, as RFC 0085 TR1 and `spec/core/diagnostic.md` already say. RFC 0050 section 5 says one JSON line with status 3, and is replaced there.
Alters tests: yes. `conformance/kernel/print-one.test` (`print(1)`) passes today and fails under this RFC. It is not edited.
Breaking: yes.
Prerequisite: RFC `retire-print-one`, not open. It must be accepted first.

**Gates.** This is a supermajority RFC (RULES rule 4: `breaking` or `alters_tests`).

- G-a. Open until voted. Approvals must be at least 0.75 of non-abstaining votes (`tools/lib/rfc.py`). Quorum is five votes cast, abstentions included.
- G-b. Open. RULES rule 6 bars a rejected RFC's substance for 10 nights. This draft repeats the substance of rejected RFC 0103 (kernel-v45) in its kernel design, so the orchestrator decides before any vote whether that bar applies.
- G-c. Open. `print-one.test` passes today and fails under this RFC, so CI cannot pass until `retire-print-one` is accepted. This draft does not open it. No vote before then. This text does not close the gate.
- G-d. Open. The syntax is `lexical-syntax-v6` (attempt 6), which is not yet accepted. If that draft is accepted differently, this RFC is revised first.

## Summary

The kernel is the smallest part of Glyph that runs a useful program: `Int` and `Bool`, bindings, functions with an optional result, the `io` and `fail` marks, `if`, `wh`, `ret`, examples (`ex`), and `put`. Statements take no separator. Text is printed only (T3). A trap writes one line `trap: <kind>` and exits with status 1 (TR1).

The kernel card, which K1 puts at the top of `spec/card.md`:

```
# Card: kernel
Types: Int, Bool. Text literal only as the whole argument of put.
Stmts, no separator: let x=e | var x=e | x=e (var only) | f(a) | put e | if e{}else{} | wh e{} | ret [e] (last in a block).
Decl: name [(p T,...)] [R] [io] [fail] {block} [ex e]. Params: name T. No parameters: no parentheses.
Ops low to high: or; and; == != < <= > >= (no chain); + -; * / %; unary - not.
Int: 64-bit. + - * unary - trap overflow; / % trap divide-by-zero; MIN/-1 overflow.
fail: body has + - * / %, unary -, wh, or calls a file function. Else E0403.
put e: Int in decimal, or text bytes; then LF.
Entry: main [io] [fail]. No parameters, no result.
Ex: ex e after a decl; e is Bool; calls no io function.
Trap: stderr "trap: K" and LF, exit 1. K: overflow, divide-by-zero, stack-exhausted, step-exhausted.
```

The complete program that uses every form (`io`, `fail`, `var`, `wh`, `ret`, `ex`, `put`, and a call). It prints `1`, `4`, `9`:

```
sq(n Int)Int fail{ret n*n}ex sq(3)==9 main io fail{var i=1 wh i<=3{put sq(i)i=i+1}}
```

## Motivation

Attempt 46. RFC 0103 (kernel-v45) was rejected. Each objection is answered here.

- **Syntax (designer-min, user-1, user-2, impl-1, tester).** The sample, card and tests use the forms of `lexical-syntax-v6`: `n Int`, `)Int`, `main io`, one line, `put` without parentheses, no `\n` escape, no comments, no `;`. No test relies on a rule that the syntax RFC removes.
- **Trap form (designer-prag, impl-1, user-2, tester).** The trap is `trap: <kind>` with status 1 (TR1), as RFC 0085 TR1, `spec/core/diagnostic.md` and `spec/card.md` state. RFC 0101's trap rule is the same. The kinds keep the hyphenated spelling of TR1 and the compiler's table: `divide-by-zero`. This replaces RFC 0103's JSON line with status 3.
- **Keywords and bare `ret` (tester).** `put` and `fail` are keywords (lexical rule 7). A bare `ret` is valid only as a block's last item in a function with no result (F4).
- **Fail rule (user-1).** "A call to a `file decl`" is replaced by "a call to a function declared in the file" (F7).
- **Reserved names.** `let put=1` and `let fail=1` are E0003, since both words are keywords (lexical rule G3). They were E0300 in RFC 0103.
- **Layout and comments.** RFC 0103's multi-line `layout` test and its `comment-line` test are removed. A line feed outside text is E0002, and `//` is E0100 (lexical rules 4 and 5). The lexical RFC tests both.

## Design

Normative. "Must" and "is" bind implementers.

L1. Syntax is the grammar of `lexical-syntax-v6`, with its tokens, keywords and canonical layout, and no other grammar. In particular a declaration is `NAME [ "(" param { "," param } ")" ] [ type ] [ "io" ] [ "fail" ] block { "ex" expr }`, a parameter is `NAME type`, and a block is `"{" { stmt } [ "ret" [ expr ] ] "}"`.

L2. A statement starts with `let`, `var`, `put`, `if`, `wh` or a name, never with an operator, `(` or a literal. So `put a put b` is two statements, and in `put a-1` the `-` is binary.

L3. At top level a declaration starts with a name. `fn main io{}` is E0100 at `main`.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (lexical rule 8), including after unary `-`. The minimum is written `-9223372036854775807-1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is valid only as the whole argument of `put`, with no parentheses around it: `put"a"`. Anywhere else (`let t="a"`, `put("a")`, `f("a")`, `1=="a"`) it is E0200 at the literal, and the expression has type `?` (E8). `Text` is not a type: in a type position it is E0100 at the name (lexical G4), and as a value it is E0301.

T4. No implicit conversions. No unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call, and the value has type `?`.

T6. A type position accepts `Int` and `Bool` only; any other name there is E0100 at it. `Int` and `Bool` used as values are E0301 at the name.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; then call, literal, name, and `( expr )`. Binary operators are left-associative. Comparisons do not chain (lexical G6).

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

B1. `let NAME=expr` is immutable. `var NAME=expr` is mutable. The binding has the type of `expr`. There is no annotation (lexical G11).

B2. Assignment `NAME=expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, in order, as if by a `let` at its start. A `let` of a parameter's name in the body, or a second parameter with the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take `Int`, `Bool`, a function name, or a name RFC 0086 reserves (`Byte`, `byte`, `int`); each is E0300 at the new name. `put` and `fail` are keywords, so a binding with either name is E0003 (lexical G3).

### Functions

F1. `NAME [ "(" p1 T1 , ... ")" ] [ R ] [ "io" ] [ "fail" ] block`, where `R` is `Int` or `Bool`. A declaration with no parameters has no parentheses: `f{}` declares a function with no parameters, no result, no `io` and no `fail`. `f()` is never a declaration (lexical G9).

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name (for `put`, the keyword). An example may call neither (EX2).

F3. A block *returns* if its last item is `ret`, or if its last item is an `if` with an `else` whose two blocks both return. A `wh` never returns. A function with a result clause whose body does not return is E0201 at the closing `}` of the body.

F4. `ret e` needs a result clause and an `e` of its type. A mismatch, or a value returned from a function with no result, is E0200 at `e`. `ret` with no expression in a function with a result clause is E0200 at `ret`. A bare `ret` in a function with no result leaves it at once (C2).

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file: a second declaration of a name is E0300 at its name. A function named `put` or `fail` is E0003 (lexical G3). Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **Fail mark.** A body is *trapping* if, outside its examples, it contains a binary `+ - * / %`; a unary `-`; a `wh` statement; or a call to a function declared in the file. A call to `put` does not count. The `fail` token is present if and only if the body is trapping. A wrong mark is E0403 at the function name. The rule reads only the body and the names it calls (principle 2).

C0. **Ordering.** The F7 check, and then example evaluation (EX3), run only when no other error is reported.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io` and `fail`. Missing is E0302 at the end-of-file token. A second `main` is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put e` is a statement with the effect `io`. `e` is one expression of type `Int`, or a text literal (T3). Any other type, including `Bool`, is E0200 at `e`. `put` takes exactly one expression: `put 1 2` is E0100 at `2`, and `put(1,2)` is E0100 at `,`.

P2. `put` of an `Int` writes decimal with a leading `-` if negative, then LF. Of a text literal it writes the decoded bytes (lexical rule 9), then LF. Output is WASI `fd_write` to standard output; each `put` finishes before the next statement.

### Conditionals, loops and examples

C1. `if e block [else block]`. The `else` part is a block only (lexical G7).

C2. `wh e block`. There is no `break` or `continue`. A function with a result leaves early with `ret e`; a function with no result, `main` included, leaves early with bare `ret`. Either may sit in an `if` or `wh` body, since a block's `ret` is its last item.

EX1. `ex e` follows a declaration's closing `}` or another of its examples. Any other `ex` is E0100 at `ex` (lexical G5).

EX2. `e` must be `Bool`, else E0200 at `e`. It may call only functions without `io`. Calling an `io` function is E0400 at the callee name. `put` cannot appear in an expression, so it is E0100 there.

EX3. `glyphc check`, `build` and `run` each evaluate every example, when C0 finds no error, at depth 0 with a new loop counter. `true` passes. `false`, or a trap, is E0202 from `ex` to the end of `e`.

### Traps

TR1. A trap writes one line to standard error, `trap: <kind>`, then LF, and exits with status 1 through WASI `proc_exit`. The line is plain text, not JSON, and the run writes nothing else to standard error. Output written before the trap stays written. The kinds are `overflow` (E1, E2), `divide-by-zero` (E2), `stack-exhausted` (TR2) and `step-exhausted` (TR3), spelled as RFC 0085 TR1 spells them.

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack-exhausted`, checked at each function entry.

TR3. Each call frame has its own loop counter, starting at 0. Each evaluation of a `wh` condition in that frame's body adds 1. Before an addition would exceed 10000000, the run traps `step-exhausted`.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order among that function's examples.

### Card

K1. The implementing PR puts the Summary's kernel card at the top of `spec/card.md`. The diagnostics card and its trap line already say `trap: <kind>` and exit 1 and need no change.

### Diagnostics

Records follow `spec/core/diagnostic.md`. None of E0200 to E0403 is in `spec/errors.json` yet; the first PR that emits each adds it there (RFC 0093 C1).

| Code | Meaning and rules | Span | Source |
| --- | --- | --- | --- |
| E0001, E0002, E0005, E0006 | lexical | per lexical-syntax-v6 | lexical-syntax-v6 |
| E0003 | keyword where a name is required (`put`, `fail` as a binding or function name) | the keyword | lexical-syntax-v6 G3 |
| E0100 | unexpected token (L3, T3, T6, F1, P1, EX1, EX2, C2) | the token | lexical-syntax-v6 |
| E0200 | type mismatch (E3 to E6, B2, F4, EX2, M1, P1, T3, T5) | per E9, or the literal | RFC 0093 |
| E0201 | result clause, body does not return (F3) | the closing `}` | RFC 0093 |
| E0202 | example false or traps (EX3) | `ex` to end of `e` | RFC 0093 |
| E0300 | duplicate or reserved name (B4, B5, F6, M1) | the new name | RFC 0093 |
| E0301 | unknown name, or type or function name used as a value | the name | RFC 0093 |
| E0302 | no `main` (M1) | end-of-file token | RFC 0093 |
| E0303 | assignment to a `let` or a parameter (B2) | the target name | RFC 0093 |
| E0400 | `io` call or `put` from a pure function or an example | the callee name | RFC 0093 |
| E0403 | `fail` mark missing or extra (F7) | function name; fix inserts ` fail` or deletes ` fail` | RFC 0093 |
| E0500 | integer literal above the `Int` range (T1) | the literal | lexical-syntax-v6 |

## Alternatives

- **Keep `;`, `fn`, `n:Int`, `):Int` or `main()` (RFC 0085, RFC 0103).** Rejected: each costs tokens and removes no ambiguity (L2, L3, Cost).
- **Trap as one JSON line with status 3 (RFC 0050 section 5, RFC 0103).** Rejected. It gives stderr a second format, the `spec/core/diagnostic.md` and `spec/card.md` text disagree with it, and it costs more tokens per trap.
- **Infer the result type from `ret`.** Rejected (Cost).

## Cost

Measured with `sbx python3 -m tools.check.tokens` on scratch files in `out/scratch/` (not repo files):

| Snippet | RFC 0103 form | This RFC |
| --- | --- | --- |
| kernel sample (`k-0103.txt`, `k-v6.txt`) | 51 | 47 |
| kernel card (`card-kernel.txt`) | not measured | 326 |
| lexical card addition (`card-v6-add.txt`) | not measured | 224 |

- The sample saves 4 tokens: `:` on the parameter (1), `:` on the result (1), and the `()` of `main` (2). Layout does not change the count.
- `fail` marks (kept). Each costs 1 token. Without them a caller cannot see from the signature that a callee can trap (principle 2), and F7 and E0403 exist to check them.
- Result clause `R` (kept). Without `)Int` the call's type is not in its signature, so a caller must read the body. Result types would then be inferred from the `ret` expressions, and mutually recursive functions with no clause would need their types solved together.
- `I` and `B` versus `Int` and `Bool`: a tie on the sample. Kept, since RFCs 0086 and 0093 use them (Open question 5).
- Both cards are far below the 2,000-token card cap. The core cap of 12,000 is checked by the merge bot and was not measured here.

Net: removes the `:` on parameters and results, and the `()` of parameterless declarations. Keeps the `fail` mark and the result clause. Adds the rules F3, F7, C0, T3, P1 and K1, the trap line of TR1, and the keyword cases of B5 and F6.

## Test plan

Conformance tests are files in `conformance/kernel/`, with `id`, `rfc` and `kind` in the `--- meta` block. Every program is in canonical layout (lexical rule 4): one line, no separator, no comments. Run tests expect exit 0 and the stated stdout. Trap tests expect exit 1 and the stated stderr line. Compile-error tests expect one record with the stated code and span.

Run tests (status 0; stdout as stated):

| Test | Program | Stdout |
| --- | --- | --- |
| `put-one` | `main io{put 1}` | `1` |
| `print-int` | `main io fail{put 0 put-7 put 9223372036854775807}` | `0`, `-7`, `9223372036854775807` |
| `int-min` | `main io fail{put-9223372036854775807-1}` | `-9223372036854775808` |
| `put-text` | `main io{put"a\"b\"\\"}` | `a"b"\` |
| `let-var` | `main io fail{let a=1 var b=2 b=b+a put b}` | `3` |
| `bool-ops` | `main io{if 1<2 and not false{put 1}else{put 2}}` | `1` |
| `short-circuit` | `side Bool io{put 9 ret true}` and `main io fail{if false and side(){put 1}if true or side(){put 2}}` | `2` |
| `cmp-ordering` | `main io{if 2>1{put 1}if 2>=2{put 2}if 1<=2{put 3}if 1>=2{put 9}}` | `1`, `2`, `3` |
| `arith` | `main io fail{put 7/-2 put-7%3 put 2*3+4*5 put-3+1 put 3*(1+2)}` | `-3`, `-1`, `26`, `-2`, `9` |
| `min-mod` | `main io fail{let m=-9223372036854775807-1 put m%-1}` | `0` |
| `digit-sum` | `main io fail{var n=1204 var s=0 wh 0<n{s=s+n%10 n=n/10}put s}` | `7` |
| `fn-call` | `add(a Int,b Int)Int fail{ret a+b}` and `main io fail{put add(2,3)}` | `5` |
| `fn-result-io` | `sq(x Int)Int io fail{put x ret x*x}` and `main io fail{put sq(3)}` | `3`, `9` |
| `fn-bool-param` | `pick(b Bool)Int{if b{ret 1}ret 2}` and `main io fail{put pick(true)put pick(false)}` | `1`, `2` |
| `fn-io` | `say(x Int)io{put x}` and `main io fail{say(4)}` | `4` |
| `fn-void` | `f{}` and `main io fail{f()}` | none |
| `fn-recursion` | `fact(n Int)Int fail{if n<=1{ret 1}ret n*fact(n-1)}` and `main io fail{put fact(10)}` | `3628800` |
| `if-else-return` | `f(n Int)Int{if n==0{ret 1}else{ret 2}}` and `main io fail{put f(0)put f(1)}` | `1`, `2` |
| `ret-bare` | `g(n Int)io{if n==0{ret}put n}` and `main io fail{g(0)g(1)}` | `1` |
| `shadow` | `main io{let a=1 if true{let a=2 put a}put a}` | `2`, `1` |
| `example-ok` | `double(x Int)Int fail{ret x*2}ex double(3)==6 ex not false` and `main io fail{put double(4)}` | `8` |

Trap tests (stdout empty unless stated; stderr; exit 1):

| Test | Program | Stderr |
| --- | --- | --- |
| `trap-overflow` | `main io fail{put 4611686018427387904*2}` | `trap: overflow` |
| `trap-add` | `main io fail{put 9223372036854775807+1}` | `trap: overflow` |
| `trap-min` | `main io fail{let m=-9223372036854775807-1 put m/-1}` | `trap: overflow` |
| `trap-div` | `main io fail{put 1/0}` | `trap: divide-by-zero` |
| `trap-stack` | `f(n Int)Int fail{ret f(n)}` and `main io fail{put f(1)}` | `trap: stack-exhausted` |
| `trap-step` | `main io fail{put 1 wh true{}}`. Stdout `1`. | `trap: step-exhausted` |

Compile-error tests (one error each; the record is the code and the span named):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `kc-text-let` | `main io{let t="x"}` | the `"x"` | E0200 |
| `kc-text-cmp` | `main io{if 1==true{}}` | the `==` | E0200 |
| `kc-put-paren` | `main io{put("a")}` | the `"a"` | E0200 |
| `kc-put-bool` | `main io{put true}` | the `true` | E0200 |
| `kc-put-comma` | `main io{put(1,2)}` | the `,` | E0100 |
| `kc-type` | `main io{if 1{}}` | the `1` | E0200 |
| `kc-bool-op` | `main io{let a=1 and true}` | the `and` | E0200 |
| `kc-arity` | `add(a Int,b Int)Int fail{ret a+b}` and `main io fail{put add(1)}` | the `add` of the call | E0200 |
| `kc-void-value` | `f{}` and `main io{let x=f()}` | the call `f()` | E0200 |
| `kc-ret-value` | `f io{ret 1}` and `main io{f()}` | the `1` | E0200 |
| `kc-assign-type` | `main io{var a=1 a=true}` | the `true` | E0200 |
| `kc-example-type` | `f Int{ret 1}ex 1 main io fail{put f()}` | the `1` after `ex` | E0200 |
| `kc-main-sig` | `main(n Int)io{}` | the `main` | E0200 |
| `kc-ret-bare` | `f Int io{ret}` and `main io fail{put f()}` | the `ret` | E0200 |
| `kc-fn-word` | `fn main io{}` | the `main` | E0100 |
| `kc-int-max` | `main io{put 9223372036854775808}` | the literal | E0500 |
| `kc-int-min` | `main io{put-9223372036854775808}` | the literal `9223372036854775808` | E0500 |
| `kc-missing-ret` | `f(n Int)Int{if n==0{ret 1}}` and `main io{put f(0)}` | the closing `}` of `f` | E0201 |
| `kc-if-else-partial` | `f(n Int)Int io{if n==0{ret 1}else{put 2}}` and `main io{put f(0)}` | the closing `}` of `f` | E0201 |
| `kc-wh-return` | `f Int{wh false{ret 1}}` and `main io{put f()}` | the closing `}` of `f` | E0201 |
| `kc-example` | `f Int{ret 1}ex 1==2 main io fail{put f()}` | `ex 1==2` | E0202 |
| `kc-example-trap` | `f Int{ret 1}ex 1/0==0 main io fail{put f()}` | `ex 1/0==0` | E0202 |
| `kc-example-budget` | `spin Int fail{wh true{}ret 0}ex spin()==0 main io{}` | `ex spin()==0` | E0202 |
| `kc-example-stack` | `f(n Int)Bool fail{ret f(n)}ex f(1)main io{}` | `ex f(1)` | E0202 |
| `kc-dup` | `add Int{ret 1}add Int{ret 2}main io{}` | the second `add` | E0300 |
| `kc-dup-main` | `main io{}main io{}` | the second `main` | E0300 |
| `kc-dup-param` | `f(a Int)Int{let a=1 ret a}` and `main io fail{put f(1)}` | the `a` of `let a` | E0300 |
| `kc-dup-param-2` | `f(a Int,a Int)io{}` and `main io{f(1,1)}` | the second `a` | E0300 |
| `kc-reserved-int` | `main io{let Int=1}` | the `Int` | E0300 |
| `kc-reserved-put` | `main io{let put=1}` | the `put` | E0003 |
| `kc-reserved-fail` | `main io{let fail=1}` | the `fail` | E0003 |
| `kc-fn-put` | `put Int{ret 1}main io{}` | the `put` | E0003 |
| `kc-unknown` | `main io{put zz}` | the `zz` | E0301 |
| `kc-use-before` | `main io{put a let a=1}` | the first `a` | E0301 |
| `kc-type-value` | `main io{put Int}` | the `Int` | E0301 |
| `kc-fn-value` | `add(a Int,b Int)Int fail{ret a+b}` and `main io{let f=add}` | the `add` | E0301 |
| `kc-no-main` | `f{}` | the end-of-file token (offset 3) | E0302 |
| `kc-assign-let` | `main io{let a=1 a=2}` | the `a` of `a=2` | E0303 |
| `kc-assign-param` | `f(n Int)io{n=2}` and `main io{f(1)}` | the `n` of `n=2` | E0303 |
| `kc-effect` | `f{put 1}` and `main io{f()}` | the `put` | E0400 |
| `kc-effect-call` | `g io{}f{g()}` and `main io{f()}` | the `g` | E0400 |
| `kc-effect-example` | `say Int io{ret 1}ex say()==1 main io{put say()}` | the `say` in the example | E0400 |
| `kc-fail-missing` | `f(a Int)Int{ret a+1}` and `main io fail{put f(1)}` | the `f`; fix inserts ` fail` at the `{` of `f` | E0403 |
| `kc-fail-extra` | `f(a Int)Int fail{ret a}` and `main io{}` | the `f`; fix deletes ` fail` | E0403 |
| `kc-fail-main` | `main io fail{put 1}` | the `main`; fix deletes ` fail` | E0403 |
| `kc-fail-order` | `main fail io{}` | the `io` | E0100 |

Each fix is a span and a replacement. For `kc-fail-missing` the span is zero-length at the `{` and the replacement is ` fail`. For the deletions the span is the space before `fail` through the end of `fail`, and the replacement is empty. Both keep the canonical layout.

Every grammar production is reached by a `kernel` test or by a `lexical-syntax-v6` test. Lexical rules 3, 4 and 5 are tested there, not here.

## Open questions

1. **TR3 limit.** The 10000000 steps are per call frame and do not bound a run's total work.
2. **Existing tests.** G-c applies: the base rules forbid editing `print-one.test`. The group decides when `retire-print-one` is opened.
3. **Early exit.** RFC 0085 removed bare `ret`. This draft restores it for functions with no result, since `lexical-syntax-v6` allows it as a block's last item and an early exit needs it (C2). Voters may prefer a different early-exit form, which must pay under principle 6.
4. **Text type.** Staged for the standard library RFC.
5. **`Int`/`Bool` versus `I`/`B`.** A tie on the sample, so principle 8's tie-break is not decided by measurement. A change would rewrite RFC 0093's E0300 list and RFC 0086's reserved names. The group decides.
6. **RFC 0050's status.** Its front matter says accepted and its body says `Status: draft`. This draft amends RFC 0050 section 5 on the reading that RFC 0050 is accepted. The owner should confirm which is correct.
7. **Lexical dependency.** L1 to L3 depend on G-d. The trap kind `step-exhausted` is already in RFC 0085 TR1, so no new kind is added.
