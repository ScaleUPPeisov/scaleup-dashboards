"""Launch a signed synthetic fixture through LaunchServices, never production VYRON."""
import pathlib
import subprocess
import sys

app = pathlib.Path(sys.argv[1]).resolve()
evidence = pathlib.Path(sys.argv[2]).resolve()
evidence.mkdir(parents=True, exist_ok=True)
assert app.name == 'VYRON APEX Fixture.app'
def run(name, args, marker):
    stdout, stderr = evidence / (name + '.stdout.txt'), evidence / (name + '.stderr.txt')
    stdout.touch(); stderr.touch()
    command = ['/usr/bin/open', '-n', '-W', '-a', str(app), '--stdout', str(stdout), '--stderr', str(stderr), '--args', '--self-test', *args]
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=105)
        print('LaunchServices', name, proc.returncode, proc.stdout, proc.stderr)
    except subprocess.TimeoutExpired:
        print('LaunchServices timeout', name)
        return False
    out, err = stdout.read_text(errors='replace'), stderr.read_text(errors='replace')
    print(out, err)
    return proc.returncode == 0 and marker in out and 'WEB_PROCESS_TERMINATED' not in out
basic = run('basic', ['--basic-test'], 'BASIC_WEBKIT=PASS')
full = run('routes', [], 'NATIVE_FIXTURE_ROUTES=21/21')
print('BASIC_PASS', basic, 'ROUTES_PASS', full)
sys.exit(0 if basic and full else 1)
