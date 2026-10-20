import type { ApiClient, TaskPatch } from './apiClient';
import type { Task, CreateTaskPayload, Attachment, HistoryEntry, UserInput, User } from '../types/api';
import { store } from './mock/store';
import { mockCurrentPrincipal } from './mock/fixtures';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const newEtag = () => `"m${Math.random().toString(36).slice(2, 8)}"`;
const uid = () => Math.random().toString(36).slice(2, 10);
const actorName = () =>
  mockCurrentPrincipal.claims?.find((c) => c.typ === 'name')?.val || mockCurrentPrincipal.userDetails;

const STATUS_LABEL: Record<string, string> = {
  todo: 'Fila', stopped: 'Parado', inprogress: 'Andamento',
  homologation: 'Homologação', publication: 'Publicação', done: 'Concluída',
};
function pushHistory(task: Task, action: string, description: string) {
  const entry: HistoryEntry = { action, description, timestamp: new Date().toISOString() };
  task.history = [...(Array.isArray(task.history) ? task.history : []), entry];
}

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
    const oldStatus = task.status;

    const action = patch.homologationAction as string | undefined;
    if (action === 'approve') {
      task.status = 'publication';
      task.progress = 100;
      pushHistory(task, 'edited', `Homologação aprovada por <b>${actorName()}</b>`);
    } else if (action === 'reject') {
      task.status = 'inprogress';
      task.homologador = null;
      pushHistory(task, 'edited', `Homologação reprovada por <b>${actorName()}</b>`);
    } else if (action === 'forward') {
      task.status = 'inprogress';
      task.homologador = null;
      task.continuityInstructions =
        typeof patch.forwardInstructions === 'string' ? patch.forwardInstructions : '';
      const email = String(patch.newResponsibleEmail || '').toLowerCase();
      const prof = store.users.find((u) => u.email.toLowerCase() === email);
      if (prof) task.responsible = [{ email: prof.email, name: prof.name }];
      pushHistory(
        task,
        'edited',
        `Homologação encaminhada por <b>${actorName()}</b><br>Orientação de continuidade: ${task.continuityInstructions}`,
      );
    } else {
      for (const [key, value] of Object.entries(patch)) {
        if (SERVER_OWNED.has(key)) continue;
        (task as unknown as Record<string, unknown>)[key] = value;
      }
    }

    if (task.status !== oldStatus) {
      pushHistory(task, 'edited', `Status alterado para <b>${STATUS_LABEL[task.status] || task.status}</b>`);
      task.pendingAlerts = [];
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

  async addComment(taskId: string, payload: { text: string; attachments?: Attachment[] }) {
    await delay();
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Tarefa não encontrada.');
    const comment = {
      id: uid(),
      text: payload.text,
      author: { email: mockCurrentPrincipal.userDetails, name: actorName() },
      userId: mockCurrentPrincipal.userId,
      timestamp: new Date().toISOString(),
      ...(payload.attachments && payload.attachments.length ? { attachments: payload.attachments } : {}),
    };
    task.comments = [...(Array.isArray(task.comments) ? task.comments : []), comment];
    task._etag = newEtag();
    store.emit('taskUpdated', clone(task));
    return clone(task);
  },

  async signalResponsible(taskId: string, targets: string[]) {
    await delay();
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Tarefa não encontrada.');
    const ts = new Date().toISOString();
    const keep = (Array.isArray(task.pendingAlerts) ? task.pendingAlerts : []).filter(
      (a) => !targets.includes(a.targetUser),
    );
    task.pendingAlerts = [...keep, ...targets.map((t) => ({ targetUser: t, signaledBy: actorName(), timestamp: ts }))];
    pushHistory(task, 'attention_requested', `Atenção solicitada por ${actorName()} para ${targets.join(', ')}.`);
    task._etag = newEtag();
    store.emit('taskUpdated', clone(task));
    return clone(task);
  },

  async editComment(taskId: string, commentId: string, text: string, authorEmail: string) {
    await delay();
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Tarefa não encontrada.');
    const comment = (Array.isArray(task.comments) ? task.comments : []).find((c) => c.id === commentId);
    if (!comment) throw new Error('Comentário não encontrado.');
    const authorName = typeof comment.author === 'object' ? comment.author.name : comment.author;
    const authorMail = typeof comment.author === 'object' ? comment.author.email : '';
    const a = authorEmail.toLowerCase();
    if (![authorMail, authorName].filter(Boolean).map((v) => v!.toLowerCase()).includes(a)) {
      throw new Error('Sem permissão para editar este comentário.');
    }
    comment.text = text;
    comment.editedAt = new Date().toISOString();
    task._etag = newEtag();
    store.emit('taskUpdated', clone(task));
    return clone(task);
  },

  async deleteComment(taskId: string, index: number) {
    await delay();
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Tarefa não encontrada.');
    if (!Array.isArray(task.comments) || !task.comments[index]) throw new Error('Comentário não encontrado.');
    task.comments.splice(index, 1);
    task._etag = newEtag();
    store.emit('taskUpdated', clone(task));
    return clone(task);
  },

  async dismissAlert(taskId: string) {
    await delay();
    const task = store.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error('Tarefa não encontrada.');
    const me = mockCurrentPrincipal.userDetails.toLowerCase();
    const myName = actorName();
    const at = new Date().toISOString();
    task.pendingAlerts = (Array.isArray(task.pendingAlerts) ? task.pendingAlerts : []).map((alert) =>
      (alert.targetUser === myName || alert.targetUser.toLowerCase() === me) && !alert.acknowledgedAt
        ? { ...alert, acknowledgedAt: at }
        : alert,
    );
    task._etag = newEtag();
    store.emit('taskUpdated', clone(task));
    return clone(task);
  },

  async improveTitle(currentTitle: string) {
    await delay(300);
    const clean = currentTitle.trim().replace(/\s+/g, ' ');
    return { title: clean ? `${clean[0].toUpperCase()}${clean.slice(1)} — versão clara (mock)` : clean };
  },

  async uploadAttachment(file: File) {
    await delay(200);
    return {
      url: `https://mock.local/${encodeURIComponent(file.name)}`,
      name: file.name,
      contentType: file.type || 'application/octet-stream',
    };
  },

  async addUser(payload: UserInput) {
    await delay();
    const email = payload.email.trim().toLowerCase();
    if (store.users.some((u) => u.email.toLowerCase() === email)) throw new Error('Este utilizador já existe.');
    const user: User = {
      id: email,
      email,
      name: payload.displayName,
      displayName: payload.displayName,
      role: payload.role || '',
      picture: '',
      isAdmin: payload.isAdmin === true,
      isAiAgent: payload.isAiAgent === true,
    };
    store.users.push(user);
    return clone(user);
  },

  async updateUser(id: string, payload: UserInput) {
    await delay();
    const user = store.users.find((u) => u.id === id || u.email === id);
    if (!user) throw new Error('Utilizador não encontrado.');
    const newEmail = payload.email.trim().toLowerCase();
    user.id = newEmail;
    user.email = newEmail;
    user.displayName = payload.displayName;
    user.role = payload.role || '';
    user.isAdmin = payload.isAdmin === true;
    user.isAiAgent = payload.isAiAgent === true;
    return clone(user);
  },

  async deleteUser(id: string) {
    await delay();
    store.users = store.users.filter((u) => u.id !== id && u.email !== id);
  },
};
