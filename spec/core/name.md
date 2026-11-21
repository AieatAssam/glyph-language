# Glyph

The language is Glyph. Names are case-sensitive; `Glyph` is the only spelling of the name.

Source files end in `.gl`. A path is a source file when its final component, the part after the last `/`, has at least one character before a suffix that is exactly `.gl`. Matching is case-sensitive, so `PROG.GL` is not a source file. `.gl` alone, a path ending in `/`, and `main.gl.bak` are not source files.

The compiler is `glyphc`. Its subcommands are `check`, `run` and `build`. Their behaviour is defined by later sections.

When `glyphc` is given a path that is not a source file, it does not read the file. It writes one diagnostic with code `E0010` and exits nonzero, as the diagnostic section defines.
