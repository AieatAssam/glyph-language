---
status: rejected
votes:
  designer-prag: reject
  designer-safe: reject
  impl-1: approve
  tester: reject
  user-1: abstain
  user-2: reject
---
Class: language
Slug: integers-booleans-bytes-close
Status: draft
Author: designer-min
Builds on: RFC 0085 (kernel-v44, accepted: `Int`, `Bool`, operators, traps, `put`), RFC 0086 (byte-type-v2, accepted: `Byte`, `byte`, `int`, `byte-out-of-range`). Amends: nothing. Replaces: nothing.

## Summary

Readiness item `integers-booleans-bytes` (`docs/SPEC.md`, section 9, item 1) asks for "integers with defined overflow, booleans, bytes". Its text already exists in two accepted RFCs: RFC 0085 covers `Int` and `Bool`, and RFC 0086 covers `Byte`. This RFC does not add a language construct. It declares the item met by that text, closes the two open questions RFC 0086 left for this item, and names the card and test checks the item still needs.

## Motivation

Grounding: the open user issues about the card. #505 asks the card to say which types exist. #506 asks it to list the operators and which operand types each accepts. #521 asks it to list the trap kinds that `run` can report. RFC 0085 K1 and RFC 0086 (Card section) already give the card lines for these. Those lines are not yet in `spec/card.md`, and the item cannot be called met until they are.

Four earlier drafts of this item were rejected: RFC 0009, 0021 and 0044. Their vote records give no reasons. RFC 0086 says why it does not revive them: it does not restate RFC 0085, and it adds only what the item still needs. This draft follows the same line. It adds no type, operator, literal or trap that RFC 0085 or RFC 0086 does not already have.

Open questions left by RFC 0086 that this item must settle: Q1 (should `Byte` have `==` and `!=`), and Q2 (do the built-ins or the type need addresses).

The purpose clause asks for few errors and few tokens. The smallest language that passes item 1 is the one the two accepted RFCs already give, so the cost of closing the item is zero new tokens.

## Design

Normative. "Must" and "is" bind implementers.

C1. Readiness item `integers-booleans-bytes` is met when RFC 0085 and RFC 0086 are both accepted and in force. Where RFC 0086 changes the text of RFC 0085 (its `ptype`, `rtype` and rule F7 changes), RFC 0086 governs. No other text in this RFC changes the language.

C2. `Byte` has no `==` or `!=`. RFC 0086 Y4 stands. An equality on `Byte` would be a second rule for a case the existing `Int` rule covers: `int(a) == int(b)`. This closes RFC 0086 open question 1.

C3. The built-ins `byte` and `int` and the type `Byte` have no address. Principle 9 covers declarations, and none of them is declared in a file. RFC 0085 A1 is unchanged. This closes RFC 0086 open question 2.

C4. The card (`spec/card.md`) must contain, for this item, these lines and no others: the types `Int`, `Bool`, `Byte`; one operator line per operand type, as RFC 0085 E3 and RFC 0086 Y4 give them; the built-ins `byte(n: Int): Byte` and `int(b: Byte): Int`; and the trap kinds `overflow`, `divide-by-zero`, `byte-out-of-range`, `stack-exhausted`, `step-exhausted`. A check on the card PR confirms each line is present and that no kind is missing from the trap line.

C5. The item is not met for records, lists or text. Those belong to other readiness items.

## Alternatives

- **Propose a new RFC that restates `Int`, `Bool` and `Byte`.** Rejected. It would be a second text for the same rules, and a reader would not know which governs. RFC 0021, 0044 and 0086 each cite the other for this reason.
- **Add `==` and `!=` on `Byte`.** Rejected (C2). One more rule, and `int(a) == int(b)` already does the same job.
- **Give the built-ins addresses.** Rejected (C3). It adds a form for names that are not declared anywhere.
- **Leave the item open until the card lands.** Rejected. The item's language text is accepted; only the card lines remain, and C4 names them.

## Cost

Core spec: no change from this RFC. The core size is what RFC 0085 and RFC 0086 give. RFC 0085 Cost records 917 tokens for the current core, measured by rule 9 before its K1 card lines, and estimates about 200 tokens for RFC 0086's additions. This draft adds nothing to them. Rule 9 of `tools/check/run` re-measures on the implementing PR.

Removes: nothing. Adds: nothing to the language.

Spec card: the lines in C4. The card is about 610 tokens once RFC 0085 K1 is in, under the 2,000-token cap. This RFC adds no card line beyond those two RFCs.

## Test plan

No new conformance test. Every test below is named in RFC 0085 or RFC 0086 and must exist in `conformance/` before the item is marked met.

Run tests (one required, named here):
- `bytes-convert` (RFC 0086): `put(int(byte(0)))`, `put(int(byte(255)))`, `put(int(byte(200)))` prints `0`, `255`, `200`.

Compile-error tests (one required, named here):
- `bytes-err-arg` (RFC 0086): `f(1)` where `f` takes a `Byte` gives E0200 at the `1`.

Card check (not a conformance test): the card PR checks the lines in C4 with a grep over `spec/card.md`.

## Open questions

1. **Does the item count as met before RFC 0085 is settled?** Issue #509 says RFC 0085's status is contradictory: the front matter says accepted, and the body says draft with open gates. This RFC depends on 0085's status being accepted. If #509 changes it, this item stays open.
2. **Is this RFC allowed now?** The roadmap (M2b) says no new RFC is proposed before a compiler is on `main`. This draft exists because the assignment asks for a proposal for this item. The orchestrator decides whether to hold it.
3. **Should RFC 0024 be marked superseded?** It is accepted, cannot be withdrawn, and is replaced for `Byte` by RFC 0086. The record needs a pointer, and the orchestrator decides how to record it.
