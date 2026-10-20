// TC499: real decision controller -> API client -> HTTP -> updateTask handler.
// Cosmos and outbound services are isolated. No live identities or infrastructure.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const plain = value => JSON.parse(JSON.stringify(value));
import {reviewer, current, other, base, fixture} from './fixtures/forward-api-fixture.mjs';
const originalHistory = base.history;
const request = (extra={}) => ({homologationAction:'forward',expectedStatus:'homologation',expectedEtag:'v1',newResponsibleEmail:current,forwardInstructions:'  Etapa 2\nValidar <script>alert("x")</script> & concluir  ',...extra});
const rejections = task => task.history.filter(e=>e.description.startsWith('Homologação reprovada')).length;
for(const responsible of [[{email:current,name:'Current'}],[' CURRENT@EXAMPLE.TEST '],[{email:current},{email:other}]]) {
    const f=fixture({...base,responsible});const result=await f.call(request({actorEmail:other,status:'done',progress:0,history:[]}));
    assert.equal(result.status,undefined);assert.equal(f.task.status,'inprogress');assert.equal(f.task.progress,100);assert.equal(f.task.homologador,null);
    assert.deepEqual(plain(f.task.responsible),[{email:current,name:'Current <safe>',picture:''}]);
    assert.deepEqual(plain(f.task.history[0]),originalHistory[0]);assert.equal(f.task.history.length,2);assert.equal(rejections(f.task),rejections(base));
    const audit=f.task.history.at(-1).description;
    assert.match(audit,/^Homologação encaminhada/);assert.match(audit,/reviewer@example.test/);assert.match(audit,/Etapa 2<br>Validar &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; concluir/);assert.match(audit,/Andamento/);assert.ok(!audit.includes('<script>'));
    assert.deepEqual(plain(f.task.comments),base.comments);assert.deepEqual(plain(f.task.requester),base.requester);assert.equal('forwardInstructions' in f.task,false);
    assert.equal(f.task.assignmentHistory.length,responsible.length===2?1:0,'unchanged membership is not a reassignment');
    if(responsible.length===2){assert.equal(f.task.assignmentHistory[0].from.length,2);assert.deepEqual(plain(f.task.assignmentHistory[0].to),[{email:current,name:'Current <safe>'}]);}
    assert.equal(f.writes.length,1);assert.equal(f.signals.length,1);assert.equal(f.discord.length,1);assert.equal(f.notices.length,0);
    assert.equal((await f.call(request())).status,409);assert.equal(f.writes.length,1);
}
for(const newResponsibleEmail of [reviewer,other,' CURRENT@EXAMPLE.TEST ']) {
    const f=fixture();assert.equal((await f.call(request({newResponsibleEmail}))).status,undefined);assert.equal(f.task.responsible[0].email,newResponsibleEmail.trim().toLowerCase());
}
for(const forwardInstructions of [undefined,null,0,false,{},[], '', '   \n\t']) {
    const f=fixture();assert.equal((await f.call(request({forwardInstructions}))).status,400);assert.equal(f.writes.length,0);assert.deepEqual(f.task,base);assert.equal(f.signals.length+f.discord.length+f.notices.length,0);
}
{const f=fixture();assert.equal((await f.call(request({forwardInstructions:'a'.repeat(5001)}))).status,undefined);}
{const f=fixture();assert.equal((await f.call(request(),other)).status,403);assert.equal(f.writes.length,0);}
{const f=fixture();f.intervening={responsible:[{email:other}],history:[...base.history,{description:'Assignment changed'}]};assert.equal((await f.call(request())).status,409);assert.equal(f.task.status,'homologation');assert.equal(f.task.responsible[0].email,other);assert.equal(f.writes.length+f.signals.length+f.discord.length,0);}
{const f=fixture();const results=await Promise.all([f.call(request()),f.call(request({newResponsibleEmail:other}))]);assert.equal(results.filter(r=>r.status===undefined).length,1);assert.equal(results.filter(r=>r.status===409).length,1);assert.equal(f.writes.length,1);assert.equal(f.task.history.length,2);assert.equal(rejections(f.task),1);}
{const f=fixture();assert.equal((await f.call({title:'Edited',forwardInstructions:'Do not persist'})).status,undefined);assert.equal('forwardInstructions' in f.task,false);}

// Actual HTTP fetch and response/error behavior, with the shipped controller and API client.
for(const valid of [true,false]) {
    const f=fixture(), received=[];
    const server=createServer(async(req,res)=>{
        try {
            assert.equal(req.method,'PUT');assert.equal(req.url,'/api/updateTask/TC499');assert.equal(req.headers['content-type'],'application/json');
            let raw='';for await (const data of req)raw+=data;
            const payload=JSON.parse(raw);received.push(payload);const result=await f.call(payload);
            res.writeHead(result.status||200,{'Content-Type':'application/json'});res.end(JSON.stringify(result.body));
        }catch(error){res.writeHead(500);res.end(JSON.stringify({error:error.message}));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
        const address=`http://127.0.0.1:${server.address().port}`;
        let refreshes=0;const client={fetch:(path,options)=>fetch(address+path,options),refreshProjectTaskCounts:()=>refreshes++};
        vm.createContext(client);vm.runInContext(read('app/js/api.js').replace(/^import .*;\n/gm,'').replaceAll('export async function','async function'),client);
        const state={tasks:[clone(base)],currentUser:{userDetails:reviewer,userRoles:['travelcash_user']},lastInteractedTaskId:base.id};
        const toasts=[],buttons=[{dataset:{taskId:base.id},setAttribute(){},removeAttribute(){}}];
        const context={state,api:{updateTask:client.updateTask},document:{querySelectorAll:()=>buttons,getElementById:()=>null},ui:{showToast:(message,type)=>toasts.push({message,type}),updateActiveView(){}},showApprovalSuccess(){throw Error('Forward is not approval');}};
        vm.createContext(context);vm.runInContext(read('app/js/homologation-v2.js').replaceAll('export function','function'),context);
        const main=read('app/js/main.js');vm.runInContext(main.slice(main.indexOf('const pendingHomologationDecisions'),main.indexOf('// --- PONTO DE ENTRADA ---')),context);
        const guidance=valid?'Etapa 2: continuar com a mesma pessoa':'   ';
        assert.equal(await context.decideHomologation(base.id,'forward',current,guidance),valid);
        assert.deepEqual(received,[{homologationAction:'forward',expectedStatus:'homologation',expectedEtag:'v1',newResponsibleEmail:current,forwardInstructions:guidance}]);
        assert.equal(state.tasks[0].status,valid?'inprogress':'homologation');assert.equal(f.writes.length,valid?1:0);assert.equal(refreshes,valid?1:0);assert.equal(toasts.at(-1).type,valid?'success':'error');
        if(valid){assert.match(toasts.at(-1).message,/Andamento/);assert.equal(rejections(state.tasks[0]),1);}
        assert.equal(buttons[0].disabled,valid);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
console.log('PASS TC499: same/other/reviewer forwarding, required escaped guidance, Andamento without rejection, original history/comments/provenance preserved, sole/multiple responsible semantics, concurrency/ETag, exact real HTTP controller/client/handler contract and rejected-write UI recovery. External infrastructure is mocked.');
