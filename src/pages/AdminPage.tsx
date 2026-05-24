/**
 * AdminPage.tsx — Administração de usuários (Sprint 18)
 *
 * Rota: /admin
 * Endpoints:
 *   GET  /api/admin/users               → lista de usuários
 *   POST /api/admin/users               → criar usuário
 *   POST /api/admin/users/delete        → excluir usuário
 *   POST /api/admin/users/reset-password → redefinir senha
 *
 * Requer papel admin; não-admins veem aviso de acesso restrito.
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#eef1f5', panel: '#ffffff', border: '#c8ced8',
  accent: '#2b6cb0', text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

const ROLE_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  admin:    { bg: '#fff5f5', color: '#991b1b', border: '#fca5a5' },
  operator: { bg: '#ebf8ff', color: '#2b6cb0', border: '#90cdf4' },
};
const ROLE_DEFAULT = { bg: '#f7f9fc', color: C.muted, border: C.border };

function roleStyle(role: string) {
  return ROLE_STYLE[role?.toLowerCase()] ?? ROLE_DEFAULT;
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; }
}

// ─── Modal genérico ───────────────────────────────────────────────────────────

interface ModalProps {
  title:    string;
  onClose:  () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: ModalProps): React.ReactElement {
  return (
    <div style={ms.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={ms.box}>
        <div style={ms.head}>
          <span style={ms.headTitle}>{title}</span>
          <button style={ms.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={ms.body}>{children}</div>
      </div>
    </div>
  );
}

const ms: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10,20,40,.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9000,
  },
  box: {
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    width: 440,
    maxWidth: '92vw',
    boxShadow: '0 8px 32px rgba(0,0,0,.18)',
  },
  head: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px',
    borderBottom: `1px solid ${C.border}`,
    background: '#f7f9fc',
    borderRadius: '8px 8px 0 0',
  },
  headTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  closeBtn: {
    background: 'none', border: 'none', fontSize: 16,
    cursor: 'pointer', color: C.muted, fontFamily: 'inherit', padding: '0 4px',
  },
  body: { padding: '16px' },
};

// ─── Formulário — Novo Usuário ────────────────────────────────────────────────

interface CreateUserFormProps {
  onCreated: () => void;
  onClose:   () => void;
}

function CreateUserForm({ onCreated, onClose }: CreateUserFormProps): React.ReactElement {
  const [username,    setUsername]    = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password,    setPassword]    = useState('');
  const [role,        setRole]        = useState('admin');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleCreate = async () => {
    if (!username.trim() || !password) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createAdminUser({
        username:    username.trim().toLowerCase(),
        password,
        displayName: displayName.trim() || username.trim(),
        role,
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        setError(res.error ?? 'Erro ao criar usuário.');
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <div style={fs.errorBox}>{error}</div>}
      <div style={fs.grid}>
        <div style={fs.field}>
          <label style={fs.label}>Username *</label>
          <input style={fs.input} value={username} onChange={e => setUsername(e.target.value)}
            placeholder="mínimo 3 caracteres" autoFocus />
        </div>
        <div style={fs.field}>
          <label style={fs.label}>Nome de Exibição</label>
          <input style={fs.input} value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="Nome completo" />
        </div>
        <div style={fs.field}>
          <label style={fs.label}>Senha *</label>
          <input style={fs.input} type="password" value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="new-password" placeholder="Mínimo 8 caracteres, maiúscula, número…" />
        </div>
        <div style={fs.field}>
          <label style={fs.label}>Papel</label>
          <select style={fs.select} value={role} onChange={e => setRole(e.target.value)}>
            <option value="admin">Administrador</option>
            <option value="operator">Operador</option>
          </select>
        </div>
      </div>
      <div style={fs.actions}>
        <button style={fs.btnSecondary} onClick={onClose} disabled={saving}>Cancelar</button>
        <button style={fs.btnPrimary} onClick={handleCreate}
          disabled={saving || !username.trim() || !password}>
          {saving ? '…' : 'Criar Usuário'}
        </button>
      </div>
    </>
  );
}

// ─── Formulário — Resetar Senha ───────────────────────────────────────────────

interface ResetPasswordFormProps {
  username: string;
  onReset:  () => void;
  onClose:  () => void;
}

function ResetPasswordForm({ username, onReset, onClose }: ResetPasswordFormProps): React.ReactElement {
  const [newPw,   setNewPw]   = useState('');
  const [email,   setEmail]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleReset = async () => {
    if (!newPw) return;
    setSaving(true);
    setError(null);
    try {
      const res = await resetAdminPassword({ username, newPassword: newPw, email: email || undefined });
      if (res.ok) {
        onReset();
        onClose();
      } else {
        setError(res.error ?? 'Erro ao redefinir senha.');
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <div style={fs.errorBox}>{error}</div>}
      <p style={{ margin: '0 0 12px', fontSize: 13, color: C.text }}>
        Redefinir senha de <strong>{username}</strong>:
      </p>
      <div style={fs.grid}>
        <div style={fs.field}>
          <label style={fs.label}>Nova Senha *</label>
          <input style={fs.input} type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
            autoFocus autoComplete="new-password" placeholder="Mínimo 8 caracteres…" />
        </div>
        <div style={fs.field}>
          <label style={fs.label}>E-mail vinculado</label>
          <input style={fs.input} type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Necessário para admins protegidos" />
        </div>
      </div>
      <div style={fs.actions}>
        <button style={fs.btnSecondary} onClick={onClose} disabled={saving}>Cancelar</button>
        <button style={fs.btnPrimary} onClick={handleReset} disabled={saving || !newPw}>
          {saving ? '…' : 'Redefinir Senha'}
        </button>
      </div>
    </>
  );
}

const fs: Record<string, React.CSSProperties> = {
  grid:        { display: 'flex', flexDirection: 'column', gap: 12 },
  field:       { display: 'flex', flexDirection: 'column', gap: 4 },
  label:       { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' },
  input:       { padding: '6px 9px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  select:      { padding: '6px 9px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  actions:     { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  btnPrimary:  { padding: '6px 14px', background: C.accent, color: '#fff', border: `1px solid ${C.accent}`, borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary:{ padding: '6px 14px', background: '#fff', color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  errorBox:    { background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 4, padding: '8px 12px', color: '#c53030', fontSize: 13, marginBottom: 12 },
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function AdminPage(): React.ReactElement {
  const [users,      setUsers]      = useState<AppUser[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [toast,      setToast]      = useState<string | null>(null);

  // Modals
  const [showCreate,   setShowCreate]   = useState(false);
  const [resetTarget,  setResetTarget]  = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Mount ─────────────────────────────────────────────────────────────────
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
      .then(([session, res]) => {
        setIsAdmin(session.role === 'admin');
        setUsers(res.users ?? []);
      })
      .catch(e => setError(String((e as Error)?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Excluir usuário ───────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{`@keyframes ad-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Cabeçalho */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Administração de Usuários</h1>
          <p style={s.sub}>Criação, restrição e gerenciamento de contas locais</p>
        </div>
        {isAdmin && !loading && (
          <button style={s.btnPrimary} onClick={() => setShowCreate(true)}>+ Novo Usuário</button>
        )}
      </div>

      {/* Toast */}
      {toast && <div style={s.successBox}>{toast}</div>}

      {/* Acesso restrito */}
      {!isAdmin && !loading && (
        <div style={s.warningBox}>
          🔒 Acesso restrito. Apenas administradores podem gerenciar usuários.
        </div>
      )}

      {/* Erro */}
      {error && <div style={s.errorBox}>{error} <button style={s.errClose} onClick={() => setError(null)}>✕</button></div>}

      {/* Loading */}
      {loading && (
        <div style={s.spinWrap}>
          <div style={{ ...s.spinner, animation: 'ad-spin .7s linear infinite' }} />
        </div>
      )}

      {/* Tabela */}
      {!loading && (
        <div style={s.panel}>
          {users.length === 0 ? (
            <div style={s.empty}>Nenhum usuário cadastrado.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 40 }}>#</th>
                  <th style={s.th}>Username</th>
                  <th style={s.th}>Nome de Exibição</th>
                  <th style={{ ...s.th, width: 110 }}>Papel</th>
                  <th style={{ ...s.th, width: 110 }}>Criado em</th>
                  <th style={{ ...s.th, width: 60 }}>Flags</th>
                  {isAdmin && <th style={{ ...s.th, width: 160, textAlign: 'right' }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {users.map(user => {
                  const rs = roleStyle(user.role);
                  return (
                    <tr key={user.id} style={s.tr}>
                      <td style={{ ...s.td, color: C.muted, fontSize: 12 }}>{user.id}</td>
                      <td style={s.td}>
                        <span style={s.username}>{user.username}</span>
                      </td>
                      <td style={s.td}>{user.display_name || '—'}</td>
                      <td style={s.td}>
                        <span style={{ ...s.badge, background: rs.bg, color: rs.color, border: `1px solid ${rs.border}` }}>
                          {user.role || '—'}
                        </span>
                      </td>
                      <td style={s.td}>
                        <span style={{ fontSize: 12, color: C.muted }}>{fmtDate(user.created_at)}</span>
                      </td>
                      <td style={s.td}>
                        {user.must_change_password === 1 && (
                          <span title="Deve alterar senha no próximo login" style={{ ...s.badge, background: '#fffaf0', color: '#c05621', border: '1px solid #fbd38d' }}>
                            ⚠ pw
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button style={s.btnRowSm} onClick={() => setResetTarget(user.username)}>
                              Resetar Senha
                            </button>
                            <button
                              style={{ ...s.btnRowSm, color: C.bad, borderColor: C.bad }}
                              onClick={() => setDeleteTarget(user.username)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {users.length > 0 && (
            <div style={s.tableFooter}>
              {users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Modal — Novo Usuário */}
      {showCreate && (
        <Modal title="Novo Usuário" onClose={() => setShowCreate(false)}>
          <CreateUserForm
            onCreated={() => { showToast('Usuário criado com sucesso.'); void loadUsers(); }}
            onClose={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {/* Modal — Resetar Senha */}
      {resetTarget && (
        <Modal title={`Resetar Senha — ${resetTarget}`} onClose={() => setResetTarget(null)}>
          <ResetPasswordForm
            username={resetTarget}
            onReset={() => showToast(`Senha de "${resetTarget}" redefinida.`)}
            onClose={() => setResetTarget(null)}
          />
        </Modal>
      )}

      {/* Modal — Confirmar Exclusão */}
      {deleteTarget && (
        <Modal title="Confirmar Exclusão" onClose={() => setDeleteTarget(null)}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: C.text }}>
            Tem certeza que deseja excluir o usuário <strong>{deleteTarget}</strong>?
            Esta ação é irreversível.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={fs.btnSecondary} onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </button>
            <button
              style={{ ...fs.btnPrimary, background: C.bad, borderColor: C.bad }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? '…' : 'Excluir Definitivamente'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '0 0 40px' },

  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16, flexWrap: 'wrap', gap: 10,
  },
  h1:  { margin: 0, fontSize: 22, fontWeight: 800, color: C.text },
  sub: { margin: '2px 0 0', fontSize: 13, color: C.muted },

  successBox: {
    background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 4,
    padding: '10px 14px', color: '#276749', fontSize: 13, marginBottom: 12, fontWeight: 600,
  },
  warningBox: {
    background: '#fffaf0', border: '1px solid #fbd38d', borderRadius: 4,
    padding: '10px 14px', color: '#c05621', fontSize: 13, marginBottom: 12,
  },
  errorBox: {
    background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 4,
    padding: '10px 14px', color: '#c53030', fontSize: 13, marginBottom: 12,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  errClose: { background: 'none', border: 'none', cursor: 'pointer', color: '#c53030', fontSize: 14 },

  panel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em',
    borderBottom: `1px solid ${C.border}`, background: '#f7f9fc',
  },
  tr:  { borderBottom: `1px solid #eef1f5` },
  td:  { padding: '8px 12px', color: C.text, verticalAlign: 'middle' },
  badge: {
    display: 'inline-block', padding: '2px 7px', borderRadius: 3,
    fontSize: 11, fontWeight: 700,
  },
  username: { fontWeight: 600, fontFamily: 'monospace', fontSize: 13 },

  tableFooter: {
    padding: '8px 14px', fontSize: 12, color: C.muted,
    borderTop: `1px solid ${C.border}`, background: '#fafbfc',
  },
  empty: { padding: '40px 20px', textAlign: 'center', color: C.muted, fontSize: 14 },

  btnPrimary: {
    padding: '6px 14px', background: C.accent, color: '#fff',
    border: `1px solid ${C.accent}`, borderRadius: 4,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  btnRowSm: {
    padding: '3px 9px', background: '#fff', color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 3,
    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },

  spinWrap: { display: 'flex', justifyContent: 'center', padding: '40px 0' },
  spinner: {
    width: 28, height: 28, border: `3px solid ${C.border}`,
    borderTopColor: C.accent, borderRadius: '50%',
  },
};
