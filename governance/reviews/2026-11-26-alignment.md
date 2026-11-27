# Owner review, 2026-11-26: is the language being built for its purpose?

> **Update, 2026-11-27.** This review was written against `main` as of the end of 2026-11-26. Before it merged, the owner superseded RFCs 0037, 0048, 0050, 0085, 0086, 0093, 0099 and 0100 (`governance/premise/`), and a new syntax (RFC 0104) and kernel (RFC 0105) were accepted. The body below describes the earlier state. What that changes is in the last section, "After the supersession".

Purpose (constitution): a language written, repaired and read only by language models, with as few tokens and errors as possible. Human readability is not a goal.

Scope: the seven nights from 2026-11-20 to 2026-11-26. 98 RFCs decided, 578 votes, 7,898 audit events, the RFCs in force, the process tools and the prompts. Token figures are from `python3 -m tools.check.tokens` as changed by this review.

## Where the project stands

- 98 RFCs decided. 12 accepted, of which 6 were later superseded by the owner. 85 rejected.
- By topic: kernel 44 attempts (2 accepted), arrays 22 (0 accepted), text 14 (2), integers and bytes 9 (3), lexical syntax 4 (2).
- The compiler on `main` runs one program, `fn main() io { print(1) }`. Two conformance tests exist. `print` is not in the accepted kernel, which says `put`.
- Dev fitness is 0.0 on all three benchmark nights: nothing a model writes compiles.
- The RFC text alone is 554,000 tokens, a mean of 5,650 per RFC, and each was read by up to six voters.

## Findings

### 1. The token counter was not a tokeniser, and the language was designed to it

`tools/check/tokens.py` charged one token per four letters, one per punctuation mark and nothing for whitespace. Every "measured" design choice was made against that.

| Claim under the old counter | Real vocabulary |
| --- | --- |
| `wh`, `ret`, `ex`, `put` each save one token over `while`, `return`, `example`, `print` (RFC 0048) | All eight are one token. Swapping them across RFC 0085's 149 test programs changes the total by 0 |
| `false` costs two tokens (RFC 0048 open question 1) | One |
| Spaces and line breaks are free | RFC 0085's test programs: 2,257 tokens as written, 1,993 with unneeded spaces removed (11.7 percent) |
| `a: Int` and `a Int` cost the same | 3 and 2 |

The benchmark's `token_efficiency` used the same counter, so the benchmark would have repeated the error.

RFC 0085's own sample (`sq` and a loop printing three squares) is 54 tokens as written and 44 tight. A Python program with the same output is 33. Today the language costs more tokens than Python, not fewer.

### 2. Voting did not measure agreement about the design

| Voter | Approve | Reject | Abstain |
| --- | --- | --- | --- |
| designer-min | 5 | 70 | 9 |
| tester | 9 | 70 | 16 |
| designer-prag | 12 | 54 | 11 |
| impl-1 | 23 | 45 | 28 |
| designer-safe | 7 | 25 | 0 |
| user-1 | 36 | 3 | 58 |
| user-2 | 34 | 3 | 60 |

- **Blind voters decided the contested RFCs.** Users see only the card and an RFC's Summary. 118 of their 194 votes were abstentions. RFCs 0048, 0050 and 0086 each passed 4 to 2 with both users approving; among voters who had read the text each was 2 to 2.
- **Abstentions made quorum.** RFC 0085, the kernel, was accepted with one approval (a user) and four abstentions. Its own text says "Status: draft" and "No vote before" a prerequisite RFC that was never opened. RFC 0084, the same design, had been rejected a cycle earlier with three abstentions.
- **Rejections were conditional approvals.** The prompt required every reject to name "one concrete change that would make you approve", and a rejected RFC can only return as a whole new RFC. The kernel went round that loop 36 times in a row (0049 to 0084). About 180 of 578 rationales turn on process (gates, cooldowns, another RFC's status); 127 mention tokens.
- **Process conditions were written into RFCs.** Designers added "gates" about cooldowns and prerequisites, and voters then abstained on the gates instead of judging the design.

### 3. The pipeline proposed faster than it could build

- The orchestrator asked for a new feature RFC whenever none was open. 45 array, text and byte RFCs were written against a kernel that was not built; 40 were rejected, many for leaning on rules that were not in force. The roadmap already said not to do this; nothing enforced it.
- The minimalist designer's rule "every addition must be paid for by a removal" was applied to a language with nothing in it. Arrays cannot remove anything.
- The conformance runner read test files in text mode, which turns CR LF into LF, so no CR test could pass. Agents cannot edit `tools/`. They filed the same bug eight times (issues 482, 485, 501, 518, 520, 546, 551, 553) and the founding implementation PR stayed blocked on it.
- "Never edit or delete an existing conformance test" was absolute in the prompts, while the merge bot already let a founding RFC rewrite tests. Agents followed the prompt, so the one test of the superseded kernel (`print(1)`) blocked the kernel that replaces it.
- No accepted RFC lets a program read input. Every benchmark task reads standard input. The readiness checklist had no item for it.

### 4. The language in force, against the purpose

| In force | Problem | Action |
| --- | --- | --- |
| RFC 0048: any spacing accepted, layout "a later RFC" | Principle 1 asks for one layout, the cheapest. 11.7 percent of program tokens are optional spaces | Brief `canonical-layout` |
| RFC 0085 F7: `fail` if and only if the body has arithmetic, a loop or a call | The compiler derives the mark, so it carries no information; one token on almost every real function, and an error class (E0403) that changes no behaviour | Brief `fail-mark` |
| RFC 0048: `wh`, `ret`, `ex`, `put` | Zero tokens saved; unfamiliar to every model | Brief `word-spelling` |
| No input primitive | Fitness cannot leave 0 | Brief `input` |
| RFC 0050 says a trap is a JSON line with exit 3; RFC 0085 TR1 says `trap: K` and exit 1 | Two RFCs in force contradict | Left to the architect and designers |
| `spec/card.md` documents the superseded diagnostic format (message, file, line, column) | The card is the only thing the benchmark model sees | Arrives with the RFC 0050 implementation |
| RFC 0037 (text ordering) is `implementing` | It amends two superseded RFCs | Will lapse |

RFC 0050 (diagnostics without message, file, line or column) is the one founding decision already aligned: a record is 17 tokens where the old one was 42.

### 5. The benchmark does not yet reward the purpose

- `token_efficiency` was capped at parity with Python and weighted 0.10. A language half the size of Python scored the same as one equal to it.
- The published "held-out fitness" (95.2, 94.5, 94.0) is the Python run on the held-out tasks. The held-out job has no Glyph mode, so the overfitting alarm compares Glyph on dev with Python on held-out and cannot fire.

## What this change does

Measurement
- `tools/check/tokens.py` now counts with a real byte-pair vocabulary (`o200k_base`, vendored, offline), checked token for token against the reference implementation on 225 repository files (787,389 tokens, no difference). The spec caps and the benchmark use it. Agents can run it: `sbx python3 -m tools.check.tokens`.
- `token_efficiency`: parity with Python scores 0.5 and half of Python's tokens scores 1. Weight 0.10 to 0.20, taken from `pass1` and `pass3`.

Constitution (wording, four principles)
- 3: a mark the compiler can derive, or that nearly every function carries, is not required.
- 4: a diagnostic carries nothing a model does not need for the repair.
- 6: spec and card are written as tersely as the language.
- 8: count tokens, never characters; among forms of equal cost take the one models already write without error. This replaces "a short name beats a full word".

Voting
- Quorum is 3 votes that approve or reject. Abstentions no longer count toward it.
- Users do not vote. `impl-2` does. Six voters, all of whom read the whole RFC.
- One voting rule for every voter, in the base prompt: approve a right decision that can be built and put fixable defects in the rationale; reject only for a constitution conflict, real ambiguity, a measured higher token cost, or more than one decision.
- Process is not an agent's call: no gates in RFCs, no votes withheld over cooldowns or status.

Flow
- No new proposals while four or more accepted RFCs are unbuilt.
- An RFC makes one decision in at most 8,000 characters (founding: 25,000), states its cost from counter output, and takes rules only from RFCs in force.
- A test of a superseded RFC is retired; gate rule 6 no longer counts it, judged by the test's `rfc:` line on the base branch.
- The conformance runner reads bytes, and a test can write any byte as `\xHH` with `source-escapes: hex`.
- The readiness checklist has an `input` item.

Owner briefs
- `governance/BRIEFS.yml` is a recorded channel for the owner to ask for an RFC by name with evidence and a question. Two open at a time; dropped after three rejections. The four briefs are the four actions in the table above. They are voted like any RFC.

## What this change does not do

- **RFC 0085 stays accepted.** Its vote would fail under the new quorum, but voiding it restarts the loop that took four nights, and nothing of it is built yet, so amending it is cheap. The briefs amend it under the new rules. Supersede it with an `Owner-Supersedes-RFC: 0085` commit trailer if you would rather restart.
- **It does not edit any RFC, the card, the grammar or the compiler.** Those are the agents'.
- **The counter is a stand-in.** It is another vendor's vocabulary, far closer to any model's tokeniser than letters divided by four, but not the benchmark model's own. The benchmark's measured output tokens are the judge. A calibration against the model's token-count API in the bench job (the only job with network and a key) would set `caps.tokeniser_scale` properly.
- **The held-out run still measures Python.** A Glyph mode for the held-out job is needed before the overfitting alarm means anything. It matters at M3.
- **Accepted RFCs are still revised without a vote.** RFC 0048 was revised 38 times and RFC 0085 16 times, many of them after acceptance, through the "implementers could not build it" path. That path is needed, but it has no bound on what a revision may change.

## Checks worth making after a few nights

- Do the briefs reach a vote with counter figures in their Cost sections?
- Does the share of rationales that argue process fall, and the approve share of designer-min and tester rise above one in ten?
- Does the founding implementation PR merge now that the CR tests can run and the `print(1)` test can be retired?
- Is anything still proposed while four accepted RFCs are unbuilt?

## After the supersession (2026-11-27)

What happened on `main` between this review and its merge:

- The owner measured each accepted RFC with the old counter and superseded the six that conflicted with the purpose clause, with findings in `governance/premise/`. The runner's CR bug and the agents' access to the counter were fixed there too; this change keeps both and adds the `source-escapes` form.
- RFC 0104 (lexical syntax v6) was accepted 6 to 0. It decides the layout: one line, a space only between two word tokens, anything else is E0002 with a fix. The `canonical-layout` brief is therefore dropped.
- RFC 0105 (kernel v46) was accepted with two approvals, both from users, and four abstentions from every voter who had read it. Its text again says "Status: draft" and "No vote before" a prerequisite that is not open. This is the RFC 0085 failure a second time, one night later. Under this change's quorum it would not have passed.

The new syntax, measured with the real vocabulary:

| Program printing 1, 4, 9 through a `sq` function | Tokens |
| --- | --- |
| RFC 0085 as written | 54 |
| RFC 0085 with unneeded spaces removed | 44 |
| RFC 0105: `sq(n Int)Int fail{ret n*n}ex sq(3)==9 main io fail{var i=1 wh i<=3{put sq(i)i=i+1}}` | 38 |
| Python, same structure, tight | 25 |

So the supersession bought 16 tokens of 54 on this program, and the language is still about half again the cost of Python for it. Most of the gap is the example clause (`ex sq(3)==9`, a feature Python lacks), the type annotations and the two effect marks.

Findings in `governance/premise/` that the real vocabulary does not support (they were measured with letters divided by four and one token per punctuation mark):

| Premise finding | Old counter | Real vocabulary |
| --- | --- | --- |
| Short keywords cost one token, long ones two (0048 "fine as is") | `wh` 1, `while` 2 | Both 1 alone; in canonical layout the long words are cheaper: 22 tokens fewer across RFC 0105's 91 programs (1,108 tokens) |
| Dropping `;` saves a token per statement (0048 finding 2) | `x=1;y=2` beats nothing | `x=1;y=2` and `x=1 y=2` are both 6. The saving is nil, and it cost the rule that `ret` must end its block |
| `\n` costs one more token than a raw line feed in text (0048 finding 7) | 2 against 0 | Both 3 in `a\nb` |
| `"E6"` saves a token over `"E0006"` (0050 finding 1) | holds | Holds: 3 against 4 |
| `put x`, `n Int`, `main io`, no `fn` | hold | Hold: one token each |

None of these makes RFC 0104 or 0105 wrong enough to supersede again. They are inputs to the `word-spelling` brief and to later amendments.

Briefs now filed (`governance/BRIEFS.yml`), all amending RFCs 0104 and 0105, and all waiting until the fourth founding RFC (diagnostic style, RFC 0108 in discussion) is decided:

- `word-spelling`: the four short words cost 22 tokens more than the long ones, not fewer.
- `fail-mark`: 39 of 1,108 tokens in RFC 0105's programs, derivable by the compiler. RFC 0105 kept it; the constitution wording in this change now addresses it directly.
- `input`: still nothing reads standard input.

Read "RFC 0085 stays accepted" above as moot: it is superseded. The equivalent decision now is that RFC 0105 stays accepted despite its vote, for the same reason, and the same trailer supersedes it if you prefer.
