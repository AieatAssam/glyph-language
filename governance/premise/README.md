# Token-premise review (owner, 2026-11-26)

Each accepted RFC was checked against the constitution's purpose clause and principles 1 and 8, with
`python3 -m tools.check.tokens`. `NNNN.md` lists the findings for RFC NNNN. The owner superseded the RFCs
listed here; the orchestrator puts each file into the brief of the attempt that replaces it.

The counter of that day charged every punctuation character as one token and one token per four
letters, so it over-priced `==`, `!=`, `//` and `false`, which real tokenisers take as one token.
Findings that rest only on that are left out. The counter has since been replaced by a real
vocabulary; `governance/reviews/2026-11-26-alignment.md` lists which figures here it changes.
