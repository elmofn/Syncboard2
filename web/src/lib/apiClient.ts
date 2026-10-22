import type { Task, User, Notification, CreateTaskPayload, ProjectCount, Attachment, UserInput } from '../types/api';
import type { MeetingPayload } from './calendar';

/** Patch genérico de tarefa; aceita os auxiliares de concorrência do contrato. */
export type TaskPatch = Partial<Task> & {
  expectedStatus?: string;
  expectedEtag?: string;
  [key: string]: unknown;
};

export interface CalendarStatus {
  connected: boolean;
}
export interface MeetingResult {
  htmlLink: string;
  hangoutLink?: string | null;
  id?: string;
}

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
  editComment(taskId: string, commentId: string, text: string, authorEmail: string): Promise<Task>;
  deleteComment(taskId: string, index: number): Promise<Task>;
  signalResponsible(taskId: string, targets: string[]): Promise<Task>;
  dismissAlert(taskId: string, expectedEtag?: string): Promise<Task>;
  improveTitle(currentTitle: string, userInstruction?: string): Promise<{ title: string }>;
  uploadAttachment(file: File): Promise<Attachment>;
  addUser(payload: UserInput): Promise<User>;
  updateUser(id: string, payload: UserInput): Promise<User>;
  deleteUser(id: string): Promise<void>;
  /** Google Agenda: situação da conexão do usuário atual. */
  calendarStatus(): Promise<CalendarStatus>;
  /** Google Agenda: cria o evento; rejeita com status 428 se não conectado. */
  createMeeting(payload: MeetingPayload): Promise<MeetingResult>;
}
