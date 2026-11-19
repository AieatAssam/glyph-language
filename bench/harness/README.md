# Bench harness

Fitness bench for AI-written programs. Generate asks a model for programs, execute runs them, score
computes the metrics. Run every command from the repo root.

## Dev flow (separate generate and execute jobs)

Dev tasks live in `bench/tasks/dev` (YAML plus `ref/` reference sources). Their expected outputs are
public, so the generate and execute steps can run as separate CI jobs.

1. Generate job, round K from 1 to attempts+1 (`governance/RULES.md` sets attempts):
   `python -m bench.harness.generate round K --tasks bench/tasks/dev --out OUT --lang python`
   Round K reads execute's results from `OUT/results` (round K-1).
2. Execute job, after every generate round:
   `python -m bench.harness.execute --in OUT --out OUT/results --lang python`
   The execute job needs no AI auth. Pass `OUT` between jobs as an artifact.
3. Score: `python -m bench.harness.score score OUT/results [--baseline SCORE.json]`

Generate holds AI auth and never runs programs. Execute runs programs and holds no secrets.
`bundle.json` has test inputs and sha256 digests of expected outputs. It has no prompts, ids or
reference source.

## Held-out flow (its own job, totals only)

Held-out tasks live encrypted in `bench/heldout.tar.age`. Their inputs and expected outputs must
never reach an artifact. `bench/harness/heldout_run.py` therefore runs the whole held-out pass in the
`heldout` job of `.github/workflows/bench.yml`. That job is separate from the generate-K jobs and runs in
environment `bench`, the only job with `HELDOUT_KEY`:

    HELDOUT_KEY="<AGE-SECRET-KEY line>" python -m bench.harness.heldout_run --out DIR [--baseline FILE]

- Decrypts the archive into a job-local temp workspace. Task ids are opaque (HMAC of the key).
- Generate runs on the host, with `HELDOUT_KEY` and AI auth.
- Execute runs in the sandbox: `bash tools/sandbox/run.sh CHECKOUT RESULTS --data WS -- python3 -m bench.harness.execute --in /data --out /out --lang python`.
  The container has `--network none`, a read-only root, no environment from the job, and no key
  file. `bin/`, `bench/`, `governance/` and `tools/` come from the base checkout, read-only; the
  workspace is mounted read-only at `/data`; results go to `/out`.
- Score runs on the host over the sandbox results. The temp workspace is deleted afterwards.
- `DIR` must be empty or absent. It ends with exactly one file, `totals.json`, holding
  `{"fitness": ..., "metrics": {...}}`. Nothing else leaves the job.

The key is the `AGE-SECRET-KEY-...` line only, stored as the repo secret `HELDOUT_KEY`. To rebuild
the archive, encrypt the tar to `age-keygen -y KEYFILE` of the existing key file. Do not generate a new key.

## Tests

`python3 -m unittest tools.test_bench` runs offline. It uses the Python fake model
(`BENCH_FAKE_MODEL=python-ref`). `HeldoutRunTests` checks that the held-out output dir holds only
`totals.json` and that the sandbox stand-in never sees `HELDOUT_KEY`. The glyph no-compiler test runs
on a temp copy of the repo with `compiler/ACTIVE` removed.

## Residual risks

- Programs run inside the sandbox can write any file to `/out`, so they could forge results. Only
  totals leave the job, which limits what a forgery can reach, but it is not prevented.
- Programs can read `/repo/bundle.json`. It holds digests, not expected outputs, and inputs are
  visible to the program by design.
- The held-out path runs only Python. The glyph path was run in the sandbox against the toy fixture
  only. `execute.py` calls `bin/glyphc --json -o OUT SRC`, which the toy CLI (`build SRC -o OUT`)
  rejects, so the compiler CLI contract is still unpinned.
