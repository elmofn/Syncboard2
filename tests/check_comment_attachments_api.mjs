// TC501: execute real add/read/edit/delete handlers at isolated Cosmos/Discord
// boundaries. No Azure, browser, credentials, uploads, or live notifications.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const actor = {userId:'authenticated-opaque-id', userDetails:'author@example.test', userRoles:['travelcash_user']};
const recipient = 'mentioned@example.test';
const taskAttachment = {url:'https://files.example.test/task.pdf', name:'task.pdf', contentType:'application/pdf'};
const attachment = {url:'https://files.example.test/comment%20evidence.pdf?version=1&sig=fixture', name:'Comment evidence.pdf', contentType:'application/pdf'};
const base = {id:'TC-501-fixture', title:'Isolated comment fixture', status:'inprogress', _etag:'task-v1', attachments:[taskAttachment], comments:[]};
const mention = `<p><span class="mention-tag" data-email="${recipient}">@Mentioned</span> Verifique a evidência.</p>`;

function fixture({initial=base, readError, writeError, failUsers=false, failNotice=false, failDiscord=false}={}) {
    let stored = clone(initial), version = 1, uuid = 0, reads = 0, queries = 0, setupCalls = 0;
    const writes = [], notices = [], discord = [], errors = [], sequence = [];
    const tasks = {
        item(id, partition) {
            assert.equal(id, base.id); assert.equal(partition, base.id);
            return {
                async read() {
                    reads++;
                    if (readError) throw Object.assign(new Error('Injected read failure'), readError);
                    return {resource:clone(stored)};
                },
                async replace(document, options) {
                    assert.equal(options?.accessCondition?.type, 'IfMatch');
                    if (writeError) throw Object.assign(new Error('Injected write failure'), writeError);
                    if (options.accessCondition.condition !== stored?._etag) throw Object.assign(new Error('Stale snapshot'), {code:412});
                    stored = {...clone(document), _etag:`task-v${++version}`};
                    writes.push(clone(stored)); sequence.push('task-commit');
                    return {resource:clone(stored)};
                }
            };
        },
        items:{query(spec) {
            queries++;
            assert.equal(spec.query, 'SELECT * FROM c WHERE c.status <> @status');
            assert.equal(spec.parameters[0].value, 'done');
            return {async fetchAll() { return {resources:stored && stored.status !== 'done' ? [clone(stored)] : []}; }};
        }}
    };
    const users = {items:{readAll() { return {async fetchAll() {
        if (failUsers) throw new Error('Injected user lookup failure');
        return {resources:[{email:recipient, name:'Mentioned'}]};
    }}; }}};
    const notifications = {items:{async create(value) {
        if (failNotice) throw new Error('Injected notice failure');
        notices.push(clone(value)); sequence.push('notice');
        return {resource:clone(value)};
    }}};
    const database = {
        container(name) { assert.ok(['Tasks','Users','Notifications'].includes(name)); return {Tasks:tasks, Users:users, Notifications:notifications}[name]; },
        containers:{async createIfNotExists() { setupCalls++; }}
    };
    const handlers = new Map();
    function handler(name) {
        if (!handlers.has(name)) {
            const module = {exports:{}};
            vm.runInNewContext(read(`api/${name}/index.js`), {
                module, Buffer, URL, Date, console:{error:message=>errors.push(message)}, process:{env:{DISCORD_WEBHOOK_URL:'mock://discord'}},
                require(name) {
                    if (name === '@azure/cosmos') return {CosmosClient:class {
                        database(name) { assert.equal(name,'TasksDB'); return database; }
                        databases = {async createIfNotExists() {}};
                    }};
                    if (name === 'axios') return {async post(url, payload) {
                        assert.equal(url, 'mock://discord');
                        if (failDiscord) throw new Error('Injected Discord failure');
                        discord.push(clone(payload)); sequence.push('discord');
                    }};
                    if (name === 'uuid') return {v4:()=>`fixture-uuid-${++uuid}`};
                    if (name === '../shared/notificationProgress') return require('../api/shared/notificationProgress.js');
                    throw new Error(`Unmocked dependency: ${name}`);
                }
            }, {filename:`api/${name}/index.js`});
            handlers.set(name, module.exports);
        }
        return handlers.get(name);
    }
    async function call(name, body={}, {principal=actor, commentId, input=clone(stored)}={}) {
        const log = ()=>{}; log.error = message=>errors.push(message);
        const context = {bindingData:{id:base.id, commentId}, bindings:{}, log};
        const headers = principal ? {'x-ms-client-principal':Buffer.from(JSON.stringify(principal)).toString('base64')} : {};
        await handler(name)(context, {body, headers}, input);
        return {res:clone(context.res), signal:clone(context.bindings.signalRMessage)};
    }
    return {call, writes, notices, discord, errors, sequence,
        get task() { return clone(stored); }, get reads() { return reads; },
        get queries() { return queries; }, get setupCalls() { return setupCalls; }
    };
}

function assertUnchanged(f, result, status, initial=base) {
    assert.equal(result.res.status, status, JSON.stringify(f.errors));
    assert.deepEqual(f.task, clone(initial));
    assert.equal(f.writes.length, 0);
    assert.equal(f.notices.length, 0);
    assert.equal(f.discord.length, 0);
    assert.equal(result.signal, undefined);
}

test('attachment metadata survives commit, HTTP response, SignalR and real getTasks reload', async () => {
    const f = fixture();
    const extras = {...attachment, author:'forged@example.test', userId:'forged', approved:true, arbitrary:{nested:true}};
    const attachments = [extras, {url:'https://files.example.test/report.csv', name:'Relatório ç.csv', contentType:'text/csv'}];
    const submitted = clone(attachments);
    const result = await f.call('addComment', {text:mention, attachments, author:'forged@example.test', userId:'forged'});
    assert.equal(result.res.status, undefined, JSON.stringify(f.errors));
    assert.equal(f.writes.length, 1);
    const comment = f.task.comments[0];
    assert.equal(comment.text, mention);
    assert.equal(comment.author, actor.userDetails);
    assert.equal(comment.userId, actor.userId);
    assert.ok(comment.id); assert.ok(!Number.isNaN(Date.parse(comment.timestamp)));
    assert.deepEqual(comment.attachments, [attachment, attachments[1]]);
    assert.deepEqual(f.task.attachments, [taskAttachment]);
    assert.deepEqual(result.res.body, f.task);
    assert.deepEqual(result.signal, {target:'taskUpdated', arguments:[f.task]});
    assert.equal(result.res.body._etag, 'task-v2');
    const reload = await f.call('getTasks');
    assert.deepEqual(reload.res.body, [f.task]); assert.equal(f.queries, 1);
    assert.equal(f.notices.length, 1); assert.equal(f.notices[0].targetUserEmail, recipient);
    assert.equal(f.notices[0].commentPreview, '**@Mentioned** Verifique a evidência.');
    assert.equal(f.notices[0].taskStageVersion, 0);
    assert.deepEqual(f.sequence, ['task-commit','notice','discord']);
    assert.equal(f.discord.length, 1);
    assert.equal(f.discord[0].embeds[0].description, '**@Mentioned** Verifique a evidência.');
    for (const value of [attachment.url, attachment.name, attachment.contentType]) {
        assert.ok(!JSON.stringify(f.discord).includes(value), 'No attachment metadata in Discord');
        assert.ok(!JSON.stringify(f.notices).includes(value), 'No attachment metadata in mention preview');
    }
    assert.deepEqual(attachments, submitted, 'Input metadata remains unchanged');
});

for (const text of ['Texto legado\nSegunda linha', '<p>Texto <strong>rico</strong></p><img src="fixture.png">', '<img src="fixture.png">']) {
    test(`absence of attachments preserves the existing comment shape: ${text}`, async () => {
        const legacy = {id:'legacy', text:'Old comment', author:'older@example.test'};
        const f = fixture({initial:{...base, comments:[legacy]}});
        const result = await f.call('addComment', {text});
        assert.equal(result.res.status, undefined);
        assert.deepEqual(f.task.comments[0], legacy);
        assert.deepEqual(Object.keys(f.task.comments[1]).sort(), ['id','text','author','userId','timestamp'].sort());
        assert.equal(f.task.comments[1].text, text);
        assert.deepEqual(f.task.attachments, [taskAttachment]);
    });
}

test('an explicitly empty attachments array is valid without modifying older comments', async () => {
    const legacy = {text:'Original without UUID', author:{name:'Older author', email:'older@example.test'}};
    const f = fixture({initial:{...base, comments:[legacy]}});
    const result = await f.call('addComment', {text:'No files selected', attachments:[]});
    assert.equal(result.res.status, undefined);
    assert.deepEqual(f.task.comments, [legacy, result.res.body.comments[1]]);
    assert.deepEqual(f.task.comments[1].attachments, []);
});

for (const comments of [undefined, null, {}, 'legacy-invalid-list']) {
    test(`legacy comments-list initialization remains compatible: ${JSON.stringify(comments)}`, async () => {
        const f = fixture({initial:{...base, comments}});
        const result = await f.call('addComment', {text:'Evidence', attachments:[attachment]});
        assert.equal(result.res.status, undefined); assert.equal(f.task.comments.length, 1);
        assert.deepEqual(f.task.comments[0].attachments, [attachment]);
    });
}

const invalidAttachments = [
    undefined, null, '', 'files', {}, 1, true,
    [null], [false], [1], ['file'], [[]], [{}],
    [{...attachment, url:undefined}], [{...attachment, name:undefined}], [{...attachment, contentType:undefined}],
    ...['url','name','contentType'].flatMap(key => [null, false, 5, {}, [], '', '   '].map(value => [{...attachment, [key]:value}])),
    [attachment, {name:'Missing fields'}]
];
for (const [index, attachments] of invalidAttachments.entries()) {
    test(`reject malformed attachments ${index + 1} before any database/notification work`, async () => {
        const f = fixture();
        const result = await f.call('addComment', {text:mention, attachments});
        assertUnchanged(f, result, 400);
        assert.equal(f.reads, 0); assert.equal(f.setupCalls, 0);
        assert.match(result.res.body, /Anexos inválidos/);
    });
}

const unsafeUrls = [
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'http://files.example.test/file',
    'ftp://files.example.test/file', '//files.example.test/file', '/file', 'files.example.test/file',
    'https:', 'https://', 'https:///files.example.test/file', 'https://[invalid]/file',
    'https://files.example.test:invalid/file', 'https://files.example.test:65536/file',
    'https://user:pass@files.example.test/file', 'https://user@files.example.test/file',
    'https://:pass@files.example.test/file', 'https://@files.example.test/file',
    'https://us%65r:pa%73s@files.example.test/file',
    ' https://files.example.test/file', 'https://files.example.test/file ',
    'https://files.example.test/a b', 'https://files.example.test/\tfile',
    'https://files.example.test/\nfile', 'https://files.example.test/\rfile',
    'https://files.example.test/\u0000file', 'https://files.example.test/\u007ffile',
    'https://files.example.test\\file', 'https:\\files.example.test\\file'
];
for (const url of unsafeUrls) {
    test(`reject unsafe or malformed attachment URL: ${JSON.stringify(url)}`, async () => {
        const f = fixture();
        const result = await f.call('addComment', {text:'Evidence', attachments:[{...attachment, url}]});
        assertUnchanged(f, result, 400); assert.equal(f.reads, 0);
    });
}

for (const url of [
    'https://files.example.test/file', 'HTTPS://files.example.test/file',
    'https://files.example.test:8443/file', 'https://files.example.test/a%20b?sig=fixture%2Babc&v=1#page=2',
    'https://files.example.test/folder/@evidence?email=name@example.test',
    'https://[2001:db8::1]/file'
]) {
    test(`preserve safe HTTPS URL exactly: ${url}`, async () => {
        const f = fixture();
        const result = await f.call('addComment', {text:'Evidence', attachments:[{...attachment, url}]});
        assert.equal(result.res.status, undefined, JSON.stringify(f.errors));
        assert.equal(f.task.comments[0].attachments[0].url, url);
    });
}

test('no invented filename, count, size, or MIME-type whitelist', async () => {
    const f = fixture();
    const attachments = Array.from({length:32}, (_, index) => ({
        url:`https://files.example.test/item-${index}`, name:` ${'Evidence'.repeat(100)}-${index} `,
        contentType:index % 2 ? 'application/x-custom-evidence; version=1' : 'unknown-format', size:10 ** 12
    }));
    const result = await f.call('addComment', {text:'Evidence', attachments});
    assert.equal(result.res.status, undefined);
    assert.deepEqual(f.task.comments[0].attachments, attachments.map(({url,name,contentType})=>({url,name,contentType})));
});

test('unauthenticated request remains 401 before attachment validation or writes', async () => {
    const f = fixture();
    const result = await f.call('addComment', {text:mention, attachments:null}, {principal:null});
    assertUnchanged(f, result, 401); assert.equal(f.reads, 0); assert.equal(f.setupCalls, 0);
});

test('missing task remains 404 without emitting attachment metadata', async () => {
    // Explicit null bypasses the fixture's default argument and models no resource.
    const empty = fixture({initial:null});
    const result = await empty.call('addComment', {text:mention, attachments:[attachment]});
    assertUnchanged(empty, result, 404, null);
});

for (const error of [{code:412}, {statusCode:412}]) {
    test(`ETag conflict ${JSON.stringify(error)} remains 409 without a commit, mention, or Discord`, async () => {
        const f = fixture({writeError:error});
        const result = await f.call('addComment', {text:mention, attachments:[attachment]});
        assertUnchanged(f, result, 409);
    });
}

test('concurrent attachment comments use ETag protection instead of overwriting another commit', async () => {
    const f = fixture();
    const results = await Promise.all([
        f.call('addComment', {text:mention, attachments:[attachment]}),
        f.call('addComment', {text:'Concurrent comment', attachments:[{...attachment, name:'Second.pdf'}]})
    ]);
    assert.equal(results.filter(result=>result.res.status === undefined).length, 1);
    assert.equal(results.filter(result=>result.res.status === 409).length, 1);
    assert.equal(f.writes.length, 1); assert.equal(f.task.comments.length, 1);
    assert.equal(f.discord.length, 1);
    assert.deepEqual(f.task.attachments, [taskAttachment]);
    const winner = results.find(result=>result.res.status === undefined);
    assert.deepEqual(winner.signal.arguments, [f.task]);
    assert.equal(results.find(result=>result.res.status === 409).signal, undefined);
});

for (const options of [{readError:{code:503}}, {writeError:{code:500}}, {failUsers:true}, {initial:{...base, _etag:undefined}}]) {
    test(`server failure remains 500 without a partial commit: ${JSON.stringify(options)}`, async () => {
        const f = fixture(options);
        const result = await f.call('addComment', {text:mention, attachments:[attachment]});
        assertUnchanged(f, result, 500, options.initial || base);
    });
}

for (const options of [{failNotice:true}, {failDiscord:true}]) {
    test(`post-commit notification failure still reports committed attachment success: ${JSON.stringify(options)}`, async () => {
        const f = fixture(options);
        const result = await f.call('addComment', {text:mention, attachments:[attachment]});
        assert.equal(result.res.status, undefined);
        assert.equal(f.writes.length, 1);
        assert.deepEqual(f.task.comments[0].attachments, [attachment]);
        assert.deepEqual(result.res.body, f.task);
        assert.deepEqual(result.signal.arguments, [f.task]);
        assert.ok(f.errors.length > 0);
    });
}

test('the existing text-only edit API preserves attachments and ignores attempted attachment replacement', async () => {
    const f = fixture();
    await f.call('addComment', {text:'Original', attachments:[attachment]});
    const before = f.task.comments[0];
    const result = await f.call('editComment', {text:'Edited text', author:actor.userDetails, attachments:[], userId:'forged'}, {commentId:before.id});
    assert.equal(result.res.status, undefined);
    const after = f.task.comments[0];
    assert.equal(after.text, 'Edited text'); assert.ok(after.editedAt);
    assert.deepEqual(after.attachments, before.attachments);
    assert.equal(after.author, before.author); assert.equal(after.userId, before.userId);
    assert.deepEqual(f.task.attachments, [taskAttachment]);
    assert.deepEqual(result.signal.arguments, [f.task]);
    assert.equal(f.notices.length, 0); assert.equal(f.discord.length, 1, 'Edit API adds no new Discord effect');
});

test('existing edit authorization still denies a different author with 403 and leaves attachments intact', async () => {
    const comment = {id:'original-comment', text:'Original', author:actor.userDetails, userId:actor.userId, attachments:[attachment]};
    const initial = {...base, comments:[comment]};
    const f = fixture({initial});
    const result = await f.call('editComment', {text:'Changed', author:'another@example.test', attachments:[]}, {commentId:comment.id});
    assertUnchanged(f, result, 403, initial);
});

test('existing delete API removes only the chosen comment reference, preserving other comments and task attachments', async () => {
    const other = {id:'other-comment', text:'Keep', author:actor.userDetails, attachments:[attachment]};
    const initial = {...base, comments:[other]};
    const f = fixture({initial});
    await f.call('addComment', {text:'Remove this reference', attachments:[attachment]});
    const result = await f.call('deleteComment', {index:1});
    assert.equal(result.res.status, undefined);
    assert.deepEqual(f.task.comments, [other]);
    assert.deepEqual(f.task.attachments, [taskAttachment]);
    assert.deepEqual(result.res.body, f.task); assert.deepEqual(result.signal.arguments, [f.task]);
    assert.equal(f.writes.length, 2); assert.equal(f.discord.length, 1);
    // This fixture fails on any unmocked dependency: no Blob client or deletion
    // route is loaded, so deleting a comment does not delete the stored file.
});

test('SWA role gate is unchanged; addComment has no new endpoint-local 403 or ACL policy', () => {
    const config = JSON.parse(read('app/staticwebapp.config.json'));
    assert.deepEqual(config.routes.find(route=>route.route === '/*').allowedRoles, ['travelcash_user']);
    const source = read('api/addComment/index.js');
    assert.match(source, /author: user\.userDetails,\s*userId: user\.userId/);
    assert.ok(!source.includes('status: 403'));
});
