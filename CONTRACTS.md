# Build contracts (for builders of protected infrastructure)

The build spec is `docs/SPEC.md`. This file pins the interfaces between components so they can be built in parallel. If this file and the spec disagree, this file wins on interfaces; the spec wins on intent.

## Runtime and conventions

- Python 3.12, stdlib plus `pyyaml` and `jsonschema` (`tools/requirements.txt`). Tools are a package and run from the repo root as `python -m tools.<module> ...`.
- TypeScript runs directly on Node 24 with type stripping (`node file.ts`). Use only erasable syntax: no `enum`, no `namespace`, no parameter properties. Relative imports carry the `.ts` extension. Do not use a build step, `tsc`, or npm dependencies outside `site/`.
- Python tests are plain `test_*.py` files run with `python -m unittest discover -s tools -p 'test_*.py'`. TypeScript tests are `*.test.ts` files run with `node --test`.
- Canonical JSON is `json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")`. Use the same encoding everywhere a hash or a byte comparison is involved.
- Code must be deterministic: no wall-clock time except in the `ts` argument the caller passes in, and no dict-order leaks.

## Environment variables (all tools and workflows)

| Var | Meaning | Default |
| --- | --- | --- |
| `BASE_BRANCH` | The branch that plays the role of `main`. The M1 dry run uses `dryrun` | `main` |
| `GITHUB_REPOSITORY` | `owner/name` | set by Actions |
| `GH_TOKEN` | Used by the `gh` CLI in publisher and merge bot jobs only | none |
| `RUN_DATE` | Nightly date, `YYYY-MM-DD` | today (UTC) |
| `CYCLE` | Cycle number, 1 to 6 | `1` |
| `AGENT_MODE` | `live` (Claude Code) or `scripted` (M1 canned agents) | `live` |
| `GLYPH_DRY` | `1` means the `gh` wrapper prints instead of calling GitHub (used by unit tests) | unset |

Cycle id: `"<RUN_DATE>/c<CYCLE>"`, which sorts lexicographically. Session id: `"<RUN_DATE>/c<CYCLE>/<phase>/<agent-id>"`. Architect, scribe, and bench phases use `c0`.

## Paths and trust

Protected paths (only the owner may change them; the publisher refuses them and the merge bot re-checks):
`.github/`, `governance/` (all of it, including `roster.yml`), `agents/prompts/`, `tools/`, `toolkit/`, `bench/`, `audit/`, `site/`, `bin/`, `compiler/bootstrap/`, `compiler/ACTIVE`, `docs/`, `CONTRACTS.md`, `README.md`, `package.json`.

These go beyond the spec on purpose. The spec puts `run_agent.sh` and the prompts in `agents/`, and `site/` is unclassified there. All of them run with secrets or shape every agent, so they are protected. The runner lives at `tools/run_agent.sh`.

Agent territory and the roles that may write each path (enforced by the publisher):

| Path | Roles |
| --- | --- |
| `rfcs/NNNN-*.md` | designer, architect-weekly (in RFC PRs only) |
| `rfcs/NNNN.plan.md` | implementer, architect-weekly |
| `spec/**` | implementer, architect-weekly, scribe (`spec/CHANGELOG.md` only) |
| `compiler/stage0/**`, `compiler/self/**` | implementer, architect-weekly |
| `conformance/**` | tester, implementer, architect-weekly |
| `stdlib/**` | implementer, architect-weekly |
| `examples/**` | user (in `docs` PRs), implementer |
| `architecture/**` | architect, architect-weekly |
| `agents/<own-id>/MEMORY.md` | every agent, its own file only, through `out/MEMORY.md` |

## governance/RULES.md

`governance/RULES.md` holds prose plus exactly one fenced block whose info string is `yaml rules`. `tools.lib.rules.load_rules(root)` returns that block as a dict. The keys are those in the file as committed.

## governance/roster.yml

```yaml
agents:
  - id: designer-min
    role: designer        # designer|implementer|tester|reviewer|user|scribe|architect|architect-weekly
    model: claude-haiku-5-5
    effort: null          # or low|medium|high
    votes: true
    persona: "..."
```

## Agent session I/O

The orchestrator writes `<outdir>/assignments.json`, a list of entries `{"agent","session","phase","file"}`, plus one prompt file per entry: `<outdir>/<agent>.md`. An empty list is valid.

`tools/run_agent.sh <agent-id> <assignment-file> <outdir>` composes the prompt from these parts, in order:

1. `governance/CONSTITUTION.md`
2. `agents/prompts/base.md`
3. `agents/prompts/<role>.md`
4. the persona
5. `agents/<id>/MEMORY.md`
6. the assignment

It runs one session and leaves:
- `<outdir>/files/**`: changed or new files, mirroring repo paths
- `<outdir>/actions.json`: `{"actions":[...]}`, validated against `tools/schemas/actions.schema.json`
- `<outdir>/MEMORY.md`
- `<outdir>/session.json`, written by the runner, not the agent: `{"agent","session","phase","outcome":"ok|failed|timeout","usage":{...},"started","ended"}`
- `<outdir>/transcript.jsonl`, scrubbed of secret values by the runner before upload

In `AGENT_MODE=scripted`, the runner calls `python -m tools.scripted.agent <agent-id> <assignment-file> <outdir>` instead of Claude Code.

## Actions (`tools/schemas/actions.schema.json`)

Every action has a `type`. File paths are repo-relative, and each named file must exist under `out/files/`.

| type | fields |
| --- | --- |
| `open_rfc` | `title`, `slug`, `class` (`language`/`stdlib`), `file` (written as `rfcs/draft-<slug>.md`; the publisher assigns NNNN and renames it) |
| `revise_rfc` | `rfc` ("0007"), `file`, `note` |
| `comment` | `target`: `{"rfc":"0007"}` or `{"pr":12}` or `{"issue":5}`, plus `body` |
| `vote` | `rfc`, `vote` (`approve`/`reject`/`abstain`), `rationale` |
| `withdraw_rfc` | `rfc`, `reason` |
| `open_pr` | `title`, `class` (`language`/`stdlib`/`bugfix`/`refactor`/`docs`), `rfc` (optional), `subtask` (optional int), `body`, `files` [paths], `delete` [paths] (optional) |
| `update_pr` | `pr`, `body` (optional), `files`, `delete` (optional), `subtask` (optional) |
| `review` | `pr`, `verdict` (`approve`/`request_changes`), `body` |
| `open_issue` | `title`, `body`, `labels` [] |
| `close_issue` | `issue`, `reason` |
| `digest` | `title`, `body` |

Allowed action types per role:

| Role | Actions |
| --- | --- |
| designer | open_rfc, revise_rfc, comment, vote, withdraw_rfc, open_issue, close_issue |
| implementer | open_pr, update_pr, comment, vote, open_issue, close_issue |
| tester | open_pr, update_pr, comment, vote, open_issue |
| reviewer | review, comment |
| user | open_issue, comment, vote, open_pr (`examples/` only) |
| scribe | digest, comment, open_pr (`spec/CHANGELOG.md` only) |
| architect | comment, open_issue, open_pr (`architecture/` only) |
| architect-weekly | open_rfc, revise_rfc, comment, open_issue, open_pr, update_pr |

A `vote` is accepted only when the roster marks the agent as a voter and the agent is not the RFC's author. Limits: at most 2,000,000 bytes under `out/` in total, at most 50 actions, and a comment body of at most 20,000 characters.

Branches:
- RFC PR: `agent/rfc-NNNN`
- implementation of an RFC: `agent/impl-NNNN`, one PR per RFC that accumulates subtasks
- any other PR: `agent/<class>-<slug>`

The publisher pushes only to `agent/*`.

## Publisher

`python -m tools.publisher --session-dirs DIR... --out PUBDIR`

- Validates each session directory. Any refused action is listed with a reason. Valid actions are applied to GitHub through `tools/lib/gh.py`.
- Every posted body starts with `**[<agent-id> · <session>]**`. A vote comment also carries a machine marker: `<!-- glyph:vote {"rfc":"0007","vote":"approve"} -->`.
- Writes:
  - `PUBDIR/report.json`: `{"published":[...],"refused":[{"agent","session","action","reason"}]}`
  - `PUBDIR/events.jsonl`: proposed events, one per line, without `seq`, `prev_hash`, or `hash`, each with an `idem` key such as `"<session>#<action-index>"`
- Copies `session.json`, `MEMORY.md`, and `transcript.jsonl` into `PUBDIR/sessions/<agent>/`.

## Audit log (`tools/lib/audit.py`, owned by the audit and mergebot builder)

```python
canonical_json(obj) -> bytes
load_events(root) -> list[dict]
append_event(root, *, type, actor, session, subject, data, ts, idem=None) -> dict | None   # None when idem already present
verify_chain(root) -> tuple[bool, int | None]   # (ok, first bad seq)
```

An event has the fields `seq` (from 1), `ts`, `type`, `actor`, `session`, `subject`, `data`, `idem` (may be null), `prev_hash` (the genesis value is 64 zeros), and `hash` (SHA-256 hex over the canonical JSON of the entry without `hash`). The file is `audit/events.jsonl`.

Event types are those in spec §11, plus:
- `cycle_started` {cycle}
- `rfc_status` {rfc, from, to, reason}
- `check_run` {pr, sha, base_sha, rules: {"1": {"ok": bool, "detail": str}, ...}}
- `bench_run` {scope: gate|nightly|baseline, ...}

`subject` is any of `{"rfc"}`, `{"pr"}`, `{"issue"}`.

## State (`tools/lib/state.py`, same owner)

`load_state(root) -> dict` replays the events, so no GitHub calls are needed. The shape:

```
{"rfcs": {"0007": {"number","title","slug","author","class","status","pr","branch",
                   "status_cycle","status_date","votes":{agent:{"vote","rationale"}},
                   "accepted_super": bool}},
 "prs": {"12": {"number","branch","class","rfc","author","status","head_sha","reviews":[{"agent","verdict","sha"}],
               "subtask_failures":{"<n>":count}}},
 "issues": {"5": {"number","title","author","status"}},
 "cycles": ["2026-11-20/c1", ...],
 "escalations": [...], "spec_version": "0.0.0", "head_hash": "..."}
```

RFC statuses are `draft`, `discussion`, `voting`, `accepted`, `rejected`, `implementing`, `implemented`, `withdrawn`, `lapsed`, and `superseded`. A status changes only through `rfc_opened` (which sets `discussion`), `rfc_status`, `rfc_decided`, `rfc_withdrawn`, `merged`, and the other events of spec §11. Cycle counts are taken from `cycle_started` events.

## Merge bot (`python -m tools.mergebot <cmd>`)

| cmd | does |
| --- | --- |
| `open` | Verifies the chain, scans protected-path commits since the last owner event and records them as owner events, and appends `cycle_started` |
| `ingest PUBDIR...` | Appends the proposed events, idempotent through `idem`. Records `session_*` events from `sessions/*/session.json` with the transcript sha256. Commits `audit/` to `BASE_BRANCH` |
| `decide` | Moves RFCs `discussion` → `voting` once eligible, tallies `voting` RFCs, lapses expired ones, writes the RFC file to BASE with its status and vote record in front matter, writes `audit/decisions/NNNN.md`, and closes the RFC PR |
| `merge CHECKDIR [BENCHDIR]` | Applies gate rules 1–14 (spec §6) to candidate PRs using the check and bench result JSON. Squash-merges at most one PR per call with commit trailers, bumps `spec/VERSION` (a minor bump for `language` and `stdlib`, a patch bump otherwise), and records `gate_blocked` or `merged` |
| `close` | Writes `audit/daily/<date>.md` from the digest events, pushes transcripts to the orphan branch `audit-transcripts` at `<session>.jsonl.gz` (session `<date>/r<run id>/c<cycle>/<phase>/<agent>`, so cycles and same-day runs do not overwrite each other), and creates the annotated tag `audit-<date>` at the head hash. Prints `release=true` when the spec version changed tonight |
| `verify` | Checks the chain and replays it (spec §11 integrity). Exit code 1 on failure |

Every committing command does a pull-rebase-push with retries. None of them executes code from agent territory.

## Check (`tools/check/`)

`python -m tools.check.run --repo DIR --out result.json [--pr N --sha S --base-sha B]` runs inside the sandbox container. It writes:

```
{"pr","sha","base_sha","rules":{"4":{"ok","detail"},"5":...,"7":...,"8":...,"9":...,"10":...,"11":...,"12":...},
 "conformance":{"passed","failed","total","failures":[...]},"stats":{...}}
```

Rules 1, 2, 3, 6, 13, and 14 are evaluated by the merge bot, not by check.

`bin/glyphc` is a protected bash script. It reads `compiler/ACTIVE`. For `stage0` it runs `node compiler/stage0/src/main.ts "$@"`. For `self` it runs `toolkit/run.ts` on `compiler/bootstrap/glyphc.wasm`. It exits 3 when no compiler exists.

Conformance `.test` format and kinds are defined in spec §7. In a `compile-error` test, `expect-errors` lines read `E0207 4` (code, line).

## Toolkit (TypeScript, `toolkit/`)

- `toolkit/wasm-encoder.ts` exports the class `ModuleBuilder` (types, imports, funcs, memory, globals, exports, data, start), an `Op` instruction emitter, and LEB128 helpers. `toBytes(): Uint8Array`.
- `toolkit/validate.ts` exports `validate(bytes): {ok, errors[], imports[]}`. It uses `WebAssembly.validate` and `WebAssembly.Module.imports`, and allows only `wasi_snapshot_preview1` imports. CLI: `node toolkit/validate.ts f.wasm`.
- `toolkit/run.ts` exports `run(bytes|path, {args, stdin, dir, fuel, memoryMb, stdoutLimit}) -> {exitCode, stdout, stderr, trap, fuelExhausted}`. It uses `wasmtime` (with `-W fuel=`) when one is on PATH and otherwise falls back to `node:wasi`. CLI: `node toolkit/run.ts f.wasm [args]`.
- `toolkit/wasi-browser.ts`: a minimal WASI preview-1 shim for the playground worker.

## Rules flags

`RULES.md` holds `gates: {bench, differential, fixed_point, native}` and `milestone`. Infrastructure for later milestones is built now and stays switched off until the owner flips its flag.

## Playground entry

`compiler/<ACTIVE>/browser.ts` exports `compile(source, opts) -> {wasm?: Uint8Array, diagnostics}` and `format(source) -> string`. It may not use any Node API, and the implementer prompt requires it. The full contract is in `site/README.md`.

## Self-hosting conventions

- `compiler/self/ENTRY` holds the repo-relative path of the self-hosted compiler's entry source.
- Stage 0 and the self-hosted compiler both implement `--dump tokens|ast|ir` as canonical JSON.
- An example program may have a sibling `<name>.expect` file in the conformance container format (`stdin`, `expect-stdout`, `expect-exit`). Details are in `tools/check/README.md`.

## Commit identities

- Agent branch commits (publisher): author `<agent-id> <<agent-id>@agents.glyph-language.invalid>`, committer `glyph-publisher`, trailers `Agent:` and `Session:`.
- Squash merges (merge bot): author is the PR's author agent; every other agent with commits on the branch gets a `Co-authored-by:` trailer; committer `glyph-mergebot`.
- Bot-only commits (audit, decisions, bootstrap): `glyph-mergebot`.
- A plan-only PR (only `rfcs/NNNN.plan.md`) is judged on gate rules 1, 2 and 14; rules 3 to 13 apply to code.

## Re-running a night

Session ids are `<date>/r<run id>/c<cycle>/<phase>/<agent>`, and every idempotency key derives from them. GitHub's "Re-run jobs" keeps the run id, so a re-run skips what already happened. A fresh `workflow_dispatch` gets a new run id and starts a new night: after a partial failure, re-run the failed jobs instead, or the new run will open duplicate RFCs and PRs.
