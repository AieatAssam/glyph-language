---
status: rejected
votes:
  designer-min: reject
  designer-prag: abstain
  impl-1: abstain
  tester: reject
  user-1: reject
  user-2: reject
---
# RFC draft: Kernel: integers, booleans, bindings, functions, conditionals, loops, text output

Class: language
Slug: kernel-v45
Status: draft
Replaces: RFC 0085 (kernel-v44, accepted). Keeps its decisions except where Motivation says otherwise.
Depends on: RFC 0048 (accepted; lexing), RFC 0050 (accepted; records, trap line), RFC 0093 (accepted; meanings of E0200 to E0403), RFC 0086 (accepted; reserved `Byte`, `byte`, `int`), and `lexical-syntax-v5` (Gate G-d).
Amends: RFC 0050 section 5, by adding the trap kind `step exhausted` to the kinds it takes from RFC 0005. The grammar in L1 replaces RFC 0048's `fn_decl` and `stmt`.
Alters tests: yes. `conformance/kernel/print-one.test` (`print(1)`) passes today and fails under this RFC. It is not edited.
Breaking: yes.
Prerequisite: RFC `retire-print-one`, not open. It must be accepted first.

**Gates.** This is a supermajority RFC (RULES rule 4: `breaking` or `alters_tests`).

- G-a. Open until voted. Approvals must be at least 0.75 of non-abstaining votes (`tools/lib/rfc.py`). Quorum is five votes cast, abstentions included.
- G-b. Open. RULES rule 6 bars a rejected RFC's substance for 10 nights. Whether this draft repeats RFC 0084 (`kernel-v43`) is the orchestrator's call, made before any vote.
- G-c. Open. `print-one.test` passes today and fails under this RFC, so CI cannot pass until `retire-print-one` is accepted. This draft does not open it. No vote before then. This text does not close the gate.
- G-d. Open. L1 uses the token set `lexical-syntax-v5` is to define (no `;`, `fn` an ordinary name, `put` without parentheses, layout not significant). That draft is not in `rfcs/`. If it is accepted differently, this RFC is revised first.

## Summary

The kernel is the smallest part of Glyph that runs a useful program: `Int` and `Bool`, bindings, functions with an optional result, the `io` and `fail` marks, `if`, `wh`, `ret`, examples (`ex`), and `put`. A trap ends a run with status 3 and one JSON line (TR1). Statements take no separator. Text is printed only (T3).

The complete kernel card, which K1 puts into `spec/card.md`:

```
# Card: kernel

Types: Int, Bool. Text literal only as put's whole argument.
Stmts, no separator: let x=e | var x=e | x=e (var only) | f(a) | put e | if e{} else{} | wh e{} | ret e.
Decl: f(a:Int,b:Bool):Int io fail{block} ex e. No result clause: no value, no ret e.
Ops low to high: or; and; == != < <= > >= (no chain); + -; * / %; unary - not.
Int: 64-bit. + - * unary - trap overflow; / % trap divide by zero; MIN/-1 overflow.
Fail: decl has fail iff body has + - * / %, unary -, wh, or calls a file decl. Else E0403.
Output: put e io prints Int in decimal, then LF; put "t" prints t, then LF.
Entry: main()[io][fail]. No parameters, no result.
Ex: ex e after a decl; e is Bool and true; no io calls. Checked on check, build, run.
Trap: stderr {"trap":"K"} and LF, exit 3. K: overflow, divide by zero, stack exhausted, step exhausted.
```

The complete program that uses every form (`io`, `fail`, `var`, `wh`, `ret`, `ex`, `put`, and a call). It prints `1`, `4`, `9`:

```
sq(n:Int):Int fail{ret n*n}ex sq(3)==9
main()io fail{var i=1 wh i<=3{put sq(i) i=i+1}}
```

## Motivation

Attempt 45. RFC 0085 was superseded. Each owner finding and vote is answered here.

- **Findings 1, 6.** `;` and `fn` are removed; `put` takes its argument without parentheses; layout is not significant. Every test program is rewritten.
- **Finding 2 (`: R`).** Kept (Cost).
- **Finding 3 (`fail`, `io`).** Both kept, on principle 3 (Cost).
- **Finding 4 (trap form).** RFC 0050 section 5: JSON line and exit 3. TR1 matches.
- **Finding 5 (sources).** RFC 0049 is no longer cited. `put` is defined here (P1). Codes come from RFC 0048 and RFC 0093 (Diagnostics).
- **Gates (designer-min, designer-prag, impl-1).** The objection is G-c. This text does not close it.
- **user-1 (could not test).** The kernel card is in the Summary; K1 adds it to `spec/card.md`. No front end exists, so nothing here has been run.
- **New diagnostics.** `put(1,2)` is E0100 at `,`. `let put=1` is E0300, since `put` is an identifier (L1).

## Design

Normative. "Must" and "is" bind implementers.

L1. Tokens are RFC 0048's, except as lexical-syntax-v5 states (G-d). This RFC relies on these: there is no `;` token; `fn` is an ordinary identifier; `put` is an identifier that the statement grammar reads as the put statement; the keywords are `let var if else wh ret ex io and or not true false`. Spacing and line ends are not tokens, and the parser ignores them (RFC 0048 G12).

```
prog  = { decl }
decl  = NAME "(" [ param { "," param } ] ")" [ ":" type ] [ "io" ] [ "fail" ] block { "ex" expr }
param = NAME ":" type
type  = "Int" | "Bool"
block = "{" { stmt } "}"
stmt  = "let" NAME "=" expr | "var" NAME "=" expr | NAME "=" expr | NAME "(" [ expr { "," expr } ] ")"
      | "put" expr | "if" expr block [ "else" block ] | "wh" expr block | "ret" expr
```

L2. A statement starts with a keyword, `put`, or `NAME`, never with an operator, `(` or a literal. So `put a put b` is two statements, and in `put a -1` the `-` is binary. `put` at a statement start is always the put statement.

L3. At top level, a declaration starts with `NAME` then `(`. Any other token there is E0100. `fn main()io{}` is E0100 at `main`.

### Types

T1. `Int` is a signed 64-bit two's complement integer. A literal above 9223372036854775807 is E0500 (RFC 0048 rule 8), including after unary `-`. The minimum is written `-9223372036854775807-1`.

T2. `Bool` is `true` or `false`.

T3. A text literal is valid only as the whole expression of `put`, with no parentheses around it. Anywhere else, including `put("a")`, it is E0200 at the literal, and the expression has type `?` (E8). `Text` is not a type: in a type position it is E0100 at the name, and as a value it is E0301.

T4. No implicit conversions. No unit type.

T5. A call to a function with no result is a statement only. Used as a value it is E0200 at the call, and the value has type `?`.

T6. A type position accepts `Int` and `Bool` only; any other name there is E0100 at it. `Int` and `Bool` used as values are E0301 at the name.

### Expressions

Precedence, loosest first: `or`; `and`; `==` `!=` `<` `<=` `>` `>=`; `+` `-`; `*` `/` `%`; unary `-` `not`; then call, literal, name, and `( expr )`. Binary operators are left-associative. Comparisons do not chain (RFC 0048 G6).

E1. `+`, `-` and `*` on `Int` give the exact result if it fits in 64 bits, else they trap `overflow`. Unary `-` on the minimum traps `overflow`.

E2. `/` and `%` truncate toward zero. `%` takes the sign of its left operand, so `-7%3` is `-1`. A zero divisor traps `divide by zero`. `MIN/-1` traps `overflow`. `MIN%-1` is `0` and does not trap.

E3. `==` and `!=` take two `Int` or two `Bool`. `<`, `<=`, `>` and `>=` take two `Int`. `and`, `or` and `not` take `Bool`. `+ - * / %` and unary `-` take `Int`. Any other operand type is E0200 at the operator (E9). `Text` has no equality.

E4. `and` and `or` short-circuit.

E5. The condition of `if` and `wh` is `Bool`, else E0200 at the condition.

E6. A call's argument count and types must match its parameters. Otherwise E0200 at the argument, or at the callee name for a count error.

E7. Evaluation is left to right: the left operand before the right; call arguments in order, then the call.

E8. **Recovery.** A failed expression takes its operator's or callee's result type, or `?`, with no further diagnostic.

E9. **Spans.** An operator error (E3) is E0200 at the operator. A condition error is at the condition; an argument error, at the argument.

### Bindings

B1. `let NAME=expr` is immutable. `var NAME=expr` is mutable. The binding has the type of `expr`. There is no annotation (RFC 0048 G10).

B2. Assignment `NAME=expr` needs a `var`. Assigning to a `let` or a parameter is E0303 at the name. An unknown name is E0301. A type mismatch is E0200 at the expression.

B3. A binding is visible from its declaration to the end of its block. Use before declaration is E0301 at the name.

B4. Parameters are declared in the body block, in order, as if by a `let` at its start. A `let` of a parameter's name in the body, or a second parameter with the same name, is E0300 at the new name.

B5. An inner block may declare a name that an outer block declares. A binding or parameter may not take a reserved name or a function name. Otherwise E0300 at the new name. Reserved names are `put`, `Int`, `Bool` and `fail`, and the names RFC 0086 reserves (`Byte`, `byte`, `int`).

### Functions

F1. `NAME(p1:T1,...)[:R][io][fail] block`, where `R` is `Int` or `Bool`. `f()io{}` is valid and has no result.

F2. A function without `io` may not call an `io` function or `put`. Either is E0400 at the callee name. An example may call neither (EX2).

F3. A function with a result clause must return on every path. A block returns if one of its statements is `ret`, or if it is an `if` with an `else` whose two blocks both return. A `wh` never counts. Otherwise E0201 at the closing `}` of the body.

F4. `ret e` needs a result clause and an `e` of its type. A mismatch, or a value returned from a function with no result, is E0200 at `e`. `ret` with no expression is E0100 at the next token (RFC 0048 G12).

F5. Recursion is allowed. Termination is not checked. A run ends by a return from `main` or by a trap (TR1).

F6. Function names are unique in the file (E0300 at the second name). A function named with a reserved name is E0300. Declaration order does not matter. A function name, or `put`, used as a value is E0301.

F7. **Fail mark.** A body is *trapping* if, outside its examples, it contains a binary `+ - * / %`; a unary `-`; a `wh` statement; or a call to a function declared in the file. A call to `put` does not count. The `fail` token is present if and only if the body is trapping. A wrong mark is E0403 at the function name. The rule reads only the body and the names it calls.

C0. **Ordering.** The F7 check, and then example evaluation (EX3), run only when no other error is reported.

### Entry point and output

M1. A program has exactly one `main` with no parameters and no result. It may have `io` and `fail`. Missing is E0302 at the end-of-file token. A second `main` is E0300 at its name. A `main` with a parameter or result is E0200 at the name `main`.

P1. `put e` is a statement with the effect `io`. `e` is one expression of type `Int`, or a text literal (T3). Any other type, including `Bool`, is E0200 at `e`. `put` takes exactly one expression: `put 1 2` is E0100 at `2`, and `put(1,2)` is E0100 at `,`.

P2. `put` of an `Int` writes decimal with a leading `-` if negative, then LF. Of a text literal it writes the decoded bytes (RFC 0048 rule 9), then LF. Output is WASI `fd_write` to standard output; each `put` finishes before the next statement.

### Conditionals, loops and examples

C1. `if e block [else block]`. The `else` part is a block only (RFC 0048 G7).

C2. `wh e block`. There is no `break` or `continue`. A function with a result leaves early with `ret e`. A function without a result, and `main`, leave only by falling off their body.

EX1. `ex e` follows a declaration's closing `}` or another of its examples. Any other `ex` is E0100 at `ex` (RFC 0048 G5).

EX2. `e` must be `Bool`, else E0200 at `e`. It may call only functions without `io`. Calling an `io` function or `put` is E0400 at the callee name.

EX3. `glyphc check`, `build` and `run` each evaluate every example, when C0 finds no error, at depth 0 with a new loop counter. `true` passes. `false`, or a trap, is E0202 from `ex` to the end of `e`.

### Traps

TR1. A trap ends the run with exit status 3 through WASI `proc_exit`. Before exiting, the runtime writes one line to standard error, `{"trap":"<kind>"}` and LF (RFC 0050 section 5), and nothing else. Output written before the trap stays written. The kinds are `overflow` (E1, E2), `divide by zero` (E2), `stack exhausted` (TR2) and `step exhausted` (TR3). The first three are spelled as in RFC 0005; the last is new here.

TR2. `main` is at depth 1. An example's expression is at depth 0. A call that would make the depth 10001 traps `stack exhausted`, checked at each function entry.

TR3. Each call frame has its own loop counter, starting at 0. Each evaluation of a `wh` condition in that frame's body adds 1. Before an addition would exceed 10000000, the run traps `step exhausted`.

### Stable addresses

A1. A declaration is addressed as `<file>::<name>`, with `<file>` repo-relative. An example is `<file>::<name>#<n>`, with `<n>` counting from 1 in source order among that function's examples.

### Card

K1. The implementing PR puts the Summary's kernel card at the top of `spec/card.md`, and updates the diagnostics card's trap line (RFC 0050).

### Diagnostics

Records follow RFC 0050. Each code's meaning is from the source named in the last column. None of E0200 to E0403 is in `spec/errors.json` yet; the first PR that emits each adds it there (RFC 0093 C1).

| Code | Meaning and rules | Span | Source |
| --- | --- | --- | --- |
| E0001, E0005, E0006 | lexical | per RFC 0048 | RFC 0048 |
| E0100 | unexpected token | the token | RFC 0048 |
| E0200 | type mismatch (E3 to E6, B2, F4, EX2, M1, P1, T3, T5) | per E9, or the literal | RFC 0093 |
| E0201 | result clause, can reach closing `}` (F3) | the closing `}` | RFC 0093 |
| E0202 | example false or traps (EX3) | `ex` to end of `e` | RFC 0093 |
| E0300 | duplicate or reserved name (B4, B5, F6, M1) | the new name | RFC 0093 |
| E0301 | unknown name, or type or function name used as a value | the name | RFC 0093 |
| E0302 | no `main` (M1) | end-of-file token | RFC 0093 |
| E0303 | assignment to a `let` or a parameter (B2) | the target name | RFC 0093 |
| E0400 | `io` call or `put` from a pure function or an example | the callee name | RFC 0093 |
| E0403 | `fail` mark missing or extra (F7) | function name; fix inserts or deletes `fail` | RFC 0093 |
| E0500 | integer literal above the `Int` range (T1) | the literal | RFC 0048 |

## Alternatives

- **Keep `;` or `fn`.** Rejected: they cost tokens and remove no ambiguity (L2, L3).
- **Infer the result type from `ret`.** Rejected (Cost).
- **Derive the `fail` mark from the body.** Rejected (Cost; principle 3).

## Cost

Measured with `tools/check/tokens` on scratch copies of the sample:

- RFC 0085's sample in its own syntax: 57 tokens. The sample above: 51. Saving 6 (`;`, `fn`, parentheses around `put`). The owner measured 174 to 164 for `;` alone on their sample.
- **`fail` marks (kept).** Without the two marks: 49. Each costs one token. Kept for principle 3: a caller reads only the signature (principle 2), so the mark is where a caller sees that a callee can trap. The rules F7 and E0403 exist to check the marks.
- **Result clause `:R` (kept).** Without `:Int` on `sq`: 49. The clause costs two tokens. Without it, a call's type is not in its signature, so a caller must read the body. The result type would be inferred from the `ret` expressions, and mutually recursive functions with no clause would need their types solved together. A missing `ret` would then be reported only after that solution.
- **Spacing.** 51 with and without spaces. Layout does not change the count.
- **`I` and `B` versus `Int` and `Bool`.** Both 51. Tie. `Int` and `Bool` stay, since RFCs 0086 and 0093 use them (Open question 5).

Net: removes `;` (RFC 0048 G1, G2), `fn`, and parentheses around `put`. Adds the kind `step exhausted` (Amends), and the rules F7, C0, T3, P1 and K1. Bare `ret` is already gone (RFC 0085).

Kernel card: 332 tokens (measured), against the 2,000 cap for the card. Core: merge bot measures against 12,000.

## Test plan

Conformance tests are files in `conformance/kernel/`, with `id`, `rfc` and `kind` in the `--- meta` block. Every program is in the layout above, with no separators. Every fix is `none` except E0403.

Run tests (status 0; stdout as stated):

| Test | Program | Stdout |
| --- | --- | --- |
| `put-one` | `main()io{put 1}` | `1` |
| `print-int` | `main()io fail{put 0 put -7 put 9223372036854775807}` | `0`, `-7`, `9223372036854775807` |
| `int-min` | `main()io fail{put -9223372036854775807-1}` | `-9223372036854775808` |
| `put-text` | `main()io{put "a\n\"b\"\\"}` | `a`, `"b"\` |
| `put-mixed` | `main()io{put "x" put 7}` | `x`, `7` |
| `let-var` | `main()io fail{let a=1 var b=2 b=b+a put b}` | `3` |
| `let-bool` | `main()io{let b=1<2 if b{put 1}}` | `1` |
| `bool-ops` | `main()io{if 1<2 and not false{put 1}else{put 2}}` | `1` |
| `bool-or` | `main()io{if false or 1<2{put 1}}` | `1` |
| `short-circuit` | `side():Bool io{put 9 ret true}`; `main()io fail{if false and side(){put 1} if true or side(){put 2}}` | `2` |
| `cmp-ordering` | `main()io{if 2>1{put 1} if 2>=2{put 2} if 1<=2{put 3} if 1>=2{put 9}}` | `1`, `2`, `3` |
| `cmp-eq` | `main()io{if 1!=2{put 3} if true==true{put 4}}` | `3`, `4` |
| `arith` | `main()io fail{put 7/-2 put -7%3 put 2*3+4*5 put -3+1 put (1+2)*3}` | `-3`, `-1`, `26`, `-2`, `9` |
| `rem-identity` | `main()io fail{put 17-17/5*5 put 17%5}` | `2`, `2` |
| `min-mod` | `main()io fail{let m=-9223372036854775807-1 put m%-1}` | `0` |
| `digit-sum` | `main()io fail{var n=1204 var s=0 wh 0<n{s=s+n%10 n=n/10} put s}` | `7` |
| `eval-order` | `a():Int io{put 1 ret 1}`; `b():Int io{put 2 ret 2}`; `main()io fail{if a()<b(){put 3}}` | `1`, `2`, `3` |
| `eval-order-ge` | as `eval-order`, with `main()io fail{if b()>=a(){put 3}}` | `2`, `1`, `3` |
| `fn-call` | `add(a:Int,b:Int):Int fail{ret a+b}`; `main()io fail{put add(2,3)}` | `5` |
| `fn-result-io` | `sq(x:Int):Int io fail{put x ret x*x}`; `main()io fail{put sq(3)}` | `3`, `9` |
| `fn-bool-param` | `pick(b:Bool):Int{if b{ret 1} ret 2}`; `main()io fail{put pick(true) put pick(false)}` | `1`, `2` |
| `fn-bool-result` | `pos(n:Int):Bool{ret 0<n}`; `main()io fail{if pos(3){put 1} if pos(0){put 2}}` | `1` |
| `fn-io` | `say(x:Int)io{put x}`; `main()io fail{say(4)}` | `4` |
| `fn-void` | `f(){}`; `main()io fail{f()}` | none |
| `fn-discard` | `g():Int{ret 1}`; `main()io fail{g()}` | none |
| `fn-recursion` | `fact(n:Int):Int fail{if n<=1{ret 1} ret n*fact(n-1)}`; `main()io fail{put fact(10)}` | `3628800` |
| `if-else-return` | `f(n:Int):Int{if n==0{ret 1}else{ret 2}}`; `main()io fail{put f(0) put f(1)}` | `1`, `2` |
| `wh-sum` | `main()io fail{var i=0 var s=0 wh i<5{i=i+1 s=s+i} put s}` | `15` |
| `if-else-chain` | `main()io{if false{put 1}else{put 2}}` | `2` |
| `layout` | `main()io{` LF `let a=1` LF `if a==1{put a}` LF `}` | `1` |
| `no-separator` | `main()io{put 1 put 2}` | `1`, `2` |
| `paren-nested` | `main()io fail{put -((4))}` | `-4` |
| `shadow` | `main()io{let a=1 if true{let a=2 put a} put a}` | `2`, `1` |
| `example-ok` | `double(x:Int):Int fail{ret x*2}ex double(3)==6 ex not false`; `main()io fail{put double(4)}` | `8` |
| `step-ok` | `main()io fail{var i=0 wh i<1000{i=i+1} put 1}` | `1` |
| `comment-line` | `main()io{put 1 // put 9` LF `}` | `1` |
| `ret-early` | `f(n:Int):Int{if n==0{ret 7} ret n}`; `main()io fail{put f(0) put f(3)}` | `7`, `3` |

Trap tests (stdout empty unless stated; stderr is the JSON line; exit 3):

| Test | Program | Stderr |
| --- | --- | --- |
| `trap-overflow` | `main()io fail{put 4611686018427387904*2}` | `{"trap":"overflow"}` |
| `trap-add` | `main()io fail{put 9223372036854775807+1}` | `overflow` |
| `trap-sub` | `main()io fail{put -9223372036854775807-2}` | `overflow` |
| `trap-neg` | `main()io fail{let m=-9223372036854775807-1 put -m}` | `overflow` |
| `trap-min` | `main()io fail{let m=-9223372036854775807-1 put m/-1}` | `overflow` |
| `trap-div` | `main()io fail{put 1/0}` | `{"trap":"divide by zero"}` |
| `trap-mod` | `main()io fail{put 1%0}` | `divide by zero` |
| `trap-stack` | `f(n:Int):Int fail{ret f(n)}`; `main()io fail{put f(1)}` | `{"trap":"stack exhausted"}` |
| `trap-step` | `main()io fail{put 1 wh true{}}`. Stdout `1`. | `{"trap":"step exhausted"}` |

Compile-error tests (one error each; the span is the one named; the record is the code and that span):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `kc-text-let` | `main()io{let t="x"}` | the `"x"` | E0200 |
| `kc-text-cmp` | `main()io{if 1==true{}}` | the `==` | E0200 |
| `kc-text-arg` | `f(n:Int)io{}`; `main()io{f("a")}` | the `"a"` | E0200 |
| `kc-put-paren` | `main()io{put("a")}` | the `"a"` | E0200 |
| `kc-put-bool` | `main()io{put true}` | the `true` | E0200 |
| `kc-put-comma` | `main()io{put(1,2)}` | the `,` | E0100 |
| `kc-type` | `main()io{if 1{}}` | the `1` | E0200 |
| `kc-cmp-type` | `main()io{if true<false{}}` | the `<` | E0200 |
| `kc-bool-op` | `main()io{let a=1 and true}` | the `and` | E0200 |
| `kc-arity` | `add(a:Int,b:Int):Int fail{ret a+b}`; `main()io fail{put add(1)}` | the `add` | E0200 |
| `kc-void-value` | `f()io{}`; `main()io{let x=f()}` | the call `f()` | E0200 |
| `kc-ret-value` | `f()io{ret 1}`; `main()io{f()}` | the `1` | E0200 |
| `kc-assign-type` | `main()io{var a=1 a=true}` | the `true` | E0200 |
| `kc-example-type` | `f():Int{ret 1}ex 1`; `main()io fail{put f()}` | the `1` after `ex` | E0200 |
| `kc-main-sig` | `main(n:Int)io{}` | the `main` | E0200 |
| `kc-ret-bare` | `f():Int io{ret}`; `main()io fail{put f()}` | the `}` | E0100 |
| `kc-fn-word` | `fn main()io{}` | the `main` | E0100 |
| `kc-int-max` | `main()io{put 9223372036854775808}` | the literal | E0500 |
| `kc-int-min` | `main()io{put -9223372036854775808}` | the literal `9223372036854775808` | E0500 |
| `kc-missing-ret` | `f(n:Int):Int{if n==0{ret 1}}`; `main()io{put f(0)}` | the closing `}` of `f` | E0201 |
| `kc-if-else-partial` | `f(n:Int):Int io{if n==0{ret 1}else{put 2}}`; `main()io{put f(0)}` | the closing `}` of `f` | E0201 |
| `kc-wh-return` | `f():Int{wh false{ret 1}}`; `main()io{put f()}` | the closing `}` of `f` | E0201 |
| `kc-example` | `f():Int{ret 1}ex 1==2`; `main()io fail{put f()}` | `ex 1==2` | E0202 |
| `kc-example-trap` | `f():Int{ret 1}ex 1/0==0`; `main()io fail{put f()}` | `ex 1/0==0` | E0202 |
| `kc-example-budget` | `spin():Int fail{wh true{}ret 0}ex spin()==0`; `main()io{}` | `ex spin()==0` | E0202 |
| `kc-example-stack` | `f(n:Int):Bool fail{ret f(n)}ex f(1)`; `main()io{}` | `ex f(1)` | E0202 |
| `kc-dup` | `add():Int{ret 1}`; `add():Int{ret 2}`; `main()io{}` | the second `add` | E0300 |
| `kc-dup-main` | `main()io{}`; `main()io{}` | the second `main` | E0300 |
| `kc-dup-param` | `f(a:Int):Int{let a=1 ret a}`; `main()io fail{put f(1)}` | the `a` of `let a` | E0300 |
| `kc-dup-param-2` | `f(a:Int,a:Int)io{}`; `main()io{f(1,1)}` | the second `a` | E0300 |
| `kc-reserved-put` | `main()io{let put=1}` | the `put` | E0300 |
| `kc-reserved-int` | `main()io{let Int=1}` | the `Int` | E0300 |
| `kc-reserved-fail` | `main()io{let fail=1}` | the `fail` | E0300 |
| `kc-fn-put` | `put():Int{ret 1}`; `main()io{}` | the `put` | E0300 |
| `kc-binding-fn` | `g():Int{ret 1}`; `main()io{let g=2}` | the `g` | E0300 |
| `kc-unknown` | `main()io{put zz}` | the `zz` | E0301 |
| `kc-use-before` | `main()io{put a let a=1}` | the first `a` | E0301 |
| `kc-type-value` | `main()io{put Int}` | the `Int` | E0301 |
| `kc-fn-value` | `add(a:Int,b:Int):Int fail{ret a+b}`; `main()io{let f=add}` | the `add` | E0301 |
| `kc-no-main` | `f(){}` | the end-of-file token | E0302 |
| `kc-assign-let` | `main()io{let a=1 a=2}` | the `a` of `a=2` | E0303 |
| `kc-assign-param` | `f(n:Int)io{n=2}`; `main()io{f(1)}` | the `n` of `n=2` | E0303 |
| `kc-effect` | `f(){put 1}`; `main()io{f()}` | the `put` | E0400 |
| `kc-effect-call` | `g()io{}`; `f(){g()}`; `main()io{f()}` | the `g` | E0400 |
| `kc-effect-example` | `say():Int io{ret 1}ex say()==1`; `main()io{put say()}` | the `say` in the example | E0400 |
| `kc-fail-missing` | `f(a:Int):Int{ret a+1}`; `main()io fail{put f(1)}` | the `f`; fix inserts `fail` before `{` | E0403 |
| `kc-fail-extra` | `f(a:Int):Int fail{ret a}`; `main()io{}` | the `f`; fix deletes the `fail` token | E0403 |
| `kc-fail-main` | `main()io fail{put 1}` | the `main`; fix deletes the `fail` token | E0403 |
| `kc-fail-order` | `main()fail io{}` | the `io` | E0100 |

RFC 0048's planned `v4-*` tests are for `lexical-syntax-v5`, not this RFC.

## Open questions

1. **TR3 limit.** The 10000000 steps are per call frame and do not bound a run's total work.
2. **Existing tests.** G-c applies: the base rules forbid editing `print-one.test`. The group decides when `retire-print-one` is opened.
3. **Early exit.** Void functions cannot leave early. An early-exit form must pay under principle 6.
4. **Text type.** Staged for the standard library RFC.
5. **`Int`/`Bool` versus `I`/`B`.** A tie on the sample, so principle 8's tie-break is not decided by measurement. A change would rewrite RFC 0093's E0300 list and RFC 0086's reserved names. The group decides.
6. **Lexical set and `step exhausted`.** L1 to L3 depend on G-d. The trap kind is added under Amends; a reviewer who wants another spelling should name it.
