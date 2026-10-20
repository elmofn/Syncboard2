import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ui = read('app/js/ui.js');
const source = ui.slice(ui.indexOf('let notificationRefreshVersion = 0;'), ui.indexOf('// --- AUTOCOMPLETE E INPUTS')).replaceAll('export ', '');
function setup(fetchNotifications, markNotificationRead = async () => {}) {
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', value: '', disabled: false, classList: { names: new Set(['hidden']), add(n) { this.names.add(n); }, remove(n) { this.names.delete(n); }, contains(n) { return this.names.has(n); } }, querySelectorAll() { return []; } });
        return elements.get(id);
    };
    const ctx = vm.createContext({ document: { getElementById: get }, fetchNotifications, markNotificationRead, window: {}, formatDateTime: () => 'date' });
    vm.runInContext(read('app/js/people-v2.js').replace(/^import .*;\n/gm, '').replaceAll('export ', '') + '\n' + source, ctx);
    return { ctx, get, filter(value) { get('notifications-read-filter').value = value; get('notifications-read-filter').onchange(); } };
}
const sample = () => [{id:'unread-1',taskId:'T1',message:'Unread message',isRead:false},{id:'read-2',taskId:'T2',message:'Read message',isRead:true}];
test('all/read/unread filters preserve badge count and persist across refreshes', async () => {
    const h=setup(async()=>sample()); await h.ctx.updateNotificationBadge();
    assert.match(h.get('modal-notifications-list').innerHTML,/unread-1/); assert.match(h.get('modal-notifications-list').innerHTML,/read-2/);
    h.filter('read'); assert.doesNotMatch(h.get('modal-notifications-list').innerHTML,/unread-1/); assert.match(h.get('modal-notifications-list').innerHTML,/read-2/);
    assert.equal(h.get('orb-notif-count').textContent,1);
    h.filter('unread'); await h.ctx.updateNotificationBadge(); assert.match(h.get('modal-notifications-list').innerHTML,/unread-1/); assert.doesNotMatch(h.get('modal-notifications-list').innerHTML,/read-2/);
    h.filter('unexpected'); assert.match(h.get('modal-notifications-list').innerHTML,/read-2/);
});
test('bulk marks only unread records from fresh own fetch, independent of read filter', async () => {
    const rows=sample(),calls=[]; const h=setup(async()=>structuredClone(rows),async id=>{calls.push(id); rows.find(n=>n.id===id).isRead=true;});
    await h.ctx.updateNotificationBadge(); h.filter('read'); rows.push({id:'new',taskId:'T3',isRead:false});
    await h.ctx.markAllNotificationsRead(); assert.deepEqual(calls.sort(),['new','unread-1']); assert.equal(h.get('notifications-mark-all').disabled,true);
    assert.equal(h.get('notification-orb-badge').classList.contains('hidden'),true); assert.match(h.get('notifications-feedback').textContent,/Notificações desta ação/);
    h.filter('unread'); assert.match(h.get('modal-notifications-list').innerHTML,/Nenhuma notificação não lida/);
});
test('duplicate bulk clicks ignored; concurrency bounded; partial failures stay unread and retryable', async()=>{
    const rows=Array.from({length:11},(_,i)=>({id:`n${i}`,isRead:false})); let active=0,max=0,calls=0;let fail=true;
    const h=setup(async()=>structuredClone(rows),async id=>{calls++;max=Math.max(max,++active);await new Promise(setImmediate);active--;if(id==='n3'&&fail)throw Error('HTTP500');rows.find(n=>n.id===id).isRead=true;});
    await h.ctx.updateNotificationBadge(); const first=h.ctx.markAllNotificationsRead(); assert.equal(h.get('notifications-mark-all').disabled,true);await h.ctx.markAllNotificationsRead(); await first;
    assert.equal(calls,11);assert.equal(max,4);assert.match(h.get('notifications-feedback').textContent,/1 notificação/);assert.equal(h.get('notifications-mark-all').disabled,false);assert.equal(h.get('orb-notif-count').textContent,1);
    fail=false;await h.ctx.markAllNotificationsRead();assert.equal(calls,12);assert.equal(h.get('notifications-mark-all').disabled,true);
});
test('load failure does not mutate or erase last known notifications',async()=>{
    let fail=false,marks=0; const h=setup(async()=>{if(fail)throw Error('offline');return sample();},async()=>{marks++;});
    await h.ctx.updateNotificationBadge(); const before=h.get('modal-notifications-list').innerHTML;fail=true;
    await h.ctx.updateNotificationBadge(); assert.equal(h.get('modal-notifications-list').innerHTML,before);
    await h.ctx.markAllNotificationsRead();assert.equal(marks,0);assert.equal(h.get('modal-notifications-list').innerHTML,before);assert.match(h.get('notifications-feedback').textContent,/Nenhuma marcação/);
    fail=false; await h.ctx.updateNotificationBadge(); assert.equal(h.get('notifications-feedback').textContent,'');
});
test('older refresh cannot repaint during bulk; new arrivals after snapshot remain unread',async()=>{
    let resolveOld, count=0; const rows=sample(); const h=setup(async()=>{if(++count===2)return new Promise(r=>resolveOld=r);return structuredClone(rows);},async id=>{resolveOld(sample());rows.find(n=>n.id===id).isRead=true;rows.push({id:'arrived-later',isRead:false});});
    await h.ctx.updateNotificationBadge(); const old=h.ctx.updateNotificationBadge();await h.ctx.markAllNotificationsRead();await old;
    assert.equal(h.get('orb-notif-count').textContent,1);assert.match(h.get('modal-notifications-list').innerHTML,/arrived-later/);assert.equal(h.get('notifications-mark-all').disabled,false);
});
test('HTTP read/write failures reject and writes contain only ID, never target user',async()=>{
    const calls=[];const ctx=vm.createContext({fetch:async(...args)=>{calls.push(args);return{ok:false};}});vm.runInContext(read('app/js/api.js').replace(/^import .*;\n/gm,'').replaceAll('export ',''),ctx);
    await assert.rejects(ctx.fetchNotifications(),/carregar/);await assert.rejects(ctx.markNotificationRead('n1'),/marcar/);assert.deepEqual(JSON.parse(calls[1][1].body),{id:'n1'});
    const api=read('api/markNotificationRead/index.js');assert.match(api,/container\.item\(id, user\.userDetails\)/);
});
test('notification controls accessible and present in both full app entrypoints',()=>{
    for(const file of ['app/index.html','app/ui-v2-fidelity-preview.html']){const html=read(file);assert.match(html,/label for="notifications-read-filter"/);assert.match(html,/value="unread"/);assert.match(html,/value="read"/);assert.match(html,/id="notifications-mark-all"[^>]*disabled/);assert.match(html,/id="notifications-feedback"[^>]*role="status"/);}
});
