import type { Task, PersonRef } from '../types/api';
import { personEmail } from '../types/api';

/** Payload de criação de reunião enviado ao backend (POST /api/createMeeting). */
export interface MeetingPayload {
  taskId?: string;
  title: string;
  description?: string;
  attendees: string[];
  start: string; // ISO
  end: string; // ISO
  addMeet?: boolean;
}

/** Endpoint que inicia o consentimento OAuth do Google Agenda (abrir em popup). */
export const CALENDAR_CONNECT_URL = '/api/calendar/authorize';

// Janela padrão da reunião: próxima hora cheia, 30 min. O usuário ajusta depois.
function nextSlot(): { start: Date; end: Date } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return { start, end: new Date(start.getTime() + 30 * 60000) };
}

/**
 * Monta o payload da reunião a partir da tarefa: título, descrição + referência,
 * janela padrão e convidados = responsáveis + homologador + solicitante (sem
 * repetir o próprio usuário, se informado).
 */
export function buildMeetingPayload(task: Task, excludeEmail?: string): MeetingPayload {
  const { start, end } = nextSlot();
  const exclude = excludeEmail?.trim().toLowerCase() || '';
  const guests = new Set<string>();
  const refs: PersonRef[] = [
    ...(Array.isArray(task.responsible) ? task.responsible : []),
    ...(task.homologador ? [task.homologador] : []),
  ];
  for (const ref of refs) {
    const email = personEmail(ref).trim().toLowerCase();
    if (email && email !== exclude) guests.add(email);
  }
  const reqEmail = task.requester?.email?.trim().toLowerCase();
  if (reqEmail && reqEmail !== exclude) guests.add(reqEmail);

  const description = [task.description?.trim(), `Tarefa ${task.id} no SyncBOARD.`]
    .filter(Boolean)
    .join('\n\n');

  return {
    taskId: task.id,
    title: `Reunião: ${task.title}`,
    description,
    attendees: [...guests],
    start: start.toISOString(),
    end: end.toISOString(),
    addMeet: true,
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function gcalDate(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

/**
 * URL do compositor do Google Agenda pré-preenchido a partir do payload. Usado
 * como stand-in no modo mock (e como degradação graciosa, se preciso): abre a
 * tela de criação de evento do Google, sem criar nada automaticamente.
 */
export function googleCalendarUrl(p: MeetingPayload): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: p.title,
    dates: `${gcalDate(p.start)}/${gcalDate(p.end)}`,
  });
  if (p.description) params.set('details', p.description);
  if (p.attendees.length > 0) params.set('add', p.attendees.join(','));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
