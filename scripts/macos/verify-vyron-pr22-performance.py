#!/usr/bin/env python3
"""Validate physical M1 probe evidence without accepting rounded/partial samples."""
from __future__ import annotations

import argparse
import csv
import json
import os
import tempfile
from pathlib import Path


class EvidenceError(ValueError):
    pass


def load_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EvidenceError("REPORT_UNREADABLE") from error
    if not isinstance(value, dict):
        raise EvidenceError("REPORT_NOT_OBJECT")
    return value


def number(row: dict, key: str) -> float:
    value = row.get(key)
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise EvidenceError(f"METRIC_INVALID:{key}")
    value = float(value)
    if value < 0 or value != value or value in (float("inf"), float("-inf")):
        raise EvidenceError(f"METRIC_INVALID:{key}")
    return value


def round_pass(row: dict) -> bool:
    return (
        number(row, "fps") >= 59
        and number(row, "p50") <= 17.5
        and number(row, "p95") <= 20.5
        and number(row, "p99") <= 33.5
        and number(row, "dropped") < 1
        and number(row, "long50") == 0
    )


def validate_report(report: dict) -> dict:
    if report.get("schemaVersion") != 3:
        raise EvidenceError("REPORT_SCHEMA_NOT_3")
    dataset = report.get("dataset")
    evidence = report.get("frameEvidence")
    rounds = report.get("rounds")
    if not isinstance(dataset, dict) or not isinstance(evidence, dict) or not isinstance(rounds, list):
        raise EvidenceError("REPORT_EVIDENCE_MISSING")
    channels = int(number(dataset, "channels"))
    jobs = int(number(dataset, "jobs"))
    records = int(number(dataset, "metadataRecords"))
    assigned = int(number(dataset, "assignedJobs"))
    declared_rounds = int(number(dataset, "rounds"))
    if not 33 <= channels <= 50:
        raise EvidenceError("CHANNEL_FIXTURE_OUT_OF_RANGE")
    if jobs < 1000 or records < 5000 or assigned != jobs:
        raise EvidenceError("PERFORMANCE_FIXTURE_INCOMPLETE")
    if declared_rounds < 3 or len(rounds) != declared_rounds:
        raise EvidenceError("ROUND_COUNT_INCOMPLETE")
    foreground = evidence.get("roundForeground")
    intervals = evidence.get("roundIntervalsMs")
    if foreground != [True] * declared_rounds:
        raise EvidenceError("ROUND_NOT_FOREGROUND")
    if not isinstance(intervals, list) or len(intervals) != declared_rounds:
        raise EvidenceError("RAW_INTERVALS_MISSING")
    for values in intervals:
        if not isinstance(values, list) or not values:
            raise EvidenceError("RAW_INTERVALS_EMPTY")
        for value in values:
            if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
                raise EvidenceError("RAW_INTERVAL_INVALID")
    computed = all(isinstance(row, dict) and round_pass(row) for row in rounds)
    if bool(report.get("pass")) != computed:
        raise EvidenceError("REPORT_PASS_MISMATCH")
    return {
        "schemaVersion": 1,
        "physicalM1FrameGate": "PASS" if computed else "FAIL",
        "reportedAt": report.get("at"),
        "version": report.get("version"),
        "dataset": {
            "channels": channels,
            "jobs": jobs,
            "metadataRecords": records,
            "rounds": declared_rounds,
        },
        "aggregate": report.get("aggregate"),
        "allRoundsForeground": True,
        "rawIntervalsRetained": True,
    }


def resource_summary(path: Path) -> dict:
    try:
        with path.open(newline="", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
    except OSError as error:
        raise EvidenceError("RESOURCE_SAMPLES_UNREADABLE") from error
    if not rows or set(rows[0]) != {"epoch", "pid", "cpu_percent", "rss_kib"}:
        raise EvidenceError("RESOURCE_SAMPLES_INVALID")
    cpu: list[float] = []
    rss: list[float] = []
    for row in rows:
        try:
            cpu.append(float(row["cpu_percent"]))
            rss.append(float(row["rss_kib"]))
        except (TypeError, ValueError) as error:
            raise EvidenceError("RESOURCE_SAMPLE_NOT_NUMERIC") from error
    if any(x < 0 for x in cpu + rss):
        raise EvidenceError("RESOURCE_SAMPLE_NEGATIVE")
    return {
        "samples": len(rows),
        "cpuPercentPeak": max(cpu),
        "cpuPercentMean": sum(cpu) / len(cpu),
        "rssMiBPeak": max(rss) / 1024,
        "rssMiBMean": sum(rss) / len(rss) / 1024,
        "note": "ps samples for the isolated probe process; not system-wide energy metrics",
    }


def atomic_private_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.write("\n")
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--resources", type=Path)
    parser.add_argument("--baseline-report", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    summary = validate_report(load_json(args.report))
    if args.resources:
        summary["processResources"] = resource_summary(args.resources)
    if args.baseline_report:
        baseline = validate_report(load_json(args.baseline_report))
        summary["baseline"] = {
            "frameGate": baseline["physicalM1FrameGate"],
            "version": baseline["version"],
            "aggregate": baseline["aggregate"],
        }
    atomic_private_json(args.output, summary)
    return 0 if summary["physicalM1FrameGate"] == "PASS" else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except EvidenceError as error:
        print(f"BLOCKER={error}", file=__import__("sys").stderr)
        raise SystemExit(2)
