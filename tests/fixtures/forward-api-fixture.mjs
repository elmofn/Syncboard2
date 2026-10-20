// Shared isolated API fixture. Real handler and shared modules; no external state.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
export const reviewer = 'reviewer@example.test', current = 'current@example.test', other = 'other@example.test';
const originalHistory = [{action:'edited',description:'Homologação reprovada por Reviewer',timestamp:'2026-10-01T00:00:00Z'}];
export const base = {id:'TC499',title:'Continuar etapa',status:'homologation',progress:100,_etag:'v1',homologador:{email:reviewer},responsible:[{email:current,name:'Current'}],history:originalHistory,comments:[{text:'Concluir etapa 1'}],requester:{email:other},assignmentHistory:[]};
export const profiles = [{email:reviewer,name:'Reviewer'},{email:current,name:'Current <safe>'},{email:other,name:'Other'}];
const principal = actor => ({'x-ms-client-principal':Buffer.from(JSON.stringify({userDetails:actor,userRoles:['authenticated','travelcash_user']})).toString('base64')});
export function fixture(initial=base) {
    let task=clone(initial), version=1, intervening=null;
    const writes=[],signals=[],discord=[],notices=[];
    const tasks={item(){return {
        async read(){return {resource:clone(task)};},
        async replace(value,options){
            if(intervening){task={...task,...intervening,_etag:'v2'};intervening=null;version=2;}
            assert.equal(options.accessCondition.type,'IfMatch');
            if(options.accessCondition.condition!==task._etag)throw Object.assign(Error('conflict'),{code:412});
            task={...clone(value),_etag:`v${++version}`};writes.push(clone(task));return {resource:clone(task)};
        }
    };}};
    const users={items:{query(query){return {async fetchAll(){return {resources:profiles.filter(p=>p.email===query.parameters[0].value)};}};}}};
    const notifications={items:{async create(n){notices.push(n);}}};
    const module={exports:{}};
    vm.runInNewContext(read('api/updateTask/index.js'),{module,console,process:{env:{DISCORD_WEBHOOK_URL:'mock://discord'}},require(name){
        if(name==='@azure/cosmos')return {CosmosClient:class{database(){return {container(name){return {Tasks:tasks,Users:users,Notifications:notifications}[name];}};}}};
        if(name==='axios')return {async post(url,payload){discord.push(payload);}};
        if(name.startsWith('../shared/'))return require('../../api/shared/'+name.split('/').at(-1));
        if(name==='crypto')return {randomUUID:()=>`notice-${notices.length}`};
        throw Error(name);
    }});
    async function call(body,actor=reviewer){
        const log=()=>{};log.error=()=>{};
        const context={bindingData:{id:base.id},bindings:{},log};
        await module.exports(context,{body,headers:principal(actor)});
        if(context.bindings.signalRMessage)signals.push(context.bindings.signalRMessage);
        return context.res;
    }
    return {call,writes,signals,discord,notices,get task(){return task;},set intervening(value){intervening=value;}};
}
