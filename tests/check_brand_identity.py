#!/usr/bin/env python3
"""TC496: approved logo, integration, accessible labels and workspace boundary."""
import base64
import hashlib
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/assets/brand-v2'
FIXTURE = json.loads((ROOT / 'tests/fixtures/tc496-brand-identity.json').read_text())
NS = {'s': 'http://www.w3.org/2000/svg'}
def sha(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()
def polygons(text):
    return ''.join(re.findall(r'<polygon\b[^>]*/>', text))
def groups(path):
    return ET.fromstring(path.read_text()).findall('s:g', NS)

for name, expected in FIXTURE['primary_assets'].items():
    assert sha((ASSETS / name).read_bytes()) == expected, f'Approved SVG drift: {name}'
for name, expected in FIXTURE['cube_geometry'].items():
    svg = ET.fromstring((ASSETS / name).read_text())
    assert sha(polygons((ASSETS / name).read_text())) == expected, f'Cube changed: {name}'
    assert svg.attrib['aria-label'] == 'SyncBOARD', name
    assert svg.find('s:title', NS).text == 'SyncBOARD', name
    assert not svg.findall('.//s:text', NS), f'Logo depends on installed font: {name}'
for variant, color in [('light', '#111827'), ('dark', '#F5F7FA')]:
    reference = groups(ASSETS / f'logo-primary-{variant}.svg')
    for prefix in ['logo-primary-', 'logo-primary-mono-']:
        path = ASSETS / f'{prefix}{variant}.svg'
        svg = ET.fromstring(path.read_text())
        lettering = groups(path)
        assert svg.attrib['viewBox'] == FIXTURE['viewBox'], path.name
        assert len(lettering) == 1, f'Retired suffix remains: {path.name}'
        assert len(lettering[0].findall('s:path', NS)) == len('SyncBOARD'), path.name
        assert ET.tostring(lettering[0]) == ET.tostring(reference[0]), path.name
        assert lettering[0].attrib['fill'] == color, path.name
assert not (ASSETS / 'nt-custom.svg').exists(), 'Retired suffix still in active brand kit'
manifest = json.loads((ASSETS / 'manifest.json').read_text())
assert manifest['wordmark'] == 'SyncBOARD'
assert set(manifest['assets']) == {p.name for p in ASSETS.iterdir() if p.is_file() and p.name != 'manifest.json'}
for name, expected in manifest['assets'].items():
    assert sha((ASSETS / name).read_bytes()) == expected, f'Manifest drift: {name}'

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.images = []
        self.ids = []
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs: self.ids.append(attrs['id'])
        if tag == 'img': self.images.append(attrs)

legacy = re.compile(r'Sync[Bb]oard(?:\s*NT)?')
for path in (ROOT / 'app').glob('*.html'):
    text = path.read_text()
    page = Page(text)
    assert len(page.ids) == len(set(page.ids)), f'Duplicate ID: {path.name}'
    for attrs in page.images:
        source = attrs.get('src', '')
        brand = attrs.get('data-brand-source', source)
        if 'logo-primary-' in brand:
            assert attrs.get('alt', '').startswith('SyncBOARD'), (path.name, brand)
            assert abs(int(attrs['width']) / int(attrs['height']) - 413.617 / 96) < .05, (path.name, brand)
            if source.startswith('data:'):
                assert base64.b64decode(source.split(',', 1)[1]) == (ASSETS / brand).read_bytes()
            else:
                assert (ROOT / 'app' / source).is_file(), (path.name, source)
    # Context names are explicitly out of scope: preserve the exact existing blocks.
    if path.name == 'index.html':
        start = text.index('      <!-- Current single-workspace context.')
        end = text.index('      <nav id="view-switcher-orb"', start)
        context = text[start:end]
        assert sha(context) == FIXTURE['workspace_context']['index.html']
        text = text[:start] + text[end:]
    elif path.name == 'ui-v2-fidelity-preview.html':
        context = re.search(r'^.*<div class="fidelity-workspace">.*$', text, re.M).group()
        assert sha(context) == FIXTURE['workspace_context']['ui-v2-fidelity-preview.html']
        text = text.replace(context, '')
    assert not legacy.search(text), f'Old product branding in {path.name}'
for path in (ROOT / 'app/js').glob('*.js'):
    assert not legacy.search(path.read_text()), f'Old runtime branding: {path.name}'

css = (ROOT / 'app/css/login-v2.css').read_text()
assert '.sb-login-logo { width: 222px; height: auto;' in css
assert '.sb-login-mobile-brand { display: block; width: 176px; height: auto;' in css
subprocess.run(['python', 'scripts/embed_login_assets.py', '--check'], cwd=ROOT, check=True, capture_output=True)
print(json.dumps({'status': 'passed', 'checks': [
    'Primary light/dark SVGs byte-identical to the approved TC496 proposal',
    'All four lockups have nine outlined glyphs and no NT suffix',
    'All twelve cube geometries preserved, including monochrome and favicon',
    'All current asset hashes and accessible SVG names match',
    'Desktop, mobile, preview and embedded public-login logos use SyncBOARD',
    'Exact workspace context names/initials preserved outside TC496 scope',
    'Login logo sizing preserves intrinsic aspect ratio and embedded assets are reproducible'
], 'limits': 'Static/structural verification only; browser rendering and authenticated production flows are separate.'}, indent=2))
