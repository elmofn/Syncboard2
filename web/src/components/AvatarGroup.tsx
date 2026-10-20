import type { Person } from '../types/api';
import { Avatar } from './Avatar';

/** Avatares sobrepostos para responsáveis simultâneos. */
export function AvatarGroup({ people, max = 3 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="avatar-group">
      {shown.map((p, i) => (
        <Avatar key={p.email || i} person={p} small />
      ))}
      {extra > 0 && <span className="avatar-group__more">+{extra}</span>}
    </span>
  );
}
