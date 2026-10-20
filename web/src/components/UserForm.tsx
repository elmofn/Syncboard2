import { useState } from 'react';
import type { User } from '../types/api';
import { api } from '../lib/api';

interface Props {
  mode: 'create' | 'edit';
  user?: User;
  onClose: () => void;
  onSaved: () => void;
  notify: (msg: string) => void;
}

export function UserForm({ mode, user, onClose, onSaved, notify }: Props) {
  const isEdit = mode === 'edit';
  const [email, setEmail] = useState(user?.email ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? user?.name ?? '');
  const [role, setRole] = useState(user?.role ?? '');
  const [isAdmin, setIsAdmin] = useState(user?.isAdmin === true);
  const [isAiAgent, setIsAiAgent] = useState(user?.isAiAgent === true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!email.trim() || !displayName.trim()) {
      notify('E-mail e nome são obrigatórios.');
      return;
    }
    setSaving(true);
    try {
      const payload = { email: email.trim(), displayName: displayName.trim(), role, isAdmin, isAiAgent };
      if (isEdit && user) await api.updateUser(user.id, payload);
      else await api.addUser(payload);
      onSaved();
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Falha ao salvar o utilizador.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--sm" role="dialog" aria-modal="true" aria-label={isEdit ? 'Editar usuário' : 'Novo usuário'} onClick={(e) => e.stopPropagation()}>
        <header className="modal__head">
          <span className="modal__chip modal__chip--active">{isEdit ? 'EDITAR USUÁRIO' : 'NOVO USUÁRIO'}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="modal__single form">
          <label className="field">
            <span className="sb-label">E-mail <small className="sb-meta">(obrigatório)</small></span>
            <input className="sb-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@empresa.com" />
          </label>
          <label className="field">
            <span className="sb-label">Nome <small className="sb-meta">(obrigatório)</small></span>
            <input className="sb-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nome exibido" />
          </label>
          <label className="field">
            <span className="sb-label">Cargo / função</span>
            <input className="sb-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex.: Dev, QA, PM" />
          </label>
          <label className="checkline">
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> Administrador
          </label>
          <label className="checkline">
            <input type="checkbox" checked={isAiAgent} onChange={(e) => setIsAiAgent(e.target.checked)} /> Agente IA
          </label>
        </div>
        <footer className="modal__foot">
          <span className="sb-meta">As alterações só são enviadas ao salvar.</span>
          <div className="sb-row">
            <button type="button" className="sb-button sb-button--secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="sb-button" onClick={save} disabled={saving}>💾 {saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
