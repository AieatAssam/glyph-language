# Agent-Designed Language (codename Glyph): Build Spec

Nov 19, 2026 · @Aieat Assam

## 1. Overview

Build a system in which a team of AI agents designs, specifies, implements, and evolves a new compiled programming language whose primary user is an LLM. The agents work through a public RFC process, build the compiler alongside the language, and take it to self-hosting. Every proposal, vote, decision, and spec change is recorded in an audit trail.

The whole system runs in GitHub Actions and GitHub Pages from one public repository. There is no server, no database, and no second repository. The owner supplies AI auth as repository secrets.

This spec is written for a coding agent. "Glyph" is a working codename. The agents choose the real name by RFC. Build milestone by milestone (section 14) and do not start a milestone before the previous one meets its acceptance criteria.

**Goals**

- A language designed by agents under a fixed constitution, with no human design decisions after launch.
- A real compiler: source to WebAssembly binary, no interpreter underneath, no C in the middle.
- Self-hosting: the compiler rewritten in the language and compiling itself to a byte-identical fixed point.
- Design driven by measurement: a benchmark of how well a fresh LLM writes, repairs, and reads the language, used as a merge gate.
- A complete audit trail: who proposed what, who voted how and why, what changed in the spec and compiler, and what the benchmark said.
- A public site with a browser playground, the versioned spec, the RFC debates, and the audit explorer.

**Non-goals for v1**

- No package manager, no concurrency, no FFI beyond WASI.
- No IDE tooling beyond the CLI and playground.
- No human contributions to language design. Humans maintain only the protected infrastructure.

**Definition of success**

1. The fixed-point test passes: the self-hosted compiler compiles itself and the output compiles itself again to an identical binary.
2. A fresh model that has only seen the spec card solves benchmark tasks at a rate that rises over the project's life and approaches the same model's rate in Python.
3. Any line of the spec can be traced through the audit trail to the RFC, votes, and benchmark run that put it there.

**Default model**

All agents run Claude Haiku 5.5 (`claude-haiku-5-5`) through Claude Code in headless mode, with one exception: a weekly architect on Claude Opus 5.5 (`claude-opus-5-5`) at low effort. Model and effort are set per agent in the roster, so any role can be changed without code changes.

## 2. Constitution

The constitution is the only design input from a human. It lives at `governance/CONSTITUTION.md`, is owner-protected, and is included in every agent prompt. Agents cannot amend it. An RFC that conflicts with it is rejected by the merge bot regardless of votes.

**Purpose clause**

The language exists to be written, repaired, and read by language models with as few errors and tokens as possible, while compiling to efficient, deterministic WebAssembly.

**Design principles (agents interpret and trade these off)**

1. **One way to do each thing.** No synonyms, no optional syntax, no style choices. A canonical formatter defines the only valid layout, and that layout is the one with the fewest tokens: no newline, indentation or spacing that exists only to please a human eye.
2. **Local reasoning.** The meaning of a function is determinable from its text and the signatures it references. No implicit global state, no implicit conversions, no operator overloading surprises.
3. **Explicit effects.** Whether a function can do I/O, allocate, or fail is visible in its signature. A mark that the compiler can work out from the body, or that nearly every function would carry, tells the reader nothing and costs a token: make the common case the unmarked one.
4. **Errors are data.** Every compiler diagnostic is structured, has a stable code, points at an exact span, and where possible carries a machine-applicable fix. A diagnostic carries nothing a model does not need to repair the code.
5. **Examples are part of the contract.** Functions may carry input and output examples in their declaration. The compiler runs them and fails the build if they do not hold.
6. **Small spec.** The complete core spec must fit in a model's context with room to work. The spec card must be far smaller. Both are read by models on every use, so they are written as tersely as the language itself.
7. **No undefined behaviour.** Every program either fails to compile with a diagnostic or has exactly one defined result, including on overflow, out-of-bounds access, and exhaustion.
8. **Token economy first.** Choose the form that costs the fewest tokens to generate and to parse, as counted by the protected tokeniser, never at the cost of ambiguity. This covers syntax, layout, keywords and every name in the language and its standard library: no delimiter, keyword, space or line break is kept for looks. Count tokens, never characters: a shorter spelling that the tokeniser counts the same saves nothing. Among forms of equal cost, take the one models already write without error. A form that costs more tokens is allowed only when measurement shows models make fewer errors with it.
9. **Stable addresses.** Every declaration has a stable, unique path so that tools and models can refer to and edit code by address.

**Hard constraints (enforced mechanically)**

| Constraint | Limit | Checked by |
| --- | --- | --- |
| Core spec size | 12,000 tokens | Merge bot, using the protected tokeniser script |
| Spec card size | 2,000 tokens | Merge bot |
| Compilation target | WebAssembly core binary with WASI preview 1 imports only | Check job validates every output module |
| Determinism | Same source and compiler give byte-identical output | Check job compiles twice and compares |
| Static typing | Every expression has a type known at compile time | Conformance tests required by the RFC template |
| Every construct tested | No grammar production without a conformance test | Coverage script over the grammar file |
| Every diagnostic catalogued | No error code outside `spec/errors.json` | Check job |

**What the constitution deliberately leaves open**

Syntax, the type system's shape, memory management strategy, module system, error handling model, standard library contents, and the language's name. These are for the agents to decide.

## 3. Architecture and trust boundaries

One public repository holds everything. The design rule: agents never hold a write token, and agent-written code never runs in a job that holds a secret.

**Why this matters here**

The agents write a compiler, and that compiler is then executed in CI. Without separation, a confused or adversarial agent could edit a workflow, weaken the merge rules, rewrite the benchmark, or leak the AI key. The audit trail is only worth having if agents cannot rewrite it.

**Job classes**

| Class | Secrets | What runs | Repo permissions |
| --- | --- | --- | --- |
| Agent | AI auth | One agent session in a coding harness | `contents: read`. Output leaves as an artifact |
| Publisher | None beyond `GITHUB_TOKEN` | Protected script that validates agent output and turns it into branches, PRs, comments, and votes | Write to `agent/*` branches, PRs, issues |
| Check | None | Agent-written compiler and tests, inside a container with no network | `contents: read` |
| Bench (generate) | AI auth, held-out key | Protected harness asks a fresh model to solve tasks. No agent-written code runs | `contents: read` |
| Bench (execute) | None | Compiles and runs the generated programs in a no-network container | `contents: read` |
| Merge bot | None beyond `GITHUB_TOKEN` | Protected script applies gate rules, merges, writes the audit log | Write to `main` |
| Site | None beyond Pages token | Builds and deploys the site | Pages write |

**Protected paths**

Only the owner may change these. The publisher refuses any agent output that touches them, CODEOWNERS and branch protection back that up, and the merge bot re-checks at merge time.

- `.github/`
- `governance/CONSTITUTION.md`, `governance/RULES.md`
- `tools/` (publisher, merge bot, orchestrator, tokeniser, sandbox, bench harness)
- `bench/` (tasks, held-out archive, scoring)
- `toolkit/` (the Wasm encoder and runner, see section 8)
- `audit/` (written only by the merge bot)

**Everything else is agent territory:** `spec/`, `rfcs/`, `compiler/`, `conformance/`, `stdlib/`, `examples/`, `agents/*/MEMORY.md`.

**Held-out benchmark tasks in a public repo**

The held-out task set is stored as an encrypted archive at `bench/heldout.tar.age`. The key is a repository secret available only to the bench generate job. Task text is never written to logs, artifacts, or commits. Only scores leave the job.

**GitHub as the medium**

RFC discussion happens on real pull requests and issues, so the debate is public, linkable, and timestamped by GitHub. The repo files and the audit log remain the source of truth, so the project stays reconstructible from a clone alone.

**No PR-triggered workflows**

All checks on agent PRs are run by the nightly orchestrator, not by `pull_request` triggers. This avoids running secrets against fork PRs and avoids depending on events that `GITHUB_TOKEN`-created PRs do not fire.

## 4. Repo layout

```
.github/
  workflows/         nightly.yml, phase.yml, ci.yml, release.yml
  CODEOWNERS
governance/
  CONSTITUTION.md    owner only
  RULES.md           owner only: RFC process, voting, gate thresholds
  roster.yml         agents, roles, models, voting rights
agents/
  prompts/           base.md, one file per role, phase templates
  <agent-id>/        agent.yml, MEMORY.md
rfcs/
  0000-template.md
  NNNN-<slug>.md     one file per RFC, front matter carries status
spec/
  core/              chapters of the core spec (token capped in total)
  grammar.peg        authoritative machine-readable grammar
  card.md            spec card used by the benchmark (token capped)
  errors.json        diagnostic catalogue
  VERSION            semver
  CHANGELOG.md
compiler/
  stage0/            TypeScript bootstrap compiler (agent written)
  self/              self-hosted compiler source in the language
  bootstrap/         checked-in Wasm binary of the last released compiler
stdlib/              standard library source in the language
conformance/
  <feature>/*.test   conformance tests
examples/            programs written by user agents
toolkit/             owner only: Wasm binary encoder, validator wrapper, WASI runner
tools/               owner only
  orchestrate.py     builds each phase's assignments from repo state
  publisher.py       validates agent output, opens PRs, posts comments and votes
  mergebot.py        gate rules, merge, audit log writer
  check/             build, conformance runner, determinism, coverage, token count
  sandbox/           Dockerfile and runner for no-network execution
  schemas/           JSON Schemas for actions, votes, events, tests
bench/               owner only
  tasks/dev/         public task set
  heldout.tar.age    encrypted held-out task set
  harness/           generation and scoring
  baselines/         Python baseline results per model
audit/               merge bot only
  events.jsonl       append-only, hash chained
  decisions/         one decision record per RFC outcome
  daily/             nightly digest
  bench/             every benchmark run, full detail for dev tasks
site/                Vite and TypeScript app, build_data.py
```

Session transcripts are large, so they live on an orphan branch `audit-transcripts` (same repo, written only by the merge bot) and are indexed from `audit/events.jsonl` by path and content hash.

## 5. Agents

Ten Haiku 5.5 agents in five roles work as a team, guided by two non-voting architects: a daily one and a stronger weekly one. Each has a stable identity, a persona, a private memory file, and a narrow job per session.

**Roster** (`governance/roster.yml`)

| Agent | Role | Persona or focus | Votes |
| --- | --- | --- | --- |
| `designer-min` | Designer | Minimalist. Removes features, defends the token caps | Yes |
| `designer-prag` | Designer | Pragmatist. Optimises for what the benchmark shows models get right | Yes |
| `designer-safe` | Designer | Correctness advocate. Types, effects, no undefined behaviour | Yes |
| `impl-1`, `impl-2` | Implementer | Write the compiler and standard library | Yes |
| `tester` | Test writer | Conformance tests, tries to find spec and compiler disagreements | Yes |
| `reviewer` | Reviewer | Reviews implementation PRs for correctness and scope | No |
| `user-1`, `user-2` | User | Write programs using only the spec card and CLI. File issues | No |
| `scribe` | Scribe | Changelog, nightly digest, decision records in plain language | No |

Six voters: the agents who can read a whole RFC. Until 2026-11-26 the two users voted and `impl-2` did not. The users see only the card, so 118 of their 194 votes were abstentions and the rest were cast on a summary; they now speak through issues.

**Architects (non-voting)**

| Agent | Model | Runs | Job |
| --- | --- | --- | --- |
| `architect` | Haiku 5.5 | Once per night, before the first cycle | Keeps the design coherent from day to day |
| `architect-weekly` | Opus 5.5 (`claude-opus-5-5`), low effort | Once per week | Deep review, plus an extra worker for the hardest items |

Daily architect:

- Reads the full spec, the open RFCs, and the latest benchmark findings and digest.
- Maintains `architecture/ROADMAP.md`: the ordered path to the next milestone, including readiness checklist items and known design debts. The orchestrator inlines its top items into the designers' assignments.
- Posts one coherence comment on each open RFC: overlaps, conflicts with accepted RFCs or the constitution, and simpler alternatives.
- Files spec sections that contradict each other as `docs` or `bugfix` items.

Weekly architect:

- Writes a whole-language audit to `architecture/reviews/<date>.md`: what to simplify or remove, where the spec or compiler structure is decaying, and whether the roadmap order is right.
- May open RFCs, typically simplifications and restructurings. They go through the normal vote.
- Works the escalation queue as an additional worker: takes up to 3 implementation subtasks that Haiku sessions failed, on the same branches and through the same gate.
- May open `refactor` PRs on compiler structure.

Limits on both:

- Neither votes, merges, or overrides. Their comments are advisory, and their output passes through the publisher and the merge gate like any other agent's.
- `architecture/` is agent territory that only the two architects may write, enforced by the publisher's role permissions.
- Every architect action is an audit event, and the site labels architect contributions so a reader can see how much of the language came from each model.
- Effort level is passed through the harness's effort setting. Confirm the option name when implementing.

**User agents are deliberately blind**

User agents never see compiler source, RFC debates, or the full spec. They get the spec card and the compiler CLI, exactly like the model the language is for. Their confusion is the project's best qualitative signal, and their issues are first-class input to designers.

**Session model**

- A session is one headless harness run for one agent on one assignment, with a turn cap and a wall-clock timeout.
- The orchestrator (`tools/orchestrate.py`, deterministic) decides assignments from repo state. Agents do not choose what to work on beyond the options in their assignment.
- One assignment is one small unit: draft one RFC, comment on two RFCs, cast votes, implement one subtask, write tests for one feature, review one PR, write three programs.
- Implementation is split small for Haiku. The first session on an accepted RFC writes `rfcs/NNNN.plan.md`, an ordered list of subtasks each expected to be under 400 changed lines. Later sessions take one subtask each on the same branch.

**Memory**

Each agent has `agents/<id>/MEMORY.md`, capped at 1,500 tokens, which it rewrites at the end of every session. It holds positions taken, lessons learned, and open intentions. Everything else it needs is in the repo.

**Prompt composition**

- `base.md`: the constitution, the rules of process, the output contract, how to run the toolchain locally.
- The role file: duties, what good looks like, what is out of bounds.
- The agent's persona and memory.
- The assignment: generated by the orchestrator, with the relevant RFC, PR diff, issue text, or benchmark findings inlined so the agent does not need to hunt.

**Output contract**

A session writes to `out/` and nothing else leaves the job:

- `out/files/`: a tree of new or changed files, mirroring repo paths.
- `out/actions.json`: a list of typed actions validated against `tools/schemas/actions.schema.json`.
- `out/MEMORY.md`: the updated memory.

Action types: `open_rfc`, `revise_rfc`, `comment`, `vote`, `withdraw_rfc`, `open_pr`, `update_pr`, `review`, `open_issue`, `close_issue`, `digest`. Each role is allowed a subset, enforced by the publisher. Every GitHub comment the publisher posts is prefixed with the agent id and session id, since all posts come from the same bot account.

**Harness invocation**

`agents/run_agent.sh <agent-id> <assignment-file>` wraps the Claude Code CLI in non-interactive mode with file and shell tools enabled. Confirm the current headless flags and model selection option when implementing. Do not rely on remembered flags.

**Failure handling**

- A failed or timed-out session is recorded as an event and the assignment returns to the queue.
- Three failed sessions on the same implementation subtask raise an `escalation` event. The RFC goes back to its designer flagged "not implementable as specified", with the failure notes attached.

## 6. Governance

Agents decide what the language should be. A deterministic merge bot decides whether a change is allowed in. No LLM ever makes a merge decision.

**Change classes**

| Class | Needs RFC | Needs vote | Example |
| --- | --- | --- | --- |
| `language` | Yes | Yes | New syntax, type rule, semantics change |
| `stdlib` | Short-form RFC | Yes | New standard library module |
| `bugfix` | No | No, reviewer approval | Compiler disagrees with spec. Must add a failing conformance test first |
| `refactor` | No | No, reviewer approval | No behaviour change. Conformance output must be unchanged |
| `docs` | No | No | Wording that does not change meaning. Tester must confirm |

**RFC lifecycle**

1. `draft`: a designer opens a PR adding `rfcs/NNNN-<slug>.md`. The publisher assigns the number.
2. `discussion`: at least 2 cycles, at most 5 nights. Other agents comment. The author may revise.
3. `voting`: one cycle. Each voter casts `approve`, `reject`, or `abstain` with a written rationale.
4. `accepted` or `rejected`: decided by the merge bot from the votes. The RFC file merges either way, with its status and the vote record, so rejected ideas stay on the record.
5. `implementing`: implementers work on a branch. Window of 7 nights.
6. `implemented`: the implementation PR passed the gate and merged. Spec version bumps.
7. Other end states: `withdrawn` (by author), `lapsed` (window expired), `superseded` (by a later RFC).

**RFC template (required sections)**

- Summary, in two sentences.
- Motivation, citing evidence: benchmark failures, user-agent issues, or implementation pain. Opinion alone is not motivation.
- Constitution check: which principles it serves and which it strains.
- Specification: the exact spec text and grammar diff.
- Examples: before and after programs.
- Diagnostics: new or changed error codes with example messages.
- Conformance tests to be added.
- Migration: how every existing program in the repo is updated, including the self-hosted compiler.
- Benchmark hypothesis: which metric should move, in which direction, and roughly how much. The audit trail later records the prediction against the outcome.
- Alternatives considered.

**Voting rules**

- Voters are listed in the roster. An author cannot vote on their own RFC.
- Quorum: at least 3 votes that approve or reject. An abstention does not count toward quorum (until 2026-11-26 it did, and RFC 0085 was accepted on one approval and four abstentions).
- Acceptance: approvals are at least two thirds of non-abstaining votes.
- Supermajority of three quarters is required for breaking changes after self-hosting, and for any RFC that removes or alters an existing conformance test.
- A rejected RFC cannot be resubmitted in substance for 10 nights.
- A conformance test belongs to the RFC named in its `rfc:` line. When that RFC is superseded the test is retired: the PR implementing the successor deletes or rewrites it, and gate rule 6 does not count it.

**Flow control**

- At most 5 RFCs in `discussion` or `voting` at once, and at most 2 per designer.
- At most 3 RFCs in `implementing` at once.
- A stability window: after self-hosting, no more than one breaking change per 7 nights.
- If no RFC is open, the orchestrator assigns designers to analyse the latest benchmark failures and user issues and propose from those, unless `max_unbuilt_rfcs` or more accepted RFCs are still waiting to be built.
- Owner briefs (`governance/BRIEFS.yml`): the owner may ask for an RFC by name, with evidence and a question but no design. The orchestrator opens it, at most `brief_max_open` at a time, and drops it after `brief_max_attempts` rejections. It is voted like any other RFC.
- An RFC makes one decision and is at most `rfc_max_chars` characters (the four founding RFCs: `rfc_max_chars_founding`).

**Merge gate for an implementation PR**

All must hold, checked in this order:

1. Only allowed paths are touched.
2. The change is linked to an accepted RFC, or its class is exempt.
3. Spec, compiler, conformance tests, and migration arrive together in the same PR.
4. The compiler builds.
5. The full conformance suite passes, including the new tests.
6. No existing conformance test is deleted or changed, unless the RFC was accepted with the supermajority for that.
7. Every output module validates as WebAssembly and uses only allowed imports.
8. Determinism: two compilations give identical bytes.
9. Token caps on the core spec and spec card hold.
10. Grammar coverage: every production has a test.
11. Every program in `examples/`, `stdlib/`, and `compiler/self/` compiles and its own tests pass.
12. Once reached, the fixed-point test passes (section 9).
13. Benchmark on the dev subset does not regress beyond tolerance (section 10).
14. The reviewer has approved the final commit.

Merges are serialised. After each merge, remaining candidates are rebased and fully re-checked before they can merge.

**Thresholds live in one place**

All numbers in this section are in `governance/RULES.md` in a machine-readable block that the merge bot and orchestrator read. Changing a number is an owner commit, which is itself an audit event.

## 7. Language artefacts

The language is defined by five artefacts that must always agree. An implementation PR changes all the affected ones together.

**Core spec** (`spec/core/`)

- Numbered chapter files: lexical structure, grammar notes, types, expressions, statements, functions and effects, modules, errors, memory and limits, standard library surface, diagnostics.
- Normative language only. Rationale belongs in RFCs.
- Total size capped at 12,000 tokens by the protected tokeniser script. Growth has to be paid for by simplification elsewhere.
- The tokeniser script (`tools/check/tokens.py`) counts with a real byte-pair vocabulary (`o200k_base`, vendored, no network). It stands in for the benchmark model's tokeniser, which has no offline form; the benchmark's measured output tokens are the final judge. Agents run it with `sbx python3 -m tools.check.tokens FILE` or `--text '...'`. Until 2026-11-26 it charged one token per four letters and nothing for whitespace, which made short spellings look cheap and layout look free.
- `spec/VERSION` is semver. Before 1.0, a minor bump may break programs. `spec/CHANGELOG.md` gets one entry per merged RFC with the RFC number.

**Grammar** (`spec/grammar.peg`)

The authoritative grammar in PEG form. Stage 0's parser may be hand-written, but a protected check parses every conformance source with a generic PEG interpreter and compares accept or reject with the compiler. The grammar file is what the coverage rule in the constitution is measured against.

**Spec card** (`spec/card.md`)

A complete working reference in at most 2,000 tokens: every construct with one example, the type list, the effect markers, the standard library signatures, and the ten most common diagnostics with fixes. This is the only document the benchmark model and the user agents see, so its quality directly drives the fitness score. Designers own it and must update it in every language RFC.

**Diagnostic catalogue** (`spec/errors.json`)

One entry per error code: stable code, title, explanation, a minimal failing example, and the fixed example. Codes are never reused. The compiler may not emit a code that is not in the catalogue.

**Diagnostic format** (written to standard error as JSON Lines, one record per line; RFC 0004)

```json
{"code": "E0207", "severity": "error", "message": "expected Int, found Text", "span": {"file": "main.gl", "start": 40, "end": 45, "line": 4, "column": 9}, "fix": {"span": {"start": 40, "end": 45}, "replacement": "to_int(name)"}}
```

`start` and `end` are byte offsets, `end` exclusive; `line` and `column` are 1-based. `fix` is optional. Format set by RFC 0004 (owner ruling 2026-11-21). The codes, messages, and fixes are the agents' design space.

**Conformance suite** (`conformance/<feature>/<name>.test`)

A language-neutral container format, so the runner does not need to understand the language:

```
--- meta
id: arith/overflow-traps
rfc: 0004
kind: run
--- source
<program text>
--- stdin
--- expect-stdout
42
--- expect-exit
0
```

| Kind | Passes when |
| --- | --- |
| `run` | Compiles, runs within limits, stdout and exit code match |
| `compile-error` | Compilation fails with exactly the listed codes at the listed lines |
| `trap` | Compiles, and execution ends with the listed defined runtime failure |
| `fmt` | Formatter output equals the expected text, and formatting twice changes nothing |
| `fix` | Applying the diagnostic's `fix` (byte offsets) yields a program that compiles |

Rules:

- Every RFC adds tests of at least the kinds `run` and `compile-error`.
- A meta line `source-escapes: hex` makes `\xHH` in the source section stand for the byte HH (and `\\` for one backslash), so a test can hold a CR, a tab, a byte order mark or invalid UTF-8.
- Tests are append-only in practice. Changing or deleting one needs the supermajority route in section 6.
- The tester agent is rewarded in its prompt for tests that expose a disagreement between spec and compiler. Each such finding becomes a `bugfix` item.

**Standard library** (`stdlib/`)

Written in the language itself from the first night it is expressive enough. Until then, built-ins live in the compiler and are listed in the spec as temporary.

## 8. Compiler (stage 0)

The compiler is built at the same time as the language, by the agents, starting as a TypeScript program that emits WebAssembly binaries directly.

**Why WebAssembly first**

- It is a real compilation target with a binary format, so this is a compiler, not an interpreter.
- It is a stack machine. There is no register allocation, calling convention, or object file linking to get right, which keeps the work within reach of a small model.
- The same binary runs in CI and in the browser playground, sandboxed and deterministic.
- Every output can be validated mechanically before it is run.

**Why TypeScript for stage 0**

It runs on the Actions runner and in the browser without change, so the playground works from the first night. No runtime dependencies beyond the toolkit.

**Pipeline** (`compiler/stage0/src/`)

1. `lexer`: source text to tokens with spans.
2. `parser`: tokens to AST. The AST is plain JSON-serialisable data with a documented schema.
3. `resolve`: names, modules, stable declaration paths.
4. `check`: types, effects, exhaustiveness, example blocks collected.
5. `lower`: AST to a small typed IR (structured control flow, explicit locals, explicit memory operations).
6. `emit`: IR to a WebAssembly module using the toolkit encoder.
7. `diagnostics`: collection, ordering, JSON and human rendering, fix edits.
8. `fmt`: canonical formatter working from the AST.

Each stage can dump its output (`--dump tokens|ast|ir`) as canonical JSON. These dumps are what differential testing against the self-hosted compiler uses later.

**Toolkit** (`toolkit/`, protected, built by the coding agent in M0)

- `wasm-encoder`: a TypeScript library for building a module: types, imports, functions, memory, globals, exports, data segments, instructions, LEB128. It is the equivalent of an assembler. It knows nothing about the language.
- `validate`: wrapper that runs a standard WebAssembly validator on a module and checks the import allow-list.
- `run`: runs a module under a standard WASI runtime in CI with fuel, memory, and output limits, and a small WASI shim for the browser.

The toolkit exists so early work goes into the language instead of byte encoding. It is temporary scaffolding: the self-hosted compiler cannot call TypeScript, so by self-hosting the agents must have written their own encoder in the language.

**Runtime contract**

- A compiled program is a WASI command module: it exports `_start` and one linear memory, and imports only from `wasi_snapshot_preview1`.
- Available system surface: stdin, stdout, stderr, arguments, exit code, reading and writing files in a pre-opened directory, clock only if an RFC adds it. File access is required because the compiler must eventually read its own source.
- Runtime failures (overflow, bounds, exhaustion, failed example) are defined behaviours: a message on stderr in a fixed format and a specific exit code. Never a raw trap with no message.
- Execution limits in CI: fuel-metered instruction budget, 256 MB memory, 1 MB stdout. Limits are fuel based, not wall-clock, so results are deterministic.

**Memory management**

The agents decide by RFC. The starting recommendation in the designers' prompt is a bump allocator with region or arena release, since it is simple to implement correctly and adequate for a compiler. Reference counting or tracing collection can come later by RFC.

**CLI contract** (`bin/glyphc`, a protected wrapper script that dispatches to the active compiler)

| Command | Behaviour |
| --- | --- |
| `glyphc check <file>` | Parse and check. Diagnostics go to stderr as JSON Lines (RFC 0004). Exit 0 clean, 1 on errors |
| `glyphc build <file> -o <out.wasm>` | As check, then emit. Runs example blocks unless `--no-examples` |
| `glyphc run <file> [args]` | Build and run under the toolkit runner |
| `glyphc fmt <file> [--check]` | Canonical formatting |
| `glyphc explain <code>` | Print the catalogue entry |
| `glyphc --dump <stage> <file>` | Canonical JSON dump |
| `glyphc --version` | Compiler and spec version |

The command names and flags are fixed so the checks, the benchmark, and the playground never depend on the language's syntax. `compiler/ACTIVE` contains `stage0` or `self` and selects the implementation.

**Engineering rules for agents (in the implementer prompt)**

- No dependencies outside the toolkit and the Node standard library.
- Deterministic output: no timestamps, no map iteration order leaks, no randomness.
- Every function small enough to rewrite in one session. Prefer many small files.
- A unit test beside every module, runnable with one command that the check job also runs.

## 9. Bootstrap path

Four stages take the language from a TypeScript-hosted compiler to one that compiles itself, and then to native machine code.

| Stage | Compiler written in | Emits | Milestone |
| --- | --- | --- | --- |
| 0 | TypeScript | Wasm | M2 to M4 |
| 1 | The language, built by stage 0 | Wasm | M5 |
| 2 | The language, built by itself | Wasm, fixed point proven | M5 |
| 3 | The language | Wasm and x86-64 Linux executables | M7 |

**Self-hosting readiness checklist**

The orchestrator steers designers toward these until all are present. Each item needs an accepted, implemented RFC:

- Integers with defined overflow, booleans, bytes.
- Text with indexing, slicing, comparison, and building.
- Growable arrays and byte buffers.
- Records and tagged unions with exhaustive matching.
- Functions, recursion, and a way to return failure.
- Modules across multiple files.
- A map or association structure, or enough to write one in the standard library.
- File read and write, arguments, exit code.

**Stage 1: porting with a differential oracle**

The port is done one pipeline stage at a time, in the order lexer, parser, resolve, check, lower, emit, diagnostics, formatter. This is what makes the work tractable for Haiku: every step has an exact oracle.

- For each stage, the self-hosted component must produce a `--dump` byte-identical to stage 0's for every source in the conformance suite, the examples, and the standard library.
- The check job runs this comparison and reports the first differing file and offset, which goes straight into the next implementer assignment.
- The self-hosted emitter includes the agents' own Wasm encoder written in the language. Its output must equal stage 0's module bytes exactly.

**Stage 2: fixed point**

1. Stage 0 compiles `compiler/self/` to `A.wasm`.
2. `A.wasm` compiles `compiler/self/` to `B.wasm`.
3. `B.wasm` compiles `compiler/self/` to `C.wasm`.
4. Required: `B` and `C` are byte-identical. Since stage 1 demanded identical output to stage 0, `A` should equal `B` too, and a difference is reported as a warning to investigate.

When this passes on `main` for three consecutive nights, the orchestrator opens a cutover item:

- `compiler/ACTIVE` switches to `self`.
- The fixed-point binary is committed to `compiler/bootstrap/` by the merge bot, taken from the check job's artifact with its hash recorded in the audit log. The merge bot stores it but never executes it.
- Stage 0 is frozen. It stays in the repo for the record and for an occasional full rebuild from source to prove the chain.
- The fixed-point test becomes gate rule 12.

**Rules after cutover**

- Every build is: bootstrap binary compiles the source to `N1`, `N1` compiles the source to `N2`, and `N1` must equal `N2`.
- A new language feature cannot be used inside the compiler in the same PR that introduces it. It lands first, a new bootstrap binary is released, and only then may compiler source use it. The merge bot enforces this by building with the existing bootstrap binary.
- A release (`release.yml`, run by the orchestrator when the spec version bumps) updates the bootstrap binary and tags `spec-vX.Y.Z`.
- The playground switches to running the self-hosted compiler's own Wasm binary in the browser: the compiler, compiled by itself, compiling the visitor's program.

**Stage 3: native backend**

- A second emitter in the self-hosted compiler producing static x86-64 Linux ELF executables with direct system calls. No libc, no external assembler, no linker.
- Selected with `glyphc build --target x86_64-linux`.
- Proven by running the whole conformance suite natively on the Actions runner inside the sandbox container and requiring the same stdout and exit codes as the Wasm build.
- Final proof: the compiler built as a native executable compiles itself to a native executable, twice, to a native fixed point.
- ARM64 is a later optional target with the same proof.

## 10. Fitness benchmark

The benchmark turns "LLM-oriented" into a number. A fresh model that has seen only the spec card must write, repair, read, and edit programs. The score gates merges and tells designers where the language is failing its user.

**Tasks are language-neutral**

The syntax will keep changing, so no task may contain code in the language. Each task (`bench/tasks/dev/<id>.yml`) has:

- `id`, `category`, `tier` (1 to 3).
- `prompt`: required behaviour described purely as stdin to stdout, with one worked example.
- `tests`: stdin and expected stdout pairs. Two are visible to the model, the rest are hidden.
- `variant`: an optional follow-up requirement with its own tests, used for edit tasks.
- `probe_inputs`: extra stdin values used for read tasks.

**Task set**

60 public dev tasks and 60 encrypted held-out tasks, matched by category and tier.

| Category | Examples |
| --- | --- |
| Arithmetic and formatting | Sum, running statistics, base conversion |
| Text processing | Tokenise, count, reverse words, simple pattern matching |
| Collections | Sort, deduplicate, group, top N |
| Data modelling | Records and variants: shapes, accounts, inventory |
| Parsing | Key-value lines, small expression evaluator, CSV subset |
| State machines and simulation | Vending machine, elevator, grid walk |
| Recursion | Tree traversal from text input, permutations |
| Failure handling | Invalid input must produce the defined failure, not garbage |
| Decomposition | Problems that need several functions |
| Larger programs | 80 to 150 lines when written in Python |

**Protocol**

1. **Write.** System prompt: the spec card. User prompt: the task. No tools. The model returns one program. Up to 3 attempts. After a failed attempt it receives the compiler's JSON diagnostics, or the visible test's input, expected, and actual output.
2. **Repair** is measured inside the write loop: of first attempts that failed to compile, the share fixed on the next attempt.
3. **Read.** A passing program from this run is shown to a fresh context with a probe input. The model predicts stdout. The prediction is compared with real execution.
4. **Edit.** A passing program plus the task's variant requirement. The model returns the modified program, tested against the variant's tests.

Three samples per task. Generation runs in the bench generate job. Compilation and execution run in the separate no-network bench execute job. The benchmark model defaults to Haiku 5.5 and is set in `governance/RULES.md`.

**Metrics**

| Metric | Definition | Weight |
| --- | --- | --- |
| `pass@1` | Hidden tests pass on the first attempt | 0.30 |
| `pass@3` | Hidden tests pass within three attempts | 0.10 |
| `repair` | First-attempt compile failures fixed on attempt two | 0.15 |
| `read` | Output predictions exactly right | 0.15 |
| `edit@1` | Variant tests pass on the first attempt | 0.10 |
| `token_efficiency` | Half of (Python output tokens divided by Glyph output tokens) on tasks solved in both, capped at 1. Parity with Python scores 0.5; half of Python's tokens scores 1 | 0.20 |

Fitness is the weighted sum times 100. Also recorded but not weighted: `compile@1`, the most frequent diagnostic codes, spec card size.

**Python baseline**

The same model, tasks, and protocol with Python as the language and no spec card. Run once per benchmark model and stored in `bench/baselines/`. It is the reference line on every chart. The language starts far below it, because the model has never seen the language before. How close careful design can get is the experiment.

**Merge gate use**

- For each candidate PR, a fixed stratified subset of 20 dev tasks is run on both the PR build and current `main` in the same job, with the same sampling settings, so the comparison is paired.
- The PR fails the gate if Fitness drops by more than 2.0 points. One automatic re-run is allowed to absorb noise. A second failure blocks the PR and posts the findings to it.
- PRs that only fix bugs or refactor skip the benchmark if conformance output is unchanged.

**Nightly full run**

All 60 dev and 60 held-out tasks on `main`. Dev results are published in full under `audit/bench/<date>/`, including every generated program. Held-out results are published as metric totals only.

**Overfitting alarm**

If dev Fitness exceeds held-out Fitness by more than 8 points for three nights, the merge bot logs `overfit_warning` and the orchestrator tells designers that recent changes are fitting the public tasks.

**Feedback to designers**

A protected script writes `audit/bench/<date>/findings.md`: failed dev tasks, the diagnostics the model hit most, constructs it misused, and three representative failing programs. This is inlined into the next night's designer assignments. It is the main evidence source for RFC motivation.

**Cost controls**

A nightly full run is on the order of 120 tasks x 3 samples x up to 3 attempts, plus read and edit calls. Each call is short. `RULES.md` holds the knobs: samples per task, subset size, maximum gated PRs per cycle (default 2), cycles per night (default 3).

## 11. Audit trail

Everything that happens is recorded in five layers, all inside the repository, all written by the merge bot and never by an agent.

| Layer | Where | Answers |
| --- | --- | --- |
| Event log | `audit/events.jsonl` | What happened, in order, and who did it |
| Decision records | `audit/decisions/NNNN.md` | Why an RFC was accepted or rejected |
| Benchmark records | `audit/bench/<date>/` | What the measurements were at each point |
| Session transcripts | `audit-transcripts` branch | Exactly what each agent saw, thought, and did |
| Git history and tags | Commits, `spec-vX.Y.Z` tags | What the spec and compiler were at any moment |

**Event log**

Append-only, one JSON object per line, hash chained.

```json
{
  "seq": 1842,
  "ts": "2026-12-03T02:14:09Z",
  "type": "vote_cast",
  "actor": "designer-min",
  "session": "2026-12-03/vote/designer-min",
  "subject": {"rfc": "0012"},
  "data": {"vote": "reject", "rationale": "Adds a second loop form. Violates one way to do each thing."},
  "prev_hash": "9f2c...",
  "hash": "41ab..."
}
```

`hash` is SHA-256 over the canonical JSON of the entry without `hash`. Any edit to history breaks the chain.

**Event types**

| Group | Types |
| --- | --- |
| Sessions | `session_started`, `session_ended` (outcome, token usage, transcript path and hash), `session_failed`, `escalation` |
| RFCs | `rfc_opened`, `rfc_revised`, `comment_posted`, `vote_cast`, `rfc_decided` (full tally), `rfc_withdrawn`, `rfc_lapsed`, `rfc_superseded` |
| Implementation | `plan_written`, `pr_opened`, `pr_updated`, `review_posted`, `check_run` (result per gate rule), `gate_blocked` (rule and evidence), `merged` (commit, spec version before and after) |
| Benchmark | `bench_run` (metrics, path to detail), `overfit_warning` |
| Community | `issue_opened`, `issue_closed`, `digest_published` |
| Bootstrap | `fixed_point_passed`, `cutover`, `release` (bootstrap binary hash) |
| Owner actions | `rules_changed`, `roster_changed`, `constitution_changed`, `protected_path_changed` |

Owner actions are detected by the merge bot from commits to protected paths, so human intervention is on the record too.

**Decision records**

Generated deterministically when an RFC is decided and updated when it is implemented:

- The RFC's summary and final text hash.
- Every vote with its rationale, verbatim.
- The tally and the rule that decided it.
- Gate results for the implementation PR.
- Benchmark before and after, set against the RFC's stated hypothesis.
- Commits, spec version change, and links to the PR and transcripts.
- A plain-language summary by the scribe, clearly marked as agent-written.

**Commit trailers**

The merge bot squash-merges with trailers, so `git log` alone carries the trail:

```
RFC: 0012
Change-Class: language
Agents: impl-2, tester
Sessions: 2026-12-04/implement/impl-2, 2026-12-05/implement/tester
Spec-Version: 0.7.0 -> 0.8.0
```

**Transcripts**

The harness's full JSON stream for every session, compressed, stored at `<date>/<phase>/<agent>.jsonl.gz` on the `audit-transcripts` branch. Before storage a protected scrubber removes any occurrence of secret values. The event log records each transcript's hash.

**Spec history**

Every merge that changes `spec/` bumps `spec/VERSION` and is tagged. `tools/spec_at.py <version>` reconstructs the full spec, grammar, and card at any version. The site uses this for diffs.

**Traceability tool**

`tools/why.py <file>:<line>` walks blame to the commit, reads the trailers, and prints the RFC, the votes, the benchmark delta, and the transcripts. The site exposes the same thing: click any paragraph of the spec to see why it is there.

**Integrity**

- CI verifies the hash chain on every run.
- `tools/audit_verify.py` replays the event log, recomputes every RFC's status and the spec version, and fails if the repo disagrees.
- Each night the chain's head hash is written into an annotated tag `audit-<date>`, giving a dated anchor outside the file itself.

## 12. GitHub Actions workflows

One nightly workflow runs the whole development cycle as a fixed sequence of phases. Nothing runs outside GitHub Actions.

**Secrets and environments**

| Secret | Environment | Used by |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | `agents` | Agent jobs |
| The same AI auth | `bench` | Bench generate job |
| `HELDOUT_KEY` | `bench` | Bench generate job, to decrypt held-out tasks |

`tools/setup.sh` generates `HELDOUT_KEY`, encrypts the held-out tasks, and prints the `gh secret set` commands. After setup the owner only maintains the AI auth. Each job binds to at most one environment.

**`phase.yml`** (reusable)

Inputs: phase name and the assignment list from the orchestrator.

1. `agents`: matrix over assignments, environment `agents`, `contents: read`, `max-parallel` set to respect API rate limits, `continue-on-error`, per-job timeout. Runs `agents/run_agent.sh`, uploads `out/` and the transcript.
2. `publish`: no environment. Runs `tools/publisher.py`: schema and path validation, role permissions, then creates branches, PRs, comments, votes, and issues. Uploads a list of what was published and what was refused, with reasons.

**`nightly.yml`** (triggers: `schedule`, `workflow_dispatch`; `concurrency: nightly`, never cancel in progress)

**Cadence: several cycles per night**

Steps 2 to 10 in the table are one development cycle, packaged as a reusable `cycle.yml`. `nightly.yml` runs `cycles_per_night` cycles back to back (default 3, maximum 6, set in `RULES.md`), then runs steps 11 to 14 once.

- Cycles are declared as a static chain of jobs (`cycle-1` to `cycle-6`), each guarded by an `if` on the configured count.
- A failed cycle does not stop later cycles. Each cycle starts by re-running the orchestrator against current repo state.
- The daily architect runs once, after `open` and before `cycle-1`.
- If total run time approaches the Actions limit for one workflow run, split the cycles into separately scheduled runs that share the `nightly` concurrency group.

RFC durations in section 6 are counted in cycles where stated, so a proposal can be discussed in one cycle and voted on in the next within the same night.

| Step | Job | Class | Does |
| --- | --- | --- | --- |
| 1 | `open` | Merge bot | Verifies the audit chain, runs the orchestrator, emits assignments for the design phase |
| 2 | `design` | Phase | Designers draft or revise RFCs. Voters comment on open RFCs |
| 3 | `vote` | Phase | Voters vote on RFCs in `voting` |
| 4 | `decide` | Merge bot | Tallies, sets RFC status, merges RFC files, writes decision records |
| 5 | `implement` | Phase | Implementers and tester work on accepted RFCs and bug items |
| 6 | `check` | Check | Matrix over open implementation PRs. Build, conformance, determinism, validation, coverage, token caps, fixed point |
| 7 | `review` | Phase | Reviewer reviews PRs that passed `check` |
| 8 | `bench-gate` | Bench | For up to 2 approved PRs: generate, execute, score, paired against `main` |
| 9 | `merge` | Merge bot | Merges eligible PRs one at a time. Each further candidate is rebased and sent back through `check` first |
| 10 | `use` | Phase | User agents write programs against the new `main` and file issues |
| 11 | `bench-nightly` | Bench | Full dev and held-out run on `main`, findings written |
| 12 | `scribe` | Phase | Digest for the night |
| 13 | `close` | Merge bot | Appends events, pushes transcripts, writes the audit anchor tag, releases if the spec version changed |
| 14 | `site` | Site | Builds data and deploys Pages |

Every job that needs fresh state checks out `main` at the start. Every committing job uses pull, rebase, push with retry.

**`weekly.yml`** (triggers: weekly `schedule`, `workflow_dispatch`; same `nightly` concurrency group)

Runs before that night's cycles. One `phase.yml` call with the single agent `architect-weekly`, whose assignment contains the full spec, the roadmap, the week's digests and benchmark trend, and the escalation queue. Its output goes through the publisher as usual, so its RFCs and PRs enter the following cycles like anyone else's.

**Check job detail**

Runs inside `tools/sandbox/` container with `--network none`, a read-only source mount, and CPU, memory, and time limits. It writes a machine-readable result per gate rule. It holds no secrets and has read-only repo permissions, because it executes agent-written code.

**Bench job detail**

Two jobs per run. `generate` holds the AI auth and the held-out key, calls the model, and uploads only generated programs keyed by opaque task ids. `execute` has no secrets, compiles and runs those programs in the sandbox, and uploads pass or fail per opaque id. A final protected scoring step joins them. Held-out task text never leaves `generate`.

**`ci.yml`** (on push to `main` and manual)

Tests for `tools/` and `toolkit/`, schema validation of governance files, audit chain verification, site build.

**`release.yml`** (called from `close`)

Builds the compiler in the sandbox, attaches the Wasm binary to a GitHub release, and hands the binary to the merge bot to commit as the new bootstrap.

**Hard rules**

- No `pull_request` or `pull_request_target` triggers anywhere.
- Agent jobs never receive a token that can write.
- Agent-written code runs only in the sandbox, never in a job with secrets.
- The merge bot and publisher never execute anything from agent territory. They read files as data.
- A night that fails part-way is safe to re-run: every step is idempotent against repo state, and the orchestrator recomputes assignments from scratch.

## 13. Website

The site lets a visitor use the language, watch it evolve, and audit every decision. It is a static build on GitHub Pages with no backend.

**Stack**

Vite and TypeScript. `site/build_data.py` turns repo state, the event log, and benchmark records into compact JSON under `site/public/data/`. The compiler runs client-side.

**Views**

| View | Shows |
| --- | --- |
| Home | Current name and version, Fitness over time against the Python baseline, bootstrap stage progress, latest decisions, tonight's digest |
| Playground | Editor, compile and run in the browser, structured diagnostics with one-click fix application, formatter, Wasm size and instruction count, a version picker to run the same program on older compilers |
| Spec | The current spec and card, rendered. Every paragraph has a "why is this here" link into the audit trail |
| Spec history | Version slider with side-by-side diffs of spec, grammar, and card between any two versions |
| Time-lapse | The same small set of reference programs shown in every version of the language, animated, so the syntax visibly evolves |
| RFCs | Board by status. Each RFC page: text, discussion thread by agent, votes with rationales, hypothesis against measured outcome, linked PRs |
| Agents | Per agent: persona, RFCs authored, voting record, agreement matrix with other agents, acceptance rate, memory file |
| Benchmark | Each metric over time, dev against held-out, most common diagnostics, browsable dev attempts including failed programs and the model's repairs |
| Audit explorer | Searchable, filterable event stream. Filter by agent, RFC, type, date. Chain verification status. Links to transcripts |
| Bootstrap | The four stages, the fixed-point proof with hashes, and after cutover a note that the playground is running the self-compiled compiler |
| Digest archive | The scribe's nightly write-ups as a readable history of the project |

**Playground requirements**

- Before cutover: a browser bundle of the stage 0 TypeScript compiler.
- After cutover: the self-hosted compiler's Wasm binary, run with the toolkit's browser WASI shim.
- Compiled programs run in a Web Worker with an instruction and memory limit, so a runaway program cannot freeze the page.
- Share links encode the program and the compiler version.

**Design direction**

A working engineer's reference site with one expressive element: the time-lapse of the language changing. Code blocks are the hero. Must be fully usable on a phone, including the playground.

**Data budget**

Each view loads only its own JSON. Transcripts are linked, not bundled. Benchmark attempt detail is loaded on demand per night.

## 14. Milestones

Eight milestones. M0 and M1 are built by the coding agent with no language agents running. From M2 on, the coding agent builds only protected infrastructure and the agents build the language.

**M0. Protected infrastructure**

Build `tools/`, `toolkit/`, schemas, the sandbox image, the audit log writer, publisher, merge bot, orchestrator skeleton, and CI.

Acceptance:

- The toolkit encoder can build, validate, and run hand-assembled test modules: arithmetic, memory, a loop, a WASI `fd_write` hello world.
- The audit chain verifies, and a tampered entry is detected.
- Publisher unit tests: rejects protected paths, wrong-role actions, schema violations, oversize output.
- Merge bot unit tests for every gate rule and every voting edge case in section 6.

**M1. Dry run with scripted agents**

Replace every agent with a deterministic script that emits canned output for a toy language (integer expressions and print).

Acceptance:

- A full nightly run completes end to end on GitHub Actions: RFC opened, discussed, voted, accepted, implemented, checked, reviewed, gated, merged, digest written, site deployed.
- A scripted "bad agent" fails at each attack: writing to `.github/`, editing the constitution, deleting a conformance test, pushing directly, voting on its own RFC, reading the held-out tasks.
- The night can be re-run after a forced mid-run failure without duplicate events or PRs.
- No secret value appears in any log, artifact, or transcript.

**M2. Founding convention**

Turn on the Haiku agents. First assignments are fixed by the orchestrator: RFC 0001 the language's name, RFC 0002 lexical structure and core syntax, RFC 0003 the kernel (integers, booleans, bindings, functions, conditionals, loops, text output), RFC 0004 the diagnostic style.

Acceptance:

- Those four RFCs reach a decision through real votes with recorded rationales.
- Stage 0 compiles kernel programs to valid Wasm that runs in CI and in the playground.
- At least 40 conformance tests pass. Grammar coverage is complete.
- The spec card exists and is within its cap.

**M3. Benchmark online**

Build the task sets, harness, scoring, Python baseline, findings generator, and switch on gate rule 13.

Acceptance:

- Nightly Fitness is published for dev and held-out, with the Python baseline alongside.
- A deliberately harmful test PR (for example renaming every keyword to a random string) is blocked by the benchmark gate.
- Run-to-run noise on an unchanged `main` is measured over five nights, and the tolerance in `RULES.md` is set from it.
- Designers' assignments include the findings, and at least one RFC cites them as motivation.

**M4. Growth to self-hosting readiness**

No new infrastructure. The agents run. The orchestrator prioritises the readiness checklist in section 9.

Acceptance:

- Every checklist item is implemented through an accepted RFC.
- The standard library is written in the language.
- User agents have written at least 30 example programs that compile and pass their own tests.
- Fitness is higher than at the end of M3.

**M5. Self-hosting**

Add the differential dump comparison and the fixed-point test to the check job. The agents port the compiler.

Acceptance:

- Each pipeline stage of `compiler/self/` matches stage 0 byte for byte across the whole corpus.
- The fixed-point test passes on three consecutive nights.
- Cutover completes: the active compiler is the self-hosted one, and the bootstrap binary is committed with its hash in the audit log.
- The playground runs the self-compiled compiler.

**M6. Full site and audit explorer**

All views in section 13.

Acceptance:

- Any spec paragraph can be traced on the site to its RFC, votes, benchmark delta, and transcripts in at most three clicks.
- Spec diff between any two versions renders.
- The time-lapse plays from the first version to the current one.
- The playground works on a phone.

**M7. Native backend**

Add native execution of the conformance suite to the check job. The agents write the x86-64 emitter by RFC.

Acceptance:

- The conformance suite passes natively with results identical to the Wasm build.
- The compiler, built as a native executable, reaches a native fixed point.
- Compiled example executables are downloadable from the site.

## 15. Risks and open questions

**Risks**

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Design drift | Small models lose the thread over months, and the language becomes a pile of features | Constitution in every prompt, token caps that force removal to pay for addition, the minimalist designer, RFC flow limits, daily and weekly architect reviews |
| Haiku cannot finish hard implementation work | Type checker and self-hosted emitter are the likely sticking points | Subtasks under 400 lines, exact oracles (conformance and differential dumps), escalation events, the weekly Opus architect takes the stuck subtasks |
| Convergence on a Python lookalike | The benchmark rewards whatever the model already knows, so familiar syntax scores well | Accept it for syntax if the data says so. The constitution pushes novelty into semantics: effects, checked examples, structured diagnostics, stable addresses |
| Benchmark overfitting | Designers tune the language to 60 public tasks | Held-out set, overfitting alarm, tasks owner-protected |
| Benchmark noise blocks good changes or admits bad ones | Sampling variance on 20 tasks is real | Paired runs, one re-run, tolerance set from measured noise in M3 |
| Expressiveness and usability are conflated | Early Fitness rises just because more tasks become expressible | Report `compile@1` and `repair` separately, since they measure learnability alone |
| Gridlock or churn | Agents reject everything, or rewrite the syntax weekly | Quorum and timeouts, resubmission cooldown, stability window after self-hosting |
| Breaking changes strand the self-hosted compiler | A syntax change must migrate the compiler written in that syntax | Migration is mandatory in the RFC. Two-step rule for new features. Bootstrap binary |
| Agents weaken their own tests | Deleting a failing test is the easy way to pass | Tests are append-only without a supermajority, enforced by the merge bot |
| Nightly cost | Twelve agents, several cycles per night, plus benchmark calls | Per-session turn caps, at most 2 gated PRs per night, knobs in `RULES.md`, a dedicated key with a spend limit |
| Repo growth | Transcripts and benchmark attempts accumulate | Transcripts on their own branch, compressed. Old benchmark detail moved to release assets |
| Long nightly runs | Fourteen sequential steps with matrices | Phase timeouts, idempotent re-run, and a missed night costs nothing |

**Decided**

- **Cadence.** Several cycles per night, default 3 (section 12).
- **Architects.** A daily architect plus a weekly Opus 5.5 architect at low effort who also works as an additional worker (section 5).

**Open questions for the owner**

- **Daily architect's model.** This spec assumes Haiku 5.5, keeping the daily team on one model. It is one line in the roster to change.
- **Toolkit encoder.** This spec gives agents a ready-made Wasm encoder in stage 0 and makes them write their own for self-hosting. The purer option is that they write the encoder from night one, at the cost of a slower start. Recommended: keep the toolkit.
- **Benchmark model.** Haiku 5.5 only, or also a weekly run with a second model to check the language is not tuned to one model's habits.
- **Human visibility into votes.** Whether visitors can react to RFCs on the site as a non-binding signal shown to the agents. Off in v1.
- **Naming.** Whether to veto names. The agents choose in RFC 0001, and the owner may want a reserved-words list to avoid collisions with existing languages.
- **Licence** for the repo and for the language spec.
