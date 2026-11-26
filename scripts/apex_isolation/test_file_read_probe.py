import unittest
from unittest import mock
import file_read_probe as probe


def row(**changes):
    value = {'ok': True, 'parent_private': 'allowed', 'parent_media': 'allowed',
             'parent_foreign': 'allowed', 'webkit_media': 'loaded', 'webkit_foreign': 'loaded'}
    value.update(changes)
    return value


class FileReadProbeTests(unittest.TestCase):
    def test_requires_positive_control_for_both_direct_and_webkit_reads(self):
        for bad in [row(ok=False), row(parent_foreign='denied'), row(webkit_foreign='error'), row(webkit_media='error')]:
            self.assertEqual(probe.classify(bad, {}), 'inconclusive_control')

    def test_requires_sandbox_to_deny_foreign_and_allow_media(self):
        for bad in [row(parent_foreign='allowed'), row(parent_foreign='error'),
                    row(parent_foreign='denied', webkit_media='error'), row(ok=False)]:
            self.assertEqual(probe.classify(row(), bad), 'inconclusive_sandbox')

    def test_distinguishes_xpc_read_from_denial(self):
        base = row(parent_foreign='denied')
        self.assertEqual(probe.classify(row(), base), 'webkit_foreign_read_observed')
        self.assertEqual(probe.classify(row(), row(parent_foreign='denied', webkit_foreign='error')), 'fixture_read_blocked')
        self.assertEqual(probe.classify(row(), row(parent_foreign='denied', webkit_foreign='missing')), 'inconclusive_sandbox')

    def test_targeted_profile_is_only_a_single_fixture_denial(self):
        self.assertIn('(deny file-read* (subpath (param "FOREIGN_ROOT")))', probe._TARGETED_PROFILE)
        self.assertIn('(deny network*)', probe._TARGETED_PROFILE)
        self.assertNotEqual(probe._TARGETED_PROFILE, probe._PROFILE)

    def test_unsupported_platform_is_not_success(self):
        with mock.patch.object(probe.sys, 'platform', 'linux'):
            self.assertEqual(probe.run_file_read_probe(), ('inconclusive_platform', {}))


if __name__ == '__main__': unittest.main()
