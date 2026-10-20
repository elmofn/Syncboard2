// Browser-only synthetic fixture. Server supplies the unchanged production drag
// callback; API stubs persist only this tab's fixture data, never real tasks.
import {state} from '/app/js/state.js';
import * as realUI from '/app/js/ui.js';
import {isFidelityV2, hasFidelityFilters} from '/app/js/fidelity-v2.js';
const key = 'tc480-isolated-qa';
const initial = () => [
  {id:'FIX-1', title:'Drag me below a short or empty lane', status:'todo', order:0},
  {id:'FIX-2', title:'Second card for ordering', status:'todo', order:1},
  {id:'FIX-3', title:'Short target lane', status:'inprogress', order:0}
].map(t => ({progress:0,project:'Fixture',projectColor:'#365DCB',responsible:[],createdAt:'2026-10-12T10:00:00Z',...t}));
const node = id => document.getElementById(id);
const report = text => { node('qa-events').textContent = text; };
state.currentView = 'kanban';
state.currentUser = {userDetails:'qa@example.invalid', userRoles:['travelcash_user']};
state.tasks = JSON.parse(sessionStorage.getItem(key) || 'null') || initial();
state.projectTaskCountsStatus = 'unavailable';
let refreshDrag = () => {};
let saves = 0;
const persist = () => sessionStorage.setItem(key, JSON.stringify(state.tasks));
function render() {
  realUI.updateActiveView();
  refreshDrag();
  requestAnimationFrame(checkGeometry);
}
const ui = {renderKanbanView:render, updateActiveView:render, showToast:report};
const api = {
  async updateTask(id, payload) { Object.assign(state.tasks.find(t => t.id === id), payload); persist(); report(`LOCAL save ${++saves}: ${id} → ${payload.status}; reload preserves fixture state`); },
  async updateOrder(payload) { for (const item of payload) state.tasks.find(t => t.id === item.id).order = item.order; persist(); report(`LOCAL order ${++saves}: ${payload.map(t => t.id + ':' + t.order).join(', ')}`); }
};
globalThis.tc480 = {state,api,ui,isFidelityV2,hasFidelityFilters,openHomologadorModal:() => report('Homologation intercepted by the real callback; no live selector/API in this fixture')};
const drag = await import('/__tc480_drag.mjs');
refreshDrag = drag.updateDragAndDropState;
node('loader-container').remove();
node('app').inert = false;
node('main-content').style.opacity = '1';
node('main-content').classList.add('immersive-canvas');
document.querySelectorAll('[data-fidelity-view], #view-switcher-orb [data-view]').forEach(button => {
  button.onclick = () => {
    const view = button.dataset.fidelityView || button.dataset.view;
    if (!['home', 'kanban', 'list'].includes(view)) { report('Fixture navigation is limited to Home, Kanban and List'); return; }
    state.currentView = view; render();
  };
});
node('qa-reset').onclick = () => { state.tasks = initial();state.searchQuery='';state.currentView='kanban';persist();render();report('Reset synthetic data'); };
node('qa-long').onclick = () => { state.tasks = initial().concat(Array.from({length:10},(_,i)=>({...initial()[0],id:`LONG-${i}`,title:`Long lane ${i}`,order:i+2})));persist();render();report('Long lane added; scroll and drop into short/empty lane'); };
node('qa-empty').onclick = () => { state.tasks=[];persist();render();report('All lanes empty; geometry check only'); };
node('qa-filter').onclick = () => { state.searchQuery = state.searchQuery ? '' : 'lane';render();report(`Filter ${state.searchQuery ? 'on: only cross-lane movement' : 'off: ordering enabled'}`); };
node('qa-theme').onclick = () => document.documentElement.classList.toggle('dark');
node('qa-check').onclick = checkGeometry;
function checkGeometry() {
  if (state.currentView !== 'kanban') { node('qa-result').textContent = 'Other view: ' + state.currentView; return; }
  const boardNode = node('kanbanView');
  const board = boardNode.getBoundingClientRect();
  const main = node('main-content');
  const bottomPadding = parseFloat(getComputedStyle(main).paddingBottom);
  const boardPadding = parseFloat(getComputedStyle(boardNode).paddingBottom);
  const listBottom = board.top + boardNode.clientTop + boardNode.clientHeight - boardPadding;
  const lists = [...document.querySelectorAll('.kanban-task-list')];
  const rects = lists.map(el => el.getBoundingClientRect());
  const aligned = Math.max(...rects.map(r=>r.bottom))-Math.min(...rects.map(r=>r.bottom)) < 2;
  const filled = board.bottom + main.scrollTop >= main.getBoundingClientRect().bottom-bottomPadding-2;
  const rows = rects.every(r=>r.bottom >= listBottom-2);
  node('qa-result').textContent = `${aligned && filled && rows ? 'PASS' : 'FAIL'} geometry: aligned=${aligned}, fills canvas=${filled}, full row=${rows}; viewport ${innerWidth}×${innerHeight}; bottom ${Math.round(rects[0].bottom)}`;
}
window.addEventListener('resize',checkGeometry);
render();
report('Drag FIX-1 into the free area below Andamento or into empty Parado. Refresh to verify local persistence.');
