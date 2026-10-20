// TC-480: source contracts for the full-lane drop target. No network or mutations.
// Browser geometry/drag checks live in fixtures/tc480/drop-area.html.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const css = read('app/css/fidelity-v2.css');
const rule = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp('(?:^|\\n)' + escaped + '\\s*\\{([^}]*)\\}', 'g'))];
  assert.ok(matches.length, 'Missing layout rule: ' + selector);
  return Object.fromEntries(matches.flatMap(match => match[1].split(';')).filter(text => text.includes(':')).map(text => text.trim().split(/:\s*(.*)/s).slice(0, 2)));
};
const main = rule("body.sb-fidelity-v2[data-fidelity-view='kanban'] #main-content");
assert.equal(main.display, 'flex', 'The board must receive the remaining visible canvas height');
assert.equal(main['flex-direction'], 'column');
assert.equal(main['align-items'], 'stretch');
assert.equal(main.gap, '0', 'Legacy immersive canvas gap must not change the existing page spacing');
assert.equal(rule("body.sb-fidelity-v2[data-fidelity-view='kanban'] #main-content > *").flex, '0 0 auto', 'Headers and controls must not shrink on short/mobile viewports');
assert.equal(rule("body.sb-fidelity-v2[data-fidelity-view='kanban'] #kanbanView").flex, '1 0 auto', 'A short board fills the canvas but a tall board may overflow without clipping cards');
const board = rule('body.sb-fidelity-v2 #kanbanView');
assert.equal(board['align-items'], 'stretch', 'All columns must reach the bottom, including short and empty lanes');
assert.equal(board['overflow-x'], 'auto', 'Keep horizontal scrolling at narrow widths');
assert.equal(rule('body.sb-fidelity-v2 #kanbanView .board-column')['grid-template-rows'], 'max-content minmax(104px, 1fr)', 'Header stays at the top; the Sortable row absorbs all remaining lane height');
assert.equal(rule('body.sb-fidelity-v2 #kanbanView .kanban-task-list')['grid-row'], '2');
assert.equal(rule('body.sb-fidelity-v2 #kanbanView .sb-kanban-empty')['pointer-events'], 'none', 'The empty-state overlay must not intercept drops');
assert.match(read('app/js/fidelity-v2.js'), /document\.body\.dataset\.fidelityView = state\.currentView/);
assert.match(read('app/js/main.js'), /document\.querySelectorAll\('\.kanban-task-list'\)/);
for (const path of ['app/index.html', 'app/ui-v2-fidelity-preview.html']) {
  assert.match(read(path), /css\/fidelity-v2\.css\?v=tc480-drop-area-1/);
}
console.log('PASS TC-480 full-lane CSS/source contracts. These checks do not prove browser geometry or live API persistence.');
