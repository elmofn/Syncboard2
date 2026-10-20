import { refreshProjectTaskCounts } from './project-task-counts.js';
import { state } from './state.js';
import { updateActiveView, renderTaskHistory, updateNotificationBadge } from './ui.js';
import { fetchTasks } from './api.js';

export function connectToSignalR(onTasksUpdatedCallback) {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl('/api')
        .build();

    connection.on('taskCreated', (newTask) => {
        refreshProjectTaskCounts();
        console.log('SignalR: Nova tarefa recebida!', newTask);
        state.tasks.push(newTask);
        updateActiveView();
        onTasksUpdatedCallback();
    });

    connection.on('taskUpdated', (updatedTask) => {
        refreshProjectTaskCounts();
        console.log('SignalR: Tarefa atualizada!', updatedTask);
        const index = state.tasks.findIndex(t => t.id === updatedTask.id);
        
        // TC495: delayed alert acknowledgements must not undo a committed stage change.
        const incomingStage = Number.isSafeInteger(updatedTask.notificationStageVersion) ? updatedTask.notificationStageVersion : 0;
        const currentStage = Number.isSafeInteger(state.tasks[index]?.notificationStageVersion) ? state.tasks[index].notificationStageVersion : 0;
        const newerSignalExists = (Array.isArray(state.tasks[index]?.pendingAlerts) ? state.tasks[index].pendingAlerts : []).some(current => {
            const currentTime = Date.parse(current?.timestamp) || 0;
            const incomingAlerts = (Array.isArray(updatedTask.pendingAlerts) ? updatedTask.pendingAlerts : []).filter(alert => (alert?.targetUser || alert) === (current?.targetUser || current));
            const incomingTimes = incomingAlerts.map(alert => Date.parse(alert?.timestamp) || 0);
            const receiptWouldRegress = current?.acknowledgedAt && incomingAlerts.some(alert => (alert?.timestamp || null) === (current?.timestamp || null) && !alert?.acknowledgedAt); // TC495: receipt is monotonic for one signal.
            return currentTime > Math.max(0, ...incomingTimes) || receiptWouldRegress;
        });
        if (index !== -1 && (incomingStage < currentStage || (incomingStage === currentStage && newerSignalExists))) return;

        if (index !== -1) {
            // Se a tarefa já está na lista local, apenas atualiza
            state.tasks[index] = updatedTask;
        } else {
            // Se a tarefa não estava na lista (ex: estava arquivada) e foi restaurada (status diferente de 'done')
            if (updatedTask.status !== 'done') {
                state.tasks.push(updatedTask);
            }
        }
        
        updateNotificationBadge();
        updateActiveView(); // Isso fará a tela atualizar instantaneamente
        
        if (typeof onTasksUpdatedCallback === 'function') {
            onTasksUpdatedCallback();
        }

        const historyModal = document.getElementById('taskHistoryModal');
        if (historyModal) {
            const isHistoryModalOpen = !historyModal.classList.contains('hidden');
            if (isHistoryModalOpen && updatedTask.id === state.lastInteractedTaskId) {
                renderTaskHistory(updatedTask.id);
            }
        }
    });

    connection.on('taskDeleted', (taskId) => {
        refreshProjectTaskCounts();
        console.log('SignalR: Excluindo tarefa com ID:', taskId);
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        updateActiveView();
        onTasksUpdatedCallback();
    });

    connection.on('tasksReordered', async () => {
        console.log('SignalR: Ordem das tarefas foi alterada, buscando a nova lista.');
        state.tasks = await fetchTasks();
        updateActiveView();
        onTasksUpdatedCallback();
    });

    // Reconcile persisted read state after an offline interval, too.
    window.addEventListener('focus', updateNotificationBadge);

    async function start() {
        try {
            await connection.start();
            refreshProjectTaskCounts();
            updateNotificationBadge();
            console.log("Conectado ao SignalR.");
        } catch (err) {
            console.log(err);
            setTimeout(start, 5000);
        }
    };

    connection.onclose(start);
    start();
}