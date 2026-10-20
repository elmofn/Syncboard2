// TC-452: execute real renderers and callbacks in synthetic DOM/API fixtures only.
// This is not browser layout, permission, delivery, SSO or backend validation.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(process.env.TC495_SOURCE_ROOT ? process.env.TC495_SOURCE_ROOT + '/' + path : new URL('../' + path, import.meta.url), 'utf8');
const source = read('app/js/ui.js'), main = read('app/js/main.js');
const helpers = await import('data:text/javascript;base64,' + Buffer.from(read('app/js/people-v2.js')).toString('base64'));
const {personCard, notificationCard, peopleAvatar, escapePeopleText} = helpers;
const checks=[];
const decode = value => String(value).replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
function element(classes='') {
    const set = new Set(classes.split(/\s+/).filter(Boolean));
    return {style:{}, dataset:{}, attrs:{}, textContent:'', innerHTML:'', value:'', checked:false, disabled:false, listeners:{},
        classList:{add(...v){v.forEach(x=>set.add(x));},remove(...v){v.forEach(x=>set.delete(x));},contains:v=>set.has(v),toggle(v,on){if(on ?? !set.has(v))set.add(v);else set.delete(v);}},
        setAttribute(k,v){this.attrs[k]=v;}, addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);},
        async fire(type,event={}){for(const fn of this.listeners[type] || [])await fn(event);},
        async click(event={}){if(this.disabled)return;await this.fire('click',event);if(this.onclick)await this.onclick(event);},
        cloneNode(){const copy=element([...set].join(' '));copy.innerHTML=this.innerHTML;copy.disabled=this.disabled;return copy;},
        querySelector(){return this.child ||= element();}
    };
}
function fixture(ids=[]) {
    const els=Object.fromEntries(ids.map(id=>[id,element()]));const timers=[];
    const doc={getElementById:id=>els[id] || null,querySelectorAll:()=>[],documentElement:element()};
    const context={document:doc,state:{users:[],tasks:[]},...helpers,console:{error(){}},lucide:{createIcons(){}},window:{lucide:true},
        requestAnimationFrame:fn=>fn(),setTimeout(fn){timers.push(fn);return timers.length;},Promise};
    for(const id of ids)els[id].parentNode={replaceChild(next){els[id]=next;next.parentNode=this;}};
    return {els,doc,context,timers,flush(){while(timers.length)timers.shift()();}};
}
function section(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a,`Missing ${start}`);return text.slice(a,b);}
const stateCopy = x => JSON.parse(JSON.stringify(x));
const attention = await import('data:text/javascript;base64,'+Buffer.from(read('app/js/task-attention.js')).toString('base64'));
const currentUser={userDetails:'ana@example.test',userId:'ana@example.test'};
const task={id:'T1',title:'Immediate signal',status:'inprogress',responsible:['Ana'],pendingAlerts:[],history:[],_etag:'before'};
const persisted={...task,_etag:'after',pendingAlerts:[{targetUser:'Ana',signaledBy:'Ana',timestamp:'2026-10-15T17:00:00Z'}],history:[{action:'attention_requested',timestamp:'2026-10-15T17:00:00Z'}]};
async function run(label,hook=()=>{},user=currentUser,reject=false,reconcile=null){
 const f=fixture(['modal-signal-btn','signalConfirmModal','confirmSignalBtn','cancelSignalBtn','signal-targets-container','taskHistoryModal']);
 f.els.taskHistoryModal.classList.add('show');
 f.context.state={currentUser:user,users:[{name:'Ana',email:'ana@example.test'}],lastInteractedTaskId:'T1',tasks:[structuredClone(task)]};
 f.els['signal-targets-container'].querySelectorAll=()=>[{value:'Ana',checked:true}];const calls=[];
 f.context.ui={showToast:(...args)=>calls.push(['toast',...args]),updateActiveView:()=>calls.push(['render']),renderTaskHistory:(id,back)=>calls.push(['detail',id,back])};
 f.context.api={fetchTasks:async()=>{calls.push(['fetch']);return reconcile ? reconcile(f) : [structuredClone(f.context.state.tasks[0])];},signalResponsible:async()=>{calls.push(['signal']);hook(f);if(reject)throw Error('network');return structuredClone(persisted);},dismissAlert:async()=>{throw Error('No receipt should be necessary');}};
 vm.runInNewContext(section(main,"    const signalBtn = document.getElementById('modal-signal-btn');","    document.getElementById('add-comment-btn')"),f.context);
 await f.els['modal-signal-btn'].click();await f.els.confirmSignalBtn.click();
 return {f,calls,badge:attention.hasPendingTaskAttention(f.context.state.tasks[0],user,f.context.state.users)};
}
let r=await run('HTTP-only');assert.equal(r.badge,true,'HTTP-confirmed signal must show a badge before receipt, even without SignalR');assert.equal(r.calls.filter(c=>c[0]==='render').length,1);assert.equal(r.calls.filter(c=>c[0]==='detail').length,1);
r=await run('non-recipient',()=>{},{userDetails:'other@example.test'});assert.equal(r.badge,false);
r=await run('closed detail',f=>f.els.taskHistoryModal.classList.add('hidden'));assert.equal(r.badge,true);assert.equal(r.calls.filter(c=>c[0]==='detail').length,0);
r=await run('newer navigation',f=>{f.context.state.lastInteractedTaskId='T2'});assert.equal(r.badge,true);assert.equal(r.calls.filter(c=>c[0]==='detail').length,0);
r=await run('newer status',f=>{f.context.state.tasks[0]={...task,status:'stopped',notificationStageVersion:1}});assert.equal(r.badge,false);assert.equal(r.f.context.state.tasks[0].status,'stopped');
r=await run('newer signal',f=>{f.context.state.tasks[0]={...persisted,pendingAlerts:[{targetUser:'Ana',timestamp:'2026-10-15T17:01:00Z'}]}});assert.equal(r.f.context.state.tasks[0].pendingAlerts[0].timestamp,'2026-10-15T17:01:00Z');
r=await run('newer receipt',f=>{f.context.state.tasks[0]={...persisted,pendingAlerts:[{...persisted.pendingAlerts[0],acknowledgedAt:'2026-10-15T17:01:00Z'}]}}); // TC495: preserve the same signal's newer receipt.
assert.equal(r.f.context.state.tasks[0].pendingAlerts[0].acknowledgedAt,'2026-10-15T17:01:00Z'); // TC495: delayed unread response must not reset receipt.
r=await run('failed request',()=>{},currentUser,true);assert.equal(r.badge,false);assert.equal(r.calls.filter(c=>c[0]==='render').length,0);assert.ok(r.calls.some(c=>c[0]==='toast'&&c[2]==='error'));
r=await run('closing detail',f=>f.els.taskHistoryModal.classList.remove('show'));assert.equal(r.calls.filter(c=>c[0]==='detail').length,0);
r=await run('notification return',f=>{f.context.state.returnToNotifications=true});assert.equal(r.calls.find(c=>c[0]==='detail')[2],true);
r=await run('concurrent title/comment',f=>{f.context.state.tasks[0]={...persisted,title:'New title',comments:[{text:'new'}],_etag:'new-edit'}});assert.equal(r.f.context.state.tasks[0].title,'New title');assert.equal(r.f.context.state.tasks[0].comments[0].text,'new');assert.equal(r.calls.filter(c=>c[0]==='fetch').length,1);
r=await run('reconciliation race',f=>{f.context.state.tasks[0]={...persisted,title:'New title',_etag:'new-edit'}},currentUser,false,f=>{const old=f.context.state.tasks[0];f.context.state.tasks[0]={...old,title:'Newest title',_etag:'newest'};return [old];});assert.equal(r.f.context.state.tasks[0].title,'Newest title');assert.ok(r.calls.some(c=>c[0]==='toast'&&c[1].includes('Recarregue')&&c[2]==='success'));
r=await run('reconciliation failure',f=>{f.context.state.tasks[0]={...persisted,title:'Keep local',_etag:'new-edit'}},currentUser,false,()=>{throw Error('offline')});assert.equal(r.f.context.state.tasks[0].title,'Keep local');assert.ok(r.calls.some(c=>c[0]==='toast'&&c[1].includes('Recarregue')&&c[2]==='success'));
r=await run('edit before signal commit',f=>{f.context.state.tasks[0]={...task,title:'Edited before signal',_etag:'edit-before'}},currentUser,false,()=>[{...persisted,title:'Edited before signal',_etag:'signal-after-edit'}]);assert.equal(r.badge,true);assert.equal(r.f.context.state.tasks[0].title,'Edited before signal');
persisted.notificationStageVersion=1;
r=await run('stale reconciliation stage',f=>{f.context.state.tasks[0]={...task,title:'Observed stage',notificationStageVersion:1,_etag:'concurrent'}},currentUser,false,()=>[{...persisted,notificationStageVersion:0}]);assert.equal(r.f.context.state.tasks[0].title,'Observed stage');assert.ok(r.calls.some(c=>c[0]==='toast'&&c[1].includes('Recarregue')));
delete persisted.notificationStageVersion;
r=await run('stale reconciliation signal',f=>{f.context.state.tasks[0]={...persisted,title:'Observed signal',_etag:'concurrent'}},currentUser,false,()=>[{...task,_etag:'stale-read'}]);assert.equal(r.badge,true);assert.equal(r.f.context.state.tasks[0].title,'Observed signal');assert.ok(r.calls.some(c=>c[0]==='toast'&&c[1].includes('Recarregue')));
r=await run('in-place edit while signaling',f=>{f.context.state.tasks[0].order=7;},currentUser,false,()=>[{...persisted,order:7,_etag:'saved-order'}]);assert.equal(r.badge,true);assert.equal(r.f.context.state.tasks[0].order,7);assert.equal(r.calls.filter(c=>c[0]==='fetch').length,1);
r=await run('in-place edit during reconciliation',f=>{f.context.state.tasks[0]={...persisted,title:'Observed edit',_etag:'concurrent'}},currentUser,false,f=>{f.context.state.tasks[0].order=9;return [{...persisted,order:1}];});assert.equal(r.f.context.state.tasks[0].order,9);assert.ok(r.calls.some(c=>c[0]==='toast'&&c[1].includes('Recarregue')));
r=await run('equal etag in-place edit',f=>{f.context.state.tasks[0]={...persisted,order:7};},currentUser,false,()=>[{...persisted,order:7}]);assert.equal(r.f.context.state.tasks[0].order,7);assert.equal(r.calls.filter(c=>c[0]==='fetch').length,1);
r=await run('reconciliation older than HTTP',f=>{f.context.state.tasks[0]={...task,title:'Concurrent title',_etag:'concurrent'}},currentUser,false,()=>[{...task,title:'Concurrent title',_etag:'concurrent'}]);assert.equal(r.f.context.state.tasks[0].title,'Concurrent title');assert.ok(r.calls.some(c=>c[0]==='toast'&&c[1].includes('Recarregue')));
console.log('PASS 20 immediate-signal cases: HTTP-only, recipient scope, navigation, status, signal, receipt, failures, stale reconciliation and in-place edits. No browser or real writes.');
