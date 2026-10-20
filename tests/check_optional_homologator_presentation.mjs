// TC483: a selected person plus a status is not evidence of their approval.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app/js/ui.js',import.meta.url),'utf8');
const slice=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=slice("    let homologadorBadge = '';",'    const decisionPending');
const detail=slice('    // Homologador (Sidebar do Modal)','    // Google Calendar');
const list=slice('        const homologadorName =','        if (fidelity)');
for(const status of ['todo','stopped','inprogress','homologation','publication','done']) {
    const task={status,homologador:{email:'reviewer@example.test',name:'Reviewer <literal>'},history:[]};
    const before=JSON.stringify(task),classes=new Set(['hidden']);
    const content={innerHTML:''},container={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}};
    const context={task,escapeCardText:escape,escapeHomeText:escape,esc:escape,document:{getElementById:id=>id==='modal-info-homologador-container'?container:content}};
    vm.createContext(context);vm.runInContext(badge+detail+list+'\nglobalThis.badge=homologadorBadge;globalThis.list=homologadorHtml;',context);
    assert.doesNotMatch(context.badge+context.list+content.innerHTML,/Homologado por|>Aprovado<|data-lucide="check-circle"/,'preselection/status cannot assert an approval');
    assert.equal(classes.has('hidden'),false);assert.match(content.innerHTML,/Reviewer &lt;literal&gt;/);
    assert.match(content.innerHTML,new RegExp(`>${status==='homologation'?'Pendente':'Definido'}<`));
    assert.equal(JSON.stringify(task),before,'rendering must not rewrite the history or task');
}
// Real approval evidence is still retained in the server's audit and success flow;
// neutral person labels do not weaken decision authority or remove that feedback.
const main=readFileSync(new URL('../app/js/main.js',import.meta.url),'utf8');
assert.match(main,/showApprovalSuccess/);
const api=readFileSync(new URL('../api/updateTask/index.js',import.meta.url),'utf8');
assert.match(api,/approve: 'Homologação aprovada'/);
console.log('PASS TC483 presentation: person labels stay neutral for all statuses including direct legacy Publicação; Pendente is limited to Homologação; escaping, models, history and explicit approval feedback preserved. Actual renderer sections, synthetic data.');
