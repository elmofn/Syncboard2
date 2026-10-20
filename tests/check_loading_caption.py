"""TC497: show only the startup cube, retaining the screen-reader status."""
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]

class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.stack = []
        self.loader = None
        self.loader_nodes = []
        self.loader_text = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id') == 'loader-container':
            self.loader = attrs
        if self.stack or attrs.get('id') == 'loader-container':
            self.loader_nodes.append((tag, attrs))
            if tag not in {'img', 'source'}:
                self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1][0] == tag:
            self.stack.pop()

    def handle_data(self, data):
        if self.stack and data.strip():
            self.loader_text.append((data.strip(), self.stack[-1][1]))

for entry in ('index.html', 'ui-v2-fidelity-preview.html'):
    source = (ROOT / 'app' / entry).read_text()
    page = Page(source)
    assert page.loader['role'] == 'status', entry
    assert page.loader['aria-live'] == 'polite', entry
    assert 'fidelity-sr-only' not in page.loader.get('class', '').split(), entry
    assert len(page.loader_text) == 1, entry
    text, attrs = page.loader_text[0]
    assert text == 'Carregando SyncBOARD…', entry
    assert 'fidelity-sr-only' in attrs.get('class', '').split(), entry
    assert 'hidden' not in attrs and attrs.get('aria-hidden') != 'true', entry
    pictures = [a for tag, a in page.loader_nodes if tag == 'picture']
    assert len(pictures) == 1 and pictures[0].get('aria-hidden') == 'true', entry
    assert 'sb-cube--startup' in pictures[0]['class'].split(), entry
    animated = [a for tag, a in page.loader_nodes if tag == 'source']
    assert animated == [{'media': '(prefers-reduced-motion: no-preference)', 'srcset': 'assets/cube-assembly-128.gif'}], entry
    static = [a for tag, a in page.loader_nodes if tag == 'img']
    assert static == [{'src': 'assets/cube-static-512.png', 'alt': '', 'width': '128', 'height': '128'}], entry
    assert 'css/fidelity-v2.css?' in source, entry

# The existing visually-hidden utility must continue to hide only the copy,
# without removing the status from the accessibility tree or the cube from layout.
css = (ROOT / 'app/css/fidelity-v2.css').read_text()
rule = re.search(r'body\.sb-fidelity-v2\s+\.fidelity-sr-only\s*\{([^}]+)\}', css)
assert rule, 'Visually-hidden utility is required'
properties = dict(re.findall(r'([\w-]+)\s*:\s*([^;]+)', rule.group(1)))
for key, value in {'position': 'absolute', 'width': '1px', 'height': '1px', 'overflow': 'hidden', 'clip': 'rect(0, 0, 0, 0)'}.items():
    assert properties.get(key) == value, (key, properties)
assert properties.get('display') != 'none'
assert properties.get('visibility') != 'hidden'

assets = json.loads((ROOT / 'tests/fixtures/tc461-source.json').read_text())['assets']
for path, expected in assets.items():
    assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == expected, path
print('PASS TC497: both entrypoints show only the unchanged startup cube; loading copy remains screen-reader-only, motion preference and exact assets preserved.')
