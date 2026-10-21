import { useState } from 'react';
import type { PersonRef } from '../types/api';
import { personName } from '../types/api';
import { Megaphone } from '@phosphor-icons/react';
import { useEscape } from '../lib/useEscape';

interface Props {
  responsibles: PersonRef[];
  busy?: boolean;
  onConfirm: (targets: string[]) => void;
  onClose: () => void;
}

export function SignalModal({ responsibles, busy, onConfirm, onClose }: Props) {
  const names = responsibles.map(personName).filter(Boolean);
  // Por padrão, apenas o responsável principal (primeiro) vem marcado.
  const [targets, setTargets] = useState<string[]>(names.slice(0, 1));
  useEscape(onClose);

  const toggle = (name: string, on: boolean) =>
    setTargets((prev) => (on ? [...prev, name] : prev.filter((x) => x !== name)));

  return (
    <div className="modal-overlay signal-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="signal-modal" role="dialog" aria-modal="true" aria-labelledby="signal-title" onClick={(e) => e.stopPropagation()}>
        <div className="signal-modal__icon" aria-hidden="true"><Megaphone size={28} /></div>
        <h2 id="signal-title" className="signal-modal__title">Quem deseja sinalizar?</h2>
        <p className="signal-modal__help">Selecione os responsáveis que devem receber um alerta imediato na tela.</p>

        <div className="signal-modal__targets">
          {names.map((nm, i) => (
            <label key={nm} className="checkline signal-target">
              <input
                type="checkbox"
                checked={targets.includes(nm)}
                onChange={(e) => toggle(nm, e.target.checked)}
              />
              <span className="signal-target__name">{nm}</span>
              {i === 0 && <span className="signal-target__badge">Principal</span>}
            </label>
          ))}
        </div>

        <div className="signal-modal__actions">
          <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="sb-button" disabled={busy || targets.length === 0} onClick={() => onConfirm(targets)}>
            <Megaphone /> Sinalizar
          </button>
        </div>
      </div>
    </div>
  );
}
