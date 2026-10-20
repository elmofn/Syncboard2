export function ProgressBar({ value, label, labelText }: { value: number; label?: boolean; labelText?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress">
      {label && (
        <div className="progress__head sb-meta">
          <span>{labelText ?? 'Progresso'}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="progress__track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
