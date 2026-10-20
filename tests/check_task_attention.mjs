// TC495: pure recipient matching, four presentation contracts, no live APIs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
const attention = await import('data:text/javascript;base64,'+Buffer.from(read('app/js/task-attention.js')).toString('base64'));
const secondary = await import('data:text/javascript;base64,'+Buffer.from(read('app/js/fidelity-secondary-v2.js')).toString('base64'));
const user = {userDetails:'one@example.invalid',userId:'subject-one',claims:[{typ:'name',val:'Claim One'}]};
const users=[{name:'Stored One',email:'one@example.invalid'},{name:'Other',email:'other@example.invalid'}];
const task={id:'QA-495',title:'A <title>',status:'inprogress',priority:'Média',project:'Synthetic',responsible:['Stored One'],requester:{email:user.userDetails},homologador:{email:user.userDetails},comments:[],attachments:[{}]};
const cases=[
 [undefined,false],[null,false],[[],false],['not-array',false],[[null,{},0,''],false],
 [['Stored One'],true],[[{targetUser:'Stored One'}],true],[['STORED ONE'],true],
 [['one@example.invalid'],true],[['SUBJECT-ONE'],true],[['Claim One'],true],
 [['Other'],false],[[' Stored One '],false],[[{targetUser:'other@example.invalid'}],false],
 [[{targetUser:'Stored One'},{targetUser:'Stored One'},'Other'],true]
];
for (const [pendingAlerts,expected] of cases) {
 const t={...task,pendingAlerts}; const before=JSON.stringify([t,user,users]);
 assert.equal(attention.hasPendingTaskAttention(t,user,users),expected,JSON.stringify(pendingAlerts));
 const badge=attention.renderTaskAttentionBadge(t,user,users);
 assert.equal((badge.match(/class="sb-task-attention-badge"/g)||[]).length,Number(expected));
 assert.equal(JSON.stringify([t,user,users]),before);
 assert.equal(attention.hasPendingTaskAttention(t,null,users),false);
}
// Differential check against the untouched queue's recognition for valid existing data.
const main=read('app/js/main.js');const start=main.indexOf('function checkAndQueueAlerts(');const end=main.indexOf('\nfunction processAlertQueue()',start);
for(const pendingAlerts of [[],['Stored One'],[{targetUser:'Stored One'}],['ONE@EXAMPLE.INVALID'],['subject-one'],['Claim One'],['Other'],[{targetUser:'Other'},'Stored One'],['Stored One','Stored One'],[' Stored One ']]) {
 const t={...task,pendingAlerts};const context={state:{currentUser:user,users},alertQueue:[],processAlertQueue(){}};
 vm.createContext(context);vm.runInContext(main.slice(start,end)+';checkAndQueueAlerts(input);',Object.assign(context,{input:[t]}));
 assert.equal(attention.hasPendingTaskAttention(t,user,users),context.alertQueue.length===1);
}
const t={...task,pendingAlerts:['Stored One','Stored One',{targetUser:'Other'}]};
const badge=attention.renderTaskAttentionBadge(t,user,users);
assert.match(badge,/aria-hidden="true" focusable="false"/);assert.doesNotMatch(badge,/<button|signaledBy|timestamp|Other/);
const ctx={attentionBadge:badge,status:{label:'Andamento'},pending:false,overdue:false,formatDate:()=>'',respNames:'Stored One',statusLabel:'Andamento',projectColor:'#abc',progress:null};
for (const render of [secondary.renderFidelityHomeRow,secondary.renderFidelityListRow]) {
 const html=render(t,ctx);assert.equal((html.match(/class="sb-task-attention-badge"/g)||[]).length,1);assert.match(html,/aria-label="[^"]*Atenção solicitada/);
 assert.equal((render(t,{...ctx,attentionBadge:''}).match(/sb-task-attention/g)||[]).length,0);
}
// Another recipient alone does not show a badge; receipt for this user still does.
assert.equal(attention.renderTaskAttentionBadge({...t,pendingAlerts:[{targetUser:'Other'}]},user,users),'');
assert.ok(attention.renderTaskAttentionBadge({...task,pendingAlerts:[{targetUser:'Stored One',acknowledgedAt:'2026-10-15T15:00:00Z'}]},user,users)); // TC495: receipt retains the badge.
// Other roles alone do not grant the indication; stale owner changes do not change existing recipient semantics.
assert.equal(attention.renderTaskAttentionBadge({...task,pendingAlerts:['Other']},user,users),'');
assert.ok(attention.renderTaskAttentionBadge({...task,responsible:['Other'],pendingAlerts:['Stored One']},user,users));
for(const entry of ['app/index.html','app/ui-v2-fidelity-preview.html','app/fragments/taskHistoryModal-fidelity-v2.html'])assert.equal((read(entry).match(/id="fidelity-detail-attention"/g)||[]).length,1);
assert.match(read('app/js/fidelity-v2.js'),/attentionBadge}\$\{projectStrip}/);
assert.match(read('app/js/task-fidelity-v2.js'),/attention.hidden = !badge/);
console.log('PASS TC495: 15 recipient/malformed cases, differential existing-queue matching, duplicate consolidation, role boundaries, receipt retention, read-only rendering, accessible markup and four surface anchors.');
