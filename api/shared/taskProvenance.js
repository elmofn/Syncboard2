// Prospective provenance only. Do not infer people or events from legacy free text.
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function fail(status, message) { throw Object.assign(new Error(message), {httpStatus: status, publicCode: 'TASK_PROVENANCE'}); }
function helpers() { return require('./homologation'); }
function snapshot(value) {
    if (!Array.isArray(value)) return null;
    const result = [];
    for (const person of value) {
        const email = helpers().homologatorEmail(person);
        if (!email) return null;
        if (!result.some(item => item.email === email)) result.push({email, name: typeof person === 'object' && typeof person.name === 'string' ? person.name : email});
    }
    return result;
}
function sameMembers(a, b) {
    return a !== null && b !== null && a.length === b.length && a.every(person => b.some(other => other.email === person.email));
}
async function createProvenance(body, req, users) {
    const {actorEmail, registeredProfile} = helpers();
    const actor = actorEmail(req);
    if (!actor) fail(401, 'Identidade autenticada necessária para registrar a tarefa.');
    const at = new Date().toISOString();
    // Always derive requester from trusted authentication. Ignore every client
    // requester field, including legacy explicit-request payloads from stale tabs.
    const profile = await registeredProfile(actor, users);
    const requester = {
        email: actor,
        name: profile?.name || profile?.displayName || actor,
        source: 'self_declared',
        recordedByEmail: actor,
        recordedAt: at,
        evidenceRef: null
    };
    const to = snapshot(body.responsible);
    if (to === null) fail(400, 'Selecione responsáveis com e-mail válido.');
    return {requester, assignmentHistory: [{at, actorEmail: actor, from: [], to}]};
}
function applyProvenance(previous, next, req) {
    // Preserve exact stored values, including absent legacy fields, on every path.
    for (const key of ['createdBy', 'createdAt', 'requester', 'assignmentHistory']) {
        delete next[key];
        if (own(previous, key)) next[key] = previous[key];
    }
    const from = snapshot(previous.responsible), to = snapshot(next.responsible);
    if (sameMembers(from, to) || JSON.stringify(previous.responsible) === JSON.stringify(next.responsible)) return;
    const actor = helpers().actorEmail(req);
    if (!actor) fail(401, 'Identidade autenticada necessária para alterar responsáveis.');
    if (to === null) fail(400, 'Selecione responsáveis com e-mail válido.');
    if (own(previous, 'assignmentHistory') && !Array.isArray(previous.assignmentHistory)) fail(409, 'Histórico de responsáveis inválido. Contate a equipe antes de alterar.');
    next.assignmentHistory = [...(previous.assignmentHistory || []), {at: new Date().toISOString(), actorEmail: actor, from, to}];
}
module.exports = {createProvenance, applyProvenance};
