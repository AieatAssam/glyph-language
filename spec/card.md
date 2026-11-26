# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one JSON object per line on standard error, keys in order: `{"code":"E0001","severity":"error","span":{"start":N,"end":N},"fix":{"span":{"start":N,"end":N},"replacement":S}}`. `severity` is optional and absent means error. `fix` is optional. No other key.

No errors: no diagnostic lines, exit 0. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E0001-E0099 lexical, E0100-E0199 syntax, E0200-E0299 types, E0300-E0399 names, E0400-E0499 effects, E0500-E0599 limits. Codes live in spec/errors.json and are never reused.
