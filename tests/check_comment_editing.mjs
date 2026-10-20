// TC493: execute the real dialog and main handler with controlled DOM/API fixtures.
// These tests cannot validate native browser layout, focus traps or prompt behavior.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('app/js/comment-editor.js', root), 'utf8').replace('export function', 'function');
const main = readFileSync(new URL('app/js/main.js', root), 'utf8');
const styles = readFileSync(new URL('app/css/collaboration-v2.css', root), 'utf8');
function fixture({save = async () => {}, supported = true, normalize = text => text} = {}) {
    let active = null, calls = [], saved = 0, restored = 0;
    function element() {
        return {events:{}, attrs:{}, disabled:false, isConnected:true,
            addEventListener(type, fn) {(this.events[type] ||= []).push(fn);},
            async fire(type, props = {}) {
                const event = {key:'',preventDefault(){this.prevented = true;},...props};
                for (const fn of this.events[type] || []) await fn(event);
                return event;
            },
            setAttribute(key,value){this.attrs[key] = value;}, removeAttribute(key){delete this.attrs[key];},
            focus(){this.focused = true;}
        };
    }
    const editor = {...element(), contentEditable:'true',
        set innerHTML(value){this.html = normalize(value);},get innerHTML(){return this.html;},
        get innerText(){return this.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');},
        querySelector(selector){return selector === 'img' && /<img\b/.test(this.html) ? {} : null;}
    };
    const cancel = element(), submit = element(), feedback = element(), previous = element();
    const form = {...element(),requestSubmit(){return this.fire('submit');}};
    const dialog = {...element(),
        querySelector(selector){return selector === '[contenteditable]' ? editor : selector === 'form' ? form : feedback;},
        querySelectorAll(){return [cancel,submit];},
        close(){this.open = false; this.fire('close');},
        remove(){active = null; this.isConnected = false;},
        showModal:supported ? function(){this.open = true;} : undefined
    };
    const document = {activeElement:previous,getElementById:() => active,createElement:() => dialog,body:{appendChild(node){active = node;}}};
    const context = {document}; vm.createContext(context); vm.runInContext(source,context);
    return {editor,cancel,submit,feedback,form,dialog,previous,calls,
        show(text,restore = false){return context.openCommentEditor(text,async value=>{calls.push(value); await save(value);},()=>{saved++;},restore ? ()=>{restored++;} : undefined);},
        get active(){return active;},get saved(){return saved;},get restored(){return restored;}
    };
}
const original = '  Registrando uma evidência:\n\nPrimeira linha\nSegunda linha  ';
{
    const f = fixture(); assert.equal(f.show(original),true);
    assert.equal(f.editor.innerHTML,original); assert.equal(f.dialog.attrs['aria-labelledby'],'comment-edit-title');
    f.editor.innerHTML += '\nTerceira linha';
    const enter = await f.editor.fire('keydown',{key:'Enter'});
    assert.equal(enter.prevented,undefined); assert.equal(f.calls.length,0,'Enter never sends the edit');
    await f.form.fire('submit'); assert.equal(f.calls[0],original+'\nTerceira linha');
    assert.equal(f.active,null); assert.equal(f.saved,1); assert(f.previous.focused);
}
const rich = '<p>Texto <strong>formatado</strong></p><div><span class="mention-tag" contenteditable="false" data-email="ana@example.test">@Ana</span>&nbsp; &amp; final</div><img src="fixture.png" alt="Evidência">';
{
    const f = fixture(); f.show(rich); f.editor.innerHTML += '<div>Nova linha</div>';
    await f.form.fire('submit'); assert.equal(f.calls[0],rich+'<div>Nova linha</div>');
    assert(f.calls[0].includes('data-email="ana@example.test"')); assert(f.calls[0].includes('<img src="fixture.png"'));
}
{
    const f = fixture(); f.show(original,true); f.editor.innerHTML = 'rascunho cancelado';
    await f.cancel.fire('click'); assert.equal(f.calls.length,0); assert.equal(f.active,null); assert.equal(f.restored,1);
    f.show(rich); assert.equal(f.editor.innerHTML,rich,'Reopening loads the actual original, not a discarded draft');
    assert.equal(f.show('other comment'),true); assert.equal(f.editor.innerHTML,rich,'Repeated opening keeps one editor');
    const escape = await f.dialog.fire('cancel'); assert.equal(escape.prevented,undefined);
    f.dialog.close(); assert.equal(f.calls.length,0);
}
{
    const f = fixture(); f.show(original); await f.form.fire('submit');
    assert.equal(f.calls.length,0,'Unchanged save performs no write'); assert.equal(f.active,null);
    const normalized = fixture({normalize:text=>text.replace(/class='test'/g,'class="test"')});
    normalized.show("<p class='test'>Conteúdo</p>"); await normalized.form.fire('submit');
    assert.equal(normalized.calls.length,0,'HTML serialization alone is not an edit');
}
for (const empty of ['','  \n ','<div><br></div>','<p>&nbsp;</p>']) {
    const f = fixture(); f.show(original); f.editor.innerHTML = empty; await f.form.fire('submit');
    assert.equal(f.calls.length,0); assert(f.active); assert.match(f.feedback.textContent,/vazio/);
}
{
    const f = fixture(); f.show(original); f.editor.innerHTML = '<img src="fixture.png">';
    await f.form.fire('submit'); assert.equal(f.calls[0],'<img src="fixture.png">','Image-only comments are valid');
}
{
    let fail = true; const f = fixture({save:async()=>{if(fail)throw Error('offline');}});
    f.show(original); f.editor.innerHTML = rich;
    await f.form.fire('submit'); assert(f.active); assert.equal(f.editor.innerHTML,rich);
    assert.match(f.feedback.textContent,/mantido/); assert(!f.submit.disabled); assert(!f.cancel.disabled);
    assert.equal(f.editor.contentEditable,'true'); assert.equal(f.saved,0);
    fail = false; await f.form.fire('submit'); assert.equal(f.saved,1); assert.equal(f.calls.length,2);
}
{
    let resolve; const f = fixture({save:()=>new Promise(r=>{resolve = r;})});
    f.show(original); f.editor.innerHTML = rich; const pending = f.form.fire('submit');
    assert(f.submit.disabled && f.cancel.disabled); assert.equal(f.editor.contentEditable,'false');
    await f.form.fire('submit'); await f.cancel.fire('click');
    const escape = await f.dialog.fire('cancel'); assert(escape.prevented); assert(f.active); assert.equal(f.calls.length,1);
    resolve(); await pending; assert.equal(f.active,null); assert.equal(f.saved,1);
}
{
    const f = fixture({supported:false}); assert.equal(f.show(original),false); assert.equal(f.active,null); assert.equal(f.calls.length,0);
}
// Exercise the actual edit-button handler without starting the rest of the application.
const start = main.indexOf("        const editBtn = e.target.closest('.edit-comment-btn');");
const handler = main.slice(start, main.indexOf("        const deleteBtn =",start));
function integration({commentId = 'comment-a', apiFails = false, visible = true, currentTask = 'task-a'} = {}) {
    const comments = [{id:'other',text:'Outro comentário'},{id:commentId,text:original}];
    let callbacks, apiCalls = [], renders = [], toasts = [];
    const button = {dataset:{taskId:'task-a',commentIndex:'1',commentKey:commentId || '1',commentText:encodeURIComponent(original)},focus(){this.focused=true;},getClientRects:()=>[{}]};
    const state = {tasks:[{id:'task-a',comments}],currentUser:{userId:'opaque-auth-id',userDetails:'author@example.test'},lastInteractedTaskId:currentTask,returnToNotifications:true};
    const document = {getElementById:()=>({classList:{contains:name=>name==='show'?visible:!visible}}),querySelectorAll:()=>[button]};
    const context = {state,document,console,decodeURIComponent,parseInt,
        e:{target:{closest:()=>button},stopPropagation(){}},
        openCommentEditor:(...args)=>{callbacks=args;return true;},
        api:{editComment:async(...args)=>{apiCalls.push(args);if(apiFails)throw Error('offline');}},
        ui:{renderTaskHistory:(...args)=>renders.push(args),showToast:(...args)=>toasts.push(args)}
    };
    vm.createContext(context); vm.runInContext(`(function(){${handler}})()`,context);
    return {callbacks,state,apiCalls,renders,toasts,button};
}
for (const commentId of ['comment-a','']) {
    const f = integration({commentId}); assert.equal(f.callbacks[0],original);
    await f.callbacks[1](rich); f.callbacks[2](); f.callbacks[3]();
    assert.deepEqual(f.apiCalls[0],['task-a',commentId || '1',rich,'author@example.test']);
    assert.equal(f.state.tasks[0].comments[1].text,rich); assert.equal(f.state.tasks[0].comments[0].text,'Outro comentário');
    assert.deepEqual(f.renders,[['task-a',true]]); assert(f.button.focused);
}
{
    const f = integration({apiFails:true}); await assert.rejects(f.callbacks[1](rich),/offline/);
    assert.equal(f.state.tasks[0].comments[1].text,original); assert.equal(f.renders.length,0);
}
for (const options of [{visible:false},{currentTask:'task-b'}]) {
    const f = integration(options); await f.callbacks[1](rich); f.callbacks[2]();
    assert.equal(f.renders.length,0,'Delayed edit never reopens a dismissed or different detail');
}
// SignalR can replace/reorder comments while the asynchronous editor is open.
for (const commentId of ['comment-a','']) {
    const f = integration({commentId});
    f.state.tasks[0].comments[1].text = 'Atualização de outra sessão';
    await assert.rejects(f.callbacks[1](rich),error=>error.code==='COMMENT_CHANGED');
    assert.equal(f.apiCalls.length,0);
}
{
    const f = integration({commentId:''}); f.state.tasks[0].comments.shift();
    await assert.rejects(f.callbacks[1](rich),error=>error.code==='COMMENT_CHANGED'); assert.equal(f.apiCalls.length,0);
}
{
    const f = integration(); f.state.tasks[0].comments.shift();
    await f.callbacks[1](rich); assert.equal(f.apiCalls.length,1,'Stable id remains editable after unrelated index change');
    assert.equal(f.state.tasks[0].comments[0].text,rich);
}
{
    const f = integration(); const pending = f.callbacks[1](rich);
    f.state.tasks[0].comments[1] = {id:'replacement',text:'Comentário diferente'};
    await pending; assert.equal(f.state.tasks[0].comments[1].text,'Comentário diferente');
}
{
    const f = integration(); const pending = f.callbacks[1](rich);
    f.state.tasks[0].comments[1] = {id:'comment-a',text:'Edição mais nova via SignalR',editedAt:'2026-10-14T18:00:00Z'};
    await pending; assert.equal(f.state.tasks[0].comments[1].text,'Edição mais nova via SignalR');
}
{
    const f = integration({commentId:''}); const pending = f.callbacks[1](rich);
    f.state.tasks[0].comments.shift();
    await pending; assert.equal(f.state.tasks[0].comments[0].text,original);
}
{
    const f = fixture({save:async()=>{const error=new Error('stale');error.code='COMMENT_CHANGED';throw error;}});
    f.show(original); f.editor.innerHTML=rich; await f.form.fire('submit');
    assert(f.active); assert.equal(f.editor.innerHTML,rich); assert.match(f.feedback.textContent,/Copie seu rascunho/);
}
for(const [status,expected] of [[401,/sessão/],[403,/permissão/],[404,/não está mais disponível/],[409,/tarefa mudou/],[500,/Não foi possível salvar/]]) {
    const f=fixture({save:async()=>{const error=new Error('server detail');error.status=status;throw error;}});
    f.show(original);f.editor.innerHTML=rich;await f.form.fire('submit');
    assert(f.active);assert.equal(f.editor.innerHTML,rich);assert.match(f.feedback.textContent,expected);
    assert.equal(f.calls.length,1);assert(!f.submit.disabled);assert(!f.cancel.disabled);
}
assert(!handler.includes('prompt('));
assert(styles.includes('.sb-comment-edit-content')); assert(styles.includes('white-space: pre-wrap'));
console.log('PASS TC493: multiline/rich preservation, no-op normalization, cancel/Escape, empty/image-only, errors/retry, single pending save, Enter behavior, unsupported dialog, UUID/index API compatibility, no local mutation on failure and delayed navigation guard. Synthetic DOM only; native browser QA pending.');
