Class: language
Slug: input
Amends: RFC 0109 (kernel-v47): rule B5 (reserved names), rule TR1 (trap kinds), and the kernel card in `spec/card.md`.

## Summary

One built-in, `input()`, reads the next decimal integer from standard input and returns it as an `Int`. It has the `io` effect, so the rules that already govern `io` calls govern it (F2, EX2). When no integer can be read, it traps `input`. This RFC adds one trap kind and one reserved name. It adds no keyword.

## Motivation

Every benchmark task reads standard input and writes standard output. After more than 100 decided RFCs, no accepted RFC lets a program read anything, so the dev fitness stays at 0.0. The kernel has `Int` and `Bool`, and text is only a `put` argument (RFC 0109 T3). An integer is the only value a program can take in, so the smallest input is one built-in that returns an `Int`.

## Design

Normative. Each rule binds implementers.

I1. `input()` is a call of type `Int` with no arguments. It is a built-in, not a declaration. `input` is a reserved name: a binding, parameter or declaration that takes it is E0300 at the name (RFC 0109 B5 and F6 are amended to list it). `input` used without `()` is E0301 at the name.

I2. `input()` has the `io` effect. A call from a function without `io`, or from an example, is E0400 at `input` (RFC 0109 F2, EX2).

I3. Each call reads standard input (WASI preview 1 `fd_read` on descriptor 0), in this order:
  a. It skips bytes 0x20 (space), 0x09 (tab), 0x0D (CR) and 0x0A (LF).
  b. It reads an optional `-` (0x2D).
  c. It reads one or more bytes 0x30 to 0x39 (digits). Leading zeros are allowed. The read stops at the first byte that is not a digit, and that byte is not consumed.
  d. The value, negated if `-` was read, must lie from -9223372036854775808 to 9223372036854775807 inclusive.

I4. A call returns the value read.

I5. A call traps `input` (RFC 0109 TR1 is amended to add the kind) when:
  a. the input ends before step c finds a digit, including when only skipped bytes are left;
  b. after step a, the next byte is neither `-` nor a digit;
  c. `-` is not followed by a digit;
  d. the value is out of range.
A trap ends the run as TR1 says. Output written before it stays written.

I6. Nothing is returned at end of input. Every `Int` is a valid input value, so no return value can mark the end. A program that reads an unknown number of values cannot end its loop with this built-in alone. It reads a count first. This RFC adds no second built-in.

I7. A program observes only the bytes each call consumes. The implementation may buffer, but the program cannot see the buffer.

I8. Only `input` reads standard input. `main` may call it, as any `io` function may.

## Alternatives

- **Names `get()` or `read()`.** Each costs the same tokens as `input()` (Cost). `input` is chosen because it is the name models most often give this operation. Models that expect a line-based `input` will be wrong here; the benchmark should show whether that happens.
- **A sentinel return value (0 or -1) at end of input.** Rejected. Both are valid inputs, so the program cannot tell the end from data.
- **A second built-in `more() Bool` for end of input.** Rejected for this RFC. The owner asked for one built-in. It is a separate decision.
- **Reading text lines.** Rejected. Text is `put`-only (RFC 0109 T3). Reading it needs a second type.

## Cost

Counted with `sbx python3 -m tools.check.tokens`:

| Program | Tokens |
| `main io{put input()}` (echo) | 6 |
| `main io{put get()}` and `main io{put read()}` | 6 each |
| `main io{var n=input()var s=0 var i=0 wh i<n{s=s+input()i=i+1}put s}` (sum) | 31 |

The three names cost the same. Keywords: 15 to 15; `input` is not one.

Card (`spec/card.md`, kernel). The three lines that change (`Ex`, `Any function may trap`, `Trap`) are 60 tokens now and 107 after this RFC. The full kernel card is 251 tokens now and 298 after. Cap: 2,000.

Core spec: adds I1 to I7 and the trap kind `input`. Its total is not measured here; `spec/core` holds two files in the tree.

## Test plan

Run tests with `stdin` (the conformance format already has the section):

- `input/echo` (run): `main io{put input()}`. stdin `42` LF. stdout `42` LF. exit 0.
- `input/sum` (run): `main io{var n=input()var s=0 var i=0 wh i<n{s=s+input()i=i+1}put s}`. stdin `3` LF `10` LF `20` LF `-5` LF. stdout `25` LF. exit 0.
- `input/separators` (run): `main io{put input()+input()}`. stdin ` 1` TAB `2` CR LF. stdout `3` LF. exit 0.
- `input/min` (run): echo program. stdin `-9223372036854775808`. stdout `-9223372036854775808` LF. exit 0.
- `input/eof` (trap): echo program. stdin empty. stderr `trap: input` LF. exit 1.
- `input/bad-byte` (trap): echo program. stdin `x` LF. stderr `trap: input` LF. exit 1.
- `input/bad-minus` (trap): echo program. stdin `-` LF. stderr `trap: input` LF. exit 1.
- `input/range` (trap): echo program. stdin `9223372036854775808` LF. stderr `trap: input` LF. exit 1.
- `input/err-no-io` (compile-error): `f Int{ret input()}main io{put f()}`. E0400 at bytes 10 to 15.
- `input/err-value` (compile-error): `main io{put input}`. E0301 at bytes 12 to 17.
- `input/err-reserved` (compile-error): `main io{let input=1}`. E0300 at bytes 12 to 17.

Each test's `rfc:` line names this RFC.

## Open questions

1. End of input traps rather than returning a value. A reviewer who wants a value at end of input needs a second built-in or a different return type. That is a new decision, not a change to this one.
2. The name `input` may mislead models that expect Python semantics (a string, a line). The benchmark run decides this.
