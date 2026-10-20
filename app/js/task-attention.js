/* TC495: recipient badge follows pendingAlerts, including received alerts.
 * Popup acknowledgement keeps the entry; a committed status transition clears it.
 * Identity matching remains shared with checkAndQueueAlerts; no history inference.
 */
const lower = value => typeof value === 'string' ? value.toLowerCase() : '';
export function hasPendingTaskAttention(task, currentUser, users = []) {
    if (!currentUser || !Array.isArray(task?.pendingAlerts)) return false;
    const identifiers = [
        lower(currentUser.userDetails),
        lower(currentUser.userId),
        lower(currentUser.claims?.find(claim => claim.typ === 'name')?.val)
    ].filter(Boolean);
    const dbUser = users.find(user => identifiers.includes(lower(user.email)));
    if (dbUser?.name) identifiers.push(lower(dbUser.name));
    return task.pendingAlerts.some(alert => {
        const target = lower(alert && typeof alert === 'object' ? alert.targetUser : alert);
        return Boolean(target) && identifiers.includes(target);
    });
}

export function renderTaskAttentionBadge(task, currentUser, users = []) {
    if (!hasPendingTaskAttention(task, currentUser, users)) return '';
    return '<span class="sb-task-attention-badge"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m3 11 18-5v12L3 14v-3Z"/><path d="M7 15v5h4l-1-4M21 10l2-1M21 14l2 1"/></svg><span>Atenção solicitada</span></span>';
}
