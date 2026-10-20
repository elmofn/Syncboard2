const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const email = person => typeof person?.email === 'string' ? person.email.trim().toLowerCase() : '';
const name = person => String(person?.name || email(person) || 'Nome não informado');
const knownGroup = value => Array.isArray(value) && value.every(person => email(person));
const same = (a, b) => knownGroup(a) && knownGroup(b) && a.length === b.length && a.every(person => b.some(other => email(other) === email(person)));

export function assignmentTrail(task) {
    const events = Array.isArray(task.assignmentHistory) ? task.assignmentHistory : [];
    const nodes = [];
    const complete = Object.prototype.hasOwnProperty.call(task, 'requester') && Boolean(task.createdAt) && events[0]?.at === task.createdAt && events.length > 0 && Array.isArray(events[0]?.from) && events[0].from.length === 0;
    let previous = null;
    for (const event of events) {
        if (!knownGroup(event?.to)) { nodes.push({gap: true}); previous = null; continue; }
        if (previous === null) {
            if (knownGroup(event.from) && event.from.length) nodes.push({people: event.from, label: 'Responsáveis anteriores'});
            else if (event.from === null) nodes.push({gap: true});
        } else if (!same(previous, event.from)) {
            nodes.push({gap: true});
            if (knownGroup(event.from) && event.from.length) nodes.push({people: event.from, label: 'Responsáveis anteriores'});
        }
        nodes.push({people: event.to, at: event.at || null, label: 'Responsáveis em ' + (event.at || 'data não registrada')});
        previous = event.to;
    }
    const current = [];
    for (const person of Array.isArray(task.responsible) ? task.responsible : []) {
        const normalized = typeof person === 'object' && person ? person : typeof person === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.trim()) ? {email: person.trim().toLowerCase(), name: person} : {name: person};
        if (!email(normalized) || !current.some(item => email(item) === email(normalized))) current.push(normalized);
    }
    if (!events.length || !same(previous, current)) {
        if (events.length) nodes.push({gap: true});
        nodes.push({people: current, current: true, label: 'Responsáveis atuais'});
    } else if (nodes.length) {
        // Current order defines Principal; old snapshots retain their recorded order.
        nodes[nodes.length - 1] = {...nodes[nodes.length - 1], people: current, current: true, label: 'Responsáveis atuais'};
    }
    return {nodes, partial: !complete || nodes.some(node => node.gap), missingStart: !complete};
}

function personMarkup(person, users, allowSnapshotPicture = false) {
    const display = name(person);
    const picture = users.find(user => email(user) && email(user) === email(person))?.picture || (allowSnapshotPicture ? person?.picture : null);
    const safePicture = typeof picture === 'string' && (/^https:\/\//i.test(picture) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(picture)) ? picture : '';
    const photo = safePicture ? `<img class="sb-provenance-photo" src="${esc(safePicture)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    // Keep initials underneath photos; the shared capture listener removes failed images.
    return `<span class="sb-provenance-avatar" aria-hidden="true">${esc(display.split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('').toUpperCase() || '?')}${photo}</span>`;
}
export function renderAssignmentTrail(task, users = []) {
    const {nodes, partial} = assignmentTrail(task);
    const requester = email(task.requester) ? task.requester : null;
    const requestLabel = requester ? `Solicitante: ${name(requester)} (${email(requester)}). ${requester.source === 'explicit_request' ? 'Indicado por ' + (requester.recordedByEmail || 'registrador não informado') + '; referência declarada: ' + (requester.evidenceRef || 'não informada') : 'Registrado na criação'}` : 'Solicitante não registrado';
    let html = `<button type="button" class="sb-provenance-group sb-provenance-requester" data-provenance-label="${esc(requestLabel)}" aria-label="${esc(requestLabel)}" title="${esc(requestLabel)}">${requester ? personMarkup(requester, users) : '<span class="sb-provenance-avatar" aria-hidden="true">?</span>'}</button>`;
    let gap = partial;
    if (partial) html += '<span class="sb-provenance-gap" title="Histórico parcial: trocas anteriores não registradas" aria-label="Histórico parcial">…</span>';
    for (const node of nodes) {
        if (node.gap) { if (gap) continue; html += '<span class="sb-provenance-gap" title="Trecho não registrado" aria-label="Trecho não registrado">…</span>'; gap = true; continue; }
        if (!gap) html += '<span class="sb-provenance-arrow" aria-hidden="true">→</span>';
        gap = false;
        const label = node.label + ': ' + (node.people.length ? node.people.map(person => name(person) + (email(person) ? ` (${email(person)})` : '')).join(' + ') : 'Nenhum');
        html += `<button type="button" class="sb-provenance-group" data-provenance-label="${esc(label)}" aria-label="${esc(label)}" title="${esc(label)}">${node.people.length ? node.people.map(person => personMarkup(person, users)).join('') : '<span class="sb-provenance-avatar" aria-hidden="true">—</span>'}</button>`;
    }
    return `<div class="sb-assignment-trail" role="group" aria-label="Solicitante e sequência de responsáveis${partial ? '; histórico parcial' : ''}">${html}</div>`;
}

// TC492: use the same provenance chain as cards, with no inferred dates or identities.
const normalizePerson = person => typeof person === 'object' && person ? person : typeof person === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.trim()) ? {email: person.trim(), name: person} : {name: person};
function flowDate(at) {
    // Only recorded, unambiguous dates are shown. A date-only record has no time.
    if (typeof at !== 'string') return '';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(at);
    const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/i.test(at);
    if (!dateOnly && !timestamp) return '';
    const [year, month, day] = at.slice(0, 10).split('-').map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return '';
    const date = new Date(at);
    if (!Number.isFinite(date.getTime())) return '';
    const label = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit', ...(dateOnly ? {timeZone: 'UTC'} : {})});
    return dateOnly ? label : `${label} - ${date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
}
function flowPerson(person, users, {role = '', at = null, nameId = ''} = {}) {
    const display = name(person);
    const date = flowDate(at);
    const metadata = role ? `<p class="sb-flow-meta">${esc(role)}${date ? ` - <time datetime="${esc(at)}" title="${esc(at)}">${esc(date)}</time>` : ''}</p>` : '';
    return `<div class="sb-flow-person">${personMarkup(person, users, true)}<div class="sb-flow-person-copy"><p${nameId ? ` id="${nameId}"` : ''} class="sb-flow-name"${email(person) ? ` title="${esc(email(person))}"` : ''}>${esc(display)}</p>${metadata}</div></div>`;
}
export function renderTaskDetailFlow(task, users = []) {
    const {nodes, partial, missingStart} = assignmentTrail(task);
    const requester = email(task.requester) ? task.requester : null;
    const source = requester ? (requester.source === 'explicit_request'
        ? `Indicado por ${requester.recordedByEmail || 'registrador não informado'}. Referência declarada: ${requester.evidenceRef || 'não informada'}`
        : 'Registrado na criação') : 'Solicitante não registrado; nenhum dado foi inferido.';
    let html = `<div class="sb-flow-step sb-flow-requester"><div role="group" aria-describedby="fidelity-detail-requester-source" title="${esc(source)}">${flowPerson(requester || {name: 'Não registrado'}, users, {nameId: 'fidelity-detail-requester', role: 'Solicitante', at: requester?.recordedAt})}</div><p id="fidelity-detail-requester-source" class="sb-flow-source">${esc(source)}</p></div>`;
    html += `<section id="sidebar-responsibles-container" class="sb-flow-responsibles" aria-label="Sequência de responsáveis${partial ? '; histórico parcial' : ''}">`;
    let gap = missingStart;
    if (missingStart) html += '<p class="sb-flow-gap" role="note">Histórico parcial: trocas anteriores não registradas</p>';
    for (const node of nodes) {
        if (node.gap) {
            if (!gap) html += '<p class="sb-flow-gap" role="note">Trecho não registrado</p>';
            gap = true; continue;
        }
        html += `<div class="sb-flow-step sb-flow-assignment${node.current ? ' sb-flow-current' : ''}${node.people.length > 1 ? ' sb-flow-simultaneous' : ''}${gap ? ' sb-flow-after-gap' : ''}"><div class="sb-flow-group" role="group" aria-label="${esc(node.label)}">${node.people.length ? node.people.map((person, index) => flowPerson(person, users, {role: node.current && index === 0 ? 'Responsável principal' : 'Responsável', at: node.at})).join('') : '<div class="sb-flow-person"><span class="sb-provenance-avatar" aria-hidden="true">—</span><p class="sb-flow-name">Sem responsável</p></div>'}</div></div>`;
        gap = false;
    }
    html += '</section>';
    // TC495: typed audit events only; no identities extracted from HTML descriptions.
    const attentionEvents = (Array.isArray(task.history) ? task.history : [])
        .filter(item => item?.action === 'attention_requested')
        .slice().sort((a, b) => (Date.parse(a.timestamp) || 0) - (Date.parse(b.timestamp) || 0));
    for (const event of attentionEvents) {
        const date = flowDate(event.timestamp);
        html += `<div class="sb-flow-attention" role="note"><span aria-hidden="true">•</span> Atenção solicitada${date ? ` <time datetime="${esc(event.timestamp)}" title="${esc(event.timestamp)}">${esc(date)}</time>` : ' · Data não registrada'}</div>`;
    }
    const homologador = task.homologador ? normalizePerson(task.homologador) : null;
    html += `<section id="modal-info-homologador-container" class="sb-flow-step sb-flow-validator"${homologador ? '' : ' hidden'}><div id="modal-info-homologador">${homologador ? flowPerson(homologador, users, {role: 'Homologador'}) : ''}</div></section><section id="fidelity-no-validator" class="sb-flow-step sb-flow-validator"${homologador ? ' hidden' : ''}>${flowPerson({name: 'Não informado'}, users, {role: 'Homologador'})}</section>`;
    return html;
}
