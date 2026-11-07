#!/usr/bin/env python3
"""Compare actual Jest/Vitest JSON failures between stable 6.1.15 and PR head.
Never suppress, rewrite or relabel old critical errors. No source modification.
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

def stable_path(value: str) -> str:
    """Compare source paths across a detached baseline worktree and PR head."""
    path = value.replace("\\", "/")
    for anchor in ("/src/", "/tests/", "/test/", "/scripts/"):
        if anchor in path:
            return anchor[1:] + path.rsplit(anchor, 1)[1]
    return Path(path).name

def load(path: str) -> tuple[set[str], dict[str, str], set[str]]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    failures: set[str] = set()
    errors: dict[str, str] = {}
    cases: set[str] = set()
    for suite in raw.get("testResults", []):
        location = stable_path(str(suite.get("name", "")))
        assertions = suite.get("assertionResults") or []
        had_failed_assertion = False
        for case in assertions:
            name = case.get("fullName") or case.get("title") or "unknown test"
            identity = f"{location} :: {name}"
            cases.add(identity)
            if case.get("status") == "failed":
                had_failed_assertion = True
                failures.add(identity)
                messages = case.get("failureMessages") or []
                errors[identity] = " | ".join(str(s)[:250] for s in messages[:2])
        # Test-file import/setup failures can have ZERO assertion results.
        # Omitting them would falsely report a clean regression gate.
        if suite.get("status") == "failed" and not had_failed_assertion:
            identity = f"{location} :: [SUITE_IMPORT_OR_SETUP_FAILURE]"
            failures.add(identity)
            cases.add(identity)
            errors[identity] = str(suite.get("message") or
                suite.get("failureMessage") or "Suite failed before/after test assertions")[:500]
    if not cases:
        raise ValueError(f"No test cases were parsed from {path}; refusing to treat empty runs as PASS")
    return failures, errors, cases

def main() -> int:
    if len(sys.argv) != 3:
        print("usage: vyron_vitest_diff.py <6.1.15.json> <pr.json>", file=sys.stderr)
        return 3
    baseline, prior_details, baseline_cases = load(sys.argv[1])
    current, current_details, current_cases = load(sys.argv[2])
    prior_total, current_total = len(baseline_cases), len(current_cases)
    removed_tests = sorted(baseline_cases - current_cases)
    added_tests = sorted(current_cases - baseline_cases)
    introduced = sorted(current - baseline)
    inherited = sorted(current & baseline)
    fixed = sorted(baseline - current)
    critical_markers = ("oauth", "keychain", "vault", "token", "publisher", "upload",
                        "storage", "migration", "sqlite", "recovery")
    critical = [item for item in introduced
                if any(token in item.lower() for token in critical_markers)]
    lines = [
        "# VYRON 6.1.15 → PR #22 Vitest Regression Diff",
        "",
        "This is a direct run of both commit trees with the same Node version.",
        "Historical failures remain visible in the independent Historical Regression Audit.",
        "",
        f"- Baseline tests executed: **{prior_total}**",
        f"- Candidate tests executed: **{current_total}**",
        f"- Failures already present in 6.1.15: **{len(inherited)}**",
        f"- Failures new in PR: **{len(introduced)}**",
        f"- Baseline failures absent in PR: **{len(fixed)}**",
        f"- New critical contract failures: **{len(critical)}**",
        f"- Baseline test cases missing or renamed in PR: **{len(removed_tests)}**",
        f"- New test cases in PR: **{len(added_tests)}**",
        "",
        "## New failures",
        *([f"- {name}" for name in introduced] if introduced else ["None"]),
        "",
        "## Critical new failures",
        *([f"- {name}" for name in critical] if critical else ["None"]),
        "",
        "## Baseline tests missing or renamed in PR (investigate, not auto-fixed)",
        *([f"- {name}" for name in removed_tests] if removed_tests else ["None"]),
        "",
        "## Pre-existing failures",
        *([f"- {name}" for name in inherited] if inherited else ["None"]),
        "",
        "## Previously failed, now passing/absent",
        *([f"- {name}" for name in fixed] if fixed else ["None"]),
        "",
        "Note: a missing test may indicate deletion or renaming; investigate before classifying as fixed.",
    ]
    report = "\n".join(lines) + "\n"
    print(report)
    Path("vitest-regression-diff.md").write_text(report, encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write(report)
    if introduced or removed_tests:
        return 2
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
