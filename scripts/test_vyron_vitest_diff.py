"""Regression comparator safety tests: import failures must never silently pass."""
import json
import tempfile
import unittest
from pathlib import Path
from scripts.vyron_vitest_diff import load, stable_path

class VitestDiffTests(unittest.TestCase):
    def test_stable_source_path_across_baseline_and_pr_worktrees(self):
        base = "/tmp/vyron-6_1_15-baseline/src/oauth.test.ts"
        candidate = "/home/runner/work/scaleup-dashboards/scaleup-dashboards/src/oauth.test.ts"
        self.assertEqual(stable_path(base), "src/oauth.test.ts")
        self.assertEqual(stable_path(base), stable_path(candidate))

    def test_failed_suite_without_assertions_is_counted_as_a_failure(self):
        data = {
            "testResults": [{
                "name": "/tmp/vyron-6_1_15-baseline/src/oauth.test.ts",
                "status": "failed",
                "assertionResults": [],
                "message": "Failed to load test module"
            }]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "vitest.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            failures, errors, cases = load(str(path))
            key = "src/oauth.test.ts :: [SUITE_IMPORT_OR_SETUP_FAILURE]"
            self.assertIn(key, failures)
            self.assertIn(key, cases)
            self.assertIn("Failed to load", errors[key])

    def test_normal_failed_assertion_is_not_counted_twice(self):
        data = {
            "testResults": [{
                "name": "/tmp/vyron-6_1_15-baseline/src/storage.test.ts",
                "status": "failed",
                "assertionResults": [
                    {"fullName": "never drop backup", "status": "failed",
                     "failureMessages": ["received 0 expected 1"]}],
                "message": "Assertion failed"
            }]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "vitest.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            failures, errors, cases = load(str(path))
            self.assertEqual(len(failures), 1)
            self.assertEqual(len(cases), 1)

    def test_empty_test_report_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.json"
            path.write_text('{"testResults":[]}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "No test cases"):
                load(str(path))

if __name__ == "__main__":
    unittest.main()
