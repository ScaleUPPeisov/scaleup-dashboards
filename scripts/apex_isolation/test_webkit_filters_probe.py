"""Classification contracts for the synthetic WebKit filter fixture."""
import unittest
from unittest import mock
import webkit_filters_probe as probe


def row(seen=None, ok=True, parent_allowed=True, parent_blocked=True):
    return {'seen': frozenset(seen if seen is not None else probe._RESOURCES), 'ok': ok,
            'parent_allowed': parent_allowed, 'parent_blocked': parent_blocked}


class WebKitFilterProbeTests(unittest.TestCase):
    def test_control_must_observe_all_fixture_types(self):
        self.assertEqual(probe.classify(row(seen={'fetch'}), row(seen={'redirect'}), row(), row()), 'inconclusive_control')
        self.assertEqual(probe.classify(row(parent_allowed=False), row(seen={'redirect'}), row(), row()), 'inconclusive_control')

    def test_filter_control_must_block_fixture_and_allow_redirect(self):
        self.assertEqual(probe.classify(row(), row(seen={'redirect', 'fetch'}), row(), row()), 'inconclusive_filter_control')
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}, parent_allowed=False), row(), row()), 'inconclusive_filter_control')

    def test_sandbox_without_filter_must_observe_all_types(self):
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(seen={'fetch'}), row()), 'inconclusive_baseline')
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(parent_blocked=False), row()), 'inconclusive_baseline')

    def test_filter_must_allow_test_redirect_and_start_fully(self):
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(), row(seen=set())), 'inconclusive_filter')
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(), row(ok=False)), 'inconclusive_filter')
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(), row(parent_blocked=False)), 'inconclusive_filter')

    def test_separates_blocked_from_bypassed(self):
        self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(), row(seen={'redirect'})), 'filter_blocked_fixture_requests')
        for resource in probe._BLOCKED:
            with self.subTest(resource=resource):
                self.assertEqual(probe.classify(row(), row(seen={'redirect'}), row(), row(seen={'redirect', resource})), 'filter_bypassed')

    def test_all_network_policy_requires_filter_control_and_zero_observed_requests(self):
        control = row(seen=set())
        self.assertEqual(probe.classify_all_network(control, row(seen=set())), 'all_filter_blocked_fixture_requests')
        self.assertEqual(probe.classify_all_network(row(), row(seen=set())), 'inconclusive_all_filter_control')
        self.assertEqual(probe.classify_all_network(control, row(parent_blocked=False)), 'inconclusive_all_filter')
        self.assertEqual(probe.classify_all_network(control, row(seen={'websocket'})), 'all_filter_bypassed')

    def test_unsupported_platform_is_not_success(self):
        with mock.patch.object(probe.sys, 'platform', 'linux'):
            self.assertEqual(probe.run_webkit_filters_probe(), ('inconclusive_platform', {}))


if __name__ == '__main__':
    unittest.main()
