"""Build and serve only a disposable browser fixture, never VYRON's native backend."""
import argparse
import functools
import contextlib
import http.server
import pathlib
import subprocess
import tempfile
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parents[1]

class FixtureHandler(http.server.SimpleHTTPRequestHandler):
    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'")
        super().end_headers()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prebuilt', action='store_true', help='serve packaged preview only')
    parser.add_argument('--no-browser', action='store_true', help='print loopback URL without opening a browser')
    args = parser.parse_args()
    context = contextlib.nullcontext(ROOT / 'preview') if args.prebuilt else tempfile.TemporaryDirectory(prefix='vyron-apex-browser-')
    with context as output:
        output = pathlib.Path(output)
        if not args.prebuilt:
            subprocess.run([str(ROOT / 'node_modules/.bin/vite'), 'build', '--config', 'vite.apex-interactive.config.ts', '--outDir', str(output)], cwd=ROOT, check=True)
        if not (output / 'apex-interactive.html').is_file():
            raise SystemExit('Packaged preview is missing')
        if output.is_symlink() or any(p.is_symlink() for p in output.rglob('*')):
            raise SystemExit('Symbolic links are forbidden in the preview package')
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(FixtureHandler, directory=str(output))) as server:
            url = f'http://127.0.0.1:{server.server_port}/apex-interactive.html'
            print('APEX_FIXTURE_ONLY:', url, flush=True)
            print('Ctrl+C: stop preview.', flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass

if __name__ == '__main__':
    main()
