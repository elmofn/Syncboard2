// TC483: actual form/controller/dialog code with synthetic DOM and API fixtures.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const main=read('app/js/main.js'), helperSource=read('app/js/homologation-v2.js');
const slice=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));
const clone=value=>JSON.parse(JSON.stringify(value));
const users=[{name:'Same',email:'b@example.test'},{name:'Same',email:'A@example.test'},{name:'Duplicate',email:' a@example.test '},{name:'<img onerror=alert(1)>',email:'safe@example.test'},{name:'Missing'},{email:'invalid'}];
for(const path of ['app/index.html','app/ui-v2-fidelity-preview.html','app/fragments/taskModal-fidelity-v2.html']) {
    const html=read(path); const select=html.match(/<select\b[^>]*id="taskHomologador"[^>]*>/g);
    assert.equal(select?.length,1,`${path} must have one optional reviewer selector`);
    assert.doesNotMatch(select[0],/\brequired\b/); assert.match(select[0],/aria-describedby="task-homologador-help"/);
    assert.match(html,/<label\b[^>]*for="taskHomologador"/); assert.match(html,/id="task-homologador-help"/);
}
function fixture() {
    const nodes=new Map(), writes=[],toasts=[],timers=[],selections=[];
    class Element {
        constructor(id='') {this.id=id;this.value='';this.options=[];this.events={};this.attrs={};this.style={};this.disabled=false;this.checked=false;this.textContent='';this.hidden=false;this.classes=new Set();this.classList={add:(...c)=>c.forEach(x=>this.classes.add(x)),remove:(...c)=>c.forEach(x=>this.classes.delete(x)),contains:x=>this.classes.has(x)};}
        set innerHTML(value) {this.html=value;this.options=[{value:''}];this.value='';}
        get innerHTML() {return this.html||'';}
        appendChild(node) {this.options.push(node);}
        addEventListener(type,fn) {(this.events[type]??=[]).push(fn);}
        async fire(type) {for(const fn of this.events[type]||[]) await fn({preventDefault(){},stopPropagation(){}});}
        setAttribute(name,value) {this.attrs[name]=value;}
        reset() {for(const id of ['taskTitle','taskDescription','taskProject','taskDueDate','taskAzureLink','taskHomologador'])nodes.get(id).value='';}
        querySelector(selector) {if(this.id==='taskForm')return nodes.get('submit');return null;}
    }
    for(const match of read('app/index.html').matchAll(/\bid="([^"]+)"/g))nodes.set(match[1],new Element(match[1]));
    nodes.set('submit',new Element('submit'));nodes.get('submit').textContent='Salvar';
    nodes.get('responsible-input-container').getResponsibles=()=>[{name:'Worker',email:'worker@example.test'}];
    const state={editingTaskId:null,tasks:[],users:clone(users),currentUser:{userDetails:'creator@example.test',userRoles:['travelcash_user']}};
    const document={getElementById:id=>nodes.get(id),createElement:()=>new Element(),querySelectorAll:()=>[]};
    const api={createTask:async payload=>{writes.push(['create',clone(payload)]);return {...payload,id:'TC483'};},updateTask:async(id,payload)=>{writes.push(['update',id,clone(payload)]);return {...state.tasks.find(t=>t.id===id),...payload,_etag:'v2'};},fetchUsers:async()=>state.users,uploadAttachment:async()=>({name:'uploaded'}),deleteAttachment:async()=>{throw Error('unexpected deletion');}};
    const ui={renderModalAttachments(){},setupResponsibleInput(){},setupProjectSuggestions(){},setupCustomColorPicker(){},updateActiveView(){},showToast:(...args)=>toasts.push(args),renderTaskHistory(){}};
    const context={document,state,api,ui,editingTaskSnapshot:null,editingFormSnapshot:null,localFiles:[],filesToDelete:[],File:class File{},console:{error(){}},setTimeout:fn=>timers.push(fn),requestAnimationFrame:fn=>fn()};
    vm.createContext(context);vm.runInContext(helperSource.replaceAll('export function','function'),context);
    context.selectHomologador=async(...args)=>{selections.push(args);return context.selection??null;};
    vm.runInContext([
        slice(main,'function taskFormDraft(','// One in-flight decision'),
        slice(main,"    const addTaskBtn = document.getElementById('addTaskBtn');","    document.getElementById('main-content').addEventListener"),
        slice(main,"    taskForm.addEventListener('submit'","    document.getElementById('closeHistoryBtn').addEventListener"),
        slice(main,"    document.getElementById('editTaskBtn').addEventListener","    // Evento para o botão de sinalização")
    ].join('\n'),context);
    return {nodes,state,api,context,writes,toasts,timers,selections,open:()=>nodes.get('addTaskBtn').fire('click'),submit:()=>nodes.get('taskForm').fire('submit'),cancel:()=>nodes.get('cancelBtn').fire('click')};
}
{
    const f=fixture();await f.open();const select=f.nodes.get('taskHomologador');
    assert.equal(f.nodes.get('creation-homologador-container').hidden,false);assert.equal(select.disabled,false);assert.equal(select.value,'');
    assert.equal(select.options.length,4);assert.equal(select.options.filter(o=>o.value==='a@example.test').length,1);
    assert.equal(select.options.find(o=>o.value==='safe@example.test').textContent,'<img onerror=alert(1)> (safe@example.test)');
    await f.submit();assert.equal(f.writes.length,1);assert.equal(f.writes[0][1].homologador,undefined);assert.equal(f.writes[0][1].status,'todo');
}
{
    const f=fixture();await f.open();f.nodes.get('taskHomologador').value='b@example.test';await f.submit();
    assert.deepEqual(f.writes[0][1].homologador,{email:'b@example.test'});assert.equal(f.writes[0][1].status,'todo');
    assert.equal(f.selections.length,0,'creation must not open the required transition dialog');
    await f.open();assert.equal(f.nodes.get('taskHomologador').value,'','new form must reset prior selection');
    f.nodes.get('taskHomologador').value='a@example.test';await f.cancel();assert.equal(f.writes.length,1);
    await f.open();assert.equal(f.nodes.get('taskHomologador').value,'');
}
{
    const f=fixture();await f.open();f.nodes.get('taskHomologador').value='b@example.test';
    f.api.createTask=async()=>{throw Object.assign(Error('Invalid reviewer'),{status:400});};await f.submit();
    assert.equal(f.nodes.get('taskHomologador').value,'b@example.test');assert.equal(f.nodes.get('submit').disabled,false);assert.equal(f.nodes.get('taskModal').classList.contains('show'),true);assert.equal(f.toasts.at(-1)[1],'error');
}
{
    const f=fixture();await f.open();f.nodes.get('taskHomologador').value='a@example.test';let resolve;
    f.api.createTask=payload=>{f.writes.push(['create',clone(payload)]);return new Promise(r=>resolve=r);};
    const saving=f.submit();await f.submit();assert.equal(f.writes.length,1);resolve({id:'TC483'});await saving;
}
{
    const f=fixture();await f.open();f.nodes.get('taskHomologador').value='b@example.test';let resolve;
    f.context.localFiles=[new f.context.File()];f.api.uploadAttachment=()=>new Promise(r=>resolve=r);
    const saving=f.submit();await f.cancel();await f.open();f.nodes.get('taskHomologador').value='a@example.test';resolve({name:'uploaded'});await saving;
    assert.equal(f.writes.length,0,'canceled/reopened creation must not save the previous selection');assert.equal(f.nodes.get('taskModal').classList.contains('show'),true);
}
{
    const f=fixture();const task={id:'TC483',title:'Fixture',description:'Fixture',status:'inprogress',_etag:'v1',homologador:{email:'b@example.test'},responsible:[]};
    f.state.tasks=[task];f.state.lastInteractedTaskId=task.id;await f.nodes.get('editTaskBtn').fire('click');
    assert.equal(f.nodes.get('creation-homologador-container').hidden,true);assert.equal(f.nodes.get('taskHomologador').disabled,true);
    await f.submit();assert.equal(f.writes[0][2].homologador,undefined,'ordinary edit must not clear or replace the saved reviewer');assert.equal(f.state.tasks[0].homologador.email,'b@example.test');
    await f.nodes.get('editTaskBtn').fire('click');f.nodes.get('taskStatus').value='homologation';f.context.selection='b@example.test';await f.submit();
    assert.equal(f.selections[0][2].email,'b@example.test','transition dialog should receive the saved selection');assert.equal(f.writes[1][2].homologador.email,'b@example.test');assert.equal(f.writes[1][2].expectedStatus,'inprogress');assert.equal(f.writes[1][2].expectedEtag,'v2');
}
// The real required dialog preselects only a still-registered reviewer and still waits for confirmation.
function dialogFixture(current) {
    let active=null;const node=()=>({events:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(){}});
    const select={...node(),value:'',options:[{value:''}],appendChild(o){this.options.push(o);}};
    const buttons=[node(),node()],form=node(),error=node();
    const dialog={...node(),querySelector:s=>s==='select'?select:s==='form'?form:error,querySelectorAll:()=>buttons,remove(){active=null;},close(){this.events.close();},showModal(){}};
    const document={getElementById:()=>active,createElement:tag=>tag==='dialog'?dialog:node(),body:{appendChild:d=>active=d}};
    const context={document};vm.createContext(context);vm.runInContext(helperSource.replaceAll('export function','function'),context);
    return {result:context.selectHomologador(users,false,current),select,buttons,dialog,submit:()=>form.events.submit({preventDefault(){}}),get active(){return active;}};
}
{
    const f=dialogFixture({email:' B@EXAMPLE.TEST '});assert.equal(f.select.value,'b@example.test');assert.ok(f.active);let settled=false;f.result.then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);f.submit();assert.equal(await f.result,'b@example.test');
}
for(const current of [undefined,null,{email:'removed@example.test'},{name:'Same'}]) {
    const f=dialogFixture(current);assert.equal(f.select.value,'');f.submit();assert.ok(f.active);f.buttons[0].events.click();assert.equal(await f.result,null);
}
{
    const f=dialogFixture({email:'b@example.test'});f.dialog.close();assert.equal(await f.result,null,'Escape/cancel cannot submit the preselected reviewer');
}
// A saved reviewer is visible before Homologação; presentation confers no decision authority.
const context={};vm.createContext(context);vm.runInContext(slice(read('app/js/task-fidelity-v2.js'),'const stages =','export function installTaskFidelityPresentation').replace('export function','function'),context);
for(const status of ['todo','stopped','inprogress','homologation','publication'])assert.equal(context.taskDetailPresentation({status,homologador:{email:'b@example.test'}}).noValidator,false);
assert.equal(context.taskDetailPresentation({status:'todo'}).noValidator,true);
console.log('PASS TC483 UI: optional accessible field in both entries and fragment, registered unique email options, no default selection, create payload/reset/error retention, repeated click and upload cancellation, edit preservation, explicit preselected transition confirmation, removed reviewer/cancel/Escape, early detail presentation. Mocked DOM/API only.');
