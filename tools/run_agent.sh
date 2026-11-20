#!/usr/bin/env bash
# Runs one agent session. Contract: CONTRACTS.md "Agent session I/O".
#   tools/run_agent.sh <agent-id> <assignment-file> <outdir>
# Live mode runs Claude Code headless in a scratch copy. AGENT_MODE=scripted runs tools.scripted.agent.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <agent-id> <assignment-file> <outdir>" >&2
  exit 2
fi
agent="$1"
assignment="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
mkdir -p "$3"
outdir="$(cd "$3" && pwd)"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${AGENT_MODE:-live}"
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Roster row: one field per line (persona may hold spaces, effort may be empty).
roster_row="$(python3 - "$root" "$agent" <<'PY'
import sys, yaml
from pathlib import Path
root, agent = sys.argv[1], sys.argv[2]
rows = yaml.safe_load(Path(root, "governance/roster.yml").read_text(encoding="utf-8"))["agents"]
row = next((a for a in rows if a["id"] == agent), None)
if row is None:
    sys.exit(f"unknown agent {agent!r}")
print(row["role"]); print(row["model"]); print(row.get("effort") or "")
print(" ".join(str(row.get("persona", "")).split()))
PY
)"
role="$(sed -n 1p <<<"$roster_row")"
model="$(sed -n 2p <<<"$roster_row")"
effort="$(sed -n 3p <<<"$roster_row")"
persona="$(sed -n 4p <<<"$roster_row")"
phase="$(python3 -c 'import json,sys; print(json.loads(open(sys.argv[1]).read().split("-->",1)[0].removeprefix("<!-- assignment ").strip())["phase"])' "$assignment")"

# The orchestrator's session id wins: it carries the run id that keeps same-day runs apart.
listed="$(python3 -c 'import json,sys,os; p=os.path.join(os.path.dirname(sys.argv[1]),"assignments.json"); print(next((e["session"] for e in (json.load(open(p)) if os.path.exists(p) else []) if e["agent"]==sys.argv[2]),""))' "$assignment" "$agent")"
[[ -n "$listed" ]] || { echo "run_agent: $agent is not in assignments.json next to $assignment" >&2; exit 2; }
session="$listed"

scratch="$(mktemp -d "${TMPDIR:-/tmp}/glyph-run.XXXXXX")"
trap 'rm -rf "$scratch"' EXIT

# Scratch copy. Held-out tasks, audit log and git history never enter it. The user role also
# loses RFC text, the core spec and the architecture notes, so it reads only the card and CLI docs.
excludes=(--exclude=/.git/ --exclude=/.work/ --exclude=/audit/ --exclude=/bench/heldout.tar.age)
if [ "$role" = user ]; then
  excludes+=(--exclude=/rfcs/ --exclude=/spec/core/ --exclude=/architecture/)
fi
mkdir -p "$scratch/repo"
rsync -a "${excludes[@]}" "$root/" "$scratch/repo/"
# A subtask on an existing PR works on that PR's tree, not the base: overlay the branch's files.
branch="$(python3 -c 'import json,re,sys; m=re.search(r"<!-- assignment (.*?) -->", open(sys.argv[1]).read()); print(json.loads(m.group(1)).get("branch","") if m else "")' "$assignment")"
if [[ "$branch" =~ ^agent/[A-Za-z0-9._/-]+$ ]] && git -C "$root" fetch -q origin "$branch" 2>/dev/null; then
  git -C "$root" archive FETCH_HEAD | tar -x -C "$scratch/repo" --exclude=audit --exclude=.work --exclude=bench/heldout.tar.age
fi
mkdir -p "$scratch/repo/out"

# Prompt, in contract order: constitution, base, role, persona, memory, assignment.
prompt="$scratch/prompt.md"
{
  cat "$root/governance/CONSTITUTION.md"; printf '\n\n'
  cat "$root/agents/prompts/base.md"; printf '\n\n'
  cat "$root/agents/prompts/$role.md"; printf '\n\n'
  allowed="$(cd "$root" && python3 -c 'import sys; from tools.publisher import ALLOWED; print(", ".join(sorted(ALLOWED[sys.argv[1]])))' "$role")"
  printf 'Your role may post only these action types: %s. Any other type is refused.\n\n' "$allowed"
  printf '## Persona\n\n%s\n\n' "$persona"
  if [ -s "$root/agents/$agent/MEMORY.md" ]; then
    printf '## Memory\n\n'; cat "$root/agents/$agent/MEMORY.md"; printf '\n\n'
  fi
  printf '## Assignment\n\n'; cat "$assignment"
} > "$prompt"

# Timeout: gtimeout or timeout when present, else perl alarm (macOS has neither by default).
# Exit 124 or 142 both mean the time ran out.
run_limited() {
  local secs="$1"; shift
  if command -v gtimeout >/dev/null 2>&1; then gtimeout "$secs" "$@"
  elif command -v timeout >/dev/null 2>&1; then timeout "$secs" "$@"
  else perl -e 'alarm shift; exec @ARGV or die "exec failed: $!"' "$secs" "$@"
  fi
}

rc=0
secs="${AGENT_TIMEOUT:-1800}"
if [ "$mode" = scripted ]; then
  out_src="$scratch/out"
  mkdir -p "$out_src"
  (cd "$root" && run_limited "$secs" env -u GH_TOKEN -u GITHUB_TOKEN -u HELDOUT_KEY \
     python3 -m tools.scripted.agent "$agent" "$assignment" "$out_src") > "$outdir/transcript.jsonl" 2>"$outdir/stderr.log" || rc=$?
else
  out_src="$scratch/repo/out"
  budget="$(grep -m1 'max_budget_usd' "$root/governance/RULES.md" | awk '{print $2}')"
  budget="${budget:-2.0}"
  # Auto-compact at about 300k tokens: cheaper, and it keeps sessions out of the long-context zone.
  # The agent's only shell command is sbx, which runs in the no-network glyph-sandbox container.
  # Claude Code's own Bash sandbox cannot start on GitHub-hosted runners (nested user namespaces),
  # so it is off. The web tools are disallowed.
  sandbox='{"sandbox":{"enabled":false}}'
  effort_flag=()
  [ -n "$effort" ] && effort_flag=(--effort "$effort")
  (cd "$scratch/repo" && run_limited "$secs" env -u GH_TOKEN -u GITHUB_TOKEN -u HELDOUT_KEY \
     SBX_REPO="$scratch/repo" PATH="$root/tools/agent-bin:$PATH" \
     CLAUDE_CODE_AUTO_COMPACT_WINDOW="${AGENT_COMPACT_WINDOW:-300000}" \
     claude -p --model "$model" "${effort_flag[@]}" \
     --output-format stream-json --verbose --no-session-persistence \
     --permission-mode acceptEdits \
     --allowedTools Read Write Edit Glob Grep "Bash(sbx bin/glyphc:*)" "Bash(sbx node --test:*)" "Bash(sbx python3 -m tools.check.run:*)" "Bash(sbx python3 -m tools.check_actions:*)" "Bash(sbx wc -c:*)" \
     --disallowedTools WebFetch WebSearch \
     --max-budget-usd "$budget" \
     --settings "$sandbox" \
     < "$prompt") > "$outdir/transcript.jsonl" 2>"$outdir/stderr.log" || rc=$?
fi

# Copy what the agent produced. The runner owns session.json; the agent never writes it.
if [ -d "$out_src" ]; then cp -R "$out_src"/. "$outdir"/; fi

python3 - "$outdir" "$agent" "$session" "$phase" "$rc" "$started" "$root" <<'PY'
import json, sys
from pathlib import Path
outdir, agent, session, phase, rc, started, root = sys.argv[1:]
out = Path(outdir)
rc = int(rc)
outcome = "timeout" if rc in (124, 142) else ("ok" if rc == 0 else "failed")
usage = {}
for line in (out / "transcript.jsonl").read_text(encoding="utf-8", errors="replace").splitlines():
    try:
        ev = json.loads(line)
    except ValueError:
        continue
    if ev.get("type") == "result":
        usage = {"cost_usd": ev.get("total_cost_usd"), **(ev.get("usage") or {})}
if outcome == "ok":
    try:
        import jsonschema
        schema = json.loads(Path(root, "tools/schemas/actions.schema.json").read_text(encoding="utf-8"))
        jsonschema.validate(json.loads((out / "actions.json").read_text(encoding="utf-8")), schema)
    except Exception as exc:  # missing or invalid actions.json is a failed session
        outcome = "failed"
        (out / "stderr.log").open("a", encoding="utf-8").write(f"actions.json invalid: {exc}\n")
doc = {"agent": agent, "session": session, "phase": phase, "outcome": outcome, "usage": usage,
       "started": started, "ended": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
(out / "session.json").write_text(json.dumps(doc, sort_keys=True, indent=2) + "\n", encoding="utf-8")
PY

(cd "$root" && python3 -m tools.scrub "$outdir")
exit 0
