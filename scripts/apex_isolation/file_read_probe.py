"""Synthetic macOS file-read probe. Never launches VYRON or accepts data paths.

System runtime reads are explicitly allowed; fixture media and private roots are
allowed, while a sibling fixture directory is denied. The WebKit check uses a
local HTML page with a strict CSP and no network or user data.
"""
import json
import os
import pathlib
import sys
import tempfile
import struct
import zlib

from check_policy import PolicyError, prepare
from webkit_probe import _compile_fixture, _run_fixture

_PROFILE = r'''(version 1)
(allow default)
(deny file-read*)
(allow file-read* (subpath (param "PRIVATE_ROOT")) (subpath (param "MEDIA_ROOT")) (subpath (param "BUNDLE_ROOT")))
(allow file-read* (subpath "/System") (subpath "/usr") (subpath "/Library/Apple") (subpath "/dev") (subpath "/private/etc") (subpath "/private/var/db/timezone"))
(deny network*)
(deny mach-lookup (global-name "com.apple.securityd"))'''
def _png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    header = struct.pack('>IIBBBBB', 1, 1, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(b'\x00\x80\x40\xa0\xff')) + chunk(b'IEND', b'')


def classify(control, isolated):
    if (not control.get('ok') or control.get('parent_private') != 'allowed' or control.get('parent_media') != 'allowed'
            or control.get('parent_foreign') != 'allowed' or control.get('webkit_media') != 'loaded'
            or control.get('webkit_foreign') != 'loaded'):
        return 'inconclusive_control'
    if (not isolated.get('ok') or isolated.get('parent_private') != 'allowed' or isolated.get('parent_media') != 'allowed'
            or isolated.get('parent_foreign') != 'denied' or isolated.get('webkit_media') != 'loaded'):
        return 'inconclusive_sandbox'
    return 'webkit_foreign_read_observed' if isolated.get('webkit_foreign') == 'loaded' else (
        'fixture_read_blocked' if isolated.get('webkit_foreign') == 'error' else 'inconclusive_sandbox')


def _trial(executable, base, isolated):
    private = base / 'private'; media = base / 'media'; foreign = base / 'foreign'
    command = [str(executable), str(base)]
    if isolated:
        private_params = prepare(private, [media, foreign])
        command = ['/usr/bin/sandbox-exec', '-p', _PROFILE, *private_params,
                   '-D', f'MEDIA_ROOT={media}', '-D', f'BUNDLE_ROOT={executable.parents[2]}', *command]
    env = {'HOME': str(private), 'TMPDIR': str(private), 'PATH': '/usr/bin:/bin', 'LANG': 'C'}
    result, timed_out = _run_fixture(command, private, env, 18)
    lines = set(result.stdout.splitlines())
    stderr_lower = result.stderr.lower()
    stderr_kind = next((kind for kind, marker in [('sandbox_apply', 'sandbox_apply'), ('dyld', 'dyld'),
                         ('permission', 'permission denied'), ('not_found', 'no such file')]
                        if marker in stderr_lower), 'other' if result.stderr else 'none')
    def status(prefix, choices):
        return next((choice for choice in choices if f'{prefix}_{choice.upper()}' in lines), 'missing')
    return {
        'ok': result.returncode == 0 and not timed_out and 'FIXTURE_STARTED' in lines and 'FIXTURE_FINISHED' in lines,
        'timed_out': timed_out, 'exit_code': result.returncode, 'stderr_kind': stderr_kind,
        'parent_private': status('PARENT_PRIVATE', ('allowed', 'denied', 'error')),
        'parent_media': status('PARENT_MEDIA', ('allowed', 'denied', 'error')),
        'parent_foreign': status('PARENT_FOREIGN', ('allowed', 'denied', 'error')),
        'webkit_media': status('WEBKIT_MEDIA', ('loaded', 'error')),
        'webkit_foreign': status('WEBKIT_FOREIGN', ('loaded', 'error')),
    }


def run_file_read_probe():
    if sys.platform != 'darwin': return 'inconclusive_platform', {}
    evidence = {}
    try:
        with tempfile.TemporaryDirectory(prefix='apex-file-read-', dir='/private/tmp') as temporary:
            base = pathlib.Path(temporary)
            private = base / 'private'; private.mkdir(mode=0o700)
            media = base / 'media'; media.mkdir(mode=0o700)
            foreign = base / 'foreign'; foreign.mkdir(mode=0o700)
            (private / 'sentinel').write_text('fixture')
            (media / 'media.png').write_bytes(_png())
            (foreign / 'foreign.png').write_bytes(_png())
            html = '''<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src file:; script-src 'unsafe-inline'"><script>
            function report(v){window.webkit.messageHandlers.probe.postMessage(v)}
            function check(name,url){const img=new Image();img.onload=()=>report(name+':loaded');img.onerror=()=>report(name+':error');img.src=url;document.body.appendChild(img)}
            window.onload=()=>{report('started');check('media',MEDIA_URL);check('foreign',FOREIGN_URL)}
            </script>'''.replace('MEDIA_URL', json.dumps((media / 'media.png').as_uri())).replace('FOREIGN_URL', json.dumps((foreign / 'foreign.png').as_uri()))
            (private / 'index.html').write_text(html)
            executable = _compile_fixture(base, 'file_read_fixture.swift')
            control = _trial(executable, base, False); evidence['control'] = control
            if classify(control, {}) == 'inconclusive_control': return 'inconclusive_control', evidence
            isolated = _trial(executable, base, True); evidence['isolated'] = isolated
            return classify(control, isolated), evidence
    except (OSError, PolicyError, RuntimeError):
        return 'inconclusive_environment', evidence


if __name__ == '__main__':
    result, evidence = run_file_read_probe()
    print(json.dumps({'result': result, 'observed': evidence}, ensure_ascii=True))
    if result != 'fixture_read_blocked': sys.exit(1)
