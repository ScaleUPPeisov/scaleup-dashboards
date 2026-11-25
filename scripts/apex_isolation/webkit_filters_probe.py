"""Fixture-only experiment for WebKit content rules and navigation policy.

The rule intentionally permits a local redirect start and blocks its target;
it is not a production policy and cannot prove protection for other schemes,
resource types, WebKit/XPC helpers, filesystem access, or Publisher.
"""
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import threading
import uuid

from check_policy import PolicyError, prepare
from synthetic_probe import _PROFILE
from webkit_probe import _WRAPPER, _compile_fixture, _run_fixture

_RESOURCES = frozenset({'fetch', 'xhr', 'beacon', 'websocket', 'stylesheet', 'import', 'image', 'iframe', 'redirect', 'redirect-target'})
_BLOCKED = _RESOURCES - {'redirect'}


def classify(control, filter_control, baseline, protected):
    if not control['ok'] or not control['parent_allowed'] or control['seen'] != _RESOURCES:
        return 'inconclusive_control'
    if (not filter_control['ok'] or not filter_control['parent_allowed']
            or 'redirect' not in filter_control['seen'] or filter_control['seen'] & _BLOCKED):
        return 'inconclusive_filter_control'
    if not baseline['ok'] or not baseline['parent_blocked'] or baseline['seen'] != _RESOURCES:
        return 'inconclusive_baseline'
    if not protected['ok'] or not protected['parent_blocked'] or 'redirect' not in protected['seen']:
        return 'inconclusive_filter'
    return 'filter_bypassed' if protected['seen'] & _BLOCKED else 'filter_blocked_fixture_requests'


def classify_all_network(control, protected):
    if not control['ok'] or not control['parent_allowed'] or control['seen']:
        return 'inconclusive_all_filter_control'
    if not protected['ok'] or not protected['parent_blocked']:
        return 'inconclusive_all_filter'
    return 'all_filter_bypassed' if protected['seen'] else 'all_filter_blocked_fixture_requests'


def _trial(executable, private, media, isolated, mode):
    token = uuid.uuid4().hex
    seen = set(); seen_lock = threading.Lock(); stopping = threading.Event()
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(('127.0.0.1', 0)); listener.listen(8); listener.settimeout(.2)
    port = listener.getsockname()[1]
    def serve():
        while not stopping.is_set():
            try: connection, _ = listener.accept()
            except TimeoutError: continue
            except OSError: return
            with connection:
                connection.settimeout(1)
                try:
                    line = connection.recv(2048).split(b'\r\n', 1)[0].decode('ascii', 'replace')
                    segments = line.split(' ')
                    resource = segments[1].removeprefix('/' + token + '/') if len(segments) > 1 and segments[1].startswith('/' + token + '/') else ''
                    if resource in _RESOURCES:
                        with seen_lock: seen.add(resource)
                    if resource == 'redirect':
                        response = f'HTTP/1.1 302 Found\r\nLocation: /{token}/redirect-target\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'.encode()
                    elif resource == 'stylesheet':
                        body = f"@import url('/{token}/import');".encode()
                        response = b'HTTP/1.1 200 OK\r\nContent-Type: text/css\r\nContent-Length: ' + str(len(body)).encode() + b'\r\nConnection: close\r\n\r\n' + body
                    else:
                        response = b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nOK'
                    connection.sendall(response)
                except OSError: pass
    thread = threading.Thread(target=serve, daemon=True); thread.start()
    try:
        rules = private / 'rule-store'; rules.mkdir(exist_ok=True, mode=0o700)
        command = ['/usr/bin/python3', '-I', '-c', _WRAPPER, str(executable), str(port), token, mode, str(rules)]
        if isolated:
            command = ['/usr/bin/sandbox-exec', '-p', _PROFILE, *prepare(private, [media]), *command]
        env = {'HOME': str(private), 'TMPDIR': str(private), 'PATH': '/usr/bin:/bin', 'LANG': 'C'}
        result, timed_out = _run_fixture(command, private, env, 18)
        lines = result.stdout.splitlines()
        with seen_lock: paths = frozenset(seen)
        error_code = next((line.split(' ', 1)[1] for line in lines
                           if line.startswith('RULELIST_ERROR_CODE ') and line.split(' ', 1)[1].lstrip('-').isdigit()), None)
        return {'ok': result.returncode == 0 and not timed_out and 'FIXTURE_STARTED' in lines and 'FIXTURE_FINISHED' in lines,
                'started': 'FIXTURE_STARTED' in lines, 'finished': 'FIXTURE_FINISHED' in lines, 'timed_out': timed_out,
                'rule_error': 'RULELIST_ERROR' in lines, 'rule_error_code': error_code,
                'parent_allowed': 'PARENT_NETWORK_ALLOWED' in lines, 'parent_blocked': 'PARENT_NETWORK_BLOCKED' in lines,
                'seen': paths}
    finally:
        stopping.set(); listener.close(); thread.join(timeout=1)


def run_webkit_filters_probe():
    if sys.platform != 'darwin': return 'inconclusive_platform', {}
    evidence = {}
    try:
        with tempfile.TemporaryDirectory(prefix='apex-webkit-filters-', dir='/private/tmp') as temporary:
            base = pathlib.Path(temporary)
            private = base / 'private'; private.mkdir(mode=0o700)
            media = base / 'source'; media.mkdir(mode=0o700)
            executable = _compile_fixture(base, 'webkit_filters_fixture.swift')
            control = _trial(executable, private, media, False, 'control')
            evidence['control'] = {**control, 'seen': sorted(control['seen'])}
            if not control['ok'] or not control['parent_allowed'] or control['seen'] != _RESOURCES:
                return 'inconclusive_control', evidence
            filter_control = _trial(executable, private, media, False, 'filter-control')
            evidence['filter_control'] = {**filter_control, 'seen': sorted(filter_control['seen'])}
            if (not filter_control['ok'] or not filter_control['parent_allowed']
                    or 'redirect' not in filter_control['seen'] or filter_control['seen'] & _BLOCKED):
                return 'inconclusive_filter_control', evidence
            baseline = _trial(executable, private, media, True, 'control')
            evidence['baseline'] = {**baseline, 'seen': sorted(baseline['seen'])}
            if not baseline['ok'] or not baseline['parent_blocked'] or baseline['seen'] != _RESOURCES:
                return 'inconclusive_baseline', evidence
            protected = _trial(executable, private, media, True, 'protected')
            evidence['protected'] = {**protected, 'seen': sorted(protected['seen'])}
            result = classify(control, filter_control, baseline, protected)
            if result != 'filter_blocked_fixture_requests':
                return result, evidence
            all_control = _trial(executable, private, media, False, 'all-control')
            evidence['all_control'] = {**all_control, 'seen': sorted(all_control['seen'])}
            if not all_control['ok'] or not all_control['parent_allowed'] or all_control['seen']:
                return 'inconclusive_all_filter_control', evidence
            all_protected = _trial(executable, private, media, True, 'all-protected')
            evidence['all_protected'] = {**all_protected, 'seen': sorted(all_protected['seen'])}
            result = classify_all_network(all_control, all_protected)
            # Only fixed category names are emitted; fixture paths and ports stay private.
            return result, evidence
    except subprocess.TimeoutExpired:
        return 'inconclusive_timeout', evidence
    except PolicyError:
        return 'inconclusive_policy', evidence
    except RuntimeError:
        return 'inconclusive_fixture_compile', evidence
    except OSError:
        return 'inconclusive_os', evidence


if __name__ == '__main__':
    result, evidence = run_webkit_filters_probe()
    print(json.dumps({'result': result, 'observed': evidence}, ensure_ascii=True))
    if result != 'all_filter_blocked_fixture_requests': sys.exit(1)
