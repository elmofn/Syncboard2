// TC483: real createTask handler with isolated Cosmos/notification mocks only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../api/createTask/index.js', import.meta.url), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const reviewer = {email:'reviewer@example.test', name:'Canonical Reviewer', picture:'avatar'};
const body = {title:'Fixture', description:'Fixture description', responsible:[{email:'worker@example.test'}]};
function fixture({profiles=[reviewer], failLookup=false, failCreate=false}={}) {
    const writes=[], lookups=[], discord=[]; let counter=0;
    const tasks = {
        item(id, partition) { assert.equal(id,'taskCounter'); assert.equal(partition,'taskCounter'); return {async patch() { counter++; return {resource:{currentId:483}}; }}; },
        items:{async create(value) { if(failCreate) throw Error('write failed'); writes.push(clone(value)); return {resource:{...clone(value), _etag:'created-v1'}}; }}
    };
    const users = {items:{query(spec) { lookups.push(clone(spec)); assert.equal(spec.parameters[0].name,'@email'); return {async fetchAll() {
        if(failLookup) throw Error('lookup failed');
        return {resources:profiles.filter(profile=>profile.email.toLowerCase()===spec.parameters[0].value)};
    }}; }}};
    const module = {exports:{}};
    vm.runInNewContext(source, {module, Buffer, console, process:{env:{DISCORD_WEBHOOK_URL:'mock://discord'}}, require(name) {
        if(name==='@azure/cosmos') return {CosmosClient:class {database(name) { assert.equal(name,'TasksDB'); return {container(name) { assert.ok(['Tasks','Users'].includes(name)); return name==='Tasks'?tasks:users; }}; }}};
        if(name==='axios') return {async post(url,payload) { discord.push(clone(payload)); }};
        if(name==='../shared/homologation') return require('../api/shared/homologation.js');
        throw Error(name);
    }});
    async function call(extra={}, actor='creator@example.test') {
        const log=()=>{}; log.error=()=>{};
        const context={log, bindings:{}};
        await module.exports(context, {headers:actor?{'x-ms-client-principal':Buffer.from(JSON.stringify({userDetails:actor,userRoles:['authenticated','travelcash_user']})).toString('base64')}:{}, body:{...body,...extra}});
        return {res:context.res, signal:context.bindings.signalRMessage};
    }
    return {call,writes,lookups,discord,get counter(){return counter;}};
}
for(const homologador of [undefined,null,'','   ']) {
    const f=fixture(); const {res,signal}=await f.call({homologador});
    assert.equal(res.status,undefined); assert.equal(res.body.status,'todo'); assert.equal(res.body.homologador,undefined);
    assert.equal(f.lookups.length,1); assert.equal(f.lookups[0].parameters[0].value,'creator@example.test'); assert.equal(res.body.requester.email,'creator@example.test'); assert.equal(f.counter,1); assert.equal(signal.arguments[0]._etag,'created-v1');
}
for(const homologador of [{email:' REVIEWER@EXAMPLE.TEST ',name:'Forged',isAdmin:true,approved:true}, ' REVIEWER@EXAMPLE.TEST ']) {
    const f=fixture(); const {res,signal}=await f.call({homologador,homologationAction:'approve',progress:100});
    assert.equal(res.status,undefined); assert.deepEqual(clone(res.body.homologador),reviewer,'selected reviewer must survive creation using the registered profile');
    assert.equal(res.body.status,'todo'); assert.equal(res.body.progress,undefined); assert.equal(res.body.homologationAction,undefined);
    assert.equal(res.body.createdBy,'creator@example.test'); assert.equal(f.counter,1); assert.equal(f.writes.length,1);
    assert.deepEqual(clone(signal.arguments[0]),clone(res.body)); assert.equal(f.discord.length,1);
}
for(const homologador of [{},[],false,123,'invalid',{email:'invalid'},{name:'Canonical Reviewer'},{email:'removed@example.test'}]) {
    const f=fixture(); const {res,signal}=await f.call({homologador});
    assert.equal(res.status,400,JSON.stringify(homologador)); assert.match(res.body,/homologador/i);
    assert.equal(f.counter,0); assert.equal(f.writes.length,0); assert.equal(f.discord.length,0); assert.equal(signal,undefined);
}
for(const status of ['inprogress','homologation','publication','done','stopped']) {
    const f=fixture(); const {res}=await f.call({status,homologador:reviewer});
    assert.equal(res.status,400); assert.equal(f.counter,0); assert.equal(f.writes.length,0);
}
{ const f=fixture(); const {res}=await f.call({homologador:reviewer},null); assert.equal(res.status,401); assert.equal(f.lookups.length,0); assert.equal(f.counter,0); }
{ const f=fixture({failLookup:true}); const {res,signal}=await f.call({homologador:reviewer}); assert.equal(res.status,500); assert.equal(f.counter,0); assert.equal(f.writes.length,0); assert.equal(signal,undefined); }
{ const f=fixture({failCreate:true}); const {res,signal}=await f.call({homologador:reviewer}); assert.equal(res.status,500); assert.equal(f.writes.length,0); assert.equal(f.discord.length,0); assert.equal(signal,undefined); }
// TC482 rework: exercise the real creation endpoint, including HTTP/SignalR.
for (const requester of [undefined, null, {email:'other@example.test',name:'Forged',source:'explicit_request',recordedByEmail:'other@example.test',recordedAt:'forged',evidenceRef:'TC-100#comment=1'}]) {
    const f=fixture({profiles:[reviewer,{email:'creator@example.test',name:'Authenticated Creator'}]});
    const {res,signal}=await f.call({requester,requesterEvidenceConfirmed:true});
    assert.equal(res.status,undefined);assert.equal(f.writes.length,1);
    assert.equal(res.body.requester.email,'creator@example.test');assert.equal(res.body.requester.name,'Authenticated Creator');
    assert.equal(res.body.requester.recordedByEmail,'creator@example.test');assert.equal(res.body.requester.source,'self_declared');assert.equal(res.body.requester.evidenceRef,null);
    assert.equal(res.body.requester.recordedAt,res.body.createdAt);assert.equal(res.body.assignmentHistory[0].at,res.body.createdAt);
    assert.deepEqual(clone(signal.arguments[0].requester),clone(res.body.requester));
}
console.log('PASS TC483 API: optional empty selection, canonical registered reviewer, no implicit approval, invalid/removed reviewer rejected before writes, Fila-only creation, authentication, failed lookup/write, persisted HTTP and SignalR result. No live services.');
