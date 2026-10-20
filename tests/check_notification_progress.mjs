// TC484: execute the actual handlers with an in-memory Cosmos boundary.
// No credentials, network, browser, real notifications or production writes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const plain = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const recipient = 'mentioned@example.test';
const reviewer = 'reviewer@example.test';
const actor = 'author@example.test';
const base = { id: 'TC-484-fixture', title: 'Only a fixture', status: 'inprogress', _etag: 'task-v1', history: [], comments: [], responsible: [{ email: actor, name: 'Author' }] };
const mention = `<span class="mention-tag" data-email="${recipient}">@Mentioned</span> Please check`;

function fixture(initial = base) {
    let stored = plain(initial), taskVersion = 1, notificationVersion = 0, uuid = 0;
    let now = '2026-10-12T10:00:00.000Z';
    let afterTaskCommit, beforeNotificationPatch, afterNotificationCreate, failTaskWrite = false, failNotificationQuery = false, failNotificationPatch = false, taskReadOverride;
    const notices = [], notificationWrites = [], taskWrites = [], errors = [];
    const profiles = [recipient, reviewer, actor].map(email => ({ email, name: email, _etag: 'user-v1' }));
    const clock = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).valueOf(); } };
    const tasks = { item(id, partition) {
        if (id === 'taskCounter') return { async patch() { return { resource: { currentId: 484 } }; } };
        assert.equal(id, base.id); assert.equal(partition, base.id);
        return {
            async read() { return { resource: plain(taskReadOverride || stored) }; },
            async replace(value, options) {
                if (failTaskWrite) throw Object.assign(new Error('injected conflict'), { code: 412 });
                assert.equal(options?.accessCondition?.type, 'IfMatch');
                if (options.accessCondition.condition !== stored._etag) throw Object.assign(new Error('stale'), { code: 412 });
                stored = { ...plain(value), _etag: `task-v${++taskVersion}` };
                const committed = plain(stored);
                taskWrites.push(committed);
                if (afterTaskCommit) { const hook = afterTaskCommit; afterTaskCommit = null; await hook(committed); }
                return { resource: committed };
            }
        };
    }, items: { async create(value) { stored = { ...plain(value), _etag: 'created-v1' }; return { resource: plain(stored) }; }, async bulk(operations) {
        for (const op of operations) {
            assert.equal(op.id, base.id);
            assert.equal(op.resourceBody.operations[0].path, '/order');
            stored.order = op.resourceBody.operations[0].value;
        }
        return [];
    } } };
    const users = { item(email) { return {
        async read() { return { resource: plain(profiles.find(p => p.email === email)) }; },
        async replace(profile, options) {
            const current = profiles.find(p => p.email === email);
            assert.equal(options.accessCondition.condition, current._etag);
            Object.assign(current, plain(profile), { _etag: current._etag + 'x' });
            return { resource: plain(current) };
        }
    }; }, items: {
        readAll() { return { async fetchAll() { return { resources: plain(profiles) }; } }; },
        query(spec) { return { async fetchAll() { return { resources: plain(profiles.filter(p => p.email === spec.parameters[0].value)) }; } }; }
    } };
    const notifications = { items: {
        async create(value) {
            const record = { ...plain(value), id: value.id || `notice-${++uuid}`, _etag: `notice-v${++notificationVersion}` };
            notices.push(record); notificationWrites.push({ operation: 'create', record: plain(record) });
            if (afterNotificationCreate) { const hook = afterNotificationCreate; afterNotificationCreate = null; await hook(record); }
            return { resource: plain(record) };
        },
        query(spec) {
            return { async fetchAll() {
                if (failNotificationQuery) throw Object.assign(new Error('query unavailable'), { code: 503 });
                const parameters = Object.fromEntries((spec.parameters || []).map(p => [p.name, p.value]));
                if ('@includeLegacy' in parameters) {
                    assert.equal(spec.query, 'SELECT * FROM c WHERE c.taskId = @taskId AND c.isRead = false AND ((IS_NUMBER(c.taskStageVersion) AND c.taskStageVersion >= 0 AND c.taskStageVersion <= @through) OR (@includeLegacy = true AND NOT IS_DEFINED(c.taskStageVersion) AND NOT IS_DEFINED(c.type) AND c.message = @reviewMessage))');
                    assert.equal(parameters['@reviewMessage'], 'Homologação Pendente');
                    assert.equal(typeof parameters['@includeLegacy'], 'boolean');
                }
                return { resources: plain(notices.filter(n =>
                    (!('@email' in parameters) || n.targetUserEmail === parameters['@email']) &&
                    (!('@taskId' in parameters) || n.taskId === parameters['@taskId']) &&
                    (!spec.query.includes('c.isRead = false') || n.isRead === false) &&
                    (!('@through' in parameters) ||
                        (typeof n.taskStageVersion === 'number' && n.taskStageVersion >= 0 && n.taskStageVersion <= parameters['@through']) ||
                        (parameters['@includeLegacy'] === true && !Object.hasOwn(n, 'taskStageVersion') && !Object.hasOwn(n, 'type') && n.message === parameters['@reviewMessage']))
                )) };
            } };
        }
    }, item(id, email) { return {
        async read() { return { resource: plain(notices.find(n => n.id === id && n.targetUserEmail === email)) }; },
        async patch(operations, options) {
            if (failNotificationPatch) throw Object.assign(new Error('patch unavailable'), { code: 503 });
            if (beforeNotificationPatch) { const hook = beforeNotificationPatch; beforeNotificationPatch = null; await hook(); }
            const index = notices.findIndex(n => n.id === id && n.targetUserEmail === email);
            if (index < 0) throw Object.assign(new Error('missing'), { code: 404 });
            assert.deepEqual(plain(operations.operations), [{ op: 'set', path: '/isRead', value: true }]);
            const current = notices[index];
            const originCondition = Object.hasOwn(current, 'taskStageVersion')
                ? `c.taskStageVersion = ${current.taskStageVersion}`
                : `NOT IS_DEFINED(c.taskStageVersion) AND NOT IS_DEFINED(c.type) AND c.message = ${JSON.stringify(current.message)} AND c.commentPreview = ${JSON.stringify(current.commentPreview)}`;
            // Assert the complete service-side predicate, not only the IfMatch option.
            assert.equal(operations.condition, `from c where c._etag = ${JSON.stringify(options.accessCondition.condition)} AND c.taskId = ${JSON.stringify(base.id)} AND ${originCondition} AND c.isRead = false`);
            assert.equal(options.accessCondition.type, 'IfMatch');
            if (options.accessCondition.condition !== notices[index]._etag) throw Object.assign(new Error('stale'), { code: 412 });
            notices[index].isRead = true;
            notices[index]._etag = `notice-v${++notificationVersion}`;
            notificationWrites.push({ operation: 'patch', record: plain(notices[index]) });
            return { resource: plain(notices[index]) };
        },
        async replace(value, options) {
            const index = notices.findIndex(n => n.id === id && n.targetUserEmail === email);
            if (index < 0) throw Object.assign(new Error('missing'), { code: 404 });
            if (options?.accessCondition && options.accessCondition.condition !== notices[index]._etag) throw Object.assign(new Error('stale'), { code: 412 });
            notices[index] = { ...plain(value), _etag: `notice-v${++notificationVersion}` };
            notificationWrites.push({ operation: 'replace', record: plain(notices[index]) });
            return { resource: plain(notices[index]) };
        }
    }; } };
    const database = { container(name) { return { Tasks: tasks, Users: users, Notifications: notifications }[name]; }, containers: { async createIfNotExists() {} } };
    const handlers = new Map();
    function handler(name) {
        if (!handlers.has(name)) {
            const module = { exports: {} };
            vm.runInNewContext(readFileSync(new URL(`../api/${name}/index.js`, import.meta.url), 'utf8'), {
                module, Buffer, Date: clock, console, process: { env: {} },
                require(path) {
                    if (path === '@azure/cosmos') return { CosmosClient: class { database() { return database; } } };
                    if (path === 'axios') return { async post() { throw new Error('No external side effects permitted'); } };
                    if (path === 'crypto') return { randomUUID: () => `uuid-${++uuid}` };
                    if (path === 'uuid') return { v4: () => `uuid-${++uuid}` };
                    if (path.startsWith('../shared/')) return require(`../api/shared/${path.split('/').at(-1)}.js`);
                    throw new Error(`Unmocked dependency: ${path}`);
                }
            });
            handlers.set(name, module.exports);
        }
        return handlers.get(name);
    }
    async function call(name, body, user = actor) {
        const log = () => {}; log.warn = message => errors.push(message); log.error = message => errors.push(message);
        const context = { bindingData: { id: base.id }, bindings: {}, log };
        await handler(name)(context, { body, headers: { 'x-ms-client-principal': Buffer.from(JSON.stringify({ userDetails: user, userId: user, userRoles: ['travelcash_user'] })).toString('base64') } });
        return plain(context);
    }
    const update = patch => call('updateTask', { expectedStatus: stored.status, expectedEtag: stored._etag, ...patch });
    return { call, update, notices, notificationWrites, taskWrites, errors,
        get task() { return plain(stored); },
        set now(value) { now = value; },
        set afterTaskCommit(hook) { afterTaskCommit = hook; },
        set failTaskWrite(value) { failTaskWrite = value; },
        set failNotificationQuery(value) { failNotificationQuery = value; },
        set failNotificationPatch(value) { failNotificationPatch = value; },
        set beforeNotificationPatch(hook) { beforeNotificationPatch = hook; },
        set afterNotificationCreate(hook) { afterNotificationCreate = hook; },
        set taskReadOverride(value) { taskReadOverride = value; }
    };
}

async function addMention(f) {
    const response = await f.call('addComment', { text: mention });
    assert.equal(response.res.status, undefined, JSON.stringify(f.errors));
    return f.notices.findLast(n => n.type === 'mention');
}

test('progress: entering homologation reads the prior mention, preserving the new reviewer notice', async () => {
    const f = fixture(); const oldNotice = await addMention(f);
    f.now = '2026-10-12T10:01:00.000Z';
    const response = await f.update({ status: 'homologation', homologador: { email: reviewer } });
    assert.equal(response.res.status, undefined, JSON.stringify(f.errors));
    assert.equal(f.task.status, 'homologation');
    assert.equal(f.notices.find(n => n.id === oldNotice.id).isRead, true, 'prior-stage mention must become read');
    assert.equal(f.notices.find(n => n.message === 'Homologação Pendente').isRead, false);
    assert.equal(f.notices.length, 2, 'preserve records, never delete');
});

test('completion/archive: done reads an earlier-stage mention', async () => {
    const f = fixture({ ...base, status: 'publication' }); const notice = await addMention(f);
    const response = await f.update({ status: 'done', progress: 100 });
    assert.equal(response.res.status, undefined);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, true, 'archiving must read prior-stage mention');
    assert.equal(f.notices.length, 1);
});

test('late creation: a committed old-stage comment can emit its notification after the advance', async () => {
    const f = fixture();
    f.afterTaskCommit = async () => {
        f.now = '2026-10-12T10:01:00.000Z';
        assert.equal((await f.update({ status: 'homologation', homologador: { email: reviewer } })).res.status, undefined);
        f.now = '2026-10-12T10:02:00.000Z';
    };
    const notice = await addMention(f);
    assert.equal(f.task.status, 'homologation');
    assert.ok(f.task.comments[0].timestamp < f.task.history.at(-1).timestamp);
    assert.ok(notice.createdAt > f.task.history.at(-1).timestamp, 'notification timestamp does not identify its source stage');
    assert.equal(notice.isRead, true, 'late old-stage notification must not resurrect unread state');
});

for (const status of ['stopped', 'todo', 'inprogress']) test(`non-progress: ${base.status} → ${status} preserves unread mentions`, async () => {
    const f = fixture(); const notice = await addMention(f);
    assert.equal((await f.update({ status })).res.status, undefined);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
});

test('reorder only preserves unread mentions and task stage', async () => {
    const f = fixture(); const notice = await addMention(f);
    assert.equal((await f.call('updateOrder', [{ id: base.id, order: 14 }])).res.status, 200);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
    assert.equal(f.task.status, base.status);
});

test('failed task write emits no notification or auto-read', async () => {
    const f = fixture(); const notice = await addMention(f);
    f.failTaskWrite = true;
    assert.equal((await f.update({ status: 'done' })).res.status, 409);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
    assert.equal(f.notices.length, 1);
});

// Both paths are valid today, but stopped has no remembered origin field.
// They intentionally assert existing history differences, not an assumed progress rule.
for (const origin of ['inprogress', 'publication']) test(`stopped context: ${origin} → stopped → homologation records the origin only in presentation history`, async () => {
    const f = fixture({ ...base, status: 'todo' });
    assert.equal((await f.update({ status: origin })).res.status, undefined);
    await addMention(f);
    assert.equal((await f.update({ status: 'stopped' })).res.status, undefined);
    assert.equal((await f.update({ status: 'homologation', homologador: { email: reviewer } })).res.status, undefined);
    assert.equal(f.task.status, 'homologation');
    assert.ok(f.task.history[0].description.includes(origin === 'inprogress' ? 'Andamento' : 'Publicação'));
    assert.equal(f.task.history[0].fromStatus, undefined);
    assert.equal(f.task.history[0].toStatus, undefined);
});

test('task creation initializes server-owned stage metadata and ignores spoofed values', async () => {
    const f = fixture();
    const result = await f.call('createTask', { title: 'fixture', description: 'fixture', responsible: [{ email: actor }], notificationStageVersion: 400, notificationsReadThroughStage: 399 });
    assert.equal(result.res.status, undefined);
    assert.equal(f.task.notificationStageVersion, 0);
    assert.equal(f.task.notificationsReadThroughStage, -1);
});

test('same-stage saves cannot forge or reset stage metadata', async () => {
    const f = fixture(); await addMention(f);
    await f.update({ status: 'publication' });
    const old = f.task;
    assert.equal((await f.update({ ...old, title: 'renamed', notificationStageVersion: 42, notificationsReadThroughStage: 41 })).res.status, undefined);
    assert.equal(f.task.notificationStageVersion, old.notificationStageVersion);
    assert.equal(f.task.notificationsReadThroughStage, old.notificationsReadThroughStage);
});

test('scope: every legitimate earlier recipient is reconciled; another task, current stage, and legacy are retained', async () => {
    const f = fixture(); const first = await addMention(f);
    f.notices.push({ ...plain(first), id: 'second-recipient', targetUserEmail: reviewer });
    f.notices.push({ ...plain(first), id: 'different-task', taskId: 'OTHER-TASK' });
    const legacy = { ...plain(first), id: 'legacy' }; delete legacy.taskStageVersion; f.notices.push(legacy);
    f.notices.push({ ...plain(first), id: 'already-read', isRead: true, commentPreview: 'preserve this text' });
    assert.equal((await f.update({ status: 'publication' })).res.status, undefined);
    const current = await addMention(f);
    for (const id of [first.id, 'second-recipient', 'already-read']) assert.equal(f.notices.find(n => n.id === id).isRead, true, id);
    for (const id of ['different-task', 'legacy', current.id]) assert.equal(f.notices.find(n => n.id === id).isRead, false, id);
    assert.equal(f.notices.find(n => n.id === 'already-read').commentPreview, 'preserve this text');
    assert.equal(f.notices.length, 6);
    assert.equal(f.notificationWrites.filter(w => w.operation === 'patch').length, 2);
});

for (const action of ['reject', 'forward']) test(`homologation ${action} preserves its unread reviewer notification`, async () => {
    const f = fixture(); await f.update({ status: 'homologation', homologador: { email: reviewer } });
    const reviewerNotice = f.notices[0];
    const response = await f.call('updateTask', { homologationAction: action, expectedStatus: 'homologation', expectedEtag: f.task._etag, newResponsibleEmail: recipient, forwardInstructions: 'Etapa 2' }, reviewer);
    assert.equal(response.res.status, undefined, JSON.stringify(f.errors));
    assert.equal(f.notices.find(n => n.id === reviewerNotice.id).isRead, false);
    assert.equal(f.task.notificationStageVersion, 2);
    assert.equal(f.task.notificationsReadThroughStage, 0);
    assert.equal((await f.update({ status: 'homologation', homologador: { email: reviewer } })).res.status, undefined);
    assert.equal(f.notices.find(n => n.id === reviewerNotice.id).isRead, true);
    assert.equal(f.notices.at(-1).isRead, false, 'the new homologation cycle stays unread');
    assert.equal(f.task.notificationStageVersion, 3);
    assert.equal(f.task.notificationsReadThroughStage, 2);
});

test('homologation approval supersedes its reviewer notice; publication mentions remain unread until done', async () => {
    const f = fixture(); await f.update({ status: 'homologation', homologador: { email: reviewer } });
    const reviewerNotice = f.notices[0];
    assert.equal((await f.call('updateTask', { homologationAction: 'approve', expectedStatus: 'homologation', expectedEtag: f.task._etag }, reviewer)).res.status, undefined);
    assert.equal(f.notices.find(n => n.id === reviewerNotice.id).isRead, true);
    const publicationNotice = await addMention(f);
    assert.equal(publicationNotice.isRead, false);
    assert.equal((await f.update({ status: 'done' })).res.status, undefined);
    assert.equal(f.notices.find(n => n.id === publicationNotice.id).isRead, true);
});

test('done restores to a fresh stage without clearing notices created in done', async () => {
    const f = fixture(); await f.update({ status: 'done' });
    const notice = await addMention(f); const previous = f.task;
    assert.equal((await f.update({ status: 'inprogress' })).res.status, undefined);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
    assert.equal(f.task.notificationStageVersion, previous.notificationStageVersion + 1);
    assert.equal(f.task.notificationsReadThroughStage, previous.notificationsReadThroughStage);
});

test('stopped → done is explicit completion and reads versioned notices', async () => {
    const f = fixture({ ...base, status: 'stopped' }); const notice = await addMention(f);
    assert.equal((await f.update({ status: 'done' })).res.status, undefined);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, true);
});

test('stopped → homologation has no inferred progress, including a stopped-stage mention', async () => {
    const f = fixture(); const before = await addMention(f);
    await f.update({ status: 'stopped' }); const stopped = await addMention(f);
    await f.update({ status: 'homologation', homologador: { email: reviewer } });
    assert.equal(f.notices.find(n => n.id === before.id).isRead, false);
    assert.equal(f.notices.find(n => n.id === stopped.id).isRead, false);
    assert.equal(f.notices.at(-1).isRead, false);
});

for (const failure of ['query', 'patch']) test(`partial ${failure} failure preserves a durable watermark and retries on recipient fetch`, async () => {
    const f = fixture(); const notice = await addMention(f);
    if (failure === 'query') f.failNotificationQuery = true; else f.failNotificationPatch = true;
    const response = await f.update({ status: 'publication' });
    assert.equal(response.res.status, undefined, 'the task is already committed, never invite a duplicate transition');
    assert.equal(f.task.notificationStageVersion, 1); assert.equal(f.task.notificationsReadThroughStage, 0);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
    assert.ok(f.errors.some(e => e.includes('Reconciliação')));
    f.failNotificationQuery = false; f.failNotificationPatch = false;
    const fetched = await f.call('getNotifications', undefined, recipient);
    assert.equal(fetched.res.status, undefined);
    assert.equal(fetched.res.body.find(n => n.id === notice.id).isRead, true);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, true);
    assert.equal(fetched.res.headers['Cache-Control'], 'no-store');
});

test('failed reconciliation never reports a persisted read that did not happen', async () => {
    const f = fixture(); const notice = await addMention(f); f.failNotificationPatch = true;
    await f.update({ status: 'done' });
    const fetched = await f.call('getNotifications', undefined, recipient);
    assert.equal(fetched.res.body.find(n => n.id === notice.id).isRead, false);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
});

for (const manualRead of [false, true]) test(`notification ETag conflict preserves concurrent content and manual read=${manualRead}`, async () => {
    const f = fixture(); const notice = await addMention(f);
    f.beforeNotificationPatch = () => {
        const stored = f.notices.find(n => n.id === notice.id);
        stored.commentPreview = 'changed concurrently'; stored.isRead = manualRead; stored._etag = 'concurrent-etag';
    };
    assert.equal((await f.update({ status: 'done' })).res.status, undefined);
    const stored = f.notices.find(n => n.id === notice.id);
    assert.equal(stored.isRead, true); assert.equal(stored.commentPreview, 'changed concurrently');
    assert.equal(f.notificationWrites.filter(w => w.operation === 'patch').length, manualRead ? 0 : 1);
});

test('recipient fetch reconciles only that recipient partition, not another user', async () => {
    const f = fixture(); const notice = await addMention(f);
    f.notices.push({ ...plain(notice), id: 'other-recipient', targetUserEmail: reviewer });
    f.failNotificationPatch = true; await f.update({ status: 'done' }); f.failNotificationPatch = false;
    const fetched = await f.call('getNotifications', undefined, recipient);
    assert.equal(fetched.res.body.length, 1); assert.equal(fetched.res.body[0].isRead, true);
    assert.equal(f.notices.find(n => n.id === 'other-recipient').isRead, false);
});

test('post-create check closes an advance racing the notification insertion', async () => {
    const f = fixture(); f.afterNotificationCreate = () => f.update({ status: 'done' });
    const notice = await addMention(f); assert.equal(notice.isRead, true); assert.equal(f.task.status, 'done');
});

test('a stale task read after a delayed create is repaired by a later recipient fetch', async () => {
    const f = fixture();
    f.afterTaskCommit = async source => { await f.update({ status: 'done' }); f.taskReadOverride = source; };
    const notice = await addMention(f); assert.equal(notice.isRead, false, 'injected stale read is not disguised as immediate convergence');
    f.taskReadOverride = null;
    const fetched = await f.call('getNotifications', undefined, recipient);
    assert.equal(fetched.res.body.find(n => n.id === notice.id).isRead, true);
});

test('lost task response after commit retains its watermark for later reconciliation', async () => {
    const f = fixture(); const notice = await addMention(f);
    f.afterTaskCommit = () => { throw Object.assign(new Error('lost committed response'), { code: 503 }); };
    assert.equal((await f.update({ status: 'done' })).res.status, 500);
    assert.equal(f.task.status, 'done'); assert.equal(f.task.notificationsReadThroughStage, 0);
    const fetched = await f.call('getNotifications', undefined, recipient);
    assert.equal(fetched.res.body.find(n => n.id === notice.id).isRead, true);
});

test('concurrent advances commit once; losing ETag request cannot overwrite or clear a new-stage notice', async () => {
    const f = fixture(); const old = await addMention(f);
    const results = await Promise.all([f.update({ status: 'publication' }), f.update({ status: 'done' })]);
    assert.equal(results.filter(r => r.res.status === undefined).length, 1);
    assert.equal(results.filter(r => r.res.status === 409).length, 1);
    assert.equal(f.task.notificationStageVersion, 1);
    assert.equal(f.notices.find(n => n.id === old.id).isRead, true);
    const current = await addMention(f); assert.equal(current.isRead, false);
});

test('dismissed attention alerts are stamped with the committed task stage', async () => {
    const f = fixture({ ...base, pendingAlerts: [actor] });
    assert.equal((await f.call('dismissAlert', undefined)).res.status, undefined, JSON.stringify(f.errors));
    assert.equal(f.notices.length, 1); assert.equal(f.notices[0].taskStageVersion, 0);
    await f.update({ status: 'publication' }); assert.equal(f.notices[0].isRead, true);
});

for (const value of [undefined, null, -1, 0.5, '0']) test(`unversioned/invalid legacy notification ${String(value)} is never guessed from timestamp`, async () => {
    const f = fixture();
    const legacy = { id: 'legacy', taskId: base.id, targetUserEmail: recipient, isRead: false, createdAt: '2000-01-01T00:00:00.000Z' };
    if (value !== undefined) legacy.taskStageVersion = value;
    f.notices.push(legacy); await f.update({ status: 'done' });
    const fetched = await f.call('getNotifications', undefined, recipient);
    assert.equal(fetched.res.body[0].isRead, false); assert.equal(f.notices[0].isRead, false);
});

test('stale editing snapshot cannot accidentally advance a returned task and read its notices', async () => {
    const f = fixture(); const notice = await addMention(f); const opened = f.task;
    await f.update({ status: 'todo' }); const returned = f.task;
    const result = await f.call('updateTask', { ...opened, title: 'only intended title edit', expectedStatus: opened.status, expectedEtag: opened._etag });
    assert.equal(result.res.status, 409);
    assert.deepEqual(f.task, returned);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
});

for (const body of [{ status: 'publication' }, { status: 'publication', expectedStatus: 'inprogress' }, { status: 'publication', expectedEtag: 'task-v2' }]) test(`status transition rejects a missing/incomplete snapshot: ${Object.keys(body).join(',')}`, async () => {
    const f = fixture(); const notice = await addMention(f); const before = f.task;
    const result = await f.call('updateTask', body);
    assert.equal(result.res.status, 409); assert.deepEqual(f.task, before);
    assert.equal(f.notices.find(n => n.id === notice.id).isRead, false);
});

// Approved TC484 legacy exception: only the recognizable automatic reviewer format.
function legacyReview(overrides = {}) {
    return { id: 'legacy-review', _etag: 'legacy-v1', taskId: base.id,
        targetUserEmail: reviewer, message: 'Homologação Pendente',
        commentPreview: `Você foi designado para homologar a tarefa #${base.id}: Only a fixture`,
        createdAt: '2026-10-01T00:00:00.000Z', isRead: false, ...overrides };
}
for (const status of ['publication', 'done']) test(`legacy reviewer fetch: ${status} closes only recognizable automatic notices without stage fields`, async () => {
    const f = fixture({ ...base, status });
    const preserved = [
        { id: 'mention', type: 'mention' },
        { id: 'other-message', message: 'Você foi mencionado por Author' },
        { id: 'wrong-preview', commentPreview: 'Homologação Pendente' },
        { id: 'other-task', taskId: 'another-task' },
        { id: 'invalid-stage', taskStageVersion: null },
        { id: 'invalid-type', type: null },
        { id: 'current-version', taskStageVersion: 0 },
        { id: 'other-recipient', targetUserEmail: actor },
        { id: 'already-read', isRead: true }
    ].map(legacyReview);
    f.notices.push(legacyReview(), ...preserved);
    const originals = plain(preserved);
    const response = await f.call('getNotifications', null, reviewer);
    assert.equal(response.res.status, undefined);
    assert.equal(response.res.body.find(n => n.id === 'legacy-review').isRead, true);
    assert.equal(f.notices[0].isRead, true);
    assert.deepEqual(f.notices.slice(1), originals);
    assert.equal(f.notificationWrites.length, 1);
    assert.deepEqual(Object.keys(f.notices[0]).sort(), Object.keys(legacyReview()).sort(), 'no new field');
    assert.equal(f.taskWrites.length, 0, 'no task backfill');
});
for (const status of ['todo', 'inprogress', 'stopped', 'homologation', 'unknown']) test(`legacy reviewer is preserved while task is ${status}`, async () => {
    const f = fixture({ ...base, status }); f.notices.push(legacyReview());
    await f.call('getNotifications', null, reviewer);
    assert.equal(f.notices[0].isRead, false); assert.equal(f.notificationWrites.length, 0);
});
test('legacy reviewer sweep: approval reconciles all rightful reviewers, preserving legacy mentions', async () => {
    const f = fixture({ ...base, status: 'homologation', homologador: { email: reviewer } });
    f.notices.push(legacyReview(), legacyReview({ id: 'another-reviewer', targetUserEmail: recipient }), legacyReview({ id: 'legacy-mention', type: 'mention' }));
    const result = await f.call('updateTask', { homologationAction: 'approve', expectedStatus: 'homologation', expectedEtag: f.task._etag }, reviewer);
    assert.equal(result.res.status, undefined, JSON.stringify(f.errors));
    assert.equal(f.task.status, 'publication');
    assert.deepEqual(f.notices.map(n => n.isRead), [true, true, false]);
});
test('legacy reviewer sweep: same-stage publication save works without prior version metadata', async () => {
    const f = fixture({ ...base, status: 'publication' }); f.notices.push(legacyReview());
    await f.update({ title: 'New title' });
    assert.equal(f.notices[0].isRead, true);
});
test('legacy reviewer sweep: done from stopped closes reviewer but keeps ambiguous mention', async () => {
    const f = fixture({ ...base, status: 'stopped' });
    f.notices.push(legacyReview(), legacyReview({ id: 'mention', type: 'mention' }));
    await f.update({ status: 'done' });
    assert.deepEqual(f.notices.map(n => n.isRead), [true, false]);
});
test('legacy reviewer: failed patch never claims success and later recipient read retries', async () => {
    const f = fixture({ ...base, status: 'publication' }); f.notices.push(legacyReview());
    f.failNotificationPatch = true;
    const first = await f.call('getNotifications', null, reviewer);
    assert.equal(first.res.body[0].isRead, false); assert.equal(f.notices[0].isRead, false);
    f.failNotificationPatch = false;
    const second = await f.call('getNotifications', null, reviewer);
    assert.equal(second.res.body[0].isRead, true); assert.equal(f.notices[0].isRead, true);
});
test('legacy reviewer: concurrent notification changes are reread and no longer eligible notice is preserved', async () => {
    const f = fixture({ ...base, status: 'publication' }); f.notices.push(legacyReview());
    f.beforeNotificationPatch = () => { f.notices[0].type = 'mention'; f.notices[0]._etag = 'concurrent-etag'; };
    await f.call('getNotifications', null, reviewer);
    assert.equal(f.notices[0].isRead, false); assert.equal(f.notificationWrites.length, 0);
});
test('legacy reviewer: repeated fetch is idempotent and preserves text and recipient', async () => {
    const f = fixture({ ...base, status: 'done' }); f.notices.push(legacyReview());
    await f.call('getNotifications', null, reviewer); await f.call('getNotifications', null, reviewer);
    assert.equal(f.notificationWrites.length, 1);
    const expected = legacyReview(); delete expected._etag;
    const actual = plain(f.notices[0]); delete actual._etag;
    assert.deepEqual(actual, { ...expected, isRead: true });
});
test('legacy reviewer: committed approval then concurrent reopening closes only the old legacy cycle', async () => {
    const f = fixture({ ...base, status: 'homologation', homologador: { email: reviewer } });
    f.notices.push(legacyReview());
    f.afterTaskCommit = async () => {
        const reopen = await f.update({ status: 'homologation', homologador: { email: reviewer } });
        assert.equal(reopen.res.status, undefined);
    };
    const result = await f.call('updateTask', { homologationAction: 'approve', expectedStatus: 'homologation', expectedEtag: f.task._etag }, reviewer);
    assert.equal(result.res.status, undefined);
    assert.equal(f.task.status, 'homologation');
    assert.equal(f.notices.find(n => n.id === 'legacy-review').isRead, true);
    const newCycle = f.notices.find(n => Object.hasOwn(n, 'taskStageVersion'));
    assert.ok(newCycle); assert.equal(newCycle.isRead, false);
});
