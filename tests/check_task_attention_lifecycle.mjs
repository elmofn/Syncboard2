// TC495 lifecycle fixture adapted from TC484: execute the actual handlers with an in-memory Cosmos boundary.
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
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const attention = await import('data:text/javascript;base64,'+Buffer.from(read('app/js/task-attention.js')).toString('base64'));
const flow = await import('data:text/javascript;base64,'+Buffer.from(read('app/js/task-provenance.js')).toString('base64'));
const user={userDetails:actor,userId:actor};
const initial={...base,responsible:[{name:actor,email:actor},{name:recipient,email:recipient}]};
const badge=task=>attention.hasPendingTaskAttention(task,user,[]);
const main=read('app/js/main.js');
function queued(task) {
 const context={state:{currentUser:user,users:[]},alertQueue:[],processAlertQueue(){},input:[task]};
 vm.runInNewContext(main.slice(main.indexOf('function checkAndQueueAlerts('),main.indexOf('\nfunction processAlertQueue()'))+';checkAndQueueAlerts(input)',context);
 return context.alertQueue.length;
}
test('signal, acknowledgement, reload, repeat, re-signal and status lifecycle',async()=>{
 const f=fixture(initial);
 assert.equal((await f.call('signalResponsible',{targets:[actor,recipient]})).res.status,undefined);
 assert.equal(f.task.history.length,1);assert.equal(f.task.history[0].action,'attention_requested');
 assert.equal(badge(f.task),true);assert.equal(queued(f.task),1);
 const signalTime=f.task.history[0].timestamp;
 f.now='2026-10-12T10:01:00.000Z';
 assert.equal((await f.call('dismissAlert',{})).res.status,undefined);
 assert.equal(f.task.pendingAlerts.length,2);assert.equal(badge(f.task),true);assert.equal(queued(f.task),0);
 assert.equal(f.task.pendingAlerts[0].acknowledgedAt,'2026-10-12T10:01:00.000Z'); // TC495: persisted receipt timestamp.
 assert.equal(f.task.pendingAlerts[1].acknowledgedAt,undefined); // TC495: another recipient is unchanged.
 assert.equal(f.notices.length,1);
 const writes=f.taskWrites.length;
 await f.call('dismissAlert',{});assert.equal(f.taskWrites.length,writes);assert.equal(f.notices.length,1);
 await f.update({title:'Changed',pendingAlerts:[],history:[]});assert.equal(badge(f.task),true);assert.equal(f.task.history[0].timestamp,signalTime);
 await f.update({status:'inprogress',progress:20});assert.equal(badge(f.task),true);
 f.now='2026-10-12T10:02:00.000Z';
 await f.call('signalResponsible',{targets:[actor,actor]});assert.equal(queued(f.task),1);assert.equal(f.task.pendingAlerts.length,2);
 assert.equal(f.task.pendingAlerts.find(a=>a.targetUser===actor).acknowledgedAt,undefined); // TC495: re-signal resets acknowledgement.
 assert.equal(f.task.history.filter(h=>h.action==='attention_requested').length,2);
 await f.call('dismissAlert',{});assert.equal(f.notices.length,2);
 await f.update({status:'stopped'});assert.equal(badge(f.task),false);assert.equal(f.task.pendingAlerts.length,0);
 await f.update({status:'inprogress'});assert.equal(badge(f.task),false);
 assert.equal(f.task.history.filter(h=>h.action==='attention_requested').length,2);
 const html=flow.renderTaskDetailFlow(f.task);
 assert.equal((html.match(/class="sb-flow-attention"/g)||[]).length,2);assert.ok(html.includes(signalTime));
});
test('legacy string receipt preserves recipient without fabricating signal date',async()=>{
 const f=fixture({...initial,pendingAlerts:[actor,null,{},recipient]});
 await f.call('dismissAlert',{});assert.equal(badge(f.task),true);assert.equal(queued(f.task),0);
 assert.equal(f.task.pendingAlerts[0].timestamp,undefined);assert.deepEqual(f.task.history,[]);
 assert.ok(f.task.pendingAlerts[0].acknowledgedAt); // TC495: legacy receipt is real; signal date stays unknown.
});
test('ETag failure leaves signal, receipt and status unchanged without side effects',async()=>{
 for(const action of ['signalResponsible','dismissAlert','updateTask']) {
  const f=fixture({...initial,pendingAlerts:[actor]});const before=f.task;f.failTaskWrite=true;
  const result=action==='updateTask'?await f.update({status:'stopped'}):await f.call(action,{targets:[actor]});
  assert.equal(result.res.status,409);assert.deepEqual(f.task,before);assert.equal(f.notices.length,0);assert.equal(f.taskWrites.length,0);assert.deepEqual(result.bindings,{});
 }
});
test('stale form cannot erase recipient state; invalid target produces no audit',async()=>{
 const f=fixture({...initial,pendingAlerts:[actor]});
 assert.equal((await f.call('signalResponsible',{targets:['outsider']})).res.status,400);assert.equal(f.taskWrites.length,0);
 const response=await f.update({status:'stopped',expectedEtag:'stale'});assert.equal(response.res.status,409);assert.equal(badge(f.task),true);
 await f.update({description:'ordinary edit',pendingAlerts:['outsider']});assert.deepEqual(f.task.pendingAlerts,[actor]);
});
test('signal audit escapes names; summary does not interpret descriptions or invent time',async()=>{
 const hostile='<img src=x onerror=alert(1)>';
 const f=fixture({...initial,responsible:[{name:hostile,email:recipient}]});
 await f.call('signalResponsible',{targets:[hostile]});assert.match(f.task.history[0].description,/&lt;img/);assert.doesNotMatch(f.task.history[0].description,/<img/);
 const html=flow.renderTaskDetailFlow({...initial,history:[{action:'attention_requested',description:'<script>bad</script>',timestamp:'invalid'},null,{action:'edited',timestamp:'2026-10-12T10:00:00Z'}]});
 assert.match(html,/Data não registrada/);assert.doesNotMatch(html,/script|Invalid Date/);assert.equal((html.match(/sb-flow-attention/g)||[]).length,1);
});
test('every receipt-field occurrence in application code has an adjacent TC495 comment',()=>{
 for(const file of ['api/signalResponsible/index.js','api/dismissAlert/index.js','api/updateTask/index.js','app/js/main.js','app/js/task-attention.js']) {
  for(const line of read(file).split('\n')) if(line.includes('acknowledgedAt')) assert.match(line,/TC495/); // TC495: explicit reviewability guard for the receipt field.
 }
});
test('older popup cannot acknowledge a newer signal; conflict is side-effect free',async()=>{
 const f=fixture(initial);await f.call('signalResponsible',{targets:[actor]});const shown=f.task;
 f.now='2026-10-12T10:02:00.000Z';await f.call('signalResponsible',{targets:[actor]});const newer=f.task;
 const r=await f.call('dismissAlert',{expectedEtag:shown._etag});assert.equal(r.res.status,409);assert.deepEqual(f.task,newer);assert.equal(f.notices.length,0);assert.equal(queued(f.task),1);
 await f.call('dismissAlert',{expectedEtag:newer._etag});assert.equal(queued(f.task),0);assert.equal(badge(f.task),true);
});
test('late dismissal response/broadcast use canonical state after another tab transitions',async()=>{
 const f=fixture(initial);await f.call('signalResponsible',{targets:[actor]});
 f.afterTaskCommit=async()=>{await f.update({status:'stopped'});};
 const result=await f.call('dismissAlert',{expectedEtag:f.task._etag});
 assert.equal(result.res.body.status,'stopped');assert.deepEqual(result.res.body.pendingAlerts,[]);
 assert.equal(result.bindings.signalRMessage.arguments[0].status,'stopped');assert.equal(badge(result.res.body),false);
});
test('late signal response/broadcast preserve an intervening stage transition',async()=>{
 const f=fixture(initial);f.afterTaskCommit=async()=>{await f.update({status:'stopped'});};
 const result=await f.call('signalResponsible',{targets:[actor]});
 assert.equal(result.res.body.status,'stopped');assert.deepEqual(result.res.body.pendingAlerts,[]);
 assert.equal(result.res.body.history.filter(h=>h.action==='attention_requested').length,1);
});
test('process discards queued alerts cleared/received in another tab without opening a modal',()=>{
 for(const current of [{...initial,pendingAlerts:[]},{...initial,pendingAlerts:[{targetUser:actor,acknowledgedAt:'2026-10-12T10:01:00Z'}]}]) { // TC495: already-received queued snapshot.
  const context={state:{tasks:[current]},alertQueue:[{task:{...initial,pendingAlerts:[actor]},alertData:actor}],isAlertModalOpen:false};
  const start=main.indexOf('function processAlertQueue()'),end=main.indexOf('// --- OBSERVADOR DE FLUXO DE ALERTAS',start);
  vm.runInNewContext(main.slice(start,end)+';processAlertQueue()',context);
  assert.equal(context.alertQueue.length,0);assert.equal(context.isAlertModalOpen,false);
 }
});
test('SignalR ignores an older stage snapshot so a cleared badge cannot resurrect',()=>{
 const handlers={};const current={...initial,status:'stopped',notificationStageVersion:1,pendingAlerts:[]};let renders=0;
 const context={state:{tasks:[current]},refreshProjectTaskCounts(){},console:{log(){}},updateActiveView(){renders++;},updateNotificationBadge(){},window:{addEventListener(){}},signalR:{HubConnectionBuilder:class{withUrl(){return this}build(){return{on:(name,fn)=>handlers[name]=fn,onclose(){},start:async()=>{}}}}}};
 const source=read('app/js/signalr.js').replace(/^import .*;\n/gm,'').replace('export function','function');
 vm.runInNewContext(source+';connectToSignalR(()=>{})',context);
 handlers.taskUpdated({...initial,notificationStageVersion:0,pendingAlerts:[actor]});
 assert.equal(context.state.tasks[0],current);assert.equal(renders,0);assert.equal(badge(context.state.tasks[0]),false);
});
test('SignalR keeps a newer same-stage signal over delayed older receipt',()=>{
 const handlers={};const current={...initial,pendingAlerts:[{targetUser:actor,timestamp:'2026-10-12T10:02:00Z'}]};
 const context={state:{tasks:[current]},refreshProjectTaskCounts(){},console:{log(){}},updateActiveView(){},updateNotificationBadge(){},window:{addEventListener(){}},signalR:{HubConnectionBuilder:class{withUrl(){return this}build(){return{on:(name,fn)=>handlers[name]=fn,onclose(){},start:async()=>{}}}}}};
 const source=read('app/js/signalr.js').replace(/^import .*;\n/gm,'').replace('export function','function');
 vm.runInNewContext(source+';connectToSignalR(()=>{})',context);
 handlers.taskUpdated({...initial,pendingAlerts:[{targetUser:actor,timestamp:'2026-10-12T10:00:00Z',acknowledgedAt:'2026-10-12T10:01:00Z'}]}); // TC495: delayed older receipt.
 assert.equal(context.state.tasks[0],current);assert.equal(queued(context.state.tasks[0]),1);
});
test('SignalR never removes a same-signal receipt, including timestamp-less legacy alerts',()=>{
 for(const timestamp of [undefined,'2026-10-12T10:02:00Z']) {
  const handlers={};const current={...initial,pendingAlerts:[{targetUser:actor,timestamp,acknowledgedAt:'2026-10-12T10:03:00Z'}]}; // TC495: receipt must be monotonic for this signal.
  const context={state:{tasks:[current]},refreshProjectTaskCounts(){},console:{log(){}},updateActiveView(){},updateNotificationBadge(){},window:{addEventListener(){}},signalR:{HubConnectionBuilder:class{withUrl(){return this}build(){return{on:(name,fn)=>handlers[name]=fn,onclose(){},start:async()=>{}}}}}};
  const source=read('app/js/signalr.js').replace(/^import .*;\n/gm,'').replace('export function','function');
  vm.runInNewContext(source+';connectToSignalR(()=>{})',context);
  handlers.taskUpdated({...initial,pendingAlerts:[timestamp?{targetUser:actor,timestamp}:actor]});
  assert.equal(context.state.tasks[0],current);assert.equal(queued(context.state.tasks[0]),0);
 }
});
