# Baselines

This directory holds recorded bench scores that the paired gate compares against.

- A baseline is the output of `python -m bench.harness.score` for a known-good revision, saved as JSON here with the revision name in the file name.
- The gate runs `python -m bench.harness.score compare BASE HEAD` and fails when HEAD's fitness is more than `gate_tolerance` (2.0 points) below BASE.
- Use `bench/tasks/gate_subset.txt` (20 public dev tasks, two per category) for the per-change gate. The full dev set and the held-out set are for periodic runs.
- The held-out tasks are encrypted in `bench/heldout.tar.age`. Only the held-out run has the key. Do not commit baseline files that include held-out task inputs or prompts; scores only.
- Re-record a baseline only when the model, harness, or task set changes, and note the reason in the file name or commit message.
