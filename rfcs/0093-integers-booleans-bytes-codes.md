---
status: accepted
votes:
  designer-prag: approve
  designer-safe: approve
  impl-1: approve
  tester: approve
  user-1: abstain
  user-2: approve
---
# RFC draft: Catalogue the codes of the integers, booleans and bytes item

Class: language
Slug: integers-booleans-bytes-codes
Status: draft
Author: designer-min
Builds on: RFC 0085 (kernel-v44, accepted) and RFC 0086 (byte-type-v2, accepted). Amends: RFC 0085 in its Diagnostics section only, for the source of the code meanings. Depends on: RFC 0004 (diagnostic records), RFC 0048 (lexical-syntax-v4, accepted; it owns E0006, E0100 and E0500).
Replaces: nothing. Does not revive RFC 0009, 0021, 0044 or 0088.

## Summary

Readiness item `integers-booleans-bytes` (`docs/SPEC.md`, section 9, item 1) has its design in two accepted RFCs: RFC 0085 gives `Int` and `Bool`, and RFC 0086 gives `Byte`. Both use diagnostic codes whose meanings are not catalogued. `spec/errors.json` holds six codes today. This RFC adds nine entries, E0200, E0201, E0202, E0300, E0301, E0302, E0303, E0400 and E0403, with the meanings RFC 0085 and RFC 0086 use. It changes no rule, no grammar production and no test. It also moves the source of those meanings from RFC 0049, which was rejected, to this RFC.

## Motivation

- **The catalogue is missing the codes the item uses.** `spec/errors.json` has E0001, E0005, E0006, E0010, E0100 and E0500. RFC 0085 emits E0200, E0201, E0202, E0300 to E0303, E0400 and E0403. RFC 0086 emits E0200, E0202, E0300, E0301 and E0403. The check job rule "No error code outside `spec/errors.json`" would fail on the first implementing PR for either RFC.
- **The meanings have no accepted source.** RFC 0085 says its codes "have RFC 0049's meanings", and RFC 0049 is rejected. RFC 0085 also marks E0403 as new "here", so nothing accepted defines it outside RFC 0085. An implementer reading only the accepted text cannot find what E0300 means as a catalogue entry.
- **Issue #465** asks for `explain E0100` to print the catalogue entry. That needs an entry for every code a user can see, not only the six above.
- **Issue #457** asks whether an example trap is a diagnostic. RFC 0085 EX3 says it is a diagnostic (E0202). This RFC states that boundary for RFC 0085 and RFC 0086, so the catalogue entry for E0202 says what it covers. It does not decide RFC 0082, which #457 names.
- **Benchmark finding.** The most common diagnostic in the benchmark is `UNKNOWN`, with 540 occurrences. That means the reports cannot be matched to a catalogued code. This RFC does not claim to fix that count. It removes one cause the design can fix: codes emitted by the language that are not in its catalogue.

Principle 4 asks that every diagnostic have a stable code and a meaning. The purpose clause asks for few tokens. Nine short entries are the cheapest way to meet both, because the rules themselves stay where they are.

## Design

Normative. "Must" and "is" bind implementers.

Each entry below is added to `spec/errors.json` in the form the file already uses: `code`, `message` and `meaning`. The `message` is the short label. The `meaning` says when the code is raised, in the words of the RFC that raises it.

C1. The following entries are added to `spec/errors.json`:

| Code | Message | Meaning |
| --- | --- | --- |
| E0200 | type mismatch | an operand, argument, condition, assigned value or returned value has the wrong type, or an operator is not defined for its operand's type |
| E0201 | function may end without returning | a function with a result clause can reach its closing brace without a `ret` |
| E0202 | example is false or traps | an `ex` expression evaluates to `false`, or evaluating it traps |
| E0300 | duplicate or reserved name | a name is declared twice in one scope, or is a reserved name (`put`, `Int`, `Bool`, `Byte`, `byte`, `int`, `fail`) or a function name |
| E0301 | unknown name, or name used as a value | a name is not declared, is used before its declaration, or is a type name or function name used as a value |
| E0302 | no main function | the file has no `main` |
| E0303 | assignment to a let binding or parameter | a name bound by `let` or declared as a parameter is assigned to |
| E0400 | io call from a pure context | a function without `io`, or an example, calls an `io` function or `put` |
| E0403 | fail mark missing or extra | a function's `fail` mark does not match whether its body can trap |

C2. Each code has the meaning above in every RFC that uses it. The span rule stays with the rule that raises the code: the spans in RFC 0085 (E9, and the table in its Diagnostics section) and in RFC 0086 (Y4, Y6, Y7, Y8, Y11) are unchanged. The catalogue holds meanings, not spans.

C3. RFC 0085's Diagnostics section takes its meanings from this RFC, not from RFC 0049. Its table is otherwise unchanged. This RFC amends that one sentence of RFC 0085 and nothing else in it.

C4. No code is new. Each of the nine codes is already used by RFC 0085 or RFC 0086 with the meaning in C1. No code is reused with a different meaning. E0200 is the type-mismatch code (RFC 0086 Y4 and RFC 0085 E3 both use it). RFC 0005 and RFC 0010 use E0102 for the same case, and they are rejected, so that choice is not reopened here.

C5. A code that a PR emits must be in `spec/errors.json` at the time of the PR. The check job enforces this.

C6. E0202 is a diagnostic reported by `check`, `build` and `run` (RFC 0085 EX3). A run-time trap that is not an example is not a diagnostic. It is reported as `trap: <kind>` (RFC 0085 TR1). This is the only boundary this RFC states.

## Alternatives

- **Rewrite RFC 0085 with the codes inline.** Not chosen. RFC 0085 is accepted, and its text should not change through a new RFC.
- **Keep the meanings in RFC 0049 and mark it accepted.** Rejected. RFC 0049 was rejected by three designers, and its text uses `print`, which RFC 0085 replaced. Accepting it again would reopen the vote.
- **Catalogue only the codes the item's first PR emits.** Rejected. The check job applies to every code named in an accepted RFC, and RFC 0085 names all nine. A partial catalogue would fail the same job later.
- **Give E0200 a new name, such as E0210.** Rejected. Nine codes already in two accepted RFCs would all need changing, and nothing would gain.

## Cost

Core spec: nine catalogue entries. By hand, about 40 tokens each, so about 360 tokens. This is an estimate, and the protected tokeniser has not run on this text. The catalogue may or may not count toward the 12,000-token core cap; the merge bot decides. On the figure RFC 0085 measured (core 917 of 12,000 at its drafting), the total stays far under the cap.

Removes: nothing from the language. The cross-reference in RFC 0085 from RFC 0049 to this RFC is the only text that changes, and it is a single sentence.

Spec card: no change. The card lists the trap kinds, not the codes. This RFC adds no card line.

Net language: no token, keyword, production, rule or test is added or removed.

## Test plan

This RFC adds no language construct, so it adds no run test. Its test requirement is met by tests that RFC 0085 and RFC 0086 already name, which emit each catalogued code:

Run test (status 0):

- `let-var` (RFC 0085): `fn main() io { let a = 1; var b = 2; b = b + a; put(b) }`, output `3`. It shows the catalogue is not needed for a valid program, so no code appears.

Compile-error tests (each one code, at the span the RFC names):

- `kc-text-let` (RFC 0085): E0200.
- `kc-unknown` (RFC 0085): E0301.
- `kc-dup` (RFC 0085): E0300.
- `kc-no-main` (RFC 0085): E0302.
- `kc-assign-let` (RFC 0085): E0303.
- `kc-effect` (RFC 0085): E0400.
- `kc-fail-missing` (RFC 0085): E0403.
- `kc-missing-ret` (RFC 0085): E0201.
- `kc-example` (RFC 0085): E0202.
- `bytes-err-value` (RFC 0086): E0301 for `Byte` used as a value.

A check that every catalogued code is emitted by at least one conformance test is useful, but this RFC does not add it. It is a question for the orchestrator (Open question 2).

## Open questions

1. **Does the catalogue count toward the core spec cap?** The merge bot decides. If it does, the nine entries are the cost, and the decision does not change the design.
2. **Should a check require each catalogued code to have a compile-error test?** This RFC does not add it. The roadmap (`architecture/ROADMAP.md`, M2b) says no new RFC is proposed before the first merge puts a compiler on `main`. This draft is proposed because the assignment asks for it. The orchestrator decides whether to hold it.
3. **RFC 0085's prerequisite is not accepted.** RFC 0085 depends on `retire-print-one`, which is not open, and on RFC 0049, which is rejected. Its `put` rules (P1, P2) are accepted text, but the test `print-one.test` fails under it. This RFC does not decide that. It needs its own RFC before implementation.
4. **Is E0200 the right code for a type mismatch?** RFC 0005 and RFC 0010 say E0102. A reviewer who wants E0102 should name the one change that would make them approve.
