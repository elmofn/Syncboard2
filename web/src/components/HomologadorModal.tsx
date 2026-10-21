import { useState } from 'react';
import type { User, PersonRef } from '../types/api';
import { personEmail } from '../types/api';
import { useEscape } from '../lib/useEscape';
import { play } from '../lib/sound';

interface Props {
  users: User[];
  current?: PersonRef | null;
  busy?: boolean;
  onConfirm: (person: { email: string; name: string }) => void;
  onClose: () => void;
}

export function HomologadorModal({ users, current, busy, onConfirm, onClose }: Props) {
  const options = users.filter((u) => u.email);
  const [email, setEmail] = useState(personEmail(current));
  useEscape(onClose);

  const confirm = () => {
    const u = options.find((o) => o.email === email);
    if (!u) return;
    play('send');
    onConfirm({ email: u.email, name: u.name });
  };

  return (
    <div className="modal-overlay homolog-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="homolog-modal" role="dialog" aria-modal="true" aria-labelledby="homolog-title" onClick={(e) => e.stopPropagation()}>
        <div className="homolog-modal__icon" aria-hidden="true">🛡️</div>
        <h2 id="homolog-title" className="homolog-modal__title">Quem vai homologar?</h2>
        <p className="homolog-modal__help">Selecione o responsável por validar esta tarefa antes da publicação.</p>

        <label className="field homolog-modal__field">
          <span className="sb-label">Pessoa responsável pela homologação</span>
          <select className="sb-select" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus>
            <option value="">Selecionar…</option>
            {options.map((u) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>
        </label>

        <div className="homolog-modal__actions">
          <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="sb-button homolog-modal__confirm" disabled={busy || !email} onClick={confirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
