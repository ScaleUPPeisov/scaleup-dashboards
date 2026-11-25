"""Run one hard-coded Seatbelt experiment on disposable synthetic data.

This is not an application launcher. It never accepts an executable, code, data
path, or user credentials. It does not establish isolation of WebKit, XPC,
existing application state, external volumes, or Publisher.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

from check_policy import PolicyError, prepare


class ProbeError(RuntimeError):
    pass


# Deliberately in the executable argument instead of loaded from a mutable path.
# The child is restricted to a fixed script operating on fixture paths created
# by this process, while the real APEX startup guard remains unchanged.
_PROFILE = '''(version 1)
(allow default)
(deny file-write*)
(allow file-write* (subpath (param "PRIVATE_ROOT")))
(deny network*)
(deny mach-lookup (global-name "com.apple.securityd"))'''
_CHILD = r'''import errno,json,os,pathlib,socket,sys
private=pathlib.Path(sys.argv[1]); source=pathlib.Path(sys.argv[2])
fd,dev,ino=map(int,sys.argv[3:]); checks={}
try:
    info=os.fstat(fd)
    checks['inherited_fd_closed']=(info.st_dev,info.st_ino)!=(dev,ino)
except OSError as e:
    checks['inherited_fd_closed']=e.errno==errno.EBADF
(private/'written').write_text('fixture')
checks['private_write']=True
checks['source_read']=source.read_text()=='original'
try:
    source.write_text('changed')
    checks['source_write_denied']=False
except OSError as e:
    checks['source_write_denied']=e.errno in (errno.EPERM,errno.EACCES)
try:
    s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1',1))
    checks['network_denied']=False
except OSError as e:
    checks['network_denied']=e.errno in (errno.EPERM,errno.EACCES)
finally:
    if 's' in locals(): s.close()
print(json.dumps(checks))
'''
_CHECKS = frozenset({'inherited_fd_closed', 'private_write', 'source_read',
                     'source_write_denied', 'network_denied'})


def run_synthetic_probe():
    """Run only the built-in fixture, raising if any check cannot be proven."""
    if sys.platform != 'darwin':
        raise ProbeError('MACOS_REQUIRED')
    try:
        with tempfile.TemporaryDirectory(prefix='apex-synthetic-', dir='/private/tmp') as temporary:
            base = pathlib.Path(temporary)
            private = base / 'private'; private.mkdir(mode=0o700)
            media = base / 'source'; media.mkdir(mode=0o700)
            sentinel = media / 'sentinel'; sentinel.write_text('original')
            parameters = prepare(private, [media])
            fd = os.open(sentinel, os.O_WRONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            try:
                # Deliberately make this synthetic descriptor inheritable so
                # the test exercises close_fds, not only the CLOEXEC flag.
                os.set_inheritable(fd, True)
                info = os.fstat(fd)
                command = ['/usr/bin/sandbox-exec', '-p', _PROFILE, *parameters,
                           '/usr/bin/python3', '-I', '-c', _CHILD,
                           str(private), str(sentinel), str(fd), str(info.st_dev), str(info.st_ino)]
                result = subprocess.run(
                    command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE, text=True, close_fds=True, cwd=str(private),
                    env={'HOME': str(private), 'TMPDIR': str(private), 'PATH': '/usr/bin:/bin', 'LANG': 'C'},
                    timeout=10, check=False,
                )
            finally:
                os.close(fd)
            if result.returncode != 0 or sentinel.read_text() != 'original':
                raise ProbeError('SANDBOX_PROBE_FAILED')
            try:
                checks = json.loads(result.stdout)
            except (ValueError, TypeError):
                raise ProbeError('INVALID_PROBE_RESPONSE') from None
            if not isinstance(checks, dict) or set(checks) != _CHECKS or any(value is not True for value in checks.values()):
                raise ProbeError('SANDBOX_PROBE_FAILED')
            return checks
    except ProbeError:
        raise
    except (OSError, PolicyError, subprocess.TimeoutExpired):
        raise ProbeError('SANDBOX_UNAVAILABLE') from None


if __name__ == '__main__':
    try:
        run_synthetic_probe()
    except ProbeError as exc:
        print('SYNTHETIC_PROBE_FAILED:', exc, file=sys.stderr)
        sys.exit(1)
    print('SYNTHETIC_PROBE_PASSED')
