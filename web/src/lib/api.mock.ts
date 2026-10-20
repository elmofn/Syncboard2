import type { ApiClient, TaskPatch } from './apiClient';
import type { Task, CreateTaskPayload } from '../types/api';
import { store } from './mock/store';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const newEtag = () => `"m${Math.random().toString(36).slice(2, 8)}"`;

// Campos que o servidor nunca aceita do cliente (ver docs/API.md §3).
const SERVER_OWNED = new Set([
  'id', 'history', '_etag', '_rid', '_self', '_ts', '_attachments',
  'createdBy', 'createdAt', 'requester', 'assignmentHistory', 'comments',
  'actor', 'expectedStatus', 'expectedEtag', 'newResponsibleEmail',
  'forwardInstructions', 'continuityInstructions', 'pendingAlerts',
  'notificationStageVersion', 'notificationsReadThroughStage',
]);

export const mockApi: ApiClient = {
  async getTasks() {
    await delay();
    return clone(store.tasks.filter((t) => t.status !== 'done'));
  },

  async getArchivedTasks() {
    await delay();
    return clone(store.tasks.filter((t) => t.status === 'done'));
  },

  async getUsers() {
    await delay();
    return clone(store.users);
  },

  async getNotifications() {
    await delay();
    return clone(store.notifications);
  },

  async getProjectTaskCounts() {
    await delay();
    const map = new Map<string, { project: string; active: number; total: number }>();
    for (const t of store.tasks) {
      if (!t.project) continue;
      const e = map.get(t.project) ?? { project: t.project, active: 0, total: 0 };
      e.total += 1;
      if (t.status !== 'done') e.active += 1;
      map.set(t.project, e);
    }
    return [...map.values()];
  },

  async createTask(payload: CreateTaskPayload) {
    await delay();
    const numericId = Math.max(0, ...store.tasks.map((t) => t.numericId ?? 0)) + 1;
    const task: Task = {
      id: `TC-${String(numericId).padStart(3, '0')}`,
      numericId,
      title: payload.title,
      description: payload.description,
      responsible: payload.responsible,
      homologador: payload.homologador ?? null,
      status: 'todo',
      priority: payload.priority || 'Média',
      project: payload.project || '',
      projectColor: payload.projectColor || '#526D82',
      azureLink: payload.azureLink || '',
      dueDate: payload.dueDate ?? null,
      order: -Date.now(),
      attachments: payload.attachments || [],
      comments: [],
      history: [{ action: 'created', description: 'Tarefa criada (mock).', timestamp: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      createdBy: 'Mock',
      _etag: newEtag(),
    };
    store.tasks.push(task);
    store.emit('taskCreated', clone(task));
    return clone(task);
  },

  async updateTask(id: string, patch: TaskPatch) {
    await delay();
    const task = store.tasks.find((t) => t.id === id);
    if (!task) throw new Error('Tarefa não encontrada.');
    for (const [key, value] of Object.entries(patch)) {
      if (SERVER_OWNED.has(key)) continue;
      (task as unknown as Record<string, unknown>)[key] = value;
    }
    task._etag = newEtag();
    store.emit('taskUpdated', clone(task));
    return clone(task);
  },

  async deleteTask(id: string) {
    await delay();
    store.tasks = store.tasks.filter((t) => t.id !== id);
    store.emit('taskDeleted', id);
  },

  async updateOrder(items) {
    await delay();
    for (const { id, order } of items) {
      const task = store.tasks.find((t) => t.id === id);
      if (task) task.order = order;
    }
    store.emit('tasksReordered');
  },

  async markNotificationRead(id: string) {
    await delay();
    const n = store.notifications.find((x) => x.id === id);
    if (n) n.isRead = true;
  },
};
