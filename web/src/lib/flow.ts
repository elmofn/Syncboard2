import type { Task, Person, PersonRef } from '../types/api';

export interface FlowStep {
  people: Person[];
  at?: string;
  /** passo anterior ao início do histórico registrado (sem carimbo). */
  pre?: boolean;
}

export interface TaskFlow {
  requester: Person | null; // null => "Não registrado"
  partial: boolean; // mostra "Histórico parcial: trocas anteriores não registradas"
  steps: FlowStep[]; // cadeia de responsáveis; último passo = responsável atual
  homologador: Person | null; // null => "Não informado"
}

function toPersons(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((r) => (typeof r === 'object' && r ? { email: (r as Person).email, name: (r as Person).name } : { email: '', name: String(r) }))
    .filter((p) => p.name || p.email);
}

function toPerson(ref: PersonRef | null | undefined): Person | null {
  if (!ref) return null;
  return typeof ref === 'object' ? { email: ref.email, name: ref.name } : { email: '', name: ref };
}

interface AssignmentEntry {
  at?: string;
  from?: unknown;
  to?: unknown;
}

/**
 * Deriva o fluxo da tarefa: solicitante, cadeia de responsáveis (via
 * assignmentHistory) e homologador. Cada passo pode ter 1+ responsáveis
 * (quando há responsáveis simultâneos, aparecem agrupados).
 */
export function buildTaskFlow(task: Task): TaskFlow {
  const requester = task.requester ? { email: task.requester.email, name: task.requester.name } : null;
  const homologador = toPerson(task.homologador);
  const ah = (Array.isArray(task.assignmentHistory) ? task.assignmentHistory : []) as AssignmentEntry[];

  const steps: FlowStep[] = [];
  let partial = false;

  if (ah.length) {
    const firstFrom = toPersons(ah[0]?.from);
    if (firstFrom.length) {
      // Havia responsável antes do primeiro registro -> trocas anteriores não rastreadas.
      partial = true;
      steps.push({ people: firstFrom, pre: true });
    }
    for (const h of ah) {
      const people = toPersons(h?.to);
      if (people.length) steps.push({ people, at: h?.at });
    }
  }

  // Sem histórico (ou vazio): usa o responsável atual como passo único.
  if (steps.length === 0) {
    steps.push({ people: toPersons(task.responsible), at: task.createdAt });
  }

  return { requester, partial, steps, homologador };
}
