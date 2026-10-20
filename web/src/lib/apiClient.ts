import type { Task, User, Notification, CreateTaskPayload, ProjectCount, Attachment } from '../types/api';

/** Patch genérico de tarefa; aceita os auxiliares de concorrência do contrato. */
export type TaskPatch = Partial<Task> & {
  expectedStatus?: string;
  expectedEtag?: string;
  [key: string]: unknown;
};

export interface ApiClient {
  getTasks(): Promise<Task[]>;
  getArchivedTasks(): Promise<Task[]>;
  getUsers(): Promise<User[]>;
  getNotifications(): Promise<Notification[]>;
  getProjectTaskCounts(): Promise<ProjectCount[]>;
  createTask(payload: CreateTaskPayload): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  updateOrder(items: { id: string; order: number }[]): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  addComment(taskId: string, payload: { text: string; attachments?: Attachment[] }): Promise<Task>;
  signalResponsible(taskId: string, targets: string[]): Promise<Task>;
  improveTitle(currentTitle: string, userInstruction?: string): Promise<{ title: string }>;
  uploadAttachment(file: File): Promise<Attachment>;
}
