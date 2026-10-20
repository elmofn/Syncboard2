// TC483 integration contract: both real handlers, one in-memory Cosmos store.
// Never contacts Azure or sends an actual notification.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const clone=value=>JSON.parse(JSON.stringify(value));
const creator='creator@example.test',reviewer='reviewer@example.test';
function fixture() {
    let task,version=0;
    const notifications=[],signals=[],writes=[];
    const profile={id:reviewer,email:reviewer,name:'Registered reviewer',_etag:'profile-v1'};
    const users={items:{query(spec){return {async fetchAll(){return {resources:profile.email===spec.parameters[0].value?[clone(profile)]:[]};}};}},item(id,partition){assert.equal(id,reviewer);assert.equal(partition,reviewer);return {
        async read(){return {resource:clone(profile)};},
        async replace(value,options){assert.equal(options.accessCondition.condition,profile._etag);Object.assign(profile,clone(value),{_etag:profile._etag+'x'});return {resource:clone(profile)};}
    };}};
    const tasks={items:{async create(value){task={...clone(value),_etag:`v${++version}`};writes.push(clone(task));return {resource:clone(task)};}},item(id,partition){assert.equal(id,partition);if(id==='taskCounter')return {async patch(){return {resource:{currentId:483}};}};assert.equal(id,'TC-483');return {
        async read(){return {resource:clone(task)};},
        async replace(value,options){if(options.accessCondition.condition!==task._etag)throw Object.assign(Error('stale'),{code:412});task={...clone(value),_etag:`v${++version}`};writes.push(clone(task));return {resource:clone(task)};}
    };}};
    const containers={Tasks:tasks,Users:users,Notifications:{items:{async create(value){const resource={...clone(value),_etag:'notice-v1'};notifications.push(resource);return {resource:clone(resource)};},query(spec){const params=Object.fromEntries(spec.parameters.map(p=>[p.name,p.value]));return {async fetchAll(){return {resources:clone(notifications.filter(n=>n.taskId===params['@taskId']&&n.isRead===false&&Number.isInteger(n.taskStageVersion)&&n.taskStageVersion<=params['@through']))};}};}},item(id,partition){const current=notifications.find(n=>n.id===id&&n.targetUserEmail===partition);assert(current);return {async read(){return {resource:clone(current)};},async patch(body,options){assert.equal(options.accessCondition.condition,current._etag);assert.deepEqual(body.operations,[{op:'set',path:'/isRead',value:true}]);current.isRead=true;current._etag+='x';return {resource:clone(current)};}};}}};
    function handler(path){
        const module={exports:{}};
        vm.runInNewContext(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{module,Buffer,console,process:{env:{}},require(name){
            if(name==='@azure/cosmos')return {CosmosClient:class{database(name){assert.equal(name,'TasksDB');return {container:name=>containers[name]};}}};
            if(name==='axios')return {};
            if(name==='crypto')return {randomUUID:()=>`notice-${notifications.length}`};
            if(name==='../shared/homologation')return require('../api/shared/homologation.js');
            if(name==='../shared/notificationProgress')return require('../api/shared/notificationProgress.js');
            if(name==='../shared/reviewerGuard')return require('../api/shared/reviewerGuard.js');
            throw Error(name);
        }});
        return module.exports;
    }
    const create=handler('api/createTask/index.js'),update=handler('api/updateTask/index.js');
    async function call(handler,body,actor=creator){
        const log=()=>{};log.error=()=>{};const context={log,bindings:{},bindingData:{id:'TC-483'}};
        await handler(context,{body,headers:{'x-ms-client-principal':Buffer.from(JSON.stringify({userDetails:actor,userRoles:['authenticated','travelcash_user']})).toString('base64')}});
        if(context.bindings.signalRMessage)signals.push(clone(context.bindings.signalRMessage));
        return context.res;
    }
    return {create:(body)=>call(create,{title:'Fixture',description:'Fixture description',responsible:[{email:creator}],...body}),update:(body,actor)=>call(update,body,actor),get task(){return clone(task);},notifications,signals,writes,profile};
}
for(const selected of [undefined,{email:reviewer,name:'Client forgery'}]) {
    const f=fixture();assert.equal((await f.create({homologador:selected})).status,undefined);
    assert.equal(f.task.status,'todo');assert.equal(f.task.homologador?.email,selected?reviewer:undefined);assert.equal(f.notifications.length,0);
    assert.equal((await f.update({status:'inprogress',expectedStatus:f.task.status,expectedEtag:f.task._etag})).status,undefined);
    assert.equal(f.task.homologador?.email,selected?reviewer:undefined,'ordinary transition preserves creation-time choice');
    const snapshot=f.task;
    assert.equal((await f.update({status:'homologation',expectedStatus:'inprogress',expectedEtag:snapshot._etag})).status,400,'entry never implicitly inherits a reviewer');
    assert.equal(f.task.status,'inprogress');assert.equal(f.notifications.length,0);assert.equal(f.writes.length,2);
    assert.equal((await f.update({status:'homologation',homologador:{email:reviewer},expectedStatus:'inprogress',expectedEtag:'stale'})).status,409);
    assert.equal((await f.update({status:'homologation',homologador:{email:reviewer},expectedStatus:'inprogress',expectedEtag:snapshot._etag})).status,undefined);
    assert.equal(f.task.status,'homologation');assert.deepEqual(f.task.homologador,{email:reviewer,name:'Registered reviewer',picture:''});
    assert.equal(f.notifications.length,1);assert.equal(f.notifications[0].targetUserEmail,reviewer);assert.equal(f.profile.homologationReservations[0].taskEtag,snapshot._etag);
    assert.equal((await f.update({homologationAction:'approve',expectedStatus:'homologation',expectedEtag:f.task._etag})).status,403,'creator is not implicitly authorized to approve');
    assert.equal((await f.update({status:'publication',expectedStatus:f.task.status,expectedEtag:f.task._etag})).status,403,'generic transition cannot approve');
    assert.equal(f.task.status,'homologation');assert.equal(f.writes.length,3);
    assert.equal((await f.update({homologationAction:'reject',expectedStatus:'homologation',expectedEtag:f.task._etag},reviewer)).status,undefined);
    assert.equal(f.task.status,'inprogress');assert.equal(f.task.homologador,null,'rejection still clears the previous cycle reviewer');
    assert.equal(f.signals.length,4);assert.equal(f.writes.length,4);
}
{
    const f=fixture();await f.create({homologador:{email:reviewer}});await f.update({status:'inprogress',expectedStatus:f.task.status,expectedEtag:f.task._etag});
    f.profile.email='removed@example.test';const snapshot=f.task;
    assert.equal((await f.update({status:'homologation',homologador:{email:reviewer},expectedStatus:'inprogress',expectedEtag:snapshot._etag})).status,400);
    assert.equal(f.task.status,'inprogress');assert.equal(f.writes.length,2);assert.equal(f.notifications.length,0);
}
{
    const f=fixture();await f.create({homologador:{email:reviewer}});await f.update({status:'inprogress',expectedStatus:f.task.status,expectedEtag:f.task._etag});
    await f.update({status:'homologation',homologador:{email:reviewer},expectedStatus:'inprogress',expectedEtag:f.task._etag});
    assert.equal((await f.update({homologationAction:'approve',expectedStatus:'homologation',expectedEtag:f.task._etag},reviewer)).status,undefined);
    assert.equal(f.task.status,'publication');assert.equal(f.task.progress,100);
    assert.match(f.task.history.at(-1).description,/Homologação aprovada por/);
    assert.match(f.task.history.at(-1).description,/reviewer@example\.test/);
}
{
    // Characterization only: the existing generic direct route is not closed in
    // TC483. Its status must not turn an optional selection into an approval label.
    const f=fixture();await f.create({homologador:{email:reviewer}});
    assert.equal((await f.update({status:'publication',expectedStatus:f.task.status,expectedEtag:f.task._etag})).status,undefined);
    assert.equal(f.task.homologador.email,reviewer);
    assert.ok(f.task.history.every(event=>!event.description.includes('Homologação aprovada')));
    assert.equal(f.notifications.length,0);
}
console.log('PASS TC483 lifecycle: create with/without reviewer → Andamento preserves choice → Homologação requires explicit registered selection and current ETag; one notification/reservation; creator/generic approval denied; explicit reviewer rejection clears cycle; deleted reviewer blocked. Real handlers, mocked services.');
