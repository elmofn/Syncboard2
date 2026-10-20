interface Props {
  title: string;
  subtitle: string;
  onNewTask?: () => void;
}

export function WorkHeader({ title, subtitle, onNewTask }: Props) {
  return (
    <header className="work-header">
      <div>
        <p className="work-header__eyebrow">SYNCBOARD</p>
        <h1>{title}</h1>
        <p className="work-header__subtitle sb-meta">{subtitle}</p>
      </div>
      {onNewTask && (
        <button type="button" className="sb-button" onClick={onNewTask}>
          + Nova Tarefa
        </button>
      )}
    </header>
  );
}
