import { useState } from 'react';
import { api } from '../lib/api';
import { useEscape } from '../lib/useEscape';
import { play } from '../lib/sound';

interface Props {
  original: string;
  onApply: (title: string) => void;
  onClose: () => void;
}

const CHIPS = ['Resumir', 'Mais profissional', 'Traduzir para inglês', 'Mais objetivo'];

export function AiTitleModal({ original, onApply, onClose }: Props) {
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscape(onClose);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { title } = await api.improveTitle(original.trim(), instruction.trim() || undefined);
      setResult(title);
      play('notify');
    } catch (e) {
      play('error');
      setError(e instanceof Error ? e.message : 'Falha ao gerar a sugestão.');
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (!result?.trim()) return;
    play('success');
    onApply(result.trim());
    onClose();
  };

  return (
    <div className="modal-overlay ai-overlay" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-title-heading" onClick={(e) => e.stopPropagation()}>
        <header className="ai-modal__head">
          <div className="sb-row">
            <span className="ai-modal__bot" aria-hidden="true">🤖</span>
            <h2 id="ai-title-heading">Revisar título com IA</h2>
          </div>
          <button type="button" className="modal__close ai-modal__close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <div className="ai-modal__body">
          <p className="sb-meta">Gere uma sugestão, revise o texto e escolha Aplicar. A tarefa só é enviada ao salvar o formulário.</p>

          <div className="field">
            <span className="sb-label">Título original</span>
            <p className="ai-modal__original">{original || '—'}</p>
          </div>

          <label className="field">
            <span className="sb-label">Como posso melhorar?</span>
            <textarea
              className="sb-textarea"
              rows={2}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Ex.: deixar mais formal, resumir, traduzir…"
            />
          </label>
          <div className="ai-modal__chips">
            {CHIPS.map((c) => (
              <button key={c} type="button" className="ai-chip" onClick={() => setInstruction(c)}>{c}</button>
            ))}
          </div>

          {result !== null && (
            <label className="field ai-modal__result">
              <span className="sb-label">Sugestão para revisão · ainda não aplicada</span>
              <textarea className="sb-textarea" rows={2} value={result} onChange={(e) => setResult(e.target.value)} />
            </label>
          )}
          {error && <p className="ai-modal__error">{error}</p>}
        </div>

        <footer className="ai-modal__foot">
          <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="sb-button ai-modal__gen" onClick={generate} disabled={generating}>
            ✨ {generating ? 'Gerando…' : result !== null ? 'Gerar de novo' : 'Gerar'}
          </button>
          {result !== null && (
            <button type="button" className="sb-button" onClick={apply} disabled={!result.trim()}>✓ Aplicar</button>
          )}
        </footer>
      </div>
    </div>
  );
}
