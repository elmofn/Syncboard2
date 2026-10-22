import type { Task, PersonRef } from '../types/api';
import { personEmail } from '../types/api';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formata uma data em UTC no padrão do Google Agenda: YYYYMMDDTHHMMSSZ. */
function gcalDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

/**
 * Monta a URL do Google Agenda para criar um evento já preenchido a partir da
 * tarefa. Não cria o evento: abre o compositor do Google (nova aba) para o
 * usuário ajustar data/hora e confirmar. Convidados = responsáveis +
 * homologador + solicitante (sem repetir o próprio usuário, se informado).
 */
export function googleCalendarUrl(task: Task, excludeEmail?: string): string {
  // Janela padrão: próxima hora cheia, 30 min. O usuário ajusta no Google.
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 30 * 60000);

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

  const details = [task.description?.trim(), `Tarefa ${task.id} no SyncBOARD.`]
    .filter(Boolean)
    .join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Reunião: ${task.title}`,
    dates: `${gcalDate(start)}/${gcalDate(end)}`,
    details,
  });
  if (guests.size > 0) params.set('add', [...guests].join(','));

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
