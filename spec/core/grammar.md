# Grammar

Normative. `"x"` is a keyword or punctuation token. `IDENT`, `INT`, `TEXT` and `EOF` are token kinds. `[ a ]` is zero or one, `{ a }` is zero or more, `|` separates alternatives. `"Int"` and `"Bool"` mean an `IDENT` token with that text. A program is one `program`.

```
program  = { decl } EOF
decl     = IDENT [ "(" param { "," param } ")" ] [ rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
param    = IDENT ptype
ptype    = "Int" | "Bool"
rtype    = "Int" | "Bool"
block    = "{" { stmt } [ "ret" [ expr ] ] "}"
stmt     = "let" IDENT "=" expr
         | "var" IDENT "=" expr
         | IDENT "=" expr
         | IDENT "(" [ args ] ")"
         | "put" expr
         | "if" expr block [ "else" block ]
         | "wh" expr block
args     = expr { "," expr }
expr     = and_expr { "or" and_expr }
and_expr = cmp_expr { "and" cmp_expr }
cmp_expr = add_expr [ cmp_op add_expr ]
cmp_op   = "==" | "!=" | "<" | "<=" | ">" | ">="
add_expr = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr = unary { ( "*" | "/" | "%" ) unary }
unary    = ( "-" | "not" ) unary | primary
primary  = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
```

The grammar needs one token of lookahead. No statement starts with `(`, a unary operator or a binary operator, and no expression continues with a statement's first token (a name, `let`, `var`, `put`, `if` or `wh`). So statements and declarations follow one another with no separator. `ret` ends a block: it is the last item, so no statement can follow it.

Syntax rules. Each names the token that carries E0100 or E0003.

G1. Statements and declarations have no separator. The parser never sees a gap: lexical rule 4 checks gaps first.

G2. `ret` ends its block. After `ret [expr]`, any token other than `}` is E0100 at that token. So `{ret put 1}` is E0100 at `put`, and `{ret x=1}` is E0100 at `=`.

G3. A keyword where the grammar needs an `IDENT` is E0003 at the keyword. An `IDENT` is needed for a declaration name, a parameter name, and the name after `let` or `var`. Any other keyword the grammar does not accept at a position is E0100 at it. At the start of a statement, a keyword other than `let`, `var`, `put`, `if`, `wh` or `ret` is E0100.

G4. `ptype` and `rtype` are the words `Int` and `Bool`. Any other token in those positions is E0100 at it. So `f(t Text)io{}` is E0100 at `Text`.

G5. `ex` is accepted only directly after a declaration's block, or after another `ex` of the same declaration. Any other `ex` is E0100 at it.

G6. Comparisons do not chain. After one `cmp_expr`, a second comparison operator is E0100 at it. So `1<2<3` is E0100 at the second `<`.

G7. `else` is followed by a block. `else if` is E0100 at `if`.

G8. `if`, `wh`, `ret`, `let`, `var`, `put`, `ex`, `io` and `fail` are not expressions. In an expression position each is E0100 at the keyword.

G9. A parameter list is not empty. `f()Int{}` is E0100 at `)`. A declaration with no parameters has no parentheses, so its name is followed by its result type, `io`, `fail` or `{`.

G10. The marks come in this order: result type, then `io`, then `fail`. `f io Int{}` is E0100 at `Int`, and `f fail io{}` is E0100 at `io`.

G11. A binding has no type annotation. `let a Int=1` is E0100 at `Int`.

G12. `fn` is an identifier, so `fn main io{}` is E0100 at `main`. A declaration name must be followed by `(`, a type, `io`, `fail` or `{`.

G13. At end of file, if the grammar needs more tokens, the error is E0100 at `EOF`.
