"""TC-480 local-only UI fixture; no API, authentication or production writes.
Run: python tests/serve_kanban_drop_area.py [port=8480]
Open http://127.0.0.1:8480/ (or /?baseline=1 for the original CSS).
The real entry markup, CSS, renderers and drag callback are reused. Only the
startup and persistence are replaced by synthetic data and sessionStorage.
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = '6300684d152253420b9279ecdba7e585b15af972'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/':
            html = (ROOT / 'app/index.html').read_text()
            html = re.sub(r'<script[^>]*type="module"[^>]*>.*?</script>', '', html, flags=re.S)
            html = html.replace('<head>', '<head><base href="/app/">')
            html = html.replace('<title>SyncBoard NT</title>', '<title>TC-480 isolated QA</title>')
            html = html.replace('</head>', '<style>#tc480-tools { position:fixed; top:0; left:0; z-index:3000; background:#fff; color:#172b4d; font:12px Arial; padding:5px; max-width:100vw; } #tc480-tools button { padding:5px; border:1px solid #888; margin:2px; }</style></head>')
            html = html.replace('</body>', '<section id="tc480-tools"><b>TC-480 fixture: no live data</b><button id="qa-reset">Reset</button><button id="qa-long">Long lane</button><button id="qa-empty">Empty all</button><button id="qa-filter">Toggle filter</button><button id="qa-theme">Theme</button><button id="qa-check">Check geometry</button><span id="qa-result">Loading…</span><div id="qa-events"></div></section><script type="module" src="/tests/fixtures/tc480/drop-area.mjs"></script></body>')
            if 'baseline=1' in self.path:
                html = re.sub(r'css/fidelity-v2.css\?v=[^\"]+', '/__tc480_baseline.css', html)
            return self.send_text(html, 'text/html')
        if path == '/__tc480_baseline.css':
            source = subprocess.check_output(['git', 'show', f'{BASE}:app/css/fidelity-v2.css'], cwd=ROOT).decode()
            return self.send_text(source, 'text/css')
        if path == '/__tc480_drag.mjs':
            source = (ROOT / 'app/js/main.js').read_text()
            start = source.index('function updateDragAndDropState() {')
            end = source.index('// Entry and orphan recovery', start)
            prefix = "const {state,api,ui,isFidelityV2,hasFidelityFilters,openHomologadorModal}=globalThis.tc480; let kanbanSortableInstances=[];\n"
            return self.send_text(prefix + source[start:end] + '\nexport {updateDragAndDropState};', 'text/javascript')
        if path.startswith(('/api/', '/.auth/')):
            self.send_error(403, 'Fixture has no live API or authentication')
            return
        super().do_GET()

    def send_text(self, text, content_type):
        raw = text.encode()
        self.send_response(200)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8480
    print(f'TC-480 isolated fixture: http://127.0.0.1:{port}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
