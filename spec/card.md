# Toy language card (0.1.0)

Each line is one statement. Output is decimal, one value per line.

    print 42                 -> 42
    print 1 + 2 * 3          -> 7        (* and / bind tighter)
    print (1 + 2) * 3        -> 9        (parentheses)
    print 7 / 2              -> 3        (truncates toward zero)
    print 0 - 7              -> -7       (no unary minus; subtract from 0)
    print 2147483647 + 1     -> -2147483648  (i32 wraps)
    print 1 / 0              -> run-time trap, exit 1

Types: i32 only.
Commands: `glyphc check FILE`, `glyphc build FILE -o OUT.wasm`, `glyphc run FILE`, `glyphc --version`.

Common errors:
- E0001 unexpected character or unknown word. Fix: use digits, operators, parentheses and `print`.
- E0002 expected expression or `print`. Fix: write a value after `print`.
- E0003 expected `)` or end of line. Fix: close the parenthesis or put the rest on its own line.
- E0004 integer literal does not fit in i32. Fix: use a value at most 2147483647.
