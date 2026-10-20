// TC505: real Cosmos document update/create handlers; external I/O isolated.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {reviewer, current, other, base, fixture} from './fixtures/forward-api-fixture.mjs';
const request = extra => ({homologationAction:'forward',expectedStatus:'homologation',expectedEtag:'v1',newResponsibleEmail:current,forwardInstructions:'  Próxima etapa\nValidar <script>alert("x")</script> & concluir  ',...extra});
const plain = value => JSON.parse(JSON.stringify(value));
const guidance = request().forwardInstructions.trim();
// Both newly forwarded and previously forwarded tasks persist the latest raw text.
for (const continuityInstructions of [undefined,'Orientação anterior']) {
    const initial={...base,...(continuityInstructions?{continuityInstructions}:{})};
    const f=fixture(initial);const result=await f.call(request({continuityInstructions:'forged',history:[],actorEmail:other}));
    assert.equal(result.status,undefined);assert.equal(result.body.continuityInstructions,guidance);
    assert.equal(f.task.continuityInstructions,guidance);assert.equal(f.task.forwardInstructions,undefined);
    assert.equal(f.signals[0].arguments[0].continuityInstructions,guidance);
    assert.deepEqual(plain(f.task.history.slice(0,-1)),plain(base.history));
    assert.match(f.task.history.at(-1).description,/Próxima etapa<br>Validar &lt;script&gt;/);
    assert.ok(!f.task.history.at(-1).description.includes('<script>'));
    assert.equal(f.task.progress,base.progress);assert.equal(f.task.status,'inprogress');
    assert.deepEqual(plain(f.task.comments),plain(base.comments));assert.deepEqual(plain(f.task.requester),plain(base.requester));
    assert.equal((await f.call(request())).status,409);assert.equal(f.writes.length,1);
    // A full-form or progress save cannot replace or delete the server-owned field.
    for (const value of ['forged','',null,{text:'forged'}]) {
        const saved=await f.call({title:'Safe edit',continuityInstructions:value,progress:40,missingToComplete:'Falta validar'});
        assert.equal(saved.status,undefined);assert.equal(saved.body.continuityInstructions,guidance);
    }
}
// No decision: generic saves cannot invent forwarding, regardless of stage.
for (const status of ['todo','stopped','inprogress','homologation','publication','done']) {
    const f=fixture({...base,status});
    const r=await f.call({title:'Normal edit',continuityInstructions:'forged'});
    assert.equal(r.status,undefined);assert.equal('continuityInstructions' in f.task,false);
}
// Approve/reject preserve previous guidance and cannot accept forged replacement.
for(const homologationAction of ['approve','reject']) {
    const f=fixture({...base,continuityInstructions:'Último encaminhamento'});
    const result=await f.call(request({homologationAction,continuityInstructions:'forged',forwardInstructions:'also forged'}));
    assert.equal(result.status,undefined);assert.equal(f.task.continuityInstructions,'Último encaminhamento');
}
// Re-forward through a later review cycle: latest guidance replaces field; all history stays.
{
    const first=fixture();await first.call(request({forwardInstructions:'Etapa 2'}));
    const prior=plain(first.task);const f=fixture({...prior,status:'homologation',homologador:{email:reviewer},_etag:'v1'});
    await f.call(request({forwardInstructions:'Etapa 3',newResponsibleEmail:other}));
    assert.equal(f.task.continuityInstructions,'Etapa 3');
    assert.deepEqual(plain(f.task.history.slice(0,-1)),prior.history);
    assert.match(f.task.history.at(-2).description,/Etapa 2/);assert.match(f.task.history.at(-1).description,/Etapa 3/);
}
// Validation and authorization fail before any persistence or success event.
for (const [body,actor,status] of [
    [request(),other,403], [request({expectedEtag:'stale'}),reviewer,409],
    [request({forwardInstructions:' \n '}),reviewer,400], [request({forwardInstructions:{text:'x'}}),reviewer,400],
    [request({newResponsibleEmail:'missing@example.test'}),reviewer,400]
]) {
    const f=fixture({...base,continuityInstructions:'Keep me'});const r=await f.call(body,actor);
    assert.equal(r.status,status);assert.equal(f.task.continuityInstructions,'Keep me');
    assert.equal(f.writes.length+f.signals.length+f.discord.length+f.notices.length,0);
}
{
    const f=fixture({...base,continuityInstructions:'Before'});
    f.intervening={continuityInstructions:'Winner',history:[...base.history,{description:'Concurrent edit'}]};
    assert.equal((await f.call(request())).status,409);assert.equal(f.task.continuityInstructions,'Winner');
    assert.equal(f.writes.length+f.signals.length+f.discord.length,0);
}
{
    const f=fixture();const results=await Promise.all([f.call(request({forwardInstructions:'One'})),f.call(request({forwardInstructions:'Two'}))]);
    assert.equal(results.filter(r=>r.status===undefined).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
    assert.equal(f.writes.length,1);assert.ok(['One','Two'].includes(f.task.continuityInstructions));
    assert.ok(f.task.history.at(-1).description.includes(f.task.continuityInstructions));
}
// Exercise real creation allowlist: a task cannot start with spoofed continuity.
{
    const require=createRequire(import.meta.url);const writes=[];const module={exports:{}};
    const tasks={item(){return {async patch(){return {resource:{currentId:505}};}}},items:{async create(task){writes.push(task);return {resource:task};}}};
    const users={items:{query(){return {async fetchAll(){return {resources:[]};}}}}};
    vm.runInNewContext(readFileSync(new URL('../api/createTask/index.js',import.meta.url),'utf8'),{
        module,Buffer,console,process:{env:{}},require(name){
            if(name==='@azure/cosmos')return {CosmosClient:class{database(db){assert.equal(db,'TasksDB');return {container:n=>n==='Tasks'?tasks:users};}}};
            if(name==='axios')return {post(){throw Error('No outbound request');}};
            if(name==='../shared/homologation')return require('../api/shared/homologation.js');
            throw Error(name);
        }
    });
    const log=()=>{};log.error=()=>{};const context={log,bindings:{}};
    await module.exports(context,{headers:{'x-ms-client-principal':Buffer.from(JSON.stringify({userDetails:current,userRoles:['travelcash_user']})).toString('base64')},body:{title:'New task',description:'Description',responsible:[{email:current}],continuityInstructions:'forged',forwardInstructions:'forged'}});
    assert.equal(context.res.status,undefined);assert.equal(writes.length,1);
    assert.equal('continuityInstructions' in writes[0],false);assert.equal('forwardInstructions' in writes[0],false);
}
console.log('PASS TC505 API: new field persists raw plain text in the existing Cosmos task; authenticated forwarding only; history/progress preserved; later forwarding replaces current guidance; generic/creation/other decisions cannot forge it; ETag, duplicate, stale and concurrent requests preserve the winner; HTTP/SignalR return the saved field. No live writes.');
