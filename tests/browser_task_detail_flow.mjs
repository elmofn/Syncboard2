// Chromium integration QA: real app/handlers, synthetic local APIs, blocked external traffic.
import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const vendor=process.env.SYNCBOARD_QA_VENDOR_DIR || '/workspace/shared/syncboard-ui-qa/tc455-native-wide/vendor';
const evidence=process.env.TC492_EVIDENCE_DIR || resolve(root,'../tc492-evidence');mkdirSync(evidence,{recursive:true});
const [a,b,c,d,e]=['Pessoa A','Pessoa B','Pessoa C','Pessoa D','Pessoa E'].map((name,i)=>({name,email:`person${i}@example.invalid`,role:'user'}));
const createdAt='2026-10-10T09:00:00Z';
const task={id:'QA-492',title:'Validar o resumo e o fluxo da tarefa',description:'Dados ilustrativos para validação local. Nenhuma chamada usa produção.',status:'inprogress',project:'Projeto de exemplo',projectColor:'#a78bfa',priority:'Alta',dueDate:'2026-10-16',progress:null,requester:{...a,source:'self_declared',recordedAt:createdAt},responsible:[c,d],homologador:e,createdAt,assignmentHistory:[{at:createdAt,from:[],to:[b]},{at:'2026-10-12T15:20:00Z',from:[b],to:[c]},{at:'2026-10-14T09:10:00Z',from:[c],to:[c,d]}],comments:[{id:'qa-comment',text:'Linha 1<br>Linha 2',author:a.name,userId:a.email,timestamp:'2026-10-14T16:00:00Z'}],history:[],attachments:[]};
const writes=[],errors=[],blocked=[],checks=[];
const json=(res,data)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 if(path==='/.auth/me')return json(res,{clientPrincipal:{userDetails:a.email,userId:a.email,userRoles:['travelcash_user']}});
 if(path==='/api/getUsers')return json(res,[a,b,c,d,e]);
 if(path==='/api/getTasks')return json(res,[task]);
 if(path==='/api/getNotifications')return json(res,[]);
 if(path==='/api/getProjectTaskCounts')return json(res,[{project:task.project,active:1,total:1}]);
 if(path==='/api/signalResponsible/QA-492'&&req.method==='POST'){let body='';req.on('data',v=>body+=v);req.on('end',()=>{writes.push({path,body:JSON.parse(body)});json(res,{success:true});});return;}
 if(path.startsWith('/api/')||path.startsWith('/.auth/')){res.writeHead(403);res.end('Fixture blocks this operation');return;}
 const local=resolve(root,'app',path==='/'?'index.html':'.'+path);
 if(!local.startsWith(resolve(root,'app')+'/')){res.writeHead(403);res.end();return;}
 try{const file=readFileSync(local);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif'})[extname(local)]||'application/octet-stream'});res.end(file);}catch{res.writeHead(404);res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:'UTC',reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('theme','light'));
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===url)return route.continue();
  let local;if(u.hostname==='cdn.tailwindcss.com')local='tailwind-3.4.17.js';else if(u.hostname==='unpkg.com')local='lucide.min.js';else if(u.hostname==='cdn.jsdelivr.net')local='Sortable.min.js';
  if(local)return route.fulfill({contentType:'application/javascript',body:readFileSync(resolve(vendor,local),'utf8')});
  if(u.hostname==='cdnjs.cloudflare.com')return route.fulfill({contentType:'application/javascript',body:'globalThis.signalR={HubConnectionBuilder:class{withUrl(){return this}build(){return{on(){},onclose(){},start(){return Promise.resolve()}}}}};'});
  blocked.push(u.href);return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',err=>errors.push(err.message));
 await page.goto(url);await page.waitForFunction(()=>!document.getElementById('app').inert);
 const open=async()=>{await page.evaluate(async()=>{const {renderTaskHistory}=await import('/js/ui.js');renderTaskHistory('QA-492');});await page.waitForSelector('#taskHistoryModal.show');await page.waitForTimeout(350);};
 await open();
 assert.equal(await page.locator('#fidelity-detail-progress-value').innerText(),'0%');
 assert.equal(await page.locator('.sb-flow-current .sb-flow-person').count(),2);
 assert.equal(await page.locator('.sb-flow-assignment').count(),3);
 assert.equal(await page.locator('.sb-flow-requester .sb-flow-meta').innerText(),'Solicitante - 10/10 - 09:00');
 assert.deepEqual(await page.locator('.sb-flow-current .sb-flow-meta').allTextContents(),['Responsável principal - 14/10 - 09:10','Responsável - 14/10 - 09:10']);
 assert.equal((await page.locator('#fidelity-detail-flow').innerText()).includes('Atuais'),false);
 assert.deepEqual(await page.locator('.sb-flow-assignment .sb-flow-name').allTextContents(),['Pessoa B','Pessoa C','Pessoa C','Pessoa D']);
 const styles=await page.evaluate(()=>{
  const s=el=>{const c=getComputedStyle(el);return [c.fontFamily,c.fontSize,c.fontWeight,c.color];};
  const labels=[document.querySelector('.sb-flow-requester .sb-flow-meta'),document.querySelector('.sb-flow-current .sb-flow-meta')];
  return {requester:s(labels[0]),responsible:s(labels[1]),actions:['modal-calendar-btn','modal-signal-btn'].map(id=>{const c=getComputedStyle(document.getElementById(id));return[c.color,c.backgroundColor,c.border,c.borderRadius,c.minHeight,c.padding,c.fontSize];})};
 });assert.deepEqual(styles.requester,styles.responsible);assert.deepEqual(styles.actions[0],styles.actions[1]);checks.push('Role typography matches; both action controls share computed styles');
 // TC492 regression: text equality alone cannot detect a third rendered line.
 const geometry=[];
 for (const width of [1440,1024,881,880,768,680,393,360,320]) {
  await page.setViewportSize({width,height:1100});
  await page.locator('.sb-task-detail-sidebar').scrollIntoViewIfNeeded();
  const measured=await page.evaluate(()=>{
   const rail=document.querySelector('.sb-task-detail-sidebar');
   return {width:innerWidth,railOverflow:rail.scrollWidth-rail.clientWidth,bodyOverflow:document.body.scrollWidth-innerWidth,
    rows:[...document.querySelectorAll('#fidelity-detail-flow .sb-flow-meta')].map(el=>{
     const range=document.createRange();range.selectNodeContents(el);
     const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
     const bounds=el.getBoundingClientRect();
     return {text:el.textContent,lines:new Set(rects.map(r=>Math.round(r.top))).size,
      fits:rects.every(r=>r.left>=bounds.left-1&&r.right<=bounds.right+1),available:bounds.width};
    })};
  });
  geometry.push(measured);
  assert.ok(measured.rows.length>0);
  for (const row of measured.rows) {assert.equal(row.lines,1,JSON.stringify({width,...row}));assert.ok(row.fits,JSON.stringify({width,...row}));}
  assert.ok(measured.railOverflow<=1,JSON.stringify(measured));assert.ok(measured.bodyOverflow<=1,JSON.stringify(measured));
 }
 writeFileSync(resolve(evidence,'line-geometry.json'),JSON.stringify(geometry,null,2));
 checks.push('Role/date measured on one line without clipping from 320px through desktop, including responsive boundaries');
 await page.setViewportSize({width:1440,height:1100});
 await page.locator('.sb-task-detail-sidebar').screenshot({path:resolve(evidence,'TC492-summary-light.png')});await page.screenshot({path:resolve(evidence,'TC492-detail-desktop.png')});
 await page.locator('#modal-signal-btn').click();assert.equal(await page.locator('#signal-targets-container .target-checkbox').count(),2);assert.deepEqual(await page.locator('#signal-targets-container .sb-signal-name').allTextContents(),['Pessoa C','Pessoa D']);assert.equal(await page.locator('#signal-targets-container input:checked').getAttribute('value'),'Pessoa C');await page.locator('#cancelSignalBtn').click();await page.waitForTimeout(350);assert.equal(writes.length,0);
 await page.locator('#modal-signal-btn').click();await page.locator('#signal-targets-container input[value="Pessoa C"]').uncheck();await page.locator('#signal-targets-container input[value="Pessoa D"]').check();await page.locator('#confirmSignalBtn').click();await page.waitForTimeout(1200);assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{targets:['Pessoa D']});assert.equal(await page.locator('#modal-signal-btn').innerText(),'Chamar atenção');checks.push('Attention confirmation: only current owners; cancel sends nothing; explicit alternate selection preserved; label survives send');
 await page.locator('#fidelity-detail-progress').click();await page.waitForSelector('#progressUpdateModal');await page.locator('#cancelProgressBtn').click();await page.waitForTimeout(400);assert.equal(writes.length,1);checks.push('Progress action still opens existing editor; cancel sends nothing');
 await page.locator('#fidelity-tab-comments').click();await page.locator('.edit-comment-btn').click();await page.waitForSelector('#comment-edit-dialog');assert.match(await page.locator('#comment-edit-content').innerText(),/Linha 1\nLinha 2/);await page.locator('#comment-edit-dialog button[type="button"]').click();assert.equal(writes.length,1);checks.push('TC493 rich comment editor remains multiline; cancel sends nothing');
 const setTask=async changes=>{await page.evaluate(async changes=>{const {state}=await import('/js/state.js');Object.assign(state.tasks[0],changes);const {renderTaskHistory}=await import('/js/ui.js');renderTaskHistory('QA-492');},changes);await page.waitForTimeout(350);};
 await setTask({status:'homologation'});assert.equal(await page.locator('#modal-signal-btn').isVisible(),false);assert.equal(await page.locator('#modal-approve-btn').isVisible(),false);checks.push('Homologation hides attention; non-homologator has no decision controls');
 await setTask({status:'inprogress',responsible:[],assignmentHistory:[],requester:null,homologador:null,dueDate:null});assert.match(await page.locator('#fidelity-detail-flow').innerText(),/Histórico parcial/);assert.equal(await page.locator('#fidelity-detail-requester').innerText(),'Não registrado');assert.equal(await page.locator('#fidelity-no-validator').isVisible(),true);await page.locator('#modal-signal-btn').click();assert.equal(await page.locator('#signalConfirmModal').isVisible(),false);assert.equal(writes.length,1);await page.locator('.sb-task-detail-sidebar').screenshot({path:resolve(evidence,'TC492-summary-legacy.png')});checks.push('Legacy missing requester/date/history/reviewer remain explicit; no owners does not send attention');
 await setTask(task); // Restore synthetic approved visual data.
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.locator('.sb-task-detail-sidebar').screenshot({path:resolve(evidence,'TC492-summary-dark.png')});
 await page.evaluate(()=>document.documentElement.classList.remove('dark'));
 await setTask({responsible:[{...c,name:'Pessoa com um nome muito extenso para verificar quebra de linha segura'},d]});
 await page.setViewportSize({width:393,height:852});await page.locator('.sb-task-detail-sidebar').scrollIntoViewIfNeeded();await page.locator('.sb-task-detail-sidebar').screenshot({path:resolve(evidence,'TC492-summary-mobile.png')});
 const overflow=await page.evaluate(()=>{const rail=document.querySelector('.sb-task-detail-sidebar');return {rail:rail.scrollWidth-rail.clientWidth,body:document.body.scrollWidth-innerWidth};});assert.ok(overflow.rail<=1);assert.ok(overflow.body<=1);checks.push('393px mobile: long names wrap and no horizontal overflow');
 await page.locator('#closeHistoryBtn').click();await page.waitForTimeout(500);assert.equal(await page.locator('#taskHistoryModal').isVisible(),false);await open();assert.equal(await page.locator('.sb-flow-current').count(),1);await page.locator('#fidelity-tab-history').click();await page.locator('#closeHistoryBtn').click();await page.waitForTimeout(500);await open();assert.equal(await page.locator('#fidelity-tab-comments').getAttribute('aria-selected'),'true');checks.push('Repeated close/reopen restores comments tab; flow is always present with one current group');
 assert.deepEqual(errors,[]);writeFileSync(resolve(evidence,'browser-results.json'),JSON.stringify({status:'passed',checks,writes,styles,overflow,errors,blockedExternal:blocked,limits:'Local synthetic APIs and isolated Chromium only; no production writes or real SignalR delivery. Tailwind/Lucide/Sortable reused from existing QA vendor fixtures.'},null,2));console.log(JSON.stringify({status:'passed',checks,evidence},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
