#!/usr/bin/env python3
"""Compare actual Jest/Vitest JSON failures between stable 6.1.15 and PR head.
Never suppress, rewrite or relabel old critical errors. No source modification.
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

def load(path: str) -> tuple[set[str], dict[str, str], int]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    result = set()
    errors: dict[str, str] = {}
    count = 0
    for suite in raw.get("testResults", []):
        location = str(suite.get("name", "")).replace("\\", "/")
        for case in suite.get("assertionResults", []):
            count += 1
            status = case.get("status")
            name = case.get("fullName") or case.get("title") or "unknown test"
            identity = f"{location} :: {name}"
            if status == "failed":
                result.add(identity)
                messages = case.get("failureMessages") or []
                errors[identity] = " | ".join(str(s)[:250] for s in messages[:2])
    return result, errors, count

def main() -> int:
    if len(sys.argv) != 3:
        print("usage: vyron_vitest_diff.py <6.1.15.json> <pr.json>", file=sys.stderr)
        return 3
    baseline, prior_details, prior_total = load(sys.argv[1])
    current, current_details, current_total = load(sys.argv[2])
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
        "",
        "## New failures",
        *([f"- {name}" for name in introduced] if introduced else ["None"]),
        "",
        "## Critical new failures",
        *([f"- {name}" for name in critical] if critical else ["None"]),
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
    if critical:
        return 2
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
