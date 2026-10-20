// TC505: real presentation adapter, isolated DOM, backend fixture integration. No browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixture,current} from './fixtures/forward-api-fixture.mjs';
const source=readFileSync(new URL('../app/js/task-fidelity-v2.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ').replace("if (typeof document !== 'undefined') installTaskFidelityPresentation();",'');
const classes=initial=>({values:new Set(initial),contains(s){return this.values.has(s)},add(s){this.values.add(s)},remove(s){this.values.delete(s)}});
const node=id=>({id,dataset:{},style:{},attrs:{},hidden:false,textContent:'',events:{},classList:classes([]),setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},getAttribute(k){return this.attrs[k]},addEventListener(k,f){this.events[k]=f},focus(){this.focused=true},click(){this.events.click?.({})},querySelector(){return this.child},querySelectorAll(){return this.children||[]}});
const ids=['taskHistoryModal','modal-task-id-display','fidelity-detail-status','fidelity-detail-priority','fidelity-detail-missing','fidelity-detail-progress','fidelity-detail-progress-value','fidelity-detail-progress-inline','fidelity-detail-progress-fill','fidelity-detail-continuity','fidelity-detail-continuity-text','fidelity-attachments-empty','fidelity-no-due-date','fidelity-no-validator','closeHistoryBtn','history-feed'];
const nodes=new Map(ids.map(id=>[id,node(id)]));const byId=id=>nodes.get(id);
for(const key of ['comments','attachments','history']){const tab=node('fidelity-tab-'+key);tab.dataset.fidelityTab=key;tab.attrs['aria-controls']='fidelity-panel-'+key;nodes.set(tab.id,tab);nodes.set('fidelity-panel-'+key,node('fidelity-panel-'+key));}
const modal=byId('taskHistoryModal');modal.children=['comments','attachments','history'].map(key=>byId('fidelity-tab-'+key));modal.child=node('close-proxy');byId('fidelity-no-validator').child=node('fallback');
const store={tasks:[{id:'zero',status:'inprogress',progress:0,missingToComplete:'Must not display at zero'}],lastInteractedTaskId:'zero'};
const doc={body:{classList:classes(['sb-fidelity-v2'])},getElementById:byId};let opened,closes=0;byId('closeHistoryBtn').events.click=()=>closes++;
const observers=[];const context={state:store,openProgressUpdateModal:t=>opened=t,MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){}},renderTaskAttentionBadge:()=>'',renderTaskDetailFlow:()=>''};
vm.createContext(context);vm.runInContext(source,context);
const adapter=context.installTaskFidelityPresentation(doc,store,t=>opened=t);assert.ok(adapter);
const render=task=>{store.tasks=[task];store.lastInteractedTaskId=task.id;adapter.sync();};
assert.equal(byId('fidelity-detail-missing').textContent,'Sem atualização até o momento');
assert.equal(byId('fidelity-detail-progress-inline').textContent,'0%');assert.equal(byId('fidelity-detail-continuity').hidden,true);
for(const progress of [0,'0',undefined,null,'','bad']){
 const model=context.taskDetailPresentation({progress,missingToComplete:'Ignore at zero'});
 assert.equal(model.missing,'Sem atualização até o momento');assert.equal(model.progressLabel,'0%');
}
const literal='Primeira linha\n</p><img src=x onerror=alert(1)> & "texto"';
for(const progress of [1,42,'68',100]){
 const task={id:'progress-'+progress,status:'inprogress',progress,missingToComplete:literal};const snapshot=JSON.stringify(task);render(task);
 assert.equal(byId('fidelity-detail-missing').textContent,literal);assert.equal(byId('fidelity-detail-missing').innerHTML,undefined);
 assert.equal(byId('fidelity-detail-progress-inline').textContent,`${progress}%`);assert.equal(byId('fidelity-detail-progress-value').textContent,`${progress}%`);
 assert.equal(JSON.stringify(task),snapshot);
}
assert.equal(context.taskDetailPresentation({progress:100}).missing,'Pendência não informada.');
for(const continuityInstructions of [undefined,null,'','  ',{},['invented']]){
 render({id:'legacy',status:'inprogress',progress:20,continuityInstructions,history:[{description:'Homologação encaminhada<br>Orientação de continuidade: Never infer'}]});
 assert.equal(byId('fidelity-detail-continuity').hidden,true);assert.equal(byId('fidelity-detail-continuity-text').textContent,'');
}
const f=fixture();const saved=await f.call({homologationAction:'forward',expectedStatus:'homologation',expectedEtag:'v1',newResponsibleEmail:current,forwardInstructions:literal});
assert.equal(saved.status,undefined);const persisted=JSON.stringify(saved.body);render(saved.body);
assert.equal(byId('fidelity-detail-continuity').hidden,false);assert.equal(byId('fidelity-detail-continuity-text').textContent,literal);
assert.equal(byId('fidelity-detail-continuity-text').innerHTML,undefined);assert.equal(JSON.stringify(saved.body),persisted);
// The latest guidance remains visible in later states; no hidden inference from status.
for(const status of ['inprogress','stopped','homologation','publication','done']){
 render({...saved.body,status});assert.equal(byId('fidelity-detail-continuity').hidden,false);
}
render({...saved.body,continuityInstructions:'Etapa seguinte'});assert.equal(byId('fidelity-detail-continuity-text').textContent,'Etapa seguinte');
// Switching tasks clears prior guidance, then repeated open/close restores only current data.
render({id:'new',progress:0});assert.equal(byId('fidelity-detail-continuity').hidden,true);assert.equal(byId('fidelity-detail-continuity-text').textContent,'');
render(saved.body);byId('fidelity-tab-history').click();adapter.sync();assert.equal(byId('fidelity-tab-history').attrs['aria-selected'],'true');
modal.classList.add('hidden');adapter.sync();modal.classList.remove('hidden');adapter.sync();assert.equal(byId('fidelity-tab-comments').attrs['aria-selected'],'true');
modal.child.click();assert.equal(closes,1);byId('fidelity-detail-progress').click();assert.equal(opened,saved.body);
// Saving/cancelling the existing progress modal triggers the same observer refresh.
store.tasks[0]={...saved.body,progress:35,missingToComplete:'Nova pendência'};observers[1].fn([{removedNodes:[{id:'progressUpdateModal'}]}]);
assert.equal(byId('fidelity-detail-progress-inline').textContent,'35%');assert.equal(byId('fidelity-detail-missing').textContent,'Nova pendência');
assert.equal(byId('fidelity-detail-continuity-text').textContent,literal);
console.log('PASS TC505 UI: inline current percentage, exact zero fallback, existing missingToComplete source, conditional server-owned guidance, legacy absence, literal multiline/HTML safety, saved backend payload, repeat/reopen/task switch, tab/close/progress controls and no model mutation. Minimal DOM; no native geometry claim.');
