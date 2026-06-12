/**
 * AdminPage.tsx — Administração de usuários (Sprint 18)
 */

import React, { useEffect, useState } from 'react';
import {
  listAdminUsers,
  createAdminUser,
  deleteAdminUser,
  resetAdminPassword,
  getSessionInfo,
  type AppUser,
} from '../api/settings.api';

function rolePill(role: string): string {
  if (role?.toLowerCase() === 'admin')    return 'pill pill-bad';
  if (role?.toLowerCase() === 'operator') return 'pill pill-info';
  return 'pill';
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

// ─── Modal genérico

interface ModalProps { title: string; onClose: () => void; children: React.ReactNode; }

function Modal({ title, onClose, children }: ModalProps): React.ReactElement {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 440, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)', borderRadius: 'var(--r-md) var(--r-md) 0 0' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title}</span>
          <button style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--faint)', fontFamily: 'inherit', padding: '0 4px' }} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Formulário — Novo Usuário

function CreateUserForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }): React.ReactElement {
  const [username,    setUsername]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password,    setPassword]    = useState('');
  const [role,        setRole]        = useState('admin');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleCreate = async () => {
    if (!username.trim() || !password) return;
    setSaving(true); setError(null);
    try {
      const res = await createAdminUser({ username: username.trim().toLowerCase(), password, displayName: displayName.trim() || username.trim(), role });
      if (res.ok) { onCreated(); onClose(); }
      else setError(res.error ?? 'Erro ao criar usuário.');
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <div className="alert-bad" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field"><label className="field-label">Username *</label>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} placeholder="mínimo 3 caracteres" autoFocus /></div>
        <div className="field"><label className="field-label">Nome de Exibição</label>
          <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nome completo" /></div>
        <div className="field"><label className="field-label">Senha *</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="Mínimo 8 caracteres…" /></div>
        <div className="field"><label className="field-label">Papel</label>
          <select className="select" value={role} onChange={e => setRole(e.target.value)}>
            <option value="admin">Administrador</option>
            <option value="operator">Operador</option>
          </select></div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving || !username.trim() || !password}>
          {saving ? '…' : 'Criar Usuário'}
        </button>
      </div>
    </>
  );
}

// ─── Formulário — Resetar Senha

function ResetPasswordForm({ username, onReset, onClose }: { username: string; onReset: () => void; onClose: () => void }): React.ReactElement {
  const [newPw,  setNewPw]  = useState('');
  const [email,  setEmail]  = useState('');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleReset = async () => {
    if (!newPw) return;
    setSaving(true); setError(null);
    try {
      const res = await resetAdminPassword({ username, newPassword: newPw, email: email || undefined });
      if (res.ok) { onReset(); onClose(); }
      else setError(res.error ?? 'Erro ao redefinir senha.');
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <div className="alert-bad" style={{ marginBottom: 12 }}>{error}</div>}
      <p style={{ margin: '0 0 12px', fontSize: 13 }}>Redefinir senha de <strong>{username}</strong>:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field"><label className="field-label">Nova Senha *</label>
          <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus autoComplete="new-password" placeholder="Mínimo 8 caracteres…" /></div>
        <div className="field"><label className="field-label">E-mail vinculado</label>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Necessário para admins protegidos" /></div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary btn-sm" onClick={handleReset} disabled={saving || !newPw}>
          {saving ? '…' : 'Redefinir Senha'}
        </button>
      </div>
    </>
  );
}

// ─── Componente principal

export default function AdminPage(): React.ReactElement {
  const [users,        setUsers]        = useState<AppUser[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [isAdmin,      setIsAdmin]      = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const [showCreate,   setShowCreate]   = useState(false);
  const [resetTarget,  setResetTarget]  = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadUsers = async () => {
    try {
      const res = await listAdminUsers();
      setUsers(res.users ?? []);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([getSessionInfo(), listAdminUsers()])
      .then(([session, res]) => { setIsAdmin(session.role === 'admin'); setUsers(res.users ?? []); })
      .catch(e => setError(String((e as Error)?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteAdminUser(deleteTarget);
      if (res.ok) {
        showToast(`Usuário "${deleteTarget}" excluído.`);
        setDeleteTarget(null);
        await loadUsers();
      } else {
        setError(res.error ?? 'Erro ao excluir usuário.');
        setDeleteTarget(null);
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Administração de Usuários</h1>
          <p className="page-sub">Criação, restrição e gerenciamento de contas locais</p>
        </div>
        {isAdmin && !loading && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Novo Usuário</button>
        )}
      </div>

      {toast && <div className="alert-good" style={{ marginBottom: 12 }}>{toast}</div>}
      {!isAdmin && !loading && <div className="alert-warn" style={{ marginBottom: 12 }}>🔒 Acesso restrito. Apenas administradores podem gerenciar usuários.</div>}
      {error && (
        <div className="alert-bad row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <span>{error}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)', fontSize: 14 }} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="spinner" />
        </div>
      )}

      {!loading && (
        <div className="card" style={{ padding: 0 }}>
          {users.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }} className="muted">Nenhum usuário cadastrado.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Username</th>
                    <th>Nome de Exibição</th>
                    <th style={{ width: 110 }}>Papel</th>
                    <th style={{ width: 110 }}>Criado em</th>
                    <th style={{ width: 60 }}>Flags</th>
                    {isAdmin && <th style={{ width: 160, textAlign: 'right' }}>Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td className="td-mute small">{user.id}</td>
                      <td><span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>{user.username}</span></td>
                      <td>{user.display_name || '—'}</td>
                      <td><span className={rolePill(user.role)}>{user.role || '—'}</span></td>
                      <td className="small muted">{fmtDate(user.created_at)}</td>
                      <td>
                        {user.must_change_password === 1 && (
                          <span title="Deve alterar senha no próximo login" className="pill pill-warn">⚠ pw</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td style={{ textAlign: 'right' }}>
                          <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setResetTarget(user.username)}>
                              Resetar Senha
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={() => setDeleteTarget(user.username)}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {users.length > 0 && (
            <div className="tbl-foot">
              {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <Modal title="Novo Usuário" onClose={() => setShowCreate(false)}>
          <CreateUserForm
            onCreated={() => { showToast('Usuário criado com sucesso.'); void loadUsers(); }}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Resetar Senha — ${resetTarget}`} onClose={() => setResetTarget(null)}>
          <ResetPasswordForm
            username={resetTarget}
            onReset={() => showToast(`Senha de "${resetTarget}" redefinida.`)}
            onClose={() => setResetTarget(null)}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Confirmar Exclusão" onClose={() => setDeleteTarget(null)}>
          <p style={{ margin: '0 0 16px', fontSize: 13 }}>
            Tem certeza que deseja excluir o usuário <strong>{deleteTarget}</strong>? Esta ação é irreversível.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button>
            <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? '…' : 'Excluir Definitivamente'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
