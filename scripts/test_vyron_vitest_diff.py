"""Regression comparator safety tests: import failures must never silently pass."""
import json
import tempfile
import unittest
from pathlib import Path
from scripts.vyron_vitest_diff import load, stable_path, recovered_suite_failures

class VitestDiffTests(unittest.TestCase):
    def test_recovered_import_failure_requires_passing_cases_in_the_same_file(self):
        marker = "src/oauth.test.ts :: [SUITE_IMPORT_OR_SETUP_FAILURE]"
        case = "src/oauth.test.ts :: preserves credentials"
        self.assertEqual(recovered_suite_failures({marker}, {case}, set()), {marker})
        self.assertEqual(recovered_suite_failures({marker}, set(), set()), set())
        self.assertEqual(recovered_suite_failures({marker}, {"src/other.test.ts :: ok"}, set()), set())
        for failure in (case, case + " :: [NOT_EXECUTED:pending]", marker):
            self.assertEqual(recovered_suite_failures({marker}, {case}, {failure}), set())

    def test_recovered_suite_does_not_exempt_deleted_real_tests(self):
        marker = "src/oauth.test.ts :: [SUITE_IMPORT_OR_SETUP_FAILURE]"
        old_case = "src/oauth.test.ts :: old test"
        current = {"src/oauth.test.ts :: new test"}
        recovered = recovered_suite_failures({marker, old_case}, current, set())
        self.assertEqual({marker, old_case} - current - recovered, {old_case})

    def load_case(self, status):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "vitest.json"
            path.write_text(json.dumps({"testResults": [{
                "name": "/tmp/src/oauth.test.ts", "status": "passed",
                "assertionResults": [{"fullName": "preserves refresh token", "status": status}]
            }]}), encoding="utf-8")
            return load(str(path))

    def test_newly_unexecuted_test_is_a_regression_even_if_previously_failed(self):
        for prior in ("passed", "failed"):
            for status in ("pending", "skipped", "todo", "disabled"):
                with self.subTest(prior=prior, status=status):
                    baseline, _, baseline_cases = self.load_case(prior)
                    current, _, current_cases = self.load_case(status)
                    self.assertEqual(baseline_cases, current_cases)
                    self.assertTrue(current - baseline)
                    self.assertIn(f"[NOT_EXECUTED:{status}]", next(iter(current)))

    def test_unchanged_skipped_baseline_remains_visible(self):
        baseline, _, _ = self.load_case("pending")
        current, _, _ = self.load_case("pending")
        self.assertTrue(current & baseline)
        self.assertFalse(current - baseline)

    def test_unknown_or_missing_status_fails_closed(self):
        for status in (None, "unexpected", ""):
            with self.subTest(status=status):
                with self.assertRaisesRegex(ValueError, "Unknown assertion status"):
                    self.load_case(status)

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

