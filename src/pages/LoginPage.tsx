/**
 * LoginPage.tsx — Tela de autenticação (Sprint 11)
 *
 * Modos:
 *   - login       : formulário usuário + senha
 *   - firstAccess : primeiro acesso admin
 *   - confirm     : confirmação com token
 *
 * Modais: firstAccessModal, adminLockedModal
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

function toFrontendUrl(devLink: string | undefined): string {
  if (!devLink) return 'ver logs';
  try {
    const url = new URL(devLink, window.location.origin);
    return `${window.location.origin}${url.pathname}${url.search}`;
  } catch {
    return devLink.startsWith('/') ? `${window.location.origin}${devLink}` : devLink;
  }
}

type FormMode  = 'login' | 'firstAccess' | 'confirm';
type AlertType = 'error' | 'success';

export default function LoginPage(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, loading: authLoading, onLoginSuccess } = useAuth();

  const getMode = (): FormMode => {
    if (searchParams.get('first_admin_token')) return 'confirm';
    if (searchParams.get('first_access') === '1') return 'firstAccess';
    return 'login';
  };
  const [mode, setMode] = useState<FormMode>(getMode);
  const [branding, setBranding] = useState<BrandingResponse>({});
  const [alertMsg,  setAlertMsg]  = useState('');
  const [alertType, setAlertType] = useState<AlertType>('error');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstAdminEmail,           setFirstAdminEmail]           = useState('');
  const [firstAdminCurrentPassword, setFirstAdminCurrentPassword] = useState('');
  const [firstAdminNewPassword,     setFirstAdminNewPassword]     = useState('');
  const [unlockEmail, setUnlockEmail] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [focusedId,  setFocusedId]    = useState<string | null>(null);
  const [firstAccessModalText, setFirstAccessModalText] = useState('');
  const [firstAccessModalOpen, setFirstAccessModalOpen] = useState(false);
  const [adminLockedModalOpen, setAdminLockedModalOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate('/', { replace: true });
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    getBranding().then(setBranding).catch(() => {});
    const oauthError = searchParams.get('oauth_error');
    if (oauthError) showAlert(decodeURIComponent(oauthError), 'error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setMode(getMode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const showAlert = (msg: string, type: AlertType = 'error') => { setAlertMsg(msg); setAlertType(type); };
  const clearAlert = () => setAlertMsg('');
  const showFirstAdminLink = branding.showFirstAdminLink !== false;

  const handleFirstAccessClick = (e: React.MouseEvent) => { e.preventDefault(); clearAlert(); setSearchParams({ first_access: '1' }); };
  const handleBackToLogin      = (e: React.MouseEvent) => { e.preventDefault(); clearAlert(); setSearchParams({}); };
  const handleOAuth            = () => { window.location.href = '/api/session/oauth/start'; };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); clearAlert(); setSubmitting(true);
    try {
      const result = await apiLogin(username, password);
      if (!result.ok) {
        if (result.code === 'FIRST_ADMIN_EMAIL_REQUIRED') { setSearchParams({ first_access: '1' }); return; }
        showAlert(result.error || 'Falha no login.'); return;
      }
      onLoginSuccess(); navigate('/', { replace: true });
    } catch { showAlert('Falha no login. Verifique sua conexão.'); }
    finally  { setSubmitting(false); }
  };

  const handleFirstAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault(); clearAlert(); setSubmitting(true);
    try {
      const { result, httpOk } = await requestFirstAdmin(firstAdminEmail, firstAdminCurrentPassword);
      if (!httpOk && result.code === 'ADMIN_FIRST_ACCESS_LOCKED') { setAdminLockedModalOpen(true); return; }
      if (httpOk && result.ok) {
        const msg = result.delivery === 'smtp'
          ? 'O e-mail com link de redefinição foi enviado.\n\nAbra sua caixa de entrada e clique no link para definir a senha forte do admin.'
          : `SMTP não configurado.\n\nUse docker logs <id-container> e procure por [FIRST_ADMIN] para copiar o link de redefinição.\n\nLink (dev): ${toFrontendUrl(result.devLink)}`;
        setFirstAccessModalText(msg); setFirstAccessModalOpen(true);
      }
      showAlert(result.message || (httpOk ? 'Solicitação concluída.' : 'Falha no envio.'), httpOk ? 'success' : 'error');
    } catch { showAlert('Falha no envio. Verifique sua conexão.'); }
    finally  { setSubmitting(false); }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault(); clearAlert(); setSubmitting(true);
    const token = searchParams.get('first_admin_token') || '';
    try {
      const { result, httpOk } = await confirmFirstAdmin(token, firstAdminNewPassword);
      if (!httpOk || !result.ok) { showAlert(result.error || 'Falha na confirmação.'); return; }
      showAlert(result.message || 'Cadastro confirmado! Redirecionando...', 'success');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch { showAlert('Falha na confirmação. Verifique sua conexão.'); }
    finally  { setSubmitting(false); }
  };

  const handleUnlockResend = async () => {
    try {
      const { result, httpOk } = await unlockAdminRequest(unlockEmail);
      showAlert(httpOk ? (result.message || 'Solicitação concluída.') : (result.error || 'Falha no reenvio.'), httpOk ? 'success' : 'error');
      if (httpOk) setAdminLockedModalOpen(false);
    } catch { showAlert('Falha no reenvio. Verifique sua conexão.'); }
  };

  const inp = (id: string): React.CSSProperties => ({
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: `1px solid ${focusedId === id ? 'var(--accent)' : 'var(--border)'}`,
    boxShadow: focusedId === id ? '0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent)' : 'none',
    fontSize: 14, background: 'var(--panel)', outline: 'none',
    transition: 'border-color .15s, box-shadow .15s', color: 'var(--text)',
    fontFamily: 'inherit', boxSizing: 'border-box' as const,
  });

  const focus = (id: string) => () => setFocusedId(id);
  const blur  = () => setFocusedId(null);

  return (
    <>
      <style>{`
        .lp-wrap {
          min-height: 100vh; display: grid; place-items: center; padding: 24px;
          background:
            radial-gradient(1200px 480px at 10% -10%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 60%),
            radial-gradient(900px 420px at 90% 120%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 60%),
            var(--bg);
        }
        .lp-card {
          width: min(460px, 100%); background: var(--panel);
          border: 1px solid var(--border); border-radius: 22px;
          box-shadow: var(--shadow-float); padding: 28px;
        }
        .lp-lbl { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 6px; color: var(--text); }
        .lp-btn-primary {
          width: 100%; padding: 12px 14px; border: none; border-radius: 12px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 80%, #fff));
          color: #fff; box-shadow: 0 10px 24px color-mix(in srgb, var(--accent) 30%, transparent);
          transition: .18s transform, .18s box-shadow; font-family: inherit;
        }
        .lp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .lp-btn-secondary {
          padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px;
          font-size: 14px; font-weight: 700; cursor: pointer;
          background: var(--panel-2); color: var(--text);
          transition: .18s transform; font-family: inherit;
        }
        .lp-sep { display: flex; align-items: center; gap: 12px; color: var(--faint); font-size: 12px; margin: 16px 0; }
        .lp-sep-line { flex: 1; height: 1px; background: var(--border); display: block; }
      `}</style>

      <div className="lp-wrap">
        <div className="lp-card">

          {/* Brand */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', flexShrink: 0 }}>
              {branding.logoDataUrl
                ? <img src={branding.logoDataUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                : <span style={{ color: 'var(--accent)', fontWeight: 800, fontSize: 18 }}>SP</span>
              }
            </div>
            <div>
              <h1 style={{ fontSize: 28, margin: '0 0 4px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                {branding.loginTitle || 'SharePoint Monitor'}
              </h1>
              <p style={{ color: 'var(--faint)', margin: 0, fontSize: 14 }}>
                {branding.loginSubtitle || 'Inventário • Consumo • Retenção'}
              </p>
            </div>
          </div>

          {/* Alert */}
          {alertMsg && (
            <div style={{
              marginBottom: 10, padding: '10px 12px', borderRadius: 12,
              fontSize: 13, lineHeight: 1.45,
              background: alertType === 'success' ? 'var(--good-bg)' : 'var(--bad-bg)',
              color:      alertType === 'success' ? 'var(--good)'    : 'var(--bad)',
              border:     alertType === 'success' ? '1px solid var(--good-bd)' : '1px solid var(--bad-bd)',
            }}>
              {alertMsg}
            </div>
          )}

          {/* ── Formulário: Login */}
          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <label className="lp-lbl">Usuário</label>
              <input style={inp('username')} id="username" type="text" autoComplete="username"
                value={username} onChange={e => setUsername(e.target.value)}
                onFocus={focus('username')} onBlur={blur} required />
              <label className="lp-lbl">Senha</label>
              <input style={inp('password')} id="password" type="password" autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                onFocus={focus('password')} onBlur={blur} required />
              <div style={{ marginTop: 18 }}>
                <button className="lp-btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Entrando…' : 'Entrar'}
                </button>
              </div>
            </form>
          )}

          {mode === 'login' && showFirstAdminLink && (
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <a href="/login?first_access=1" onClick={handleFirstAccessClick} style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 14 }}>
                Primeiro acesso do admin
              </a>
            </div>
          )}

          {/* ── Formulário: Primeiro acesso */}
          {mode === 'firstAccess' && (
            <form onSubmit={handleFirstAccessRequest} style={{ marginTop: 4 }}>
              <label className="lp-lbl">E-mail do administrador</label>
              <input style={inp('firstAdminEmail')} type="email" placeholder="admin@empresa.com"
                value={firstAdminEmail} onChange={e => setFirstAdminEmail(e.target.value)}
                onFocus={focus('firstAdminEmail')} onBlur={blur} required />
              {!showFirstAdminLink && (
                <>
                  <label className="lp-lbl">Senha atual do administrador</label>
                  <input style={inp('firstAdminCurrentPassword')} type="password" placeholder="Informe a senha atual"
                    value={firstAdminCurrentPassword} onChange={e => setFirstAdminCurrentPassword(e.target.value)}
                    onFocus={focus('firstAdminCurrentPassword')} onBlur={blur} />
                </>
              )}
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button type="button" className="lp-btn-secondary" style={{ flex: '0 0 auto' }} onClick={handleBackToLogin}>← Voltar</button>
                <button className="lp-btn-primary" type="submit" disabled={submitting} style={{ flex: 1 }}>
                  {submitting ? 'Enviando…' : 'Enviar e-mail'}
                </button>
              </div>
            </form>
          )}

          {/* ── Formulário: Confirmação */}
          {mode === 'confirm' && (
            <form onSubmit={handleConfirm} style={{ marginTop: 4 }}>
              <label className="lp-lbl">Nova senha do administrador</label>
              <input style={inp('firstAdminNewPassword')} type="password" placeholder="Mín. 20 caracteres com complexidade"
                value={firstAdminNewPassword} onChange={e => setFirstAdminNewPassword(e.target.value)}
                onFocus={focus('firstAdminNewPassword')} onBlur={blur} required />
              <div style={{ marginTop: 12 }}>
                <button className="lp-btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Confirmando…' : 'Confirmar cadastro'}
                </button>
              </div>
            </form>
          )}

          {/* ── OAuth */}
          {branding.oauthEnabled && mode === 'login' && (
            <>
              <div className="lp-sep"><span className="lp-sep-line" />ou<span className="lp-sep-line" /></div>
              <button className="lp-btn-secondary" type="button" onClick={handleOAuth} style={{ width: '100%' }}>
                {branding.oauthButtonLabel || 'Entrar com Microsoft'}
              </button>
            </>
          )}

          <p style={{ marginTop: 14, fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>
            Acesso seguro com trilha de auditoria e perfil por grupo.
          </p>
        </div>
      </div>

      {/* ── Modal: instruções de redefinição */}
      {firstAccessModalOpen && (
        <div className="modal-overlay" onClick={() => setFirstAccessModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Instruções de redefinição</h3>
            <div style={{ whiteSpace: 'pre-line', color: 'var(--text)', fontSize: 14 }}>
              {firstAccessModalText}
            </div>
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button className="lp-btn-secondary" type="button" onClick={() => setFirstAccessModalOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: admin bloqueado */}
      {adminLockedModalOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>Usuário bloqueado</h3>
            <p style={{ color: 'var(--text)', fontSize: 14 }}>
              Usuário bloqueado, deseja enviar um novo e-mail para reset da senha?
            </p>
            <div style={{ marginTop: 12 }}>
              <input style={inp('unlockEmail')} type="email" placeholder="Informe o e-mail de cadastro do admin"
                value={unlockEmail} onChange={e => setUnlockEmail(e.target.value)}
                onFocus={focus('unlockEmail')} onBlur={blur} />
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="lp-btn-secondary" type="button" onClick={() => setAdminLockedModalOpen(false)}>Cancelar</button>
              <button className="lp-btn-primary" type="button" onClick={handleUnlockResend} style={{ width: 'auto' }}>
                Reenviar para o e-mail
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
