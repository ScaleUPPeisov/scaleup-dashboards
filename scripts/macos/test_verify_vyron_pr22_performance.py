import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("verify-vyron-pr22-performance.py")
SPEC = importlib.util.spec_from_file_location("vyron_pr22_performance", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def report(*, fps=59.5, foreground=True, declared_pass=True):
    metric = {"fps": fps, "p50": 16.7, "p95": 19.5, "p99": 31.0,
              "worst": 35.0, "dropped": 0.5, "long50": 0, "long100": 0}
    return {
        "schemaVersion": 3, "pass": declared_pass, "at": "2026-11-11T00:00:00Z",
        "version": "6.1.15", "aggregate": metric,
        "dataset": {"channels": 35, "jobs": 1000, "metadataRecords": 5000,
                    "assignedJobs": 1000, "rounds": 3},
        "rounds": [dict(metric) for _ in range(3)],
        "frameEvidence": {"roundForeground": [foreground] * 3,
                          "roundIntervalsMs": [[16.6, 16.7, 17.0] for _ in range(3)]},
    }


class PhysicalEvidenceTests(unittest.TestCase):
    def test_complete_foreground_report_passes(self):
        result = MODULE.validate_report(report())
        self.assertEqual(result["physicalM1FrameGate"], "PASS")
        self.assertTrue(result["rawIntervalsRetained"])

    def test_rounded_59_claim_and_hidden_round_fail_closed(self):
        with self.assertRaisesRegex(MODULE.EvidenceError, "PASS_MISMATCH"):
            MODULE.validate_report(report(fps=58.7, declared_pass=True))
        with self.assertRaisesRegex(MODULE.EvidenceError, "NOT_FOREGROUND"):
            MODULE.validate_report(report(foreground=False))

    def test_fixture_and_raw_intervals_are_required(self):
        value = report()
        value["dataset"]["channels"] = 10
        with self.assertRaisesRegex(MODULE.EvidenceError, "OUT_OF_RANGE"):
            MODULE.validate_report(value)
        value = report()
        value["frameEvidence"]["roundIntervalsMs"][0] = []
        with self.assertRaisesRegex(MODULE.EvidenceError, "INTERVALS_EMPTY"):
            MODULE.validate_report(value)

    def test_resource_samples_are_summarized(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "resources.csv"
            with path.open("w", newline="", encoding="utf-8") as stream:
                writer = csv.DictWriter(stream, fieldnames=["epoch", "pid", "cpu_percent", "rss_kib"])
                writer.writeheader()
                writer.writerow({"epoch": 1, "pid": 2, "cpu_percent": 25, "rss_kib": 102400})
                writer.writerow({"epoch": 2, "pid": 2, "cpu_percent": 50, "rss_kib": 204800})
            result = MODULE.resource_summary(path)
            self.assertEqual(result["samples"], 2)
            self.assertEqual(result["cpuPercentPeak"], 50)
            self.assertEqual(result["rssMiBPeak"], 200)


if __name__ == "__main__":
    unittest.main()
