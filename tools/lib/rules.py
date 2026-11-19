"""Thresholds from governance/RULES.md, path policy, and the pure merge gate (spec section 6)."""
import re
from pathlib import Path

import yaml

# CONTRACTS.md "Paths and trust": only the owner may change these.
PROTECTED = (
    ".github/**", "governance/**", "agents/prompts/**", "tools/**", "toolkit/**", "bench/**",
    "audit/**", "site/**", "bin/**", "compiler/bootstrap/**", "compiler/ACTIVE", "docs/**",
    "CONTRACTS.md", "README.md", "package.json",
)

# CONTRACTS.md agent territory table, reduced to what a PR from a role may touch.
ROLE_PATHS = {
    "designer": ("rfcs/*.md", "spec/card.md"),
    "implementer": ("rfcs/*.plan.md", "spec/**", "compiler/stage0/**", "compiler/self/**",
                    "conformance/**", "stdlib/**", "examples/**"),
    "tester": ("conformance/**",),
    "user": ("examples/**",),
    "reviewer": (),
    "scribe": ("spec/CHANGELOG.md",),
    "architect": ("architecture/**",),
    "architect-weekly": ("rfcs/*.md", "rfcs/*.plan.md", "spec/**", "compiler/stage0/**",
                         "compiler/self/**", "conformance/**", "stdlib/**", "examples/**",
                         "architecture/**"),
}

EXEMPT_CLASSES = ("bugfix", "refactor", "docs")
LANGUAGE_CLASSES = ("language", "stdlib")


def load_rules(root) -> dict:
    text = (Path(root) / "governance" / "RULES.md").read_text(encoding="utf-8")
    m = re.search(r"```yaml rules\n(.*?)```", text, re.S)
    if not m:
        raise ValueError("governance/RULES.md has no ```yaml rules block")
    return yaml.safe_load(m.group(1))


def glob_match(path: str, pattern: str) -> bool:
    """`**` crosses directories, `*` does not. Whole-path match."""
    regex = re.escape(pattern).replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
    return re.fullmatch(regex, path) is not None


def is_protected(path: str) -> bool:
    return any(glob_match(path, p) for p in PROTECTED)


def path_allowed(role, path: str) -> bool:
    if is_protected(path):
        return False
    return any(glob_match(path, p) for p in ROLE_PATHS.get(role or "", ()))


def is_exempt(change_class: str) -> bool:
    return change_class in EXEMPT_CLASSES


def _res(n, name, ok, reason=""):
    return {"rule": n, "name": name, "ok": bool(ok), "reason": reason}


def evaluate_gate(ctx: dict, rules: dict) -> list:
    """Pure evaluation of gate rules 1 to 14 in order. Returns one result dict per rule.

    ctx:
      pr: {class, role, rfc_present, rfc_status, rfc_accepted_super, changed_files,
           head_sha, reviews: [{agent, verdict, sha}]}
      check_rules: {"4": bool, "5": bool, ..., "12": bool} from the check result (rules 4-12)
      tests_altered: bool, true when an existing conformance test was removed or changed
      bench: {fitness, baseline, conformance_output_unchanged} or None
    """
    pr = ctx.get("pr", {})
    cr = ctx.get("check_rules", {})
    gates = rules.get("gates", {})
    files = pr.get("changed_files", [])
    cls = pr.get("class")
    head = pr.get("head_sha")
    out = []

    def chk(n):
        return bool(cr.get(str(n)))

    # 1. Only allowed paths are touched.
    bad = [f for f in files if not path_allowed(pr.get("role"), f)]
    out.append(_res(1, "allowed_paths", bool(files) and not bad,
                    f"refused paths: {bad}" if bad else ("no files" if not files else "")))

    # 2. Linked to an accepted RFC, or the class is exempt.
    rfc_ok = pr.get("rfc_present") and pr.get("rfc_status") in ("accepted", "implementing", "implemented")
    ok2 = is_exempt(cls) or bool(rfc_ok)
    out.append(_res(2, "rfc_linked", ok2, "" if ok2 else f"rfc status {pr.get('rfc_status')!r}"))

    # 3. Spec, compiler, conformance and migration arrive together for language and stdlib.
    if cls in LANGUAGE_CLASSES:
        need = {"spec/": "spec", "compiler/": "compiler", "conformance/": "conformance",
                "examples/": "migration"}
        missing = [lbl for pre, lbl in need.items() if not any(f.startswith(pre) for f in files)]
        out.append(_res(3, "bundle_together", not missing,
                        f"missing: {missing}" if missing else ""))
    else:
        out.append(_res(3, "bundle_together", True, "not required for class"))

    # 4 to 5: build and conformance suite. 6: no existing conformance test altered.
    out.append(_res(4, "compiler_builds", chk(4)))
    out.append(_res(5, "conformance_passes", chk(5)))
    altered = bool(ctx.get("tests_altered"))
    waived = bool(pr.get("rfc_accepted_super"))
    out.append(_res(6, "no_test_altered", not altered or waived,
                    "" if not altered or waived else "existing conformance test altered"))

    # 7 to 11 come straight from the check result.
    for n, name in ((7, "wasm_valid"), (8, "deterministic"), (9, "token_caps"),
                    (10, "grammar_coverage"), (11, "examples_pass")):
        out.append(_res(n, name, chk(n)))

    # 12 fixed point and 13 benchmark: switched off until the owner flips the gate.
    if gates.get("fixed_point"):
        out.append(_res(12, "fixed_point", chk(12)))
    else:
        out.append(_res(12, "fixed_point", True, "gate off"))

    if gates.get("bench"):
        b = ctx.get("bench") or {}
        tol = rules["bench"]["gate_tolerance"]
        if cls in ("bugfix", "refactor") and b.get("conformance_output_unchanged"):
            ok13, why = True, "exempt: conformance output unchanged"
        elif b.get("fitness") is None or b.get("baseline") is None:
            ok13, why = False, "no bench result"
        else:
            ok13 = b["fitness"] >= b["baseline"] - tol
            why = f"fitness {b['fitness']} vs baseline {b['baseline']} tol {tol}"
        out.append(_res(13, "bench_no_regression", ok13, why))
    else:
        out.append(_res(13, "bench_no_regression", True, "gate off"))

    # 14. The reviewer approved the final commit.
    approved = any(r.get("verdict") == "approve" and r.get("sha") == head
                   for r in pr.get("reviews", []))
    out.append(_res(14, "reviewer_approved", approved, "" if approved else "no approval on head"))
    return out


def gate_passes(results: list) -> bool:
    return all(r["ok"] for r in results)


def first_failure(results: list):
    return next((r for r in results if not r["ok"]), None)
