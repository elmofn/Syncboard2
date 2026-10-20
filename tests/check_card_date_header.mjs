// TC503: presentation-only date relocation, using the actual card renderers.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const source = read('app/js/ui.js');
const helper = read('app/js/fidelity-v2.js');
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const {renderAssignmentTrail} = await import('data:text/javascript;base64,' + Buffer.from(read('app/js/task-provenance.js')).toString('base64'));
const {canDecideHomologation} = await import('data:text/javascript;base64,' + Buffer.from(read('app/js/homologation-v2.js')).toString('base64'));
const calls = [];
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.dataset = {}; this.attrs = {}; this.style = {}; this.listeners = {}; this.matches = {}; this.innerHTML = ''; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  querySelector(selector) {
    if (this.matches[selector]) return this.matches[selector];
    const match = this.innerHTML.match(new RegExp('<([a-z]+)([^>]*class="[^\"]*\\b' + selector.slice(1) + '\\b[^>]*?)>'));
    if (!match) return null;
    return this.matches[selector] = new Element(match[1]);
  }
}
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-15T12:00:00Z'])); } }
const context = {
  document: {createElement: tag => new Element(tag)},
  state: {currentUser: {userDetails: 'reviewer@example.invalid', userRoles: ['travelcash_user']}, users: []},
  isFidelityV2: () => true, renderAssignmentTrail, canDecideHomologation,
  renderTaskAttentionBadge: () => '<span class="sb-task-attention-badge">ATENÇÃO</span>',
  renderTaskHistory: id => calls.push(['details', id]),
  openProgressUpdateModal: task => calls.push(['progress', task.id]),
  showDestructiveConfirmModal: (...args) => calls.push(['delete-confirm', ...args]),
  Date: FixedDate
};
vm.createContext(context);
vm.runInContext(helper.slice(helper.indexOf('export function renderFidelityCardMarkup')).replace('export ', '') + '\n' +
  section(source, 'export const formatDate =', '// --- EFEITO VISUAL').replaceAll('export const', 'const') + '\n' +
  section(source, 'export const createTaskElement =', '// --- LOGICA DE FILTRO ---').replace('export const', 'const') +
  '\nglobalThis.makeCard = createTaskElement;', context);

const person = {name: 'Ana Exemplo', email: 'ana@example.invalid'};
const common = {id: 'TC-503-QA', title: 'Título <seguro> & completo', status: 'inprogress', priority: 'Média',
  responsible: [person], requester: person, createdAt: '2026-10-01T12:00:00Z',
  assignmentHistory: [{at: '2026-10-01T12:00:00Z', from: [], to: [person]}], comments: [{}, {}]};
const cases = [
  [{dueDate: '2026-10-21'}, '21 de out', '21/10/2026', false],
  [{dueDate: '2026-10-15'}, '15 de out', '15/10/2026', false],
  [{dueDate: '2026-10-14'}, '14 de out', 'Atrasada · 14/10/2026', true],
  [{dueDate: null}, 'Sem prazo', 'Sem prazo', false],
  [{dueDate: ''}, 'Sem prazo', 'Sem prazo', false],
  [{dueDate: 'invalid'}, 'Sem prazo', 'Sem prazo', false],
  [{dueDate: '2026-10-21T23:30:00-03:00'}, '22 de out', '22/10/2026', false],
  [{dueDate: '2026-10-14', status: 'todo'}, '14 de out', '14/10/2026', false],
  [{dueDate: '2026-10-14', status: 'publication'}, '14 de out', '14/10/2026', false],
  [{dueDate: '2026-10-14', status: 'done'}, '14 de out', '14/10/2026', false],
  [{dueDate: '2026-10-14', status: 'stopped'}, '14 de out', 'Atrasada · 14/10/2026', true],
  [{dueDate: '2026-10-14', status: 'homologation', homologador: {email: 'reviewer@example.invalid'}}, '14 de out', 'Atrasada · 14/10/2026', true]
];
for (const [change, label, fullDate, overdue] of cases) {
  const task = {...common, ...change};
  const before = JSON.stringify(task);
  const card = context.makeCard(task);
  const html = card.innerHTML;
  const header = html.slice(0, html.indexOf('<div class="task-body">'));
  const footer = html.slice(html.indexOf('<div class="sb-kanban-metadata">'));
  assert.equal((html.match(/class="sb-kanban-date(?: |")/g) || []).length, 1);
  assert.match(header, /sb-kanban-priority[^]*<\/span><span class="sb-kanban-date/);
  assert.ok(header.indexOf('sb-kanban-date') < header.indexOf('<details class="fidelity-card-menu">'));
  assert.ok(header.includes(`title="${fullDate}"`));
  assert.ok(header.includes(`>${label}</span>`) || header.includes(`</span>${label}</span>`));
  assert.equal(header.includes('sb-kanban-date--overdue'), overdue);
  assert.equal(header.includes('calendar-clock'), overdue);
  assert.equal(header.includes('Atrasada: '), overdue);
  assert.doesNotMatch(footer, /sb-kanban-date|<span aria-hidden="true">·<\/span>/);
  assert.ok(footer.includes(renderAssignmentTrail(task, [])), 'Trail is preserved exactly');
  assert.match(footer, /title="2 comentários"/);
  assert.match(html, /Título &lt;seguro&gt; &amp; completo/);
  assert.equal(JSON.stringify(task), before);
  assert.equal(card.dataset.taskId, task.id);
  assert.equal(card.dataset.status, task.status);
  for (let repeat = 0; repeat < 2; repeat++) card.querySelector('.expand-btn').listeners.click({stopPropagation() {}});
  card.querySelector('.progress-update-btn').listeners.click({stopPropagation() {}});
  card.querySelector('.delete-task-btn').listeners.click({stopPropagation() {}});
  assert.equal(Boolean(card.querySelector('.approve-btn')), task.status === 'homologation');
  assert.equal(Boolean(card.querySelector('.publish-btn')), task.status === 'publication');
}
assert.equal(calls.filter(call => call[0] === 'details').length, cases.length * 2);
assert.equal(calls.filter(call => call[0] === 'progress').length, cases.length);
assert.equal(calls.filter(call => call[0] === 'delete-confirm').length, cases.length);
for (const priority of ['Baixa', 'Média', 'Alta', 'Urgente', null, '<script>']) {
  const card = context.makeCard({...common, priority, pendingAlerts: ['Ana Exemplo']});
  assert.equal((card.innerHTML.match(/sb-task-attention-badge/g) || []).length, 1);
  assert.equal(card.innerHTML.includes('fidelity-priority-high'), ['Alta', 'Urgente'].includes(priority));
  assert.doesNotMatch(card.innerHTML, /<script>/);
}
const css = read('app/css/fidelity-v2.css');
assert.match(css, /\.sb-kanban-card-head\s*\{[^}]*flex-wrap:\s*wrap/);
assert.match(css, /\.fidelity-card-head-end\s*\{[^}]*max-width:\s*100%[^}]*flex-wrap:\s*wrap/);
console.log('PASS TC503: 12 date/status cases, 6 priority/attention cases, UTC labels, overdue accessibility, unique date in header, unchanged timeline/comments, data purity and repeated existing callbacks. Layout requires browser QA.');
