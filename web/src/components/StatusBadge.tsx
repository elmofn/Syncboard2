import type { TaskStatus } from '../types/api';
import { STATUS_META } from '../lib/status';

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="sb-badge"
      data-status={status}
      style={{
        background: `var(--sb-status-${meta.colorVar}-bg)`,
        color: `var(--sb-status-${meta.colorVar}-fg)`,
      }}
    >
      <span aria-hidden="true">{meta.icon}</span> {meta.label}
    </span>
  );
}
