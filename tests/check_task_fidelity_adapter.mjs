import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const flowModule = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../app/js/task-provenance.js', import.meta.url), 'utf8')).toString('base64'));
const attentionModule = await import('data:text/javascript;base64,' + Buffer.from(readFileSync(new URL('../app/js/task-attention.js', import.meta.url), 'utf8')).toString('base64'));
const source = readFileSync(new URL('../app/js/task-fidelity-v2.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ').replace("if (typeof document !== 'undefined') installTaskFidelityPresentation();",'');
const classes = values => ({ values:new Set(values), contains(key){return this.values.has(key)}, remove(key){this.values.delete(key)}, add(key){this.values.add(key)} });
const nodes = new Map();
const element = id => ({id,dataset:{},style:{},attrs:{},hidden:false,events:{},textContent:'',classList:classes([]),setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},getAttribute(k){return this.attrs[k]},addEventListener(k,f){this.events[k]=f},focus(){this.focused=true},click(){this.events.click?.({})},querySelector(){return this.child},querySelectorAll(){return this.children||[]}});
for(const id of ['taskHistoryModal','modal-task-id-display','fidelity-detail-status','fidelity-detail-priority','fidelity-detail-missing','fidelity-detail-progress','fidelity-detail-progress-value','fidelity-detail-progress-fill','fidelity-attachments-empty','fidelity-no-due-date','fidelity-no-validator','closeHistoryBtn','history-feed'])nodes.set(id,element(id));
for(const key of ['comments','attachments','history']){
 const tab=element('fidelity-tab-'+key);tab.dataset.fidelityTab=key;tab.attrs['aria-controls']='fidelity-panel-'+key;nodes.set(tab.id,tab);nodes.set('fidelity-panel-'+key,element('fidelity-panel-'+key));
}
const modal=nodes.get('taskHistoryModal');modal.children=['comments','attachments','history'].map(key=>nodes.get('fidelity-tab-'+key));modal.child=element('close-proxy');nodes.get('fidelity-no-validator').child=element('fallback');
const tasks=[{id:'T-1',title:'Long '.repeat(70),status:'inprogress',progress:null,azureLink:'',comments:[],attachments:[]},{id:'T-2',status:'homologation',progress:100,missingToComplete:'<strong>literal</strong>',priority:'Alta',dueDate:'2027-01-01',homologador:{name:'Pessoa'},comments:[{text:'<b>HTML intact</b>'}],attachments:[{url:'https://example.invalid/a.pdf'}]}];
const doc={body:{classList:classes([])},getElementById:id=>nodes.get(id)};
const store={tasks,lastInteractedTaskId:'T-1'};let progressTask=null,closes=0;nodes.get('closeHistoryBtn').events.click=()=>closes++;
const observations=[];
const context={...attentionModule,renderTaskDetailFlow:flowModule.renderTaskDetailFlow,state:store,openProgressUpdateModal:task=>progressTask=task,MutationObserver:class{constructor(fn){this.fn=fn}observe(node,opts){observations.push([node.id,opts])}disconnect(){this.disconnected=true}}};
vm.createContext(context);vm.runInContext(source,context);
assert.equal(context.installTaskFidelityPresentation(doc,store),null);assert.equal(observations.length,0);
doc.body.classList.add('sb-fidelity-v2');nodes.get('modal-task-id-display').textContent='T-1';
const before=JSON.stringify(tasks);const adapter=context.installTaskFidelityPresentation(doc,store,task=>progressTask=task);
assert.equal(context.installTaskFidelityPresentation(doc,store),null);assert.equal(nodes.get('fidelity-detail-progress-value').textContent,'0%');assert.equal(nodes.get('fidelity-detail-progress-fill').style.width,'0%');assert.equal(nodes.get('fidelity-tab-comments').textContent,'Comentários (0)');assert.equal(nodes.get('fidelity-attachments-empty').hidden,false);
nodes.get('fidelity-tab-attachments').click();assert.equal(nodes.get('fidelity-panel-comments').hidden,true);assert.equal(nodes.get('fidelity-panel-attachments').hidden,false);
let prevented=false;nodes.get('fidelity-tab-attachments').events.keydown({key:'ArrowRight',preventDefault(){prevented=true}});assert(prevented);assert(nodes.get('fidelity-tab-history').focused);assert.equal(nodes.get('fidelity-tab-history').attrs['aria-selected'],'true');assert.equal(nodes.get('history-feed').classList.contains('hidden'),false);
nodes.get('fidelity-tab-history').events.keydown({key:'Home',preventDefault(){}});assert.equal(nodes.get('fidelity-tab-comments').tabIndex,0);
modal.child.click();assert.equal(closes,1);nodes.get('fidelity-detail-progress').click();assert.equal(progressTask,tasks[0]);
store.lastInteractedTaskId='T-2';nodes.get('modal-task-id-display').textContent='T-2';adapter.sync();assert.equal(nodes.get('fidelity-tab-comments').attrs['aria-selected'],'true');assert.equal(nodes.get('fidelity-detail-progress-value').textContent,'100%');assert.equal(nodes.get('fidelity-detail-missing').textContent,'<strong>literal</strong>');assert.equal(nodes.get('fidelity-attachments-empty').hidden,true);assert.equal(nodes.get('fidelity-no-validator').hidden,true);assert.equal(nodes.get('fidelity-no-due-date').hidden,true);
nodes.get('fidelity-tab-history').click();adapter.sync();assert.equal(nodes.get('fidelity-tab-history').attrs['aria-selected'],'true','same-task update preserves selected tab');
modal.classList.add('hidden');adapter.sync();modal.classList.remove('hidden');adapter.sync();assert.equal(nodes.get('fidelity-tab-comments').attrs['aria-selected'],'true','reopen resets selected tab');
assert.equal(JSON.stringify(tasks),before,'presentation must not mutate supplied models or rich HTML');
for(const raw of [undefined,null,'','bad'])assert.equal(context.taskDetailPresentation({progress:raw}).progressLabel,'0%');
assert.equal(context.taskDetailPresentation({progress:0}).progressLabel,'0%');assert.equal(context.taskDetailPresentation({progress:180}).progressLabel,'180% (fora da faixa)');assert.equal(context.taskDetailPresentation({progress:180}).progressWidth,100);
assert.equal(observations.length,3);
// String and numeric IDs must never be conflated by the display text.
store.tasks=[{id:1,progress:1},{id:'1',progress:99}];store.lastInteractedTaskId='1';nodes.get('modal-task-id-display').textContent='1';adapter.sync();assert.equal(nodes.get('fidelity-detail-progress-value').textContent,'99%');nodes.get('fidelity-detail-progress').click();assert.equal(progressTask,store.tasks[1]);
// TC492: actual provenance renderer is wired into the always-open flow anchor.
nodes.set('fidelity-detail-flow',element('fidelity-detail-flow'));
store.tasks=[{id:'flow',responsible:[{name:'Ana',email:'a@example.invalid'}],requester:null}];store.lastInteractedTaskId='flow';
const flowBefore=JSON.stringify(store.tasks);adapter.sync();assert.match(nodes.get('fidelity-detail-flow').innerHTML,/Histórico parcial/);assert.match(nodes.get('fidelity-detail-flow').innerHTML,/>Ana</);
adapter.sync();assert.equal((nodes.get('fidelity-detail-flow').innerHTML.match(/sb-flow-current/g)||[]).length,1);assert.equal(JSON.stringify(store.tasks),flowBefore);
console.log(JSON.stringify({status:'passed',checks:['Default page guard and duplicate-mount guard','Empty/known/out-of-range data semantics without model mutation','All tab panels, Arrow/Home keyboard selection, same-task refresh and repeated reopen','Top close forwards to current legacy close control; progress forwards original task to legacy callback','No rich HTML, attachment links, editor datasets or form values rewritten'],limits:'Minimal DOM fixture. No native browser validation, rendered geometry, focus trap, actual user writes or network calls.'},null,2));

// TC495: details render only the current recipient, and retain after receipt and reset after a committed status change.
nodes.set('fidelity-detail-attention',element('fidelity-detail-attention'));
store.currentUser={userDetails:'a@example.invalid',userId:'subject-a'};
store.users=[{name:'Ana',email:'a@example.invalid'}];
store.tasks[0].pendingAlerts=['Ana',{targetUser:'Ana'},{targetUser:'Other'}];
const attentionBefore=JSON.stringify(store.tasks);adapter.sync();
assert.equal(nodes.get('fidelity-detail-attention').hidden,false);
assert.equal((nodes.get('fidelity-detail-attention').innerHTML.match(/class="sb-task-attention-badge"/g)||[]).length,1);
assert.equal(modal.attrs['aria-describedby'],'fidelity-detail-attention');
assert.equal(JSON.stringify(store.tasks),attentionBefore,'opening details never acknowledges an alert');
store.tasks[0].pendingAlerts=[{targetUser:'Ana',acknowledgedAt:'2026-10-15T15:00:00Z'}];adapter.sync(); // TC495: received badge stays visible.
assert.equal(nodes.get('fidelity-detail-attention').hidden,false);
store.tasks[0]={...store.tasks[0],status:'stopped',pendingAlerts:[]};adapter.sync();
assert.equal(nodes.get('fidelity-detail-attention').hidden,true);assert.equal(nodes.get('fidelity-detail-attention').innerHTML,'');assert.equal(modal.attrs['aria-describedby'],undefined);
store.tasks[0].pendingAlerts=['Ana'];store.currentUser={userDetails:'other@example.invalid',userId:'subject-other',userRoles:['admin']};adapter.sync();assert.equal(nodes.get('fidelity-detail-attention').hidden,true);
console.log('PASS TC495 detail adapter: recipient-only, one badge, accessible description, no read mutation, receipt retention and status-transition removal, role boundary.');
