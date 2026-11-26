"""Build and serve only a disposable browser fixture, never VYRON's native backend."""
import functools
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
    with tempfile.TemporaryDirectory(prefix='vyron-apex-browser-') as output:
        subprocess.run([str(ROOT / 'node_modules/.bin/vite'), 'build', '--config', 'vite.apex-interactive.config.ts', '--outDir', output], cwd=ROOT, check=True)
        with http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(FixtureHandler, directory=output)) as server:
            url = f'http://127.0.0.1:{server.server_port}/apex-interactive.html'
            print('APEX_FIXTURE_ONLY:', url, flush=True)
            print('Ctrl+C: stop preview and delete its temporary build.', flush=True)
            webbrowser.open(url)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass

if __name__ == '__main__':
    main()
