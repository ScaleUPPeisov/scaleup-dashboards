"""Synthetic-only tests. An OS integration check is opt-in on macOS."""
import json
import os
import subprocess
import sys
import unittest
from unittest import mock

import synthetic_probe as probe


class SyntheticProbeTests(unittest.TestCase):
    def setUp(self):
        self.platform = mock.patch.object(probe.sys, 'platform', 'darwin')
        self.platform.start()
        self.addCleanup(self.platform.stop)

    def response(self, **changes):
        checks = {key: True for key in probe._CHECKS}
        checks.update(changes)
        return subprocess.CompletedProcess([], 0, json.dumps(checks), '')

    def test_only_fixed_synthetic_child_is_started_with_closed_fds_and_clean_environment(self):
        with mock.patch.object(probe.subprocess, 'run', return_value=self.response()) as run:
            checks = probe.run_synthetic_probe()
        self.assertTrue(all(checks.values()))
        args, options = run.call_args
        command = args[0]
        self.assertEqual(command[:2], ['/usr/bin/sandbox-exec', '-p'])
        self.assertEqual(command[2], probe._PROFILE)
        self.assertIn('/usr/bin/python3', command)
        self.assertIn(probe._CHILD, command)
        self.assertEqual(options['stdin'], subprocess.DEVNULL)
        self.assertEqual(options['stdout'], subprocess.PIPE)
        self.assertEqual(options['stderr'], subprocess.PIPE)
        self.assertIs(options['close_fds'], True)
        self.assertEqual(set(options['env']), {'HOME', 'TMPDIR', 'PATH', 'LANG'})
        self.assertNotIn('pass_fds', options)
        self.assertNotIn('shell', options)
        self.assertEqual(options['timeout'], 10)
        self.assertTrue(options['cwd'].startswith('/private/tmp/apex-synthetic-'))

    def test_rejects_false_missing_and_extra_evidence(self):
        responses = [self.response(network_denied=False),
                     subprocess.CompletedProcess([], 0, '{}', ''),
                     subprocess.CompletedProcess([], 0, 'not json', ''),
                     self.response(unexpected=True),
                     subprocess.CompletedProcess([], 1, '{}', '')]
        for response in responses:
            with self.subTest(response=response), mock.patch.object(probe.subprocess, 'run', return_value=response):
                with self.assertRaises(probe.ProbeError): probe.run_synthetic_probe()

    def test_rejects_a_child_that_modified_the_fixture_source(self):
        def violate(command, **kwargs):
            with open(command[-4], 'w') as file:
                file.write('changed')
            return self.response()
        with mock.patch.object(probe.subprocess, 'run', side_effect=violate):
            with self.assertRaises(probe.ProbeError): probe.run_synthetic_probe()

    def test_rejects_timeout_and_platform_without_macos(self):
        with mock.patch.object(probe.subprocess, 'run', side_effect=subprocess.TimeoutExpired('fixture', 10)):
            with self.assertRaises(probe.ProbeError): probe.run_synthetic_probe()
        with mock.patch.object(probe.sys, 'platform', 'linux'):
            with self.assertRaises(probe.ProbeError): probe.run_synthetic_probe()


@unittest.skipUnless(sys.platform == 'darwin' and os.environ.get('RUN_APEX_ISOLATION_OS_TEST') == '1',
                     'requires an explicitly enabled macOS Seatbelt experiment')
class SyntheticProbeOsTests(unittest.TestCase):
    def test_real_fixture_sandbox(self):
        self.assertTrue(all(probe.run_synthetic_probe().values()))


if __name__ == '__main__':
    unittest.main()
