"""Classification tests for synthetic WebKit isolation evidence."""
import unittest
from unittest import mock
import webkit_probe as probe


def observation(started=True, finished=True, request=False, exit_ok=True, parent_network_allowed=True, parent_network_blocked=True):
    return {'started': started, 'finished': finished, 'request': request, 'exit_ok': exit_ok,
            'parent_network_allowed': parent_network_allowed, 'parent_network_blocked': parent_network_blocked}


class WebKitProbeTests(unittest.TestCase):
    def test_rejects_inoperable_control(self):
        self.assertEqual(probe.classify(observation(request=False), observation()), 'inconclusive_control')
        self.assertEqual(probe.classify(observation(started=False, request=True), observation()), 'inconclusive_control')
        self.assertEqual(probe.classify(observation(exit_ok=False, request=True), observation()), 'inconclusive_control')
        self.assertEqual(probe.classify(observation(request=True, parent_network_allowed=False), observation()), 'inconclusive_control')

    def test_rejects_sandbox_that_did_not_start_or_finish(self):
        control = observation(request=True)
        self.assertEqual(probe.classify(control, observation(started=False)), 'inconclusive_sandbox')
        self.assertEqual(probe.classify(control, observation(finished=False)), 'inconclusive_sandbox')
        self.assertEqual(probe.classify(control, observation(exit_ok=False)), 'inconclusive_sandbox')
        self.assertEqual(probe.classify(control, observation(parent_network_blocked=False)), 'inconclusive_sandbox')

    def test_reports_network_escape_or_blocked_only_with_positive_control(self):
        control = observation(request=True)
        self.assertEqual(probe.classify(control, observation(request=True)), 'network_observed')
        self.assertEqual(probe.classify(control, observation(request=False)), 'network_blocked_in_test')

    def test_does_not_run_on_unsupported_platform(self):
        with mock.patch.object(probe.sys, 'platform', 'linux'):
            self.assertEqual(probe.run_webkit_probe(), 'inconclusive_platform')


if __name__ == '__main__':
    unittest.main()
