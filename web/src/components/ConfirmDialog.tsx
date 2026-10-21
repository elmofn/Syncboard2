import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Question, Trash } from '@phosphor-icons/react';
import { useEscape } from '../lib/useEscape';
import { play } from '../lib/sound';

export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Realça o botão de confirmação como ação destrutiva. */
  danger?: boolean;
  /** Ícone exibido no topo. */
  icon?: ReactNode;
}

type Resolver = (ok: boolean) => void;
const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

/** Hook imperativo: `if (!(await confirm({...}))) return;` */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && <ConfirmDialog opts={opts} onCancel={() => settle(false)} onConfirm={() => { play('move'); settle(true); }} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ opts, onCancel, onConfirm }: { opts: ConfirmOptions; onCancel: () => void; onConfirm: () => void }) {
  useEscape(onCancel);
  return (
    <div className="modal-overlay confirm-overlay" onClick={onCancel}>
      <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" onClick={(e) => e.stopPropagation()}>
        <div className={`confirm__icon${opts.danger ? ' confirm__icon--danger' : ''}`} aria-hidden="true">
          {opts.icon ?? (opts.danger ? <Trash size={28} /> : <Question size={28} />)}
        </div>
        <h2 id="confirm-title" className="confirm__title">{opts.title ?? 'Tem certeza?'}</h2>
        <p className="confirm__message">{opts.message}</p>
        <div className="confirm__actions">
          <button type="button" className="sb-button sb-button--secondary" onClick={onCancel}>
            {opts.cancelLabel ?? 'Cancelar'}
          </button>
          <button type="button" className={`sb-button${opts.danger ? ' sb-button--danger' : ''}`} onClick={onConfirm} autoFocus>
            {opts.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
