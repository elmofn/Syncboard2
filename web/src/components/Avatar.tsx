import type { PersonRef } from '../types/api';
import { personName } from '../types/api';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ person, small }: { person: PersonRef; small?: boolean }) {
  const name = personName(person);
  const picture = typeof person === 'object' ? person.picture : undefined;
  return (
    <span className={small ? 'sb-avatar sb-avatar--sm' : 'sb-avatar'} title={name} role="img" aria-label={name}>
      {picture ? <img src={picture} alt="" /> : initials(name)}
    </span>
  );
}
