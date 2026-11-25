#!/usr/bin/env python3
"""macOS-only offline tests with synthetic files and no VYRON process."""
import errno
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

from check_policy import PolicyError, prepare

PROFILE = pathlib.Path(__file__).with_name('preview.sb')


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='apex-isolation-', dir='/private/tmp')
        self.base = pathlib.Path(self.tmp.name)
        self.private = self.base / 'private'; self.private.mkdir(mode=0o700)
        self.media = self.base / 'media'; self.media.mkdir(mode=0o700)
        (self.media / 'sentinel').write_text('original')

    def tearDown(self):
        self.tmp.cleanup()

    def test_config_fails_closed_for_overlaps_links_or_insecure_root(self):
        self.assertEqual(prepare(self.private, [self.media]), ['-D', f'PRIVATE_ROOT={self.private}'])
        for root, media in [(self.private, []), (self.private, [self.private]), (self.base, [self.media])]:
            with self.assertRaises(PolicyError): prepare(root, media)
        link = self.base / 'link'; link.symlink_to(self.private, target_is_directory=True)
        with self.assertRaises(PolicyError): prepare(link, [self.media])
        self.private.chmod(0o755)
        with self.assertRaises(PolicyError): prepare(self.private, [self.media])

    @unittest.skipUnless(sys.platform == 'darwin', 'requires macOS Seatbelt')
    def test_os_blocks_external_writes_and_descendant_network(self):
        code = r'''import errno,json,os,pathlib,socket,subprocess,sys
root=pathlib.Path(sys.argv[1]); media=pathlib.Path(sys.argv[2]); result={}
(root/'ok').write_text('ok'); result['inside_write']=True
try: (media/'sentinel').write_text('changed'); result['outside_denied']=False
except OSError as e: result['outside_denied']=e.errno in (errno.EPERM, errno.EACCES)
child="import errno,socket,sys\ns=socket.socket()\ntry: s.connect(('127.0.0.1',1))\nexcept OSError as e: sys.exit(0 if e.errno in (errno.EPERM,errno.EACCES) else 2)\nsys.exit(3)"
p=subprocess.run([sys.executable,'-I','-c',child],capture_output=True)
result['child_network_denied']=p.returncode==0
print(json.dumps(result)); sys.exit(0 if all(result.values()) else 1)
'''
        command = ['/usr/bin/sandbox-exec', '-f', str(PROFILE), *prepare(self.private, [self.media]), '/usr/bin/python3', '-I', '-c', code, str(self.private), str(self.media)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        self.assertTrue(all(json.loads(result.stdout).values()))
        self.assertEqual((self.media / 'sentinel').read_text(), 'original')


if __name__ == '__main__':
    unittest.main()
