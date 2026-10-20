// Stage versions are server-owned and follow committed task snapshots, never clocks.
// Unversioned notices remain untouched except recognizable legacy reviewer notices
// after homologation has ended in publication/done (explicitly approved TC484).
const activeOrder = ['todo', 'inprogress', 'homologation', 'publication', 'done'];
const knownStatuses = new Set([...activeOrder, 'stopped']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const safeStage = value => Number.isSafeInteger(value) && value >= 0;

function stageVersion(task) {
    if (!own(task, 'notificationStageVersion')) return 0;
    return safeStage(task.notificationStageVersion) ? task.notificationStageVersion : null;
}
function readThrough(task) {
    const current = stageVersion(task);
    const cutoff = task.notificationsReadThroughStage;
    return current !== null && safeStage(cutoff) && cutoff < current ? cutoff : -1;
}
function isAdvance(from, to) {
    if (from === to || !knownStatuses.has(from) || !knownStatuses.has(to)) return false;
    // Archive/completion is terminal even if the task was stopped.
    if (to === 'done') return true;
    // A stopped task has no reliable structured record of its previous active stage.
    // Neither stopping nor resuming is silently treated as progress.
    return activeOrder.includes(from) && activeOrder.includes(to) && activeOrder.indexOf(to) > activeOrder.indexOf(from);
}
function applyStageTransition(previous, next) {
    // Never accept a client-provided version or watermark, including full-task saves.
    delete next.notificationStageVersion;
    delete next.notificationsReadThroughStage;
    const version = stageVersion(previous);
    // Unknown/corrupt stored metadata cannot safely be renumbered. Preserve it;
    // notification creation/reconciliation will also fail closed for this task.
    if (version === null || version === Number.MAX_SAFE_INTEGER) {
        for (const key of ['notificationStageVersion', 'notificationsReadThroughStage']) {
            if (own(previous, key)) next[key] = previous[key];
        }
        return;
    }
    const changed = previous.status !== next.status;
    next.notificationStageVersion = version + (changed ? 1 : 0);
    next.notificationsReadThroughStage = isAdvance(previous.status, next.status) ? version : readThrough(previous);
}
function legacyReviewerNotice(notification, taskId) {
    return !own(notification, 'taskStageVersion') && !own(notification, 'type') &&
        notification.message === 'Homologação Pendente' &&
        typeof notification.commentPreview === 'string' &&
        notification.commentPreview.startsWith(`Você foi designado para homologar a tarefa #${taskId}: `);
}
function closesLegacyReview(task) {
    return task.status === 'publication' || task.status === 'done';
}
function isSuperseded(notification, task) {
    return notification.isRead === false && notification.taskId === task.id &&
        ((safeStage(notification.taskStageVersion) && notification.taskStageVersion <= readThrough(task)) ||
         (closesLegacyReview(task) && legacyReviewerNotice(notification, task.id)));
}

async function markSuperseded(notification, task, notifications) {
    let current = notification;
    // Bounded conflict retries; later reads retry any remaining reconciliation.
    for (let attempt = 0; attempt < 2 && isSuperseded(current, task); attempt++) {
        const item = notifications.item(current.id, current.targetUserEmail);
        if (!current._etag) {
            const { resource } = await item.read();
            if (!resource || !isSuperseded(resource, task)) return resource || current;
            current = resource;
        }
        if (!current._etag) throw new Error('ETag ausente na notificação lida.');
        try {
            // Patch only the read flag; never replace content or another recipient's partition.
            // Use the service's explicit conditional-Patch contract as well as
            // IfMatch; correctness does not depend on SDK/header support alone.
            const originCondition = legacyReviewerNotice(current, task.id)
                ? `NOT IS_DEFINED(c.taskStageVersion) AND NOT IS_DEFINED(c.type) AND c.message = ${JSON.stringify(current.message)} AND c.commentPreview = ${JSON.stringify(current.commentPreview)}`
                : `c.taskStageVersion = ${current.taskStageVersion}`;
            const condition = `from c where c._etag = ${JSON.stringify(current._etag)} AND c.taskId = ${JSON.stringify(task.id)} AND ${originCondition} AND c.isRead = false`;
            const { resource } = await item.patch({ condition, operations: [{ op: 'set', path: '/isRead', value: true }] }, {
                accessCondition: { type: 'IfMatch', condition: current._etag }
            });
            return resource || { ...current, isRead: true };
        } catch (error) {
            const code = Number(error.code || error.statusCode);
            if (code === 404) return current;
            if (code !== 412) throw error;
            const { resource } = await item.read();
            if (!resource) return current;
            current = resource;
        }
    }
    if (isSuperseded(current, task)) throw new Error('Conflito persistente ao marcar notificação; reconciliação será repetida.');
    return current;
}
function report(log, error) {
    log?.error?.(`Reconciliação de notificações pendente: ${error.message}`);
}
async function mapInBatches(items, callback) {
    const results = [];
    for (let offset = 0; offset < items.length; offset += 8) {
        results.push(...await Promise.all(items.slice(offset, offset + 8).map(callback)));
    }
    return results;
}
async function reconcileTaskNotifications(task, notifications, log) {
    const cutoff = readThrough(task);
    const includeLegacy = closesLegacyReview(task);
    if (cutoff < 0 && !includeLegacy) return;
    try {
        const { resources } = await notifications.items.query({
            query: 'SELECT * FROM c WHERE c.taskId = @taskId AND c.isRead = false AND ((IS_NUMBER(c.taskStageVersion) AND c.taskStageVersion >= 0 AND c.taskStageVersion <= @through) OR (@includeLegacy = true AND NOT IS_DEFINED(c.taskStageVersion) AND NOT IS_DEFINED(c.type) AND c.message = @reviewMessage))',
            parameters: [{ name: '@taskId', value: task.id }, { name: '@through', value: cutoff }, { name: '@includeLegacy', value: includeLegacy }, { name: '@reviewMessage', value: 'Homologação Pendente' }]
        }).fetchAll();
        await mapInBatches(resources, async notification => {
            try { await markSuperseded(notification, task, notifications); }
            catch (error) { report(log, error); }
        });
    } catch (error) { report(log, error); }
}
async function createStageNotification(notifications, tasks, sourceTask, notification, log) {
    const version = stageVersion(sourceTask);
    const value = { ...notification };
    delete value.taskStageVersion;
    if (version !== null) value.taskStageVersion = version;
    const { resource } = await notifications.items.create(value);
    // The task commit and Notifications partitions cannot share a transaction.
    // A post-create check closes the delayed-writer race; getNotifications retries
    // after partial failures or an eventually consistent task read.
    try {
        const { resource: latestTask } = await tasks.item(sourceTask.id, sourceTask.id).read();
        if (latestTask) return await markSuperseded(resource || value, latestTask, notifications);
    } catch (error) { report(log, error); }
    return resource || value;
}
async function reconcileUserNotifications(items, tasks, notifications, log) {
    const taskReads = new Map();
    return mapInBatches(items, async notification => {
        if (notification.isRead !== false || typeof notification.taskId !== 'string' ||
            (!safeStage(notification.taskStageVersion) && !legacyReviewerNotice(notification, notification.taskId))) return notification;
        try {
            if (!taskReads.has(notification.taskId)) {
                taskReads.set(notification.taskId, tasks.item(notification.taskId, notification.taskId).read());
            }
            const { resource: task } = await taskReads.get(notification.taskId);
            return task ? await markSuperseded(notification, task, notifications) : notification;
        } catch (error) {
            if (Number(error.code || error.statusCode) !== 404) report(log, error);
            return notification;
        }
    });
}
module.exports = { applyStageTransition, createStageNotification, reconcileTaskNotifications, reconcileUserNotifications };
