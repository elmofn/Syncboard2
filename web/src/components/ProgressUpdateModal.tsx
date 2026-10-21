import { useState } from 'react';
import type { Task } from '../types/api';
import { api } from '../lib/api';
import { ChartBar } from '@phosphor-icons/react';
import { useEscape } from '../lib/useEscape';
import { play } from '../lib/sound';

interface Props {
  task: Task;
  onClose: () => void;
  notify: (msg: string) => void;
}

/** Atualiza o % de progresso informado e a pendência ("o que falta para 100%"). */
export function ProgressUpdateModal({ task, onClose, notify }: Props) {
  const [progress, setProgress] = useState<number>(Math.round(task.progress ?? 0));
  const [missing, setMissing] = useState<string>(task.missingToComplete ?? '');
  const [busy, setBusy] = useState(false);
  useEscape(onClose);

  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  const complete = progress === 100;

  const save = async () => {
    if (!complete && !missing.trim()) {
      play('error');
      notify('Informe o que falta para completar a tarefa.');
      return;
    }
    setBusy(true);
    try {
      await api.updateTask(task.id, { progress, missingToComplete: complete ? '' : missing.trim() });
      play('success');
      onClose();
    } catch (e) {
      play('error');
      notify(e instanceof Error ? e.message : 'Erro ao atualizar o progresso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay homolog-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="homolog-modal progress-modal" role="dialog" aria-modal="true" aria-labelledby="progress-title" onClick={(e) => e.stopPropagation()}>
        <div className="homolog-modal__icon" aria-hidden="true"><ChartBar size={28} /></div>
        <h2 id="progress-title" className="homolog-modal__title">Atualizar progresso</h2>
        <p className="homolog-modal__help">100% representa o progresso informado. A aprovação e a publicação são etapas separadas.</p>

        <label className="field homolog-modal__field">
          <span className="sb-label">Porcentagem (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            value={progress}
            className="sb-input progress-modal__pct"
            onChange={(e) => setProgress(clamp(parseInt(e.target.value, 10)))}
            autoFocus
          />
        </label>

        <label className="field homolog-modal__field" style={{ opacity: complete ? 0.5 : 1 }}>
          <span className="sb-label">O que falta para 100%?</span>
          <textarea
            className="sb-textarea"
            rows={2}
            placeholder="Ex: Falta integrar a API de pagamentos…"
            value={complete ? '' : missing}
            disabled={complete}
            onChange={(e) => setMissing(e.target.value)}
          />
          <span className="sb-meta">Informe a pendência quando o progresso for menor que 100%.</span>
        </label>

        <div className="homolog-modal__actions">
          <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="sb-button homolog-modal__confirm" disabled={busy} onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
