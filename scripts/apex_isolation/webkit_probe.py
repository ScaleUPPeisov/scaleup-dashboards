"""Synthetic macOS WebKit network experiment, never a VYRON launcher.

A local fixture listener checks whether WebKit's network helper can reach a
loopback endpoint after sandbox-exec. The identical unsandboxed control must
first produce a request. A missing control or WebKit startup is inconclusive.
This cannot prove filesystem, XPC, WebKit data-store or Publisher isolation.
"""
import os
import pathlib
import plistlib
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import uuid

from check_policy import PolicyError, prepare
from synthetic_probe import _PROFILE

_WRAPPER = r'''import errno,socket,subprocess,sys
executable,port,token,*extra=sys.argv[1:]
try:
    with socket.socket() as s:
        s.settimeout(1); s.connect(('127.0.0.1',int(port)))
        s.sendall(b'GET /direct HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n')
    print('PARENT_NETWORK_ALLOWED',flush=True)
except OSError as e:
    print('PARENT_NETWORK_BLOCKED' if e.errno in (errno.EPERM,errno.EACCES) else 'PARENT_NETWORK_UNKNOWN',flush=True)
sys.exit(subprocess.run([executable,port,token,*extra],close_fds=True,check=False).returncode)
'''


def classify(control, isolated):
    """Interpret only exact fixture observations, failing closed on ambiguity."""
    if not control['exit_ok'] or not control['started'] or not control['request'] or not control['parent_network_allowed']:
        return 'inconclusive_control'
    if not isolated['exit_ok'] or not isolated['started'] or not isolated['finished'] or not isolated['parent_network_blocked']:
        return 'inconclusive_sandbox'
    return 'network_observed' if isolated['request'] else 'network_blocked_in_test'


def _run_fixture(command, private, env, timeout):
    """Own the fixture group; descendants retaining stdout cannot stall reaping."""
    # WebKit services can retain inherited stdout after the wrapper exits.
    # Files under the private fixture root avoid waiting forever for pipe EOF.
    with tempfile.TemporaryFile(mode='w+t', dir=private) as out, tempfile.TemporaryFile(mode='w+t', dir=private) as err:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=out, stderr=err,
                                   text=True, close_fds=True, start_new_session=True, cwd=str(private), env=env)
        timed_out = False
        try:
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            try: os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            process.wait()
        out.seek(0); err.seek(0)
        return subprocess.CompletedProcess(command, process.returncode, out.read(), err.read()), timed_out


def _compile_fixture(base, source_name='webkit_fixture.swift'):
    bundle = base / 'WebKit Fixture.app' / 'Contents'
    executable = bundle / 'MacOS' / 'WebKit Fixture'
    executable.parent.mkdir(parents=True)
    with (bundle / 'Info.plist').open('wb') as file:
        plistlib.dump({'CFBundleIdentifier': 'invalid.vyron.apex.synthetic.webkit',
                       'CFBundleName': 'WebKit Fixture', 'CFBundleExecutable': 'WebKit Fixture',
                       'CFBundlePackageType': 'APPL', 'CFBundleVersion': '1', 'LSUIElement': True,
                       'NSAppTransportSecurity': {'NSAllowsLocalNetworking': True,
                                                   'NSAllowsArbitraryLoadsInWebContent': True}}, file)
    cache = base / 'build-cache'; cache.mkdir(mode=0o700)
    env = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'HOME': str(base), 'TMPDIR': str(cache),
           'CLANG_MODULE_CACHE_PATH': str(cache / 'clang'), 'SWIFT_MODULECACHE_PATH': str(cache / 'swift'),
           'LANG': 'C'}
    source = pathlib.Path(__file__).with_name(source_name)
    compiled = subprocess.run(['/usr/bin/swiftc', str(source), '-o', str(executable)],
                              stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              close_fds=True, env=env, cwd=str(base), timeout=90, check=False)
    if compiled.returncode != 0 or not executable.is_file():
        raise RuntimeError('FIXTURE_COMPILE_FAILED')
    return executable


def _trial(executable, private, media, isolated):
    token = uuid.uuid4().hex
    observed = threading.Event()
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('127.0.0.1', 0)); listener.listen(4); listener.settimeout(.2)
    port = listener.getsockname()[1]
    stopping = threading.Event()

    def serve():
        while not stopping.is_set():
            try:
                connection, _ = listener.accept()
            except TimeoutError:
                continue
            except OSError:
                return
            with connection:
                connection.settimeout(1)
                try:
                    line = connection.recv(2048).split(b'\r\n', 1)[0]
                    if line == f'GET /{token} HTTP/1.1'.encode():
                        observed.set()
                    connection.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nOK')
                except OSError:
                    pass
    thread = threading.Thread(target=serve, daemon=True); thread.start()
    try:
        command = ['/usr/bin/python3', '-I', '-c', _WRAPPER, str(executable), str(port), token]
        if isolated:
            command = ['/usr/bin/sandbox-exec', '-p', _PROFILE, *prepare(private, [media]), *command]
        env = {'HOME': str(private), 'TMPDIR': str(private), 'PATH': '/usr/bin:/bin', 'LANG': 'C'}
        result, timed_out = _run_fixture(command, private, env, 15)
        lines = result.stdout.splitlines()
        return {'started': 'FIXTURE_STARTED' in lines, 'finished': any(s in lines for s in ('FETCH_FINISHED', 'FETCH_FAILED')),
                'request': observed.is_set(), 'exit_ok': result.returncode == 0 and not timed_out,
                'parent_network_allowed': 'PARENT_NETWORK_ALLOWED' in lines,
                'parent_network_blocked': 'PARENT_NETWORK_BLOCKED' in lines}
    finally:
        stopping.set(); listener.close(); thread.join(timeout=1)


def run_webkit_probe():
    if sys.platform != 'darwin':
        return 'inconclusive_platform'
    try:
        with tempfile.TemporaryDirectory(prefix='apex-webkit-', dir='/private/tmp') as temporary:
            base = pathlib.Path(temporary)
            private = base / 'private'; private.mkdir(mode=0o700)
            media = base / 'source'; media.mkdir(mode=0o700)
            executable = _compile_fixture(base)
            control = _trial(executable, private, media, False)
            if not control['exit_ok'] or not control['started'] or not control['request']:
                return 'inconclusive_control'
            isolated = _trial(executable, private, media, True)
            if not isolated['exit_ok']:
                return 'inconclusive_sandbox'
            return classify(control, isolated)
    except (OSError, PolicyError, RuntimeError, subprocess.TimeoutExpired):
        return 'inconclusive_environment'


if __name__ == '__main__':
    outcome = run_webkit_probe()
    print(outcome)
    if outcome != 'network_blocked_in_test':
        sys.exit(1)
