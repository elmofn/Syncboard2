import { useEscape } from '../lib/useEscape';

export interface IncomingAlert {
  key: string;
  taskId: string;
  taskTitle: string;
  signaledBy: string;
  etag?: string;
}

interface Props {
  alert: IncomingAlert;
  queueCount: number;
  busy?: boolean;
  onAck: () => void;
  onSkip: () => void;
}

export function AlertModal({ alert, queueCount, busy, onAck, onSkip }: Props) {
  useEscape(onSkip);
  return (
    <div className="modal-overlay alert-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="alert-title">
        <div className="alert-modal__icon" aria-hidden="true">📣</div>
        <h2 id="alert-title" className="alert-modal__title">Atenção Solicitada</h2>
        <p className="alert-modal__help">
          <strong>{alert.signaledBy || 'Alguém'}</strong> solicitou sua atenção na tarefa abaixo:
        </p>

        <div className="alert-modal__task">
          <p className="sb-meta">Tarefa {alert.taskId}</p>
          <h3>{alert.taskTitle}</h3>
        </div>

        <button type="button" className="sb-button alert-modal__ack" disabled={busy} onClick={onAck}>
          ✓ Recebido, vou olhar!
        </button>
        <button type="button" className="sb-button sb-button--secondary alert-modal__skip" disabled={busy} onClick={onSkip}>
          Agora não
        </button>

        <p className="sb-meta alert-modal__hint">Ao confirmar, a tarefa será aberta para você consultar.</p>
        {queueCount > 0 && (
          <p className="sb-meta alert-modal__queue">Outros alertas na fila: {queueCount}</p>
        )}
      </div>
    </div>
  );
}
