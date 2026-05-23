/**
 * LoginPage.tsx — Tela de autenticação (Sprint 11)
 *
 * Replica fielmente o fluxo de login legado (public/login.html):
 *   - Modo "login"       : formulário usuário + senha
 *   - Modo "firstAccess" : primeiro acesso admin (e-mail [+ senha atual])
 *   - Modo "confirm"     : confirmação com token recebido por e-mail
 *
 * Modais:
 *   - firstAccessModal : instruções de redefinição (SMTP ou docker logs)
 *   - adminLockedModal : desbloqueio de admin bloqueado
 *
 * Routing via URL params (mantém compatibilidade com links gerados pelo backend):
 *   ?first_admin_token=xxx → modo confirm
 *   ?first_access=1        → modo firstAccess
 *   ?oauth_error=xxx       → exibe erro de OAuth
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  getBranding,
  login as apiLogin,
  requestFirstAdmin,
  confirmFirstAdmin,
  unlockAdminRequest,
} from '../api/auth.api';
import type { BrandingResponse } from '../types';

// ─── Tipos internos ───────────────────────────────────────────────────────────

type FormMode = 'login' | 'firstAccess' | 'confirm';
type AlertType = 'error' | 'success';

// ─── Componente ───────────────────────────────────────────────────────────────

export default function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, loading: authLoading, onLoginSuccess } = useAuth();

  // ── Modo do formulário (derivado dos params da URL) ─────────────────────────
  const getMode = (): FormMode => {
    if (searchParams.get('first_admin_token')) return 'confirm';
    if (searchParams.get('first_access') === '1') return 'firstAccess';
    return 'login';
  };
  const [mode, setMode] = useState<FormMode>(getMode);

  // ── Branding ────────────────────────────────────────────────────────────────
  const [branding, setBranding] = useState<BrandingResponse>({});

  // ── Alertas ─────────────────────────────────────────────────────────────────
  const [alertMsg, setAlertMsg] = useState('');
  const [alertType, setAlertType] = useState<AlertType>('error');

  // ── Campos de formulário ────────────────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstAdminEmail, setFirstAdminEmail] = useState('');
  const [firstAdminCurrentPassword, setFirstAdminCurrentPassword] = useState('');
  const [firstAdminNewPassword, setFirstAdminNewPassword] = useState('');
  const [unlockEmail, setUnlockEmail] = useState('');

  // ── Estado dos botões ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  // ── Foco nos inputs (simula :focus do CSS) ──────────────────────────────────
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // ── Modais ──────────────────────────────────────────────────────────────────
  const [firstAccessModalText, setFirstAccessModalText] = useState('');
  const [firstAccessModalOpen, setFirstAccessModalOpen] = useState(false);
  const [adminLockedModalOpen, setAdminLockedModalOpen] = useState(false);

  // ── Redireciona se já autenticado ───────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  // ── Carrega branding e lê oauth_error ──────────────────────────────────────
  useEffect(() => {
    getBranding()
      .then(setBranding)
      .catch(() => {/* branding é opcional */});

    const oauthError = searchParams.get('oauth_error');
    if (oauthError) showAlert(decodeURIComponent(oauthError), 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sincroniza modo com mudanças nos URL params ─────────────────────────────
  useEffect(() => {
    setMode(getMode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const showAlert = (msg: string, type: AlertType = 'error') => {
    setAlertMsg(msg);
    setAlertType(type);
  };

  const clearAlert = () => setAlertMsg('');

  // showFirstAdminLink: true = admin ainda não existe (primeiro acesso sem senha)
  const showFirstAdminLink = branding.showFirstAdminLink !== false;

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleFirstAccessClick = (e: React.MouseEvent) => {
    e.preventDefault();
    clearAlert();
    setSearchParams({ first_access: '1' });
  };

  const handleBackToLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    clearAlert();
    setSearchParams({});
  };

  const handleOAuth = () => {
    window.location.href = '/api/session/oauth/start';
  };

  /** Formulário: login normal */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlert();
    setSubmitting(true);
    try {
      const result = await apiLogin(username, password);
      if (!result.ok) {
        if (result.code === 'FIRST_ADMIN_EMAIL_REQUIRED') {
          setSearchParams({ first_access: '1' });
          return;
        }
        showAlert(result.error || 'Falha no login.');
        return;
      }
      onLoginSuccess();
      navigate('/', { replace: true });
    } catch {
      showAlert('Falha no login. Verifique sua conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Formulário: primeiro acesso admin */
  const handleFirstAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlert();
    setSubmitting(true);
    try {
      const { result, httpOk } = await requestFirstAdmin(firstAdminEmail, firstAdminCurrentPassword);

      if (!httpOk && result.code === 'ADMIN_FIRST_ACCESS_LOCKED') {
        setAdminLockedModalOpen(true);
        return;
      }

      if (httpOk && result.ok) {
        const msg =
          result.delivery === 'smtp'
            ? 'O e-mail com link de redefinição foi enviado.\n\nAbra sua caixa de entrada e clique no link para definir a senha forte do admin.'
            : `SMTP não configurado.\n\nUse docker logs <id-container> e procure por [FIRST_ADMIN] para copiar o link de redefinição.\n\nLink (dev): ${result.devLink || 'ver logs'}`;
        setFirstAccessModalText(msg);
        setFirstAccessModalOpen(true);
      }

      showAlert(
        result.message || (httpOk ? 'Solicitação concluída.' : 'Falha no envio.'),
        httpOk ? 'success' : 'error',
      );
    } catch {
      showAlert('Falha no envio. Verifique sua conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Formulário: confirmação com token */
  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlert();
    setSubmitting(true);
    const token = searchParams.get('first_admin_token') || '';
    try {
      const { result, httpOk } = await confirmFirstAdmin(token, firstAdminNewPassword);
      if (!httpOk || !result.ok) {
        showAlert(result.error || 'Falha na confirmação.');
        return;
      }
      showAlert(result.message || 'Cadastro confirmado! Redirecionando...', 'success');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch {
      showAlert('Falha na confirmação. Verifique sua conexão.');
    } finally {
      setSubmitting(false);
    }
  };

  /** Modal: reenviar desbloqueio */
  const handleUnlockResend = async () => {
    try {
      const { result, httpOk } = await unlockAdminRequest(unlockEmail);
      showAlert(
        httpOk ? (result.message || 'Solicitação concluída.') : (result.error || 'Falha no reenvio.'),
        httpOk ? 'success' : 'error',
      );
      if (httpOk) setAdminLockedModalOpen(false);
    } catch {
      showAlert('Falha no reenvio. Verifique sua conexão.');
    }
  };

  // ─── Input style dinâmico (simula :focus) ────────────────────────────────────

  const inp = (id: string): React.CSSProperties => ({
    ...styles.inp,
    ...(focusedId === id ? styles.inpFocus : {}),
  });

  const focus = (id: string) => () => setFocusedId(id);
  const blur = () => setFocusedId(null);

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Fundo + card ──────────────────────────────────────────────────── */}
      <div style={styles.wrap}>
        <div style={styles.card}>

          {/* Brand */}
          <div style={styles.brand}>
            <div style={styles.logo}>
              {branding.logoDataUrl
                ? <img src={branding.logoDataUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                : <span style={styles.logoText}>SP</span>
              }
            </div>
            <div>
              <h1 style={styles.h1}>{branding.loginTitle || 'SharePoint Monitor'}</h1>
              <p style={styles.sub}>{branding.loginSubtitle || 'Inventário • Consumo • Retenção'}</p>
            </div>
          </div>

          {/* Alert box */}
          {alertMsg && (
            <div style={{ ...styles.alertBox, ...(alertType === 'success' ? styles.alertSuccess : styles.alertError) }}>
              {alertMsg}
            </div>
          )}

          {/* ── Formulário: Login normal ───────────────────────────────────── */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <label style={styles.lbl}>Usuário</label>
              <input
                style={inp('username')}
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={focus('username')}
                onBlur={blur}
                required
              />
              <label style={styles.lbl}>Senha</label>
              <input
                style={inp('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={focus('password')}
                onBlur={blur}
                required
              />
              <div style={{ marginTop: 18 }}>
                <button style={styles.btnPrimary} type="submit" disabled={submitting}>
                  {submitting ? 'Entrando…' : 'Entrar'}
                </button>
              </div>
            </form>
          )}

          {/* Link primeiro acesso (aparece abaixo do form de login) */}
          {mode === 'login' && showFirstAdminLink && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <a href="/login?first_access=1" onClick={handleFirstAccessClick} style={styles.link}>
                Primeiro acesso do admin
              </a>
            </div>
          )}

          {/* ── Formulário: Primeiro acesso admin ─────────────────────────── */}
          {mode === 'firstAccess' && (
            <form onSubmit={handleFirstAccessRequest} style={{ marginTop: 4 }}>
              <label style={styles.lbl}>E-mail do administrador</label>
              <input
                style={inp('firstAdminEmail')}
                type="email"
                placeholder="admin@empresa.com"
                value={firstAdminEmail}
                onChange={e => setFirstAdminEmail(e.target.value)}
                onFocus={focus('firstAdminEmail')}
                onBlur={blur}
                required
              />
              {/* Senha atual — visível somente quando admin já existe */}
              {!showFirstAdminLink && (
                <>
                  <label style={styles.lbl}>Senha atual do administrador</label>
                  <input
                    style={inp('firstAdminCurrentPassword')}
                    type="password"
                    placeholder="Informe a senha atual"
                    value={firstAdminCurrentPassword}
                    onChange={e => setFirstAdminCurrentPassword(e.target.value)}
                    onFocus={focus('firstAdminCurrentPassword')}
                    onBlur={blur}
                  />
                </>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={{ ...styles.btnSecondary, flex: '0 0 auto' }}
                  onClick={handleBackToLogin}
                >
                  ← Voltar
                </button>
                <button style={{ ...styles.btnPrimary, flex: 1 }} type="submit" disabled={submitting}>
                  {submitting ? 'Enviando…' : 'Enviar e-mail'}
                </button>
              </div>
            </form>
          )}

          {/* ── Formulário: Confirmação com token ─────────────────────────── */}
          {mode === 'confirm' && (
            <form onSubmit={handleConfirm} style={{ marginTop: 4 }}>
              <label style={styles.lbl}>Nova senha do administrador</label>
              <input
                style={inp('firstAdminNewPassword')}
                type="password"
                placeholder="Mín. 20 caracteres com complexidade"
                value={firstAdminNewPassword}
                onChange={e => setFirstAdminNewPassword(e.target.value)}
                onFocus={focus('firstAdminNewPassword')}
                onBlur={blur}
                required
              />
              <div style={{ marginTop: 12 }}>
                <button style={styles.btnPrimary} type="submit" disabled={submitting}>
                  {submitting ? 'Confirmando…' : 'Confirmar cadastro'}
                </button>
              </div>
            </form>
          )}

          {/* ── OAuth ─────────────────────────────────────────────────────── */}
          {branding.oauthEnabled && mode === 'login' && (
            <>
              <div style={styles.sep}>
                <span style={styles.sepLine} />
                ou
                <span style={styles.sepLine} />
              </div>
              <button style={styles.btnSecondary} type="button" onClick={handleOAuth}>
                {branding.oauthButtonLabel || 'Entrar com Microsoft'}
              </button>
            </>
          )}

          <p style={styles.footerNote}>Acesso seguro com trilha de auditoria e perfil por grupo.</p>
        </div>
      </div>

      {/* ── Modal: instruções de redefinição ──────────────────────────────── */}
      {firstAccessModalOpen && (
        <div style={styles.modalBg} onClick={() => setFirstAccessModalOpen(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Instruções de redefinição</h3>
            <div style={{ whiteSpace: 'pre-line', color: '#3a4a66', fontSize: 14 }}>
              {firstAccessModalText}
            </div>
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button style={styles.btnSecondary} type="button" onClick={() => setFirstAccessModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: admin bloqueado ────────────────────────────────────────── */}
      {adminLockedModalOpen && (
        <div style={styles.modalBg}>
          <div style={styles.modal}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Usuário bloqueado</h3>
            <p style={{ color: '#3a4a66', fontSize: 14 }}>
              Usuário bloqueado, deseja enviar um novo e-mail para reset da senha?
            </p>
            <div style={{ marginTop: 12 }}>
              <input
                style={inp('unlockEmail')}
                type="email"
                placeholder="Informe o e-mail de cadastro do admin"
                value={unlockEmail}
                onChange={e => setUnlockEmail(e.target.value)}
                onFocus={focus('unlockEmail')}
                onBlur={blur}
              />
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                style={styles.btnSecondary}
                type="button"
                onClick={() => setAdminLockedModalOpen(false)}
              >
                Cancelar
              </button>
              <button style={styles.btnPrimary} type="button" onClick={handleUnlockResend}>
                Reenviar para o e-mail
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Estilos (fiéis ao design legado) ─────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 24,
    background: [
      'radial-gradient(1200px 480px at 10% -10%, #dce9ff 0%, transparent 60%)',
      'radial-gradient(900px 420px at 90% 120%, #e7dcff 0%, transparent 60%)',
      'linear-gradient(180deg, #f4f7fb 0, #eef3fa 100%)',
    ].join(', '),
  },

  card: {
    width: 'min(460px, 100%)',
    background: 'rgba(255,255,255,.92)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    border: '1px solid #e7edf7',
    borderRadius: 22,
    boxShadow: '0 28px 70px rgba(16,29,58,.12)',
    padding: 28,
  },

  brand: {
    display: 'flex',
    gap: 14,
    alignItems: 'center',
    marginBottom: 18,
  },

  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    background: '#e9f1ff',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    border: '1px solid #cfe0ff',
    flexShrink: 0,
  },

  logoText: {
    color: '#0f5bd7',
    fontWeight: 800,
    fontSize: 18,
  },

  h1: {
    fontSize: 28,
    margin: '0 0 4px',
    fontWeight: 700,
    color: '#182133',
    lineHeight: 1.2,
  },

  sub: {
    color: '#5f6c83',
    margin: 0,
    fontSize: 14,
  },

  alertBox: {
    marginBottom: 10,
    padding: '10px 12px',
    borderRadius: 12,
    fontSize: 13,
    lineHeight: 1.45,
  },

  alertError: {
    background: '#fff2f2',
    color: '#9c2f2f',
    border: '1px solid #f0caca',
  },

  alertSuccess: {
    background: '#eefaf0',
    color: '#166534',
    border: '1px solid #b7e4c7',
  },

  lbl: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    margin: '12px 0 6px',
    color: '#182133',
  },

  inp: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #d9e1ec',
    fontSize: 14,
    background: '#fff',
    outline: 'none',
    transition: 'border-color .15s, box-shadow .15s',
    color: '#182133',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },

  inpFocus: {
    borderColor: '#b8ceff',
    boxShadow: '0 0 0 3px rgba(15,91,215,.12)',
  },

  btnPrimary: {
    width: '100%',
    padding: '12px 14px',
    border: 'none',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    background: 'linear-gradient(135deg, #0f5bd7, #2f7cf8)',
    color: '#fff',
    boxShadow: '0 10px 24px rgba(15,91,215,.22)',
    transition: '.18s transform, .18s box-shadow',
    fontFamily: 'inherit',
  },

  btnSecondary: {
    padding: '10px 14px',
    border: '1px solid #d7e2f4',
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    background: '#eff4fb',
    color: '#193052',
    transition: '.18s transform',
    fontFamily: 'inherit',
  },

  link: {
    color: '#0f5bd7',
    textDecoration: 'none',
    fontSize: 14,
  },

  sep: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    color: '#5f6c83',
    fontSize: 12,
    margin: '16px 0',
  },

  sepLine: {
    flex: 1,
    height: 1,
    background: '#d9e1ec',
    display: 'block',
  },

  footerNote: {
    marginTop: 14,
    fontSize: 12,
    color: '#6b778f',
    textAlign: 'center',
  },

  modalBg: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10,20,40,.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex: 1000,
  },

  modal: {
    background: '#fff',
    borderRadius: 14,
    maxWidth: 560,
    width: '100%',
    padding: 18,
    border: '1px solid #dfe7f5',
  },
};
