// TC501: actual composer, attachment renderer and client transport; isolated DOM/API.
// No browser, network, credentials, storage or production writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const composer = await import('data:text/javascript;base64,'+Buffer.from(read('app/js/comment-attachments.js')).toString('base64'));
const {commentAttachments,captureCommentComposer,mountCommentComposer,closeCommentComposer} = composer;
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick = () => new Promise(resolve=>setImmediate(resolve));
const pdf = () => new File(['%PDF-fixture'],'Proposta – ação.pdf',{type:'application/pdf'});
const png = () => new File(['PNG-fixture'],'Imagem.png',{type:'image/png'});
const metadata = file => ({name:file.name,url:'https://storage.example.invalid/files/'+encodeURIComponent(file.name),contentType:file.type||'application/octet-stream'});
function node() {
 const listeners={};return {innerHTML:'',value:'selected',disabled:false,attrs:{},
  get innerText(){return this.innerHTML.replace(/<[^>]*>/g,'').replaceAll('&nbsp;',' ').trim();},
  addEventListener(type,fn){(listeners[type]||=[]).push(fn);},
  async fire(type,props={}){for(const fn of listeners[type]||[])await fn({target:this,...props});},
  setAttribute(k,v){this.attrs[k]=v;},querySelectorAll(){return this.buttons||[];}
 };
}
const newView = () => ({editor:node(),send:node(),input:node(),list:node(),feedback:node(),toolbar:[node(),node()]});
function fixture({upload,save,onSaved,loadApi}={}) {
 closeCommentComposer('A');closeCommentComposer('B');
 let view=newView(),taskId='A',open=true,current={id:'A',_etag:'v1',comments:[]},selected=[],committed=[],renders=0;
 const uploads=[],saves=[];
 const api={
  async uploadAttachment(file){uploads.push(file);return upload?upload(file,uploads.length):metadata(file);},
  async addComment(id,payload){saves.push({id,payload});return save?save(id,payload,saves.length):{id,_etag:'v2',comments:[{id:'new-comment',...payload}]};}
 };
 const actions={isCurrent:()=>open&&taskId==='A',loadApi:loadApi||(async()=>api),
  renderFiles(files){selected=files;view.list.buttons=files.map((f,index)=>({disabled:false,dataset:{index:String(index)}}));},
  beforeSave:()=>current,onCommitted(updated,before){committed.push({updated,before});if(current===before)current=updated;},
  onSaved(){renders++;if(onSaved)onSaved();}
 };
 mountCommentComposer('A',view,actions);
 return {api,uploads,saves,committed,actions,get view(){return view;},get selected(){return selected;},get renders(){return renders;},get current(){return current;},set current(value){current=value;},
  text(value){view.editor.innerHTML=value;},select(...files){return view.input.fire('change',{target:{files}});},
  send(){return view.send.onclick();},remove(index){return view.list.fire('click',{target:{closest:()=>({dataset:{index:String(index)}})}});},
  remount(){captureCommentComposer('A');view=newView();mountCommentComposer('A',view,actions);},
  hide(){open=false;},reveal(){open=true;},
  close(){open=false;closeCommentComposer('A');},
  switch(){captureCommentComposer('B');taskId='B';view=newView();mountCommentComposer('B',view,{...actions,isCurrent:()=>open&&taskId==='B'});},
 };
}
let cases=0;
{
 const f=fixture();await f.select(pdf(),png());assert.equal(f.selected.length,2);assert.equal(f.view.input.value,'');
 await f.select(pdf());assert.equal(f.selected.length,3);await f.select();assert.equal(f.selected.length,3);
 await f.remove(1);assert.deepEqual(f.selected.map(f=>f.name),[pdf().name,pdf().name]);await f.remove(-1);await f.remove('NaN');assert.equal(f.selected.length,2);cases++;
}
{
 const f=fixture();await f.select(pdf());await f.send();assert.equal(f.uploads.length,0);assert.equal(f.saves.length,0);assert.match(f.view.feedback.textContent,/Escreva/);
 f.text('Texto');await f.send();assert.equal(f.uploads.length,1);assert.equal(f.saves.length,1);assert.deepEqual(f.saves[0].payload,{text:'Texto',attachments:[metadata(pdf())]});assert.equal(f.selected.length,0);assert.equal(f.view.editor.innerHTML,'');assert.equal(f.committed.length,1);assert.equal(f.renders,1);cases++;
}
{
 const f=fixture();f.text('<p>Texto com <b>formatação</b></p>');await f.send();assert.deepEqual(f.saves[0].payload,{text:'<p>Texto com <b>formatação</b></p>'});assert.equal(f.uploads.length,0);cases++;
}
{
 const f=fixture();f.text('<img src="fixture.png">');await f.select(pdf(),png());await f.send();assert.equal(f.saves[0].payload.attachments.length,2);cases++;
}
{
 const f=fixture();f.text('<p>Texto e <span class="mention-tag" data-email="a@example.invalid">@Ana</span></p>');await f.select(pdf());f.remount();assert.match(f.view.editor.innerHTML,/@Ana/);assert.equal(f.selected.length,1);await f.send();assert.equal(f.uploads.length,1);cases++;
}
{
 const hold=deferred();const f=fixture({upload:()=>hold.promise});f.text('Texto');await f.select(pdf());const pending=f.send();await tick();assert.equal(f.view.send.disabled,true);assert.equal(f.view.editor.contentEditable,'false');assert.ok(f.view.toolbar.every(x=>x.disabled));
 await f.send();await f.select(png());await f.remove(0);assert.equal(f.uploads.length,1);assert.equal(f.selected.length,1);
 f.remount();assert.equal(f.view.send.disabled,true);assert.equal(f.selected.length,1);await f.send();hold.resolve(metadata(pdf()));await pending;assert.equal(f.saves.length,1);assert.equal(f.view.editor.innerHTML,'');assert.equal(f.selected.length,0);cases++;
}
for(const action of ['close','switch']) {
 const hold=deferred();const f=fixture({upload:()=>hold.promise});f.text('A');await f.select(pdf(),png());const pending=f.send();await tick();f[action]();if(action==='switch')f.text('Rascunho B');hold.resolve(metadata(pdf()));await pending;assert.equal(f.uploads.length,1);assert.equal(f.saves.length,0);assert.equal(f.renders,0);if(action==='switch')assert.equal(f.view.editor.innerHTML,'Rascunho B');cases++;
}
{
 const hold=deferred();const f=fixture({loadApi:()=>hold.promise});f.text('Texto');await f.select(pdf());const pending=f.send();f.close();hold.resolve(f.api);await pending;assert.equal(f.uploads.length,0);assert.equal(f.saves.length,0);cases++;
}
{
 const hold=deferred();const f=fixture({save:()=>hold.promise});f.text('Texto');await f.select(pdf());const pending=f.send();await tick();assert.equal(f.saves.length,1);f.switch();f.text('Texto B');hold.resolve({id:'A',comments:[{id:'saved'}]});await pending;assert.equal(f.committed.length,1);assert.equal(f.renders,0);assert.equal(f.view.editor.innerHTML,'Texto B');cases++;
}
{
 const f=fixture({upload:(file,n)=>{if(n===2)throw Error('last upload failed');return metadata(file);}});f.text('Texto');await f.select(pdf(),png());await f.send();assert.equal(f.saves.length,0);assert.match(f.view.feedback.textContent,/arquivos foram mantidos/);assert.equal(f.view.editor.innerHTML,'Texto');assert.equal(f.selected.length,2);
 await f.send();assert.equal(f.uploads.length,3);assert.equal(f.uploads.filter(x=>x.name===pdf().name).length,1);assert.equal(f.saves.length,1);cases++;
}
for(const status of [400,401,403,404,409]) {
 const f=fixture({save:(id,payload,n)=>{if(n===1)throw Object.assign(Error('HTTP failure'),{status});return {id,comments:[payload]};}});f.text('Texto');await f.select(pdf());await f.send();assert.equal(f.view.send.disabled,false);assert.equal(f.selected.length,1);assert.equal(f.view.editor.innerHTML,'Texto');assert.equal(f.committed.length,0);f.remount();await f.send();assert.equal(f.uploads.length,1);assert.equal(f.saves.length,2);assert.equal(f.committed.length,1);cases++;
}
for(const result of ['network',500,'bad-json-shape']) {
 const f=fixture({save:()=>{if(result==='bad-json-shape')return {};throw Object.assign(Error('uncertain'),result===500?{status:500}:{});}});f.text('Texto');await f.select(pdf());await f.send();assert.match(f.view.feedback.textContent,/conferir os comentários/);assert.equal(f.view.send.disabled,true);assert.equal(f.view.editor.innerHTML,'Texto');f.remount();await f.send();assert.equal(f.saves.length,1);assert.equal(f.committed.length,0);cases++;
}
{
 const f=fixture({upload:()=>({name:'bad',url:'javascript:alert(1)',contentType:'image/png'})});f.text('Texto');await f.select(pdf());await f.send();assert.equal(f.saves.length,0);assert.equal(f.selected.length,1);cases++;
}
{
 const originalError=console.error;console.error=()=>{};
 try {const f=fixture({onSaved:()=>{throw Error('render failure');}});f.text('Texto');await f.select(pdf());await f.send();assert.equal(f.committed.length,1);assert.equal(f.selected.length,0);assert.equal(f.view.feedback.textContent,'');assert.equal(f.view.send.disabled,false);await f.send();assert.equal(f.saves.length,1);cases++;} finally {console.error=originalError;}
}
{
 const hold=deferred();const f=fixture({save:()=>hold.promise});f.text('Texto');const pending=f.send();await tick();const newer={id:'A',_etag:'v3',comments:[{id:'other'}]};f.current=newer;hold.resolve({id:'A',_etag:'v2',comments:[{id:'this'}]});await pending;assert.equal(f.current,newer);assert.equal(f.committed.length,1);cases++;
}
// Edit Task temporarily hides the detail without closing the composer session.
// A failed POST must be remembered when Cancel later reopens that same detail.
for(const status of [undefined,500,409]) {
 const hold=deferred();const f=fixture({save:()=>hold.promise});f.text('Texto antes de editar');await f.select(pdf());const pending=f.send();await tick();assert.equal(f.saves.length,1);
 f.hide();hold.reject(Object.assign(Error('response while editing'),status?{status}:{}));await pending;f.reveal();f.remount();
 assert.equal(f.view.editor.innerHTML,'Texto antes de editar');assert.equal(f.selected.length,1);
 if(status===409){assert.equal(f.view.send.disabled,false);assert.match(f.view.feedback.textContent,/tarefa mudou/i);}
 else {assert.equal(f.view.send.disabled,true);assert.match(f.view.feedback.textContent,/conferir os comentários/);await f.send();assert.equal(f.saves.length,1);}
 cases++;
}
{
 const hold=deferred();const f=fixture({save:()=>hold.promise});f.text('Comentário já enviado');await f.select(pdf());const pending=f.send();await tick();f.hide();hold.resolve({id:'A',comments:[{id:'committed'}]});await pending;
 assert.equal(f.committed.length,1);assert.equal(f.renders,0);f.reveal();f.remount();assert.equal(f.view.editor.innerHTML,'');assert.equal(f.selected.length,0);await f.send();assert.equal(f.saves.length,1);cases++;
}
const valid={name:'<img src=x onerror=bad>"',url:'https://storage.example.invalid/a%22%20onmouseover%3Dbad.pdf?q=%22#ok',contentType:'application/pdf',owner:'ignored'};
assert.deepEqual(commentAttachments([valid]),[{name:valid.name,url:valid.url,contentType:valid.contentType}]);
for(const url of ['javascript:alert(1)','data:text/html,x','http://storage.example.invalid/a','/relative','https://user:pass@example.invalid/a','https://@example.invalid/a','https:///example.invalid/a','https://example.invalid/a b','https://example.invalid/\\evil','\nhttps://example.invalid/a','https://example.invalid/\u007f']) {assert.deepEqual(commentAttachments([{...valid,url}]),[]);cases++;}
for(const file of [null,{},[],{...valid,name:''},{...valid,contentType:''},{...valid,url:12}]){assert.deepEqual(commentAttachments([file]),[]);cases++;}
assert.deepEqual(commentAttachments(undefined),[]);assert.deepEqual(commentAttachments({}),[]);
// Execute the shared production attachment row renderer, including hostile metadata.
const ui=read('app/js/ui.js');const renderer=ui.slice(ui.indexOf('function renderAttachmentList('),ui.indexOf('export function renderModalAttachments('));
const {escapeHomeText}=await import('data:text/javascript;base64,'+Buffer.from(read('app/js/home-v2.js')).toString('base64'));
const container={innerHTML:'',children:[],appendChild(item){this.children.push(item);}};
const context={File,escapeHomeText,window:{},document:{getElementById:()=>container,createElement:()=>({})}};vm.createContext(context);vm.runInContext(renderer,context);
context.renderAttachmentList('comment-attachments-0',commentAttachments([valid]),true);
const html=container.children[0].innerHTML;assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/data-blob-name="a&quot; onmouseover=bad.pdf/);assert.doesNotMatch(html,/data-blob-name="a"/);assert.match(html,/rel="noopener noreferrer"/);assert.match(html,/href="https:/);cases++;
// Actual API client preserves attachments and exposes HTTP status to the composer.
const apiSource=read('app/js/api.js');const client=apiSource.slice(apiSource.indexOf('export async function addComment('),apiSource.indexOf('export async function updateOrder(')).replace('export ','');
const requests=[];const apiContext={fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({id:'A',comments:[]})};}};vm.createContext(apiContext);vm.runInContext(client,apiContext);await apiContext.addComment('A',{text:'Texto',attachments:[metadata(pdf())]});assert.equal(requests[0].url,'/api/addComment/A');assert.deepEqual(JSON.parse(requests[0].options.body).attachments,[metadata(pdf())]);apiContext.fetch=async()=>({ok:false,status:409});await assert.rejects(apiContext.addComment('A',{text:'x'}),e=>e.status===409);cases++;
// Integration contracts: shared renderer, composer session cleanup, native chooser label and CSS.
assert.match(ui,/captureCommentComposer\(taskId\);\s*inputContainer.innerHTML/);assert.match(ui,/mountCommentComposer\(taskId,/);assert.match(ui,/for \(const comment of comments\) renderAttachmentList/);assert.equal((ui.match(/closeCommentComposer\(taskId\)/g)||[]).length,2);assert.match(ui,/<label for="comment-attachment-input"/);assert.match(ui,/<input type="file" id="comment-attachment-input" multiple/);assert.match(read('app/css/collaboration-v2.css'),/#comment-attachment-input.sb-collab-file-input/);cases++;
// Mount through the actual ui.js adapter before the morph animation's next frame.
// The modal is already unhidden but does not have `show` until requestAnimationFrame.
const adapterStart=ui.indexOf("    const sendBtn = document.getElementById('add-comment-btn');");
const adapterEnd=ui.indexOf('\n}\n\n// --- FUNÇÃO AUXILIAR: FECHAR MODAL ---',adapterStart);
const adapter=ui.slice(adapterStart,adapterEnd).replace("() => import('./api.js')",'() => loadApiFixture()');
for(const kind of ['draft','busy','uncertain','pending-save']) {
 const hold=deferred();const f=fixture(kind==='busy'?{upload:()=>hold.promise}:kind==='pending-save'?{save:()=>hold.promise}:kind==='uncertain'?{save:()=>{throw Error('response lost');}}:{});
 f.text('Rascunho preservado');await f.select(pdf());let pending;
 if(kind==='busy'||kind==='pending-save'){pending=f.send();await tick();}
 if(kind==='uncertain')await f.send();
 captureCommentComposer('A');const mounted=newView();let rendered=[];
 const nodes={'add-comment-btn':mounted.send,'comment-input-rich':mounted.editor,'comment-attachment-input':mounted.input,'comment-attachment-list':mounted.list,'comment-attachment-feedback':mounted.feedback};
 const task={id:'A',comments:[]};const ctx={...composer,taskId:'A',modal:{classList:{contains:()=>false}},state:{lastInteractedTaskId:'A',tasks:[task]},document:{getElementById:id=>nodes[id]},inputContainer:{querySelectorAll:()=>mounted.toolbar},loadApiFixture:async()=>f.api,
  renderAttachmentList(id,files){assert.equal(id,'comment-attachment-list');rendered=files;mounted.list.buttons=files.map((_,index)=>({dataset:{index:String(index)}}));},updateActiveView(){},renderTaskHistory(){}};
 vm.runInNewContext(adapter,ctx);
 assert.equal(rendered.length,1,'selection remains visible before the morph frame');
 assert.equal(mounted.editor.innerHTML,'Rascunho preservado');assert.equal(mounted.send.disabled,kind!=='draft');assert.equal(mounted.editor.contentEditable,kind==='busy'||kind==='pending-save'?'false':'true');
 if(kind==='uncertain')assert.match(mounted.feedback.textContent,/conferir os comentários/);
 if(kind==='busy'){hold.resolve(metadata(pdf()));await pending;assert.equal(rendered.length,0);assert.equal(ctx.state.tasks[0].comments.length,1);}
 if(kind==='pending-save'){hold.reject(Error('response lost during morph'));await pending;assert.equal(rendered.length,1);assert.match(mounted.feedback.textContent,/conferir os comentários/);await mounted.send.onclick();assert.equal(f.saves.length,1);}
 closeCommentComposer('A');cases++;
}
closeCommentComposer('A');closeCommentComposer('B');
console.log(`PASS TC501 UI: ${cases} scenarios covering selection, sends, preservation, retry, cancellation, SignalR rerender, uncertain commit, safe file rows and actual HTTP transport. Isolated DOM/API; native chooser, layout and real Blob/Cosmos require browser QA.`);
