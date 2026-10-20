import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
process.env.TZ = 'UTC';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ui = await import('data:text/javascript;base64,' + Buffer.from(read('app/js/task-provenance.js')).toString('base64'));
const [a,b,c,d] = ['Ana','Beto','Caio','Dora'].map((name,i) => ({name,email:`person${i}@example.invalid`}));
const initial = '2026-10-10T09:00:00Z';
let count = 0;
function test(label, fn) { fn(); count++; console.log('PASS', label); }
const task = {requester:{...a,source:'self_declared',recordedAt:initial},createdAt:initial,responsible:[a,c],homologador:d,assignmentHistory:[{at:initial,from:[],to:[a]},{at:'2026-10-12T15:20:00Z',from:[a],to:[b]},{at:'2026-10-14T09:10:00Z',from:[b],to:[a,c]}]};
test('A to B to A preserved, concurrent group, single current group and known dates', () => {
 const html = ui.renderTaskDetailFlow(task);
 assert.equal((html.match(/sb-flow-assignment/g)||[]).length,3); assert.equal((html.match(/sb-flow-current/g)||[]).length,1);
 assert.equal((html.match(/class="sb-flow-name"[^>]*>Ana</g)||[]).length,3);
 assert.match(html,/sb-flow-simultaneous/); assert.match(html,/<time datetime="2026-10-14T09:10:00Z"/); assert.doesNotMatch(html,/>Atuais/); assert.doesNotMatch(html,/Histórico parcial/);
 assert.equal((html.match(/>Responsável principal(?: -|<)/g)||[]).length,1);
 assert.ok(html.indexOf('Solicitante') < html.indexOf('Responsáveis')); assert.ok(html.lastIndexOf('Caio') < html.indexOf('Homologador'));
});
test('current reordered owners use actual Principal without rewriting earlier snapshot', () => {
 const reordered = {...task,responsible:[c,a]}; const before = JSON.stringify(reordered);
 const current = ui.assignmentTrail(reordered).nodes.at(-1); assert.equal(current.people[0].email,c.email);assert.equal(current.current,true);
 const html = ui.renderTaskDetailFlow(reordered).split('sb-flow-current')[1]; assert.ok(html.indexOf('Caio') < html.indexOf('Responsável principal')); assert.ok(html.indexOf('Responsável principal') < html.indexOf('>Ana<'));
 assert.equal(JSON.stringify(reordered),before);
});
test('legacy data stays unknown and absent time is not invented', () => {
 const html = ui.renderTaskDetailFlow({createdBy:a.email,responsible:[b],homologador:null});
 assert.match(html,/Não registrado/);assert.match(html,/Histórico parcial/);assert.match(html,/Não informado/);assert.doesNotMatch(html,/<time\b/);assert.doesNotMatch(html,/2026|>Ana</);
});
test('internal gaps remain visible and do not collapse repeated people', () => {
 const html = ui.renderTaskDetailFlow({...task,responsible:[a],assignmentHistory:[{at:initial,from:[],to:[a]},{at:'invalid',from:[c],to:[a]}]});
 assert.match(html,/Trecho não registrado/);assert.match(html,/histórico parcial/);assert.doesNotMatch(html,/trocas anteriores não registradas/);assert.equal((html.match(/sb-flow-assignment/g)||[]).length,3);assert.doesNotMatch(html,/Invalid Date/);
});
test('unknown previous group gets a single gap and no invented start timestamp', () => {
 const html = ui.renderTaskDetailFlow({responsible:[a],assignmentHistory:[{from:null,to:[a]}]});
 assert.equal((html.match(/class="sb-flow-gap"/g)||[]).length,1);assert.doesNotMatch(html,/<time\b/);
});
test('empty groups and malformed history remain honest without exceptions', () => {
 for (const assignmentHistory of [undefined,{},[null], [{from:[],to:[{name:'unknown'}]}]]) {
  const html = ui.renderTaskDetailFlow({responsible:[],assignmentHistory});assert.match(html,/Sem responsável/);assert.match(html,/Histórico parcial/);
 }
});
test('safe email-matched photo, failed-photo class, fallback initials and escaping', () => {
 const html = ui.renderTaskDetailFlow({requester:{...a,name:'<script>'},responsible:[{...b,picture:'javascript:alert(1)'}],homologador:{...d,picture:'https://example.invalid/d.png'}},[{...a,picture:'https://example.invalid/a.png'},{name:'Beto',email:'other@example.invalid',picture:'https://example.invalid/wrong.png'}]);
 assert.match(html,/sb-provenance-photo/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|javascript:|wrong.png/);assert.match(html,/d.png/);assert.match(html,/referrerpolicy="no-referrer"/);
});
test('explicit legacy source remains available without inferring requester from creator', () => {
 const html = ui.renderTaskDetailFlow({...task,requester:{...a,source:'explicit_request',recordedByEmail:b.email,evidenceRef:'TC100 <ref>'}});
 assert.match(html,/person1@example.invalid/);assert.match(html,/TC100 &lt;ref&gt;/);assert.match(html,/aria-describedby="fidelity-detail-requester-source"/);
});
test('always-open static flow has no expansion controls or extra progress sentence', () => {
 for(const file of ['app/index.html','app/fragments/taskHistoryModal-fidelity-v2.html']) {
  const html = read(file); const aside = html.slice(html.indexOf('<aside class="sb-task-detail-sidebar"'),html.indexOf('</aside>',html.indexOf('<aside class="sb-task-detail-sidebar"')));
  assert.match(aside,/>Resumo</);assert.match(aside,/id="fidelity-flow-heading">Fluxo</);assert.doesNotMatch(aside,/<details|<summary|aria-expanded|chevron|100% não substitui/);
  assert.match(aside,/>Chamar atenção</);assert.match(aside,/>Marcar reunião</);assert.match(aside,/fidelity-detail-progress-value">0%</);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 }
});
test('CSS gives role labels one typography rule and actions one shared rule', () => {
 const css=read('app/css/task-fidelity-v2.css'); assert.match(css,/\.sb-flow-label \{[^}]*font: 500 12px\/1\.5/);assert.match(css,/:is\(#modal-calendar-btn, #modal-signal-btn\)/);assert.match(css,/sb-flow-validator\[hidden\]/);
});
test('flow groups and compact deadline override legacy important avatar dimensions and spacing', () => {
 const base=read('app/css/custom.css'), css=read('app/css/task-fidelity-v2.css'), entry=read('app/index.html');
 const legacy=base.match(/#sidebar-responsibles-container > div \{([^}]+)\}/)[1];
 for(const prop of ['width','height']) assert.match(legacy,new RegExp(prop+': 38px !important'));
 const selector='body.sb-app.sb-fidelity-v2 #taskHistoryModal #sidebar-responsibles-container.sb-flow-responsibles > .sb-flow-assignment';
 const start=css.indexOf(selector+' {');assert.ok(start>=0);const override=css.slice(start,css.indexOf('}',start));
 for(const prop of ['width','height'])assert.match(override,new RegExp(prop+': auto !important'));
 assert.match(override,/box-shadow: none !important/);
 assert.equal((selector.match(/#/g)||[]).length,2,'two IDs beat the legacy selector with one ID at equal important priority');
 assert.ok(entry.indexOf('css/custom.css')<entry.indexOf('css/task-fidelity-v2.css'));
 assert.match(css,/#modal-info-dueDate-container \{ margin-bottom: 0 !important; \}/);
 const rendered=ui.renderTaskDetailFlow(task);assert.match(rendered,/<section id="sidebar-responsibles-container" class="sb-flow-responsibles"/);assert.match(rendered,/<div class="sb-flow-step sb-flow-assignment/);
});
test('signal handler keeps target selection, permission gate and explicit confirmation', () => {
 const main=read('app/js/main.js');const block=main.slice(main.indexOf('// Evento para o botão de sinalização'),main.indexOf("document.getElementById('add-comment-btn').addEventListener"));
 assert.match(block,/task.status === 'homologation'/);assert.match(block,/const responsibleList = task.responsible/);assert.match(block,/newConfirmBtn.onclick = async/);assert.match(block,/api.signalResponsible\(taskId, selectedTargets\)/);assert.match(block,/index === 0 \? 'checked'/);
 assert.equal((block.match(/<span>Chamar atenção<\/span>/g)||[]).length,2);
});
test('requested rows put name before role and recorded date/time, with no current heading', () => {
 const html=ui.renderTaskDetailFlow(task);
 assert.match(html,/>Ana<\/p><p class="sb-flow-meta">Solicitante - <time datetime="2026-10-10T09:00:00Z" title="2026-10-10T09:00:00Z">10\/10 - 09:00<\/time>/);
 assert.match(html,/>Ana<\/p><p class="sb-flow-meta">Responsável principal - <time/);
 assert.match(html,/>Caio<\/p><p class="sb-flow-meta">Responsável - <time/);
 assert.match(html,/>Dora<\/p><p class="sb-flow-meta">Homologador<\/p>/);
 assert.doesNotMatch(html,/<h4|sb-flow-group-label|>Atuais/);
 assert.equal((html.match(/sb-flow-current/g)||[]).length,1);
});
test('requester uses only its recordedAt; task dates and sample times are never substituted', () => {
 const html=ui.renderTaskDetailFlow({requester:a,createdAt:initial,updatedAt:initial,responsible:[b],homologador:d});
 assert.doesNotMatch(html,/<time\b|13:50|14\/10/);
 const recorded=ui.renderTaskDetailFlow({requester:{...a,recordedAt:'2026-10-14T16:51:00Z'},createdAt:initial,responsible:[b]});
 assert.match(recorded,/14\/10 - 16:51/);assert.doesNotMatch(recorded,/10\/10 - 09:00/);
});
test('missing or invalid recorded timestamp never becomes a current date or midnight', () => {
 for(const at of [undefined,null,'','invalid','2026-02-30T13:50:00Z','2026-10-14T13:50:00','2026-10-14T24:00:00Z','2026-10-14T13:60:00Z',123,true,{}]) {
  const html=ui.renderTaskDetailFlow({requester:{...a,recordedAt:at},responsible:[b],assignmentHistory:[{from:null,to:[b],at}]});
  assert.doesNotMatch(html,/<time\b|Invalid Date|00:00/);
 }
});
test('date-only records preserve the date without inventing an hour', () => {
 const html=ui.renderTaskDetailFlow({requester:{...a,recordedAt:'2026-10-14'},responsible:[b],assignmentHistory:[{from:null,to:[b],at:'2026-10-14'}]});
 assert.equal((html.match(/>14\/10<\/time>/g)||[]).length,2);assert.doesNotMatch(html,/00:00/);
});
test('timestamps follow browser locale zone; the same source yields appropriate local time', () => {
 const source='data:text/javascript;base64,'+Buffer.from(read('app/js/task-provenance.js')).toString('base64');
 for(const [TZ,expected] of [['America/Los_Angeles','14/10 - 09:51'],['America/Sao_Paulo','14/10 - 13:51']]) {
  const child=spawnSync(process.execPath,['--input-type=module','--eval',`const {renderTaskDetailFlow}=await import(${JSON.stringify(source)});console.log(renderTaskDetailFlow({requester:{email:'a@example.invalid',name:'Ana',recordedAt:'2026-10-14T16:51:00Z'},responsible:[]}));`],{encoding:'utf8',env:{...process.env,TZ}});
  assert.equal(child.status,0,child.stderr);assert.ok(child.stdout.includes(expected));
 }
});
test('recorded group time repeats for its simultaneous members without splitting or mutation', () => {
 const before=JSON.stringify(task);const current=ui.renderTaskDetailFlow(task).split('sb-flow-current')[1].split('</section>')[0];
 assert.equal((current.match(/>14\/10 - 09:10<\/time>/g)||[]).length,2);assert.equal(JSON.stringify(task),before);
 assert.match(read('app/css/task-fidelity-v2.css'),/\.sb-flow-current \{ background: #eaf0ff; border-color: #b6c7ff;/);
});
test('detail rail reserves role/date space without clipping or changing editor columns', () => {
 const css=read('app/css/task-fidelity-v2.css');
 assert.match(css,/body\.sb-app\.sb-fidelity-v2 #taskHistoryModal \{ --sb-task-columns: minmax\(0, 1fr\) 340px;/);
 assert.match(css,/@media \(max-width: 880px\)/);
 assert.match(css,/@media \(max-width: 360px\) \{\s*body\.sb-app\.sb-fidelity-v2 #taskHistoryModal \{ --sb-task-rail-inset: 6px; --sb-flow-person-gap: 8px;/);
 const metadata=css.match(/\.sb-flow-meta \{([^}]+)\}/)[1];
 assert.doesNotMatch(metadata,/nowrap|hidden|ellipsis/);
 assert.match(metadata,/font-size: 12px/);
 assert.match(css,/\.sb-flow-person \{[^}]*gap: var\(--sb-flow-person-gap, 12px\)/);
});
console.log(`${count} TC492 cases passed`);
