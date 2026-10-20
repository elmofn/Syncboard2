// Tipos do contrato da API (ver docs/API.md). Fonte da verdade do modelo de dados.

export type TaskStatus =
  | 'todo'
  | 'stopped'
  | 'inprogress'
  | 'homologation'
  | 'publication'
  | 'done';

export interface Person {
  email: string;
  name: string;
  picture?: string;
}

/** Campos de responsável/homologador podem ser objeto OU string legada. */
export type PersonRef = Person | string;

export interface Attachment {
  url: string;
  name: string;
  contentType: string;
}

export interface Comment {
  id: string;
  text: string; // HTML
  author: PersonRef;
  userId?: string;
  timestamp: string;
  editedAt?: string;
  attachments?: Attachment[];
}

export interface HistoryEntry {
  action: string;
  description: string; // contém HTML hoje (ver DESIGN-SYSTEM/Fase 3)
  timestamp: string;
}

export interface PendingAlert {
  targetUser: string;
  signaledBy: string;
  timestamp: string;
  acknowledgedAt?: string;
}

export interface Task {
  id: string;
  numericId?: number;
  title: string;
  description: string;
  responsible: PersonRef[];
  homologador?: PersonRef | null;
  status: TaskStatus;
  priority: string;
  progress?: number; // 0–100 (barra "Progresso")
  project: string;
  projectColor: string;
  azureLink?: string;
  dueDate?: string | null;
  order: number;
  attachments?: Attachment[];
  comments?: Comment[];
  pendingAlerts?: PendingAlert[];
  history?: HistoryEntry[];
  continuityInstructions?: string;
  createdBy?: string;
  createdAt?: string;
  notificationStageVersion?: number;
  notificationsReadThroughStage?: number;
  _etag?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  displayName?: string;
  role?: string;
  picture?: string;
  isAdmin?: boolean;
  isAiAgent?: boolean;
}

export interface Notification {
  id: string;
  targetUserEmail: string;
  type?: string;
  taskId: string;
  taskTitle?: string;
  message: string;
  commentPreview?: string;
  isRead: boolean;
  createdAt: string;
}

export interface ProjectCount {
  project: string;
  active: number;
  total: number;
}

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string; // e-mail
  userRoles: string[];
  claims?: { typ: string; val: string }[];
}

/** Payload de criação (ver POST /api/createTask). */
export interface CreateTaskPayload {
  title: string;
  description: string;
  responsible: PersonRef[];
  homologador?: PersonRef | null;
  azureLink?: string;
  project?: string;
  projectColor?: string;
  priority?: string;
  dueDate?: string | null;
  attachments?: Attachment[];
}

// --- Helpers de normalização (responsible/homologador dupla-forma) ---
export function personEmail(ref: PersonRef | null | undefined): string {
  if (!ref) return '';
  return (typeof ref === 'object' ? ref.email : ref) ?? '';
}
export function personName(ref: PersonRef | null | undefined): string {
  if (!ref) return '';
  return typeof ref === 'object' ? ref.name || ref.email : ref;
}
