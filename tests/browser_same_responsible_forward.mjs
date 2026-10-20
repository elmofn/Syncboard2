// Chromium QA: real app, native dialog, real updateTask handler, synthetic database.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {base,fixture,profiles,reviewer,current} from './fixtures/forward-api-fixture.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const evidence=process.env.TC499_EVIDENCE_DIR || resolve(root,'../tc499-evidence');mkdirSync(evidence,{recursive:true});
const vendor=process.env.SYNCBOARD_QA_VENDOR_DIR || '/workspace/shared/syncboard-ui-qa/tc455-native-wide/vendor';
let f=fixture({...base,project:'QA local',priority:'Média',attachments:[],createdAt:'2026-10-14T12:00:00Z',comments:[]}),actor=reviewer;
const requests=[],errors=[],checks=[];
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://local').pathname;
  if(path==='/.auth/me')return json(res,{clientPrincipal:{userDetails:actor,userId:actor,userRoles:['travelcash_user']}});
  if(path==='/api/getUsers')return json(res,profiles);
  if(path==='/api/getTasks')return json(res,[f.task]);
  if(path==='/api/getNotifications')return json(res,[]);
  if(path==='/api/getProjectTaskCounts')return json(res,[{project:'QA local',active:1,total:1}]);
  if(path==='/api/updateTask/TC499'&&req.method==='PUT'){let raw='';for await(const part of req)raw+=part;const payload=JSON.parse(raw);requests.push(payload);const r=await f.call(payload,actor);return json(res,r.body,r.status||200);}
  if(path.startsWith('/api/')||path.startsWith('/.auth/'))return json(res,{message:'Fixture blocks operation'},403);
  const local=resolve(root,'app',path==='/'?'index.html':'.'+path);if(!local.startsWith(resolve(root,'app')+'/'))return json(res,{},403);
  try{const file=readFileSync(local);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif'})[extname(local)]||'application/octet-stream'});res.end(file);}catch{res.writeHead(404);res.end();}
 }catch(error){json(res,{message:error.message},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addInitScript(()=>localStorage.setItem('theme','light'));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
  let local;if(url.hostname==='cdn.tailwindcss.com')local='tailwind-3.4.17.js';else if(url.hostname==='unpkg.com')local='lucide.min.js';else if(url.hostname==='cdn.jsdelivr.net')local='Sortable.min.js';
  if(local)return route.fulfill({contentType:'application/javascript',body:readFileSync(resolve(vendor,local),'utf8')});
  if(url.hostname==='cdnjs.cloudflare.com')return route.fulfill({contentType:'application/javascript',body:'globalThis.signalR={HubConnectionBuilder:class{withUrl(){return this}build(){return{on(){},onclose(){},start(){return Promise.resolve()}}}}};'});
  return route.abort();
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 const load=async()=>{await page.goto(origin);await page.waitForFunction(()=>!document.getElementById('app').inert);};
 const detail=async()=>{await page.evaluate(async()=>{const ui=await import('/js/ui.js');ui.renderTaskHistory('TC499');});await page.waitForSelector('#taskHistoryModal.show');await page.waitForTimeout(350);};
 await load();await detail();await page.locator('#modal-forward-btn').click();
 const dialog=page.locator('#homologation-forward-dialog'),select=page.locator('#homologation-forward-person'),instructions=page.locator('#homologation-forward-instructions');
 await dialog.waitFor({state:'visible'});assert.equal(await select.locator('option').count(),4);
 await select.selectOption(current);await dialog.locator('button[type=submit]').click();assert.equal(requests.length,0);assert.equal(await instructions.evaluate(el=>el.validity.valueMissing),true);
 await instructions.fill('    ');await dialog.locator('button[type=submit]').click();assert.equal(requests.length,0);assert.match(await dialog.locator('.sb-forward-error').innerText(),/orientação/);
 await instructions.fill('Etapa 1 homologada.\nAvançar para a etapa 2 com o mesmo responsável.');
 await dialog.screenshot({path:resolve(evidence,'TC499-forward-desktop.png')});
 await page.evaluate(()=>document.documentElement.classList.add('dark'));await dialog.screenshot({path:resolve(evidence,'TC499-forward-dark.png')});await page.evaluate(()=>document.documentElement.classList.remove('dark'));
 await page.setViewportSize({width:375,height:812});await dialog.screenshot({path:resolve(evidence,'TC499-forward-mobile.png')});
 assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog has no horizontal overflow');
 await dialog.locator('button[type=submit]').click();await dialog.waitFor({state:'detached'});await page.waitForTimeout(350);
 assert.equal(requests.length,1);assert.equal(f.writes.length,1);assert.equal(f.task.status,'inprogress');assert.equal(f.task.responsible[0].email,current);assert.equal(f.task.homologador,null);assert.match(f.task.history.at(-1).description,/Homologação encaminhada/);assert.equal(f.task.history.filter(h=>h.description.startsWith('Homologação reprovada')).length,1);
 assert.equal(await page.locator('#taskHistoryModal').evaluate(el=>el.classList.contains('hidden')),true);checks.push('Native required/whitespace guard; current assignee listed; desktop/dark/mobile no overflow; real success persists one forward to Andamento and closes detail without new rejection');
 // Stale server snapshot preserves selection/guidance and never commits a losing decision.
 f=fixture({...base,attachments:[],comments:[]});await load();await detail();await page.locator('#modal-forward-btn').click();await select.selectOption(current);await instructions.fill('Continuar após revisar');f.intervening={title:'Concurrent edit'};
 await dialog.locator('button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#homologation-forward-dialog .sb-forward-error')?.textContent.includes('Não foi possível'));
 assert.equal(f.writes.length,0);assert.equal(await select.inputValue(),current);assert.equal(await instructions.inputValue(),'Continuar após revisar');assert.equal(await dialog.isVisible(),true);
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});checks.push('ETag conflict keeps the dialog and entered guidance, refreshes task, Escape cancels without write');
 actor=current;await load();await detail();assert.equal(await page.locator('#modal-forward-btn').isVisible(),false);checks.push('A non-homologator cannot see the forwarding action');
 assert.deepEqual(errors,[]);writeFileSync(resolve(evidence,'browser-results.json'),JSON.stringify({status:'passed',checks,requests:requests.length,pageErrors:errors,limits:'Synthetic identities/storage and outbound services. No production DB/session, Azure auth or external reporting tested.'},null,2));
 console.log(JSON.stringify({status:'passed',checks,requests:requests.length,pageErrors:errors},null,2));
}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
