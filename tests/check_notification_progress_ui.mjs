// TC484: real badge rendering/controller with synthetic DOM and network-free events.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const source = read('app/js/ui.js');
const badgeSource = section(source, 'let notificationRefreshVersion = 0;', '// --- AUTOCOMPLETE E INPUTS').replaceAll('export ', '');
const notificationSource = read('app/js/people-v2.js').replace(/^import .*;\n/gm, '').replaceAll('export ', '');
const node = () => ({ textContent: '', innerHTML: '', classList: { names: new Set(['hidden']), add(name) { this.names.add(name); }, remove(name) { this.names.delete(name); }, contains(name) { return this.names.has(name); } }, querySelectorAll() { return []; } });

test('delayed unread response cannot repaint a newer persisted read response', async () => {
    const pending = [], elements = new Map();
    const element = id => { if (!elements.has(id)) elements.set(id, node()); return elements.get(id); };
    const context = { document: { getElementById: element }, fetchNotifications: () => new Promise(resolve => pending.push(resolve)), formatDateTime: () => 'date', window: {} };
    vm.createContext(context); vm.runInContext(notificationSource + '\n' + badgeSource, context);
    const old = context.updateNotificationBadge(); const fresh = context.updateNotificationBadge();
    pending[1]([{ id: 'N1', taskId: 'T1', message: 'Mention', isRead: true }]); await fresh;
    assert.ok(element('notification-badge-orb').classList.contains('hidden'));
    assert.match(element('modal-notifications-list').innerHTML, /Lida/);
    const currentHTML = element('modal-notifications-list').innerHTML;
    pending[0]([{ id: 'N1', taskId: 'T1', message: 'Mention', isRead: false }]); await old;
    assert.equal(element('modal-notifications-list').innerHTML, currentHTML);
    assert.ok(element('notification-badge-orb').classList.contains('hidden'));
    const newest = context.updateNotificationBadge(); pending[2]([{ id: 'N2', taskId: 'T1', message: 'New stage', isRead: false }]); await newest;
    assert.equal(element('notification-badge-orb').classList.contains('hidden'), false);
    assert.match(element('modal-notifications-list').innerHTML, /Não lida/);
});

test('task update, connection/reconnection and focus request a notification refresh', async () => {
    const events = new Map(); let refreshes = 0, close, focus;
    const connection = { on(name, callback) { events.set(name, callback); }, onclose(callback) { close = callback; }, async start() {} };
    const context = { state: { tasks: [] }, document: { getElementById: () => null }, window: { addEventListener(name, callback) { assert.equal(name, 'focus'); focus = callback; } }, console: { log() {} }, updateNotificationBadge() { refreshes++; }, refreshProjectTaskCounts() {}, updateActiveView() {}, renderTaskHistory() {}, fetchTasks: async () => [], setTimeout() {}, signalR: { HubConnectionBuilder: class { withUrl() { return this; } build() { return connection; } } } };
    vm.createContext(context); vm.runInContext(read('app/js/signalr.js').replace(/^import .*;\n/gm, '').replaceAll('export ', ''), context);
    context.connectToSignalR(() => {}); await new Promise(setImmediate); assert.equal(refreshes, 1);
    events.get('taskUpdated')({ id: 'T1', status: 'done' }); assert.equal(refreshes, 2);
    await close(); assert.equal(refreshes, 3);
    focus(); assert.equal(refreshes, 4);
});

test('notification fetch explicitly bypasses HTTP cache', async () => {
    const calls = []; const context = { fetch: async (...args) => { calls.push(args); return { ok: true, json: async () => [] }; }, refreshProjectTaskCounts() {} };
    vm.createContext(context); vm.runInContext(read('app/js/api.js').replace(/^import .*;\n/gm, '').replaceAll('export ', ''), context);
    await context.fetchNotifications();
    assert.equal(calls[0][0], '/api/getNotifications'); assert.equal(calls[0][1].cache, 'no-store');
});

test('actual form, drag and publication paths carry the snapshot used by the user', () => {
    const main = read('app/js/main.js');
    const save = section(main, 'if (savingTaskId) {', '// Delete blobs only');
    assert.match(save, /expectedStatus: savingSnapshot\?\.status, expectedEtag: savingSnapshot\?\._etag/);
    assert.match(main, /status: newStatus, oldStatus: oldStatus, expectedStatus: oldStatus, expectedEtag: task\._etag/);
    assert.match(main, /status: 'done', progress: 100, expectedStatus: task.status, expectedEtag: task._etag/);
});

for (const newerEvent of [false, true]) test(`rejected drag rolls back only its own optimistic status; newer event=${newerEvent}`, async () => {
    const task = { id: 'T1', status: 'todo', _etag: 'v1', progress: 20 };
    const state = { tasks: [task], currentView: 'kanban' };
    const card = { dataset: { taskId: 'T1' }, classList: { remove() {} } };
    const list = (status, children) => ({ dataset: { columnId: status }, children, parentElement: { querySelector: () => ({ textContent: '1' }) } });
    const from = list('todo', []), to = list('inprogress', [card]);
    const rendered = [], toasts = []; let options;
    const context = { state, kanbanSortableInstances: [], document: { querySelectorAll: () => [from, to] }, Sortable: function (element, opts) { options = opts; this.destroy = () => {}; }, console: { error() {} }, ui: { renderKanbanView() { rendered.push(state.tasks[0].status); }, showToast(message) { toasts.push(message); } }, api: { async updateTask() { if (newerEvent) state.tasks[0] = { ...task, status: 'publication', _etag: 'event-v3' }; throw Object.assign(new Error('conflict'), { status: 409 }); }, async updateOrder() { assert.fail('no reorder after rejected transition'); } } };
    vm.createContext(context); vm.runInContext(section(read('app/js/main.js'), 'function updateDragAndDropState() {', '// Entry and orphan recovery'), context);
    context.updateDragAndDropState(); await options.onEnd({ item: card, from, to });
    assert.equal(state.tasks[0].status, newerEvent ? 'publication' : 'todo');
    assert.deepEqual(rendered, [newerEvent ? 'publication' : 'todo']);
    assert.match(toasts.at(-1), /Recarregue a página/);
});
