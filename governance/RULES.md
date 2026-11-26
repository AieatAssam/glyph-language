# Rules of process

Owner-protected. The merge bot and orchestrator read the block below; changing a number is an owner commit and is recorded as a `rules_changed` event.

## RFC process

1. `draft` → `discussion`: a designer opens an RFC; the publisher assigns the number and opens PR `agent/rfc-NNNN`.
2. `discussion`: at least `discussion_min_cycles` cycles, at most `discussion_max_nights` nights. The author may revise.
3. `voting`: `voting_cycles` cycle(s). Voters cast approve, reject or abstain with a rationale. Authors cannot vote on their own RFC. Voters are the agents who can read the whole RFC: designers, implementers and the tester. User agents see only the card, so they do not vote; their issues are their voice.
4. Decided by the merge bot: quorum of `quorum` votes that approve or reject (an abstention is not a vote for quorum); accepted when approvals are at least `accept_ratio` of non-abstaining votes; `supermajority_ratio` required for breaking changes after self-hosting and for any RFC that removes or alters a conformance test (RFC front matter `alters_tests: true` or `breaking: true`).
5. `implementing` for at most `implementing_max_nights` nights, then `lapsed` The four founding RFCs (name, lexical syntax, kernel, diagnostic style) are exempt: they share one implementation PR and never lapse.
6. A rejected RFC cannot be resubmitted in substance for `resubmit_cooldown_nights` nights.
7. No new RFC is proposed while `max_unbuilt_rfcs` or more accepted RFCs are not yet implemented. Designers revise and comment instead. An owner brief (`governance/BRIEFS.yml`) is exempt: it asks for an RFC by name, at most `brief_max_open` at a time, and is dropped after `brief_max_attempts` rejections.
8. A conformance test belongs to the RFC in its `rfc:` line. When that RFC is superseded the test is retired: the PR that implements the successor deletes or rewrites it, and gate rule 6 does not count it.
9. An RFC makes one decision and is at most `rfc_max_chars` characters (`rfc_max_chars_founding` for the four founding RFCs).

## Merge gate

Rules 1–14 of the build spec section 6, in order. Flags under `gates` switch on later-milestone rules.

```yaml rules
milestone: M2
quorum: 3
accept_ratio: 0.6667
supermajority_ratio: 0.75
discussion_min_cycles: 2
discussion_max_nights: 5
voting_cycles: 1
implementing_max_nights: 7
resubmit_cooldown_nights: 10
max_open_rfcs: 5
max_open_rfcs_per_designer: 2
max_implementing: 3
max_unbuilt_rfcs: 4
brief_max_open: 2
brief_max_attempts: 3
rfc_max_chars: 8000
rfc_max_chars_founding: 25000
stability_window_nights: 7
cycles_per_night: 6
fast_until_conformance_tests: 200
max_gated_prs_per_cycle: 2
escalation_failures: 3
subtask_max_changed_lines: 400
max_out_bytes: 2000000
max_actions: 50
max_open_issues: 40
session:
  timeout_minutes: 30
  max_budget_usd: 2.0
  max_parallel: 4
memory_max_tokens: 1500
caps:
  core_spec_tokens: 12000
  card_tokens: 2000
  tokeniser_scale: 1.0
execution:
  fuel: 10000000000
  memory_mb: 256
  stdout_bytes: 1048576
bench:
  model: claude-haiku-5-5
  samples: 3
  attempts: 3
  gate_subset: 20
  gate_tolerance: 2.0
  gate_reruns: 1
  overfit_gap: 8
  overfit_nights: 3
  weights:
    pass1: 0.30
    pass3: 0.10
    repair: 0.15
    read: 0.15
    edit1: 0.10
    token_efficiency: 0.20
gates:
  bench: false
  differential: false
  fixed_point: false
  native: false
weekly_architect_max_escalations: 3
```
