import { useState } from 'react';
import type { User } from '../types/api';
import { api } from '../lib/api';
import { play } from '../lib/sound';
import { Avatar } from './Avatar';
import { UserForm } from './UserForm';

interface Props {
  users: User[];
  canManage: boolean;
  currentEmail: string;
  onChanged: () => void;
  notify: (msg: string) => void;
}

export function PeopleView({ users, canManage, currentEmail, onChanged, notify }: Props) {
  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; user: User } | null>(null);
  const real = users.filter((u) => u.email); // remove o sentinela "DEFINIR"

  const remove = async (u: User) => {
    if (u.email.toLowerCase() === currentEmail.toLowerCase()) {
      notify('Você não pode excluir a própria conta.');
      return;
    }
    if (!window.confirm(`Excluir o usuário ${u.displayName || u.name}?`)) return;
    try {
      await api.deleteUser(u.id);
      play('move');
      onChanged();
    } catch (e) {
      play('error');
      notify(e instanceof Error ? e.message : 'Falha ao excluir o usuário.');
    }
  };

  return (
    <div className="people">
      {canManage && (
        <div className="people__toolbar">
          <button type="button" className="sb-button" onClick={() => setForm({ mode: 'create' })}>+ Novo usuário</button>
        </div>
      )}

      <div className="list">
        <div className="list__head people__row sb-meta">
          <span>Pessoa</span>
          <span>Cargo</span>
          <span>Perfil</span>
          {canManage && <span>Ações</span>}
        </div>
        {real.map((u) => (
          <div key={u.id} className="list__row people__row">
            <span className="people__person">
              <Avatar person={{ email: u.email, name: u.displayName || u.name, picture: u.picture }} small />
              <span className="people__id">
                <strong>{u.displayName || u.name}</strong>
                <small className="sb-meta">{u.email}</small>
              </span>
            </span>
            <span className="sb-meta">{u.role || '—'}</span>
            <span className="people__badges">
              {u.isAdmin && <span className="tag tag--admin">Admin</span>}
              {u.isAiAgent && <span className="tag tag--ai">Agente IA</span>}
              {!u.isAdmin && !u.isAiAgent && <span className="sb-meta">Membro</span>}
            </span>
            {canManage && (
              <span className="people__actions">
                <button type="button" className="sb-button sb-button--secondary" onClick={() => setForm({ mode: 'edit', user: u })}>Editar</button>
                <button type="button" className="sb-button sb-button--secondary action-danger" onClick={() => remove(u)}>Excluir</button>
              </span>
            )}
          </div>
        ))}
        {real.length === 0 && <p className="list-empty sb-meta">Nenhum usuário cadastrado.</p>}
      </div>

      {form && (
        <UserForm
          mode={form.mode}
          user={form.mode === 'edit' ? form.user : undefined}
          onClose={() => setForm(null)}
          onSaved={onChanged}
          notify={notify}
        />
      )}
    </div>
  );
}
