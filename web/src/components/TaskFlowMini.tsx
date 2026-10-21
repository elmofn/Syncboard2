import { ArrowRight } from '@phosphor-icons/react';
import type { Task } from '../types/api';
import { buildTaskFlow } from '../lib/flow';
import { usePersonResolver } from '../lib/people';
import { Avatar } from './Avatar';
import { AvatarGroup } from './AvatarGroup';

const MAX_STEPS = 2;

/** Fluxo compacto do card: solicitante … responsável → (grupo) responsável atual. */
export function TaskFlowMini({ task }: { task: Task }) {
  const flow = buildTaskFlow(task);
  const resolve = usePersonResolver();
  const truncated = flow.partial || flow.steps.length > MAX_STEPS;
  const shown = flow.steps.slice(-MAX_STEPS);

  return (
    <div className="flowmini" aria-label="Fluxo de responsáveis">
      {flow.requester ? (
        <Avatar person={resolve(flow.requester)} small />
      ) : (
        <span className="flowmini__unknown" title="Solicitante não registrado">?</span>
      )}
      {truncated && <span className="flowmini__sep" aria-hidden="true">…</span>}
      {shown.map((step, i) => (
        <span key={i} className="flowmini__step">
          {i > 0 && <ArrowRight className="flowmini__arrow" aria-hidden="true" />}
          <AvatarGroup people={step.people.map(resolve)} />
        </span>
      ))}
    </div>
  );
}
