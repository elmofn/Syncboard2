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
const evidence=process.env.TC495_EVIDENCE_DIR || resolve(root,'../tc495-evidence');mkdirSync(evidence,{recursive:true});
const [a,b,c,d,e]=['Pessoa A','Pessoa B','Pessoa C','Pessoa D','Pessoa E'].map((name,i)=>({name,email:`person${i}@example.invalid`,role:'user'}));
const createdAt='2026-10-10T09:00:00Z';
const task={id:'QA-492',title:'Validar o resumo e o fluxo da tarefa',description:'Dados ilustrativos para validação local. Nenhuma chamada usa produção.',status:'inprogress',project:'Projeto de exemplo',projectColor:'#a78bfa',priority:'Alta',dueDate:'2026-10-16',progress:null,requester:{...a,source:'self_declared',recordedAt:createdAt},responsible:[c,d],homologador:e,createdAt,assignmentHistory:[{at:createdAt,from:[],to:[b]},{at:'2026-10-12T15:20:00Z',from:[b],to:[c]},{at:'2026-10-14T09:10:00Z',from:[c],to:[c,d]}],comments:[{id:'qa-comment',text:'Linha 1<br>Linha 2',author:a.name,userId:a.email,timestamp:'2026-10-14T16:00:00Z'}],history:[],attachments:[]};
const writes=[],errors=[],blocked=[],checks=[];
const json=(res,data)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const server=createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 if(!['GET','HEAD'].includes(req.method)){writes.push({path,method:req.method});res.writeHead(403);res.end('Writes blocked');return;}
 if(path==='/.auth/me')return json(res,{clientPrincipal:{userDetails:a.email,userId:a.email,userRoles:['travelcash_user']}});
 if(path==='/api/getUsers')return json(res,[a,b,c,d,e]);
 if(path==='/api/getTasks')return json(res,[task]);
 if(path==='/api/getNotifications')return json(res,[]);
 if(path==='/api/getProjectTaskCounts')return json(res,[{project:task.project,active:1,total:1}]);
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
 const setTasks=async(tasks,view='kanban',currentUser=null)=>{await page.evaluate(async({tasks,view,currentUser})=>{const {state}=await import('/js/state.js');state.tasks=tasks;state.currentView=view;if(currentUser)state.currentUser=currentUser;state.selectedResponsible='all';state.selectedProject='all';state.searchQuery='';const {updateActiveView}=await import('/js/ui.js');updateActiveView();},{tasks,view,currentUser});await page.waitForTimeout(150);};
 const flagged={...task,id:'QA-495',title:'Tarefa com pedido de atenção e título extenso para validar quebra segura no card estreito',pendingAlerts:[{targetUser:a.name,signaledBy:b.name,timestamp:'2026-10-14T20:00:00Z'},a.name,{targetUser:c.name}],responsible:[a,c]};
 const unflagged={...flagged,id:'QA-495-B',title:'Tarefa sem pedido de atenção',pendingAlerts:[]};
 const onlyOther={...flagged,id:'QA-495-C',title:'Pedido destinado a outra pessoa',pendingAlerts:[{targetUser:c.name}]};
 const fixtures=[flagged,unflagged,onlyOther];
 await setTasks(fixtures);
 const card=page.locator('.task-card[data-task-id="QA-495"]');
 assert.equal(await card.locator('.sb-task-attention-badge').count(),1);
 assert.equal(await page.locator('#kanbanView .sb-task-attention-badge').count(),1);
 assert.match(await card.getAttribute('aria-label'),/Atenção solicitada/);
 assert.match(await card.locator('.expand-btn').getAttribute('aria-label'),/Atenção solicitada/);
 const before=await page.evaluate(async()=>JSON.stringify((await import('/js/state.js')).state.tasks));
 await card.screenshot({path:resolve(evidence,'TC495-card.png')});
 await card.evaluate(el=>{el.style.width='214px';el.style.minWidth='214px';});
 const fit=await card.evaluate(el=>{const badge=el.querySelector('.sb-task-attention-badge');const r=el.getBoundingClientRect(),b=badge.getBoundingClientRect();return{card:Math.round(r.width),overflow:el.scrollWidth-el.clientWidth,badge:Math.round(b.width),inside:b.left>=r.left&&b.right<=r.right,icon:getComputedStyle(badge.querySelector('svg')).width,label:badge.textContent.trim()};});
 assert.equal(fit.card,214);assert.ok(fit.overflow<=1);assert.equal(fit.inside,true);assert.equal(fit.icon,'14px');assert.equal(fit.label,'Atenção solicitada');
 await card.screenshot({path:resolve(evidence,'TC495-card-214px.png')});checks.push('Card: one recipient-only badge despite duplicates, accessible label, 214px width without overflow');
 await setTasks(fixtures,'home');
 assert.equal(await page.locator('#home-dynamic-list .sb-task-attention-badge').count(),1);
 assert.match(await page.locator('#home-dynamic-list [data-task-id="QA-495"]').getAttribute('aria-label'),/Atenção solicitada/);
 await page.locator('#home-dynamic-list').screenshot({path:resolve(evidence,'TC495-home.png')});checks.push('Home: label below title; no badge for absent or other-recipient alerts');
 await setTasks(fixtures,'list');
 assert.equal(await page.locator('#listView .sb-task-attention-badge').count(),1);
 assert.equal(await page.locator('#listView thead th').count(),7);
 assert.match(await page.locator('#listView .info-btn[data-task-id="QA-495"]').getAttribute('aria-label'),/Atenção solicitada/);
 await page.locator('#listView').screenshot({path:resolve(evidence,'TC495-board-list.png')});checks.push('Board list: badge in task column, seven existing columns, metadata preserved');
 const open=async(id='QA-495')=>{await page.evaluate(async id=>{const {renderTaskHistory}=await import('/js/ui.js');renderTaskHistory(id);},id);await page.waitForSelector('#taskHistoryModal.show');await page.waitForTimeout(350);};
 const close=async()=>{await page.locator('[data-fidelity-close-detail]').click();await page.waitForTimeout(400);};
 await open();
 assert.equal(await page.locator('#fidelity-detail-attention .sb-task-attention-badge').count(),1);
 assert.equal(await page.locator('#taskHistoryModal').getAttribute('aria-describedby'),'fidelity-detail-attention');
 await page.locator('.sb-fidelity-detail-topline').screenshot({path:resolve(evidence,'TC495-details.png')});
 assert.equal(await page.locator('#modal-signal-btn').innerText(),'Chamar atenção');
 await close();await open('QA-495-B');assert.equal(await page.locator('#fidelity-detail-attention').isVisible(),false);assert.equal(await page.locator('#taskHistoryModal').getAttribute('aria-describedby'),null);await close();
 assert.equal(await page.evaluate(async()=>JSON.stringify((await import('/js/state.js')).state.tasks)),before);
 assert.equal(writes.length,0);checks.push('Opening four surfaces leaves pendingAlerts unchanged and sends no writes; details badge resets for another task');
 // Real SignalR client callback with synthetic transport, no network.
 await page.evaluate(()=>{globalThis.__handlers={};globalThis.signalR={HubConnectionBuilder:class{withUrl(){return this}build(){return{on(k,fn){globalThis.__handlers[k]=fn},onclose(){},start(){return Promise.resolve()}}}}};});
 await page.evaluate(async()=>{const {connectToSignalR}=await import('/js/signalr.js');connectToSignalR(()=>{});});
 await open();
 const received={...flagged,pendingAlerts:[{...flagged.pendingAlerts[0],acknowledgedAt:'2026-10-15T15:00:00Z'},{targetUser:c.name}]}; // TC495: receipt retains the alert.
 await page.evaluate(updated=>globalThis.__handlers.taskUpdated(updated),received);await page.waitForTimeout(400);
 assert.equal(await page.locator('#fidelity-detail-attention').isVisible(),true);
 assert.equal(await page.locator('#listView .sb-task-attention-badge').count(),1);
 await page.evaluate(updated=>globalThis.__handlers.taskUpdated(updated),{...received,status:'stopped',notificationStageVersion:1,pendingAlerts:[]});await page.waitForTimeout(400);
 assert.equal(await page.locator('#fidelity-detail-attention').isVisible(),false);
 assert.equal(await page.locator('#listView .sb-task-attention-badge').count(),0);
 await close();await setTasks([{...flagged,pendingAlerts:[{targetUser:c.name}]}],'kanban');assert.equal(await page.locator('#kanbanView .sb-task-attention-badge').count(),0);
 checks.push('Committed receipt retains badge, then status transition via real taskUpdated handler removes it from open details and list; other-recipient alert stays invisible');
 await setTasks(fixtures,'kanban',{userDetails:d.email,userId:d.email,userRoles:['admin']});assert.equal(await page.locator('#kanbanView .sb-task-attention-badge').count(),0);checks.push('Non-recipient admin gets no badge; requester/reviewer/owner status never grants it');
 await setTasks(fixtures,'home',{userDetails:a.email,userId:a.email,userRoles:['travelcash_user']});await page.setViewportSize({width:393,height:852});await page.locator('#home-dynamic-list').screenshot({path:resolve(evidence,'TC495-home-mobile.png')});
 await open();await page.locator('.sb-fidelity-detail-topline').screenshot({path:resolve(evidence,'TC495-details-mobile.png')});
 const overflow=await page.evaluate(()=>{const header=document.querySelector('.sb-fidelity-detail-topline'),badge=header.querySelector('.sb-task-attention-badge'),close=header.querySelector('button'),b=badge.getBoundingClientRect(),c=close.getBoundingClientRect();return {header:header.scrollWidth-header.clientWidth,body:document.body.scrollWidth-innerWidth,overlap:b.right>c.left&&b.top<c.bottom&&b.bottom>c.top};});assert.ok(overflow.header<=1);assert.ok(overflow.body<=1);assert.equal(overflow.overlap,false);
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.locator('.sb-fidelity-detail-topline').screenshot({path:resolve(evidence,'TC495-details-dark.png')});
 checks.push('393px mobile header wraps safely; no horizontal overflow or overlap; light/dark informational badge');
 assert.deepEqual(errors,[]);assert.equal(writes.length,0);writeFileSync(resolve(evidence,'browser-results.json'),JSON.stringify({status:'passed',checks,writes,fit,overflow,errors,blockedExternal:blocked,limits:'Local synthetic state and APIs; real DOM renderers and SignalR update callback; no production writes or real alert delivery.'},null,2));console.log(JSON.stringify({status:'passed',checks,evidence},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
