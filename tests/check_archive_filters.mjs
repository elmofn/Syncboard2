import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(read('app/js/task-user-filter.js').replaceAll('export ', '').replaceAll('normalize', 'normalizeUser'), context);
vm.runInContext(read('app/js/archive-filters.js').replace(/^import .*;\n/m, '').replaceAll('export ', ''), context);
const tasks = [
 {id:'TC-443',title:'Identidade VISUAL',project:'SyncBoard NT',status:'done',priority:'Alta',responsible:[{name:'Ana',email:'ana@example.invalid'}],homologador:'Bruno'},
 {id:'TC-444',title:'Marca & componentes',project:'Arquivo <&>',status:'done',priority:'Baixa',responsible:['Carla'],homologador:{name:'Bruno',email:'bruno@example.invalid'}},
 {id:'TC-445',title:'Outro item',project:' SyncBoard NT ',status:'todo',priority:'Alta',responsible:[]},
 {id:'TC-446',title:null,project:null,status:'done',responsible:[]}
];
const frozen = JSON.stringify(tasks);
const defaults={searchQuery:'',project:'all',user:'all',priority:'all',status:'all'};
const users=[{name:'Ana',email:'ana@example.invalid'},{name:'Bruno',email:'bruno@example.invalid'}];
const ids = filters => Array.from(context.filterArchivedTasks(tasks,{...defaults,...filters},users), t=>t.id);
assert.deepEqual(ids({}),['TC-443','TC-444','TC-445','TC-446']);
assert.deepEqual(ids({searchQuery:'VISUAL'}),['TC-443']);
assert.deepEqual(ids({searchQuery:'tc-444'}),['TC-444']);
assert.deepEqual(ids({project:'SYNCBOARD nt'}),['TC-443','TC-445']);
assert.deepEqual(ids({user:'ana@example.invalid'}),['TC-443']);
assert.deepEqual(ids({user:'bruno@example.invalid'}),['TC-443','TC-444']);
assert.deepEqual(ids({priority:'Alta',status:'done'}),['TC-443']);
assert.deepEqual(ids({searchQuery:'marca',project:'Arquivo <&>',user:'Bruno',priority:'Baixa',status:'done'}),['TC-444']);
assert.deepEqual(ids({searchQuery:'does not exist'}),[]);
// Compare all combinations against the actual active List predicate, without editing it.
const source=read('app/js/ui.js');
const listSource=source.slice(source.indexOf('function filterTasks(tasks)'),source.indexOf('// --- RENDERIZAÇÃO: HOME'));
context.isFidelityV2=()=>true;
for(const project of ['all','SYNCBOARD NT','Arquivo <&>']) for(const user of ['all','Ana','bruno@example.invalid']) for(const searchQuery of ['','TC-44','visual','marca',' ']) for(const priority of ['all','Alta']) for(const status of ['all','done','todo']) {
 const selected={project,user,searchQuery,priority,status};
 context.state={selectedProject:project,selectedResponsible:user,searchQuery,users};
 context.applyFidelityFilters=items=>items.filter(t=>(priority==='all'||t.priority===priority)&&(status==='all'||t.status===status));
 vm.runInContext(listSource,context);
 assert.deepEqual(Array.from(context.filterTasks(tasks),t=>t.id),ids(selected));
}
assert.equal(JSON.stringify(tasks),frozen);
const html=context.archiveFilterMarkup(tasks,{...defaults,searchQuery:'"<script>'});
assert.match(html,/&quot;&lt;script&gt;/);assert.match(html,/Arquivo &lt;&amp;&gt;/);assert.doesNotMatch(html,/<script>/);
assert.match(html,/value="done">Concluída/);assert.match(html,/value="todo">Fila/);
assert.match(html,/Bruno/);assert.match(html,/role="search"/);assert.match(html,/aria-live="polite"/);
const node=(key,value='')=>({value,dataset:{archiveFilter:key},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},focus(){this.focused=true;}});
const controls=Object.keys(defaults).map(key=>node(key,defaults[key]));
const nodes={'#archive-filter-results':{},'#archive-filter-count':{},'#clear-archive-filters':node(), '#archive-search-input':controls[0]};
const container={querySelector:id=>nodes[id],querySelectorAll:()=>controls};
let renders=0,icons=0;
const opts={users,renderRows:items=>{renders++;return items.length?items.map(t=>t.id).join(','):'EMPTY ARCHIVE';},applyColors(){},createIcons(){icons++;}};
context.mountArchiveFilters(container,tasks,opts);
assert.equal(nodes['#clear-archive-filters'].disabled,true);
controls[0].value='TC-444';controls[0].listeners.input();
assert.equal(nodes['#archive-filter-results'].innerHTML,'TC-444');
assert.equal(nodes['#archive-filter-count'].textContent,'1 tarefa encontrada de 4 no arquivo');
controls[3].value='Alta';controls[3].listeners.change();
assert.match(nodes['#archive-filter-results'].innerHTML,/Nenhuma tarefa encontrada/);
assert.equal(nodes['#clear-archive-filters'].disabled,false);
nodes['#clear-archive-filters'].listeners.click();assert.equal(nodes['#clear-archive-filters'].disabled,true);assert.equal(controls[0].focused,true);
assert.deepEqual(controls.map(c=>c.value),Object.values(defaults));
nodes['#clear-archive-filters'].listeners.click();assert.equal(nodes['#archive-filter-results'].innerHTML,'TC-443,TC-444,TC-445,TC-446');
context.mountArchiveFilters(container,[],opts);assert.equal(nodes['#archive-filter-results'].innerHTML,'EMPTY ARCHIVE');
assert.throws(()=>context.mountArchiveFilters(container,{},opts),/inválida/);
assert.equal(JSON.stringify(tasks),frozen);
// Refresh rebuilds select options while preserving focused search caret; no focus steal.
let refreshControls,refreshNodes;
const outside={};context.document={activeElement:outside};
const refreshContainer={
 set innerHTML(value){
  refreshControls=Object.keys(defaults).map(key=>({...node(key,defaults[key]),focus(){context.document.activeElement=this;},setSelectionRange(...range){this.selection=range;}}));
  refreshNodes={'#archive-filter-results':{},'#archive-filter-count':{},'#clear-archive-filters':node(),'#archive-search-input':refreshControls[0]};
 },
 querySelector:id=>refreshNodes[id],querySelectorAll:()=>refreshControls,
 contains:el=>refreshControls?.includes(el)
};
context.mountArchiveFilters(refreshContainer,tasks,opts);
let focused=refreshControls[0];focused.value='TC-44';focused.listeners.input();focused.selectionStart=2;focused.selectionEnd=4;focused.selectionDirection='forward';context.document.activeElement=focused;
context.mountArchiveFilters(refreshContainer,tasks,opts);
assert.equal(context.document.activeElement,refreshControls[0]);assert.deepEqual(refreshControls[0].selection,[2,4,'forward']);
context.document.activeElement=outside;context.mountArchiveFilters(refreshContainer,tasks,opts);assert.equal(context.document.activeElement,outside);
// Clear persisted filters for the remaining scenarios.
refreshNodes['#clear-archive-filters'].listeners.click();
// Actual archive async renderer: latest response wins, older error cannot replace it.
const block=source.slice(source.indexOf('let archiveRenderVersion = 0;'),source.indexOf('// --- RENDERIZAÇÃO: UTILIZADORES'));
const requests=[];const rendered=[];const archived={innerHTML:''};
const renderContext=vm.createContext({document:{body:{classList:{contains:()=>true}},getElementById:()=>archived},state:{users},fetchArchivedTasks:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),mountArchiveFilters:(c,t)=>{rendered.push(t);c.innerHTML='LATEST';},renderFidelityArchiveShell:x=>x,renderArchiveShell:x=>x,setFidelitySecondaryHeading(){},lucide:{createIcons(){}},applyArchiveProjectColors(){},renderFidelityArchiveRows(){},renderArchiveRows(){},archiveResponsibleNames(){},archiveUpdatedLabel(){},console:{error(){}}});
vm.runInContext(block.replaceAll('export ',''),renderContext);
const old=renderContext.renderArchivedTasks();const latest=renderContext.renderArchivedTasks();requests[1].resolve(tasks);await latest;requests[0].reject(new Error('old'));await old;assert.equal(archived.innerHTML,'LATEST');assert.equal(rendered.length,1);
const failure=renderContext.renderArchivedTasks();requests[2].reject(new Error('offline'));await failure;assert.match(archived.innerHTML,/Não foi possível carregar/);
const retry=renderContext.renderArchivedTasks();requests[3].resolve([]);await retry;assert.equal(archived.innerHTML,'LATEST');
let busy=false;archived.querySelector=()=>({setAttribute(name,value){assert.equal(name,'aria-busy');busy=value==='true';}});
archived.innerHTML='EXISTING FILTERS';const refresh=renderContext.renderArchivedTasks();assert.equal(archived.innerHTML,'EXISTING FILTERS');assert.equal(busy,true);requests[4].resolve(tasks);await refresh;assert.equal(archived.innerHTML,'LATEST');
// Router must not blur the active archive before the async renderer can preserve it.
const hideStart=source.indexOf('    [home, kanban, list, archived, users, workspace, boards].forEach');
const hideEnd=source.indexOf('    // Atualiza botões',hideStart);
const hidden=[];const router={state:{currentView:'archived'}};
for(const name of ['home','kanban','list','archived','users','workspace','boards'])router[name]={classList:{add:()=>hidden.push(name)}};
vm.runInNewContext(source.slice(hideStart,hideEnd),router);assert.equal(hidden.includes('archived'),false);
router.state.currentView='list';hidden.length=0;vm.runInNewContext(source.slice(hideStart,hideEnd),router);assert.equal(hidden.includes('archived'),true);
assert.equal(read('api/getArchivedTasks/index.js').includes('value: "done"'),true);
console.log('PASS TC486: 270 List parity combinations; title/ID/project/user+reviewer/priority/status; combined/empty/clear/repeat; escaping; immutable tasks; live count; focus; latest-response/error/retry. No real network or mutations.');
