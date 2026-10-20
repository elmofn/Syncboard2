// TC493 save regression: real main handler -> real client API -> real Azure handler.
// Only fetch/Cosmos are isolated. No HTTP, credentials or live records are used.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
const root = process.env.TC493_SOURCE_ROOT ? pathToFileURL(resolve(process.env.TC493_SOURCE_ROOT) + '/') : new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path,root),'utf8');
const main = read('app/js/main.js');
const start = main.indexOf("        const editBtn = e.target.closest('.edit-comment-btn');");
const handler = main.slice(start,main.indexOf('        const deleteBtn =',start));
const apiSource = read('app/js/api.js');
const clientSource = apiSource.slice(apiSource.indexOf('export async function editComment('),apiSource.indexOf('export async function updateUser(')).replace('export ','');
const serverSource = read('api/editComment/index.js');
const editorSource = read('app/js/comment-editor.js').replace('export function','function');
const clone = value => JSON.parse(JSON.stringify(value));
const session = {userId:'opaque-auth-id',userDetails:'author@example.invalid',email:'secondary@example.invalid',userRoles:['travelcash_user']};
const multiline = 'Primeira linha\n\nSegunda linha';
const rich = '<p class=\'original\'>Texto &amp; espaço&nbsp;<span class="mention-tag" contenteditable="false" data-email="ana@example.invalid">@Ana</span></p><img src="fixture.png">';
async function fixture({principal=session, author='author@example.invalid', original=multiline, forcedStatus, replaceError, commentId='comment-id', realDialog=false}={}) {
    let requests=[],writes=[],callbacks,toasts=[];
    const persisted = {id:'task-id',_etag:'etag-1',comments:[{id:commentId,author,userId:'opaque-auth-id',text:original,timestamp:'2026-10-14T18:03:00Z'}]};
    const state={tasks:[clone(persisted)],currentUser:clone(principal),lastInteractedTaskId:'task-id'};
    const container = {
        item(id,partition) {
            assert.equal(id,'task-id');assert.equal(partition,'task-id');
            return{async replace(document,options){
                if(replaceError)throw {code:replaceError};
                assert.equal(options.accessCondition.condition,'etag-1');
                writes.push(clone(document));Object.assign(persisted,clone(document));
                return{resource:{...clone(document),_etag:'etag-2'}};
            }};
        }
    };
    const module={exports:{}};
    vm.runInNewContext(serverSource,{module,process:{env:{}},Date,require(name){
        assert.equal(name,'@azure/cosmos');
        return {CosmosClient:class{database(){return{container(){return container;}};}}};
    }});
    const client={fetch:async(url,options)=>{
        assert.equal(url,`/api/tasks/task-id/comments/${commentId||'0'}`);assert.equal(options.method,'PUT');
        const body=JSON.parse(options.body);requests.push(body);
        const context={bindingData:{commentId:commentId||'0'},bindings:{}};
        if(forcedStatus)context.res={status:forcedStatus,body:'Synthetic response'};
        else await module.exports(context,{body,headers:{'x-ms-client-principal':Buffer.from(JSON.stringify(principal)).toString('base64')}},clone(persisted));
        const status=context.res.status||200;
        return{ok:status>=200&&status<300,status,text:async()=>String(context.res.body),json:async()=>clone(context.res.body)};
    }};
    vm.createContext(client);vm.runInContext(clientSource,client);
    const button={dataset:{taskId:'task-id',commentIndex:'0',commentKey:commentId||'0',commentText:encodeURIComponent(original)}};
    // Controlled DOM for a fully composed dialog -> callback -> transport -> server case.
    let activeDialog=null;
    const element=()=>({events:{},setAttribute(){},removeAttribute(){},focus(){},
        addEventListener(type,fn){(this.events[type]||=[]).push(fn);},
        async fire(type,props={}){for(const fn of this.events[type]||[])await fn({preventDefault(){},...props});}
    });
    const editor={...element(),innerHTML:'',get innerText(){return this.innerHTML.replace(/<[^>]*>/g,'');},querySelector:()=>null};
    const form={...element(),requestSubmit(){return this.fire('submit');}},feedback=element(),cancel=element(),submit=element();
    const dialog={...element(),querySelector:s=>s==='[contenteditable]'?editor:s==='form'?form:feedback,querySelectorAll:()=>[cancel,submit],
        showModal(){this.open=true;},close(){this.open=false;this.fire('close');},remove(){activeDialog=null;}
    };
    const document={getElementById:id=>id==='comment-edit-dialog'?activeDialog:{classList:{contains:value=>value==='show'}},querySelectorAll:()=>[],createElement:()=>dialog,body:{appendChild:d=>{activeDialog=d;}}};
    let realOpen;
    const context={state,decodeURIComponent,parseInt,console,document,
        e:{target:{closest:()=>button},stopPropagation(){}},
        api:{editComment:client.editComment},openCommentEditor:(...args)=>{callbacks=args;return realDialog?realOpen(...args):true;},
        ui:{renderTaskHistory(){},showToast:(...args)=>toasts.push(args)}
    };
    vm.createContext(context);
    if(realDialog){const editorContext={document};vm.createContext(editorContext);vm.runInContext(editorSource,editorContext);realOpen=editorContext.openCommentEditor;}
    vm.runInContext(`(function(){${handler}})()`,context);
    return{state,persisted,requests,writes,callbacks,toasts,editor,dialog,feedback,cancel,form,async save(text){await callbacks[1](text);callbacks[2]();}};
}
const expectBroken=process.argv.includes('--expect-broken');
if(expectBroken){
    const f=await fixture();await assert.rejects(f.save('Editado'),error=>/Sem permissão/.test(error.message));
    assert.equal(f.requests[0].author,'opaque-auth-id');assert.equal(f.writes.length,0);
    assert.equal(f.state.tasks[0].comments[0].text,multiline);
    console.log('REPRODUCED published TC493: opaque userId sent as author, real handler returns 403, no persistence.');
} else {
    let cases=0;
    for(const author of ['author@example.invalid','AUTHOR@EXAMPLE.INVALID',{email:'author@example.invalid',name:'Author'}]) {
        const f=await fixture({author});await f.save(rich);
        assert.equal(f.requests[0].author,'author@example.invalid','userDetails used exactly as in addComment');
        assert.equal(f.writes.length,1);assert.equal(f.persisted.comments[0].text,rich);assert.equal(f.state.tasks[0].comments[0].text,rich);cases++;
    }
    for(const [principal,author] of [
        [{userId:'opaque',email:'fallback@example.invalid'},'fallback@example.invalid'],
        [{userId:'opaque',userDetails:'Session Display Name'},'Session Display Name']
    ]) {
        const f=await fixture({principal,author});await f.save('Atualizado');assert.equal(f.writes.length,1);cases++;
    }
    for(const author of ['someone-else@example.invalid',{email:'someone-else@example.invalid',name:'Other'},'opaque-auth-id']) {
        const f=await fixture({author});await assert.rejects(f.save(rich),error=>error.status===403);
        assert.equal(f.writes.length,0);assert.equal(f.requests.length,1,'No retry using comment author or another identity');
        assert.equal(f.requests[0].author,'author@example.invalid');assert.equal(f.state.tasks[0].comments[0].text,multiline);cases++;
    }
    {
        const f=await fixture({principal:{userId:'opaque-auth-id'}});
        await assert.rejects(f.save(rich),error=>error.code==='COMMENT_IDENTITY');assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);cases++;
    }
    {
        const f=await fixture({original:rich});const normalized=rich.replace("class='original'",'class="original"')+'<div>Nova linha</div>';
        await f.save(normalized);assert.equal(f.writes.length,1);assert.equal(f.persisted.comments[0].text,normalized);cases++;
    }
    {
        const f=await fixture({commentId:''});await f.save('Linha 1\nLinha 2');assert.equal(f.writes.length,1);cases++;
    }
    for(const status of [401,403,404,409,500]) {
        const f=await fixture({forcedStatus:status});await assert.rejects(f.save(rich),error=>error.status===status);
        assert.equal(f.writes.length,0);assert.equal(f.state.tasks[0].comments[0].text,multiline);cases++;
    }
    {
        const f=await fixture({replaceError:412});await assert.rejects(f.save(rich),error=>error.status===409);assert.equal(f.writes.length,0);cases++;
    }
    {
        const f=await fixture({realDialog:true});f.editor.innerHTML=rich;await f.form.fire('submit');
        assert.equal(f.requests.length,1);assert.equal(f.writes.length,1);assert.equal(f.persisted.comments[0].text,rich);
        assert.equal(f.dialog.open,false);assert.equal(f.toasts.at(-1)[1],'success');cases++;
    }
    {
        const f=await fixture({realDialog:true,author:'other@example.invalid'});f.editor.innerHTML=rich;await f.form.fire('submit');
        assert.equal(f.requests.length,1);assert.equal(f.writes.length,0);assert.equal(f.dialog.open,true);
        assert.equal(f.editor.innerHTML,rich);assert.match(f.feedback.textContent,/permissão/);cases++;
    }
    {
        const f=await fixture({realDialog:true});f.editor.innerHTML=rich;await f.cancel.fire('click');
        assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);assert.equal(f.dialog.open,false);cases++;
    }
    // Creation source contract: author and opaque userId are intentionally separate.
    assert.match(read('api/addComment/index.js'),/author: user\.userDetails,\s*userId: user\.userId/);
    console.log(`PASS TC493 save contract: ${cases} real main/client/API fixture cases, authenticated author selection, wrong author still denied, no impersonation retry, normalized HTML and HTTP status propagation. No live services.`);
}
