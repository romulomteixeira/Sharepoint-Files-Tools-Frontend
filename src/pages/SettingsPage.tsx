/**
 * SettingsPage.tsx — Configurações do sistema (Sprint 18)
 *
 * Rota: /settings
 *
 * Funcionalidades:
 *   - Exibe configurações agrupadas: Graph, Motor de Scan, Versões,
 *     Workers, Preços e Branding
 *   - Admins podem editar e salvar via POST /api/config
 *   - Não-admins veem os campos em modo leitura
 *   - Detecção de papel via GET /api/session/check
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  getConfig,
  getSessionInfo,
  saveConfig,
  type AppConfig,
} from '../api/settings.api';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#eef1f5', panel: '#ffffff', border: '#c8ced8',
  accent: '#2b6cb0', text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

// ─── Sub-componentes ──────────────────────────────────────────────────────────

interface SectionProps {
  title:    string;
  subtitle: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, subtitle, children, defaultOpen = true }: SectionProps): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={ss.section}>
      <button style={ss.sectionHead} onClick={() => setOpen(o => !o)} type="button">
        <div>
          <div style={ss.sectionTitle}>{title}</div>
          <div style={ss.sectionSub}>{subtitle}</div>
        </div>
        <span style={{ fontSize: 16, color: C.muted, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && <div style={ss.sectionBody}>{children}</div>}
    </div>
  );
}

interface FieldProps {
  label:     string;
  hint?:     string;
  children:  React.ReactNode;
}

function Field({ label, hint, children }: FieldProps): React.ReactElement {
  return (
    <div style={ss.field}>
      <label style={ss.label}>{label}</label>
      {children}
      {hint && <span style={ss.hint}>{hint}</span>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SettingsPage(): React.ReactElement {
  const [config,   setConfig]   = useState<AppConfig | null>(null);
  const [draft,    setDraft]    = useState<AppConfig>({});
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mount: sessão + config ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([getSessionInfo(), getConfig()])
      .then(([session, cfg]) => {
        setIsAdmin(session.role === 'admin');
        setConfig(cfg);
        setDraft(cfg);
      })
      .catch(e => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Salvar ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveConfig(draft);
      setConfig(draft);
      setEditMode(false);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3500);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(config ?? {});
    setEditMode(false);
    setError(null);
  };

  // ── Helpers de binding ────────────────────────────────────────────────────
  const str  = (key: keyof AppConfig) =>
    String(draft[key] ?? config?.[key] ?? '');
  const num  = (key: keyof AppConfig) =>
    Number(draft[key] ?? config?.[key] ?? 0);
  const bool = (key: keyof AppConfig) =>
    Boolean(draft[key] ?? config?.[key]);

  const setStr  = (key: keyof AppConfig) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setDraft(d => ({ ...d, [key]: e.target.value }));
  const setNum  = (key: keyof AppConfig) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft(d => ({ ...d, [key]: Number(e.target.value) }));
  const setBool = (key: keyof AppConfig) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft(d => ({ ...d, [key]: e.target.checked }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={ss.page}>
      <style>{`@keyframes st-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Cabeçalho */}
      <div style={ss.header}>
        <div>
          <h1 style={ss.h1}>Configurações</h1>
          <p style={ss.sub}>
            Token Microsoft Graph, motor de scan, versões e branding
            {isAdmin && <span style={ss.adminBadge}>Admin</span>}
          </p>
        </div>
        {isAdmin && !editMode && !loading && (
          <button style={ss.btnPrimary} onClick={() => setEditMode(true)}>
            ✎ Editar Configurações
          </button>
        )}
        {editMode && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ss.btnDanger} onClick={handleCancel}>Cancelar</button>
            <button style={ss.btnPrimary} onClick={handleSave} disabled={saving}>
              {saving ? '…' : '💾 Salvar'}
            </button>
          </div>
        )}
      </div>

      {/* Feedback */}
      {error && <div style={ss.errorBox}>{error}</div>}
      {saved && <div style={ss.successBox}>✓ Configurações salvas com sucesso.</div>}
      {!isAdmin && !loading && (
        <div style={ss.infoBox}>
          Você está visualizando as configurações em modo leitura. Apenas administradores podem alterar.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={ss.spinWrap}>
          <div style={ss.spinner} />
        </div>
      )}

      {/* Formulário */}
      {!loading && config && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Credenciais Microsoft Graph ──────────────────────────────── */}
          <Section title="Credenciais Microsoft Graph" subtitle="Tenant ID, Client ID e credenciais de serviço">
            <div style={ss.grid2}>
              <Field label="Tenant ID">
                <input style={ss.input} value={str('tenantId')} onChange={setStr('tenantId')} readOnly={!editMode} />
              </Field>
              <Field label="Client ID (App Registration)">
                <input style={ss.input} value={str('clientId')} onChange={setStr('clientId')} readOnly={!editMode} />
              </Field>
              <Field label="Client Secret" hint="Campo redactado. Preencha apenas para alterar.">
                <input
                  style={ss.input}
                  type="password"
                  value={editMode ? str('clientSecret') : '••••••••'}
                  onChange={setStr('clientSecret')}
                  readOnly={!editMode}
                  placeholder={editMode ? 'Novo secret (vazio = manter atual)' : undefined}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Nome do Operador">
                <input style={ss.input} value={str('operatorName')} onChange={setStr('operatorName')} readOnly={!editMode} />
              </Field>
              <Field label="E-mail do Operador">
                <input style={ss.input} type="email" value={str('operatorEmail')} onChange={setStr('operatorEmail')} readOnly={!editMode} />
              </Field>
            </div>
          </Section>

          {/* ── Motor de Scan ───────────────────────────────────────────── */}
          <Section title="Motor de Scan" subtitle="Concorrência de workers e limite de páginas">
            <div style={ss.grid3}>
              <Field label="Concorrência" hint="Número de workers paralelos (1–20)">
                <input
                  style={ss.input}
                  type="number"
                  min={1} max={20}
                  value={num('concurrency') || ''}
                  onChange={setNum('concurrency')}
                  readOnly={!editMode}
                />
              </Field>
              <Field label="Delta Page Limit" hint="Máx. páginas por delta de lista">
                <input
                  style={ss.input}
                  type="number"
                  min={1000} max={100000} step={1000}
                  value={num('deltaPageLimit') || ''}
                  onChange={setNum('deltaPageLimit')}
                  readOnly={!editMode}
                />
              </Field>
              <Field label="Preço por TB/mês (R$)" hint="Usado para cálculo de custo estimado">
                <input
                  style={ss.input}
                  type="number"
                  min={0} step={0.01}
                  value={num('pricePerTbMonth') || ''}
                  onChange={setNum('pricePerTbMonth')}
                  readOnly={!editMode}
                />
              </Field>
            </div>
          </Section>

          {/* ── Versões Automáticas ──────────────────────────────────────── */}
          <Section title="Versões Automáticas" subtitle="Coleta automática de histórico de versões">
            <div style={ss.grid3}>
              <Field label="Modo de Versões">
                {editMode
                  ? (
                    <select style={ss.select} value={str('versionsAuto')} onChange={setStr('versionsAuto')}>
                      <option value="top">Top N maiores arquivos</option>
                      <option value="all">Todos os arquivos</option>
                      <option value="none">Desabilitado</option>
                    </select>
                  )
                  : <input style={ss.input} value={str('versionsAuto')} readOnly />
                }
              </Field>
              <Field label="Top N arquivos" hint="Relevante quando modo = top">
                <input
                  style={ss.input}
                  type="number" min={1} max={100000}
                  value={num('versionsAutoTopN') || ''}
                  onChange={setNum('versionsAutoTopN')}
                  readOnly={!editMode}
                />
              </Field>
              <Field label="Máx. Itens">
                <input
                  style={ss.input}
                  type="number" min={1}
                  value={num('versionsAutoMaxItems') || ''}
                  onChange={setNum('versionsAutoMaxItems')}
                  readOnly={!editMode}
                />
              </Field>
              <Field label="Concorrência de Versões">
                <input
                  style={ss.input}
                  type="number" min={1} max={20}
                  value={num('versionsAutoConcurrency') || ''}
                  onChange={setNum('versionsAutoConcurrency')}
                  readOnly={!editMode}
                />
              </Field>
              <Field label="Batch Size">
                <input
                  style={ss.input}
                  type="number" min={1}
                  value={num('versionsBatchSize') || ''}
                  onChange={setNum('versionsBatchSize')}
                  readOnly={!editMode}
                />
              </Field>
              <Field label="Forçar Re-enriquecimento">
                <label style={ss.checkRow}>
                  <input
                    type="checkbox"
                    checked={bool('versionsAutoForce')}
                    onChange={setBool('versionsAutoForce')}
                    disabled={!editMode}
                    style={{ marginRight: 6 }}
                  />
                  <span style={{ fontSize: 13, color: C.text }}>Enriquecer mesmo se já processado</span>
                </label>
              </Field>
            </div>
          </Section>

          {/* ── Workers de Versão ────────────────────────────────────────── */}
          <Section title="Workers de Versão" subtitle="Processos paralelos dedicados ao enriquecimento de versões" defaultOpen={false}>
            <div style={ss.grid3}>
              <Field label="Usar Version Workers">
                <label style={ss.checkRow}>
                  <input
                    type="checkbox"
                    checked={bool('useVersionWorker')}
                    onChange={setBool('useVersionWorker')}
                    disabled={!editMode}
                    style={{ marginRight: 6 }}
                  />
                  <span style={{ fontSize: 13, color: C.text }}>Habilitado</span>
                </label>
              </Field>
              <Field label="Número de Workers" hint="1–8 (requer app registrations adicionais)">
                <input
                  style={ss.input}
                  type="number" min={1} max={8}
                  value={num('nVersionWorkers') || ''}
                  onChange={setNum('nVersionWorkers')}
                  readOnly={!editMode}
                  disabled={!bool('useVersionWorker')}
                />
              </Field>
            </div>
          </Section>

          {/* ── Branding ─────────────────────────────────────────────────── */}
          <Section title="Branding da Tela de Login" subtitle="Título e subtítulo exibidos na página de login" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Título da tela de login">
                <input style={ss.input} value={str('brandingLoginTitle')} onChange={setStr('brandingLoginTitle')} readOnly={!editMode} />
              </Field>
              <Field label="Subtítulo da tela de login">
                <input style={ss.input} value={str('brandingLoginSubtitle')} onChange={setStr('brandingLoginSubtitle')} readOnly={!editMode} />
              </Field>
            </div>
          </Section>

          {/* Barra de ações inferior (modo edição) */}
          {editMode && (
            <div style={ss.actionBar}>
              <button style={ss.btnDanger} onClick={handleCancel}>Cancelar</button>
              <button style={ss.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? '…' : '💾 Salvar Configurações'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const ss: Record<string, React.CSSProperties> = {
  page: { padding: '0 0 40px' },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 10,
  },
  h1:  { margin: 0, fontSize: 22, fontWeight: 800, color: C.text },
  sub: { margin: '2px 0 0', fontSize: 13, color: C.muted, display: 'flex', alignItems: 'center', gap: 8 },
  adminBadge: {
    display: 'inline-block',
    padding: '1px 7px',
    background: '#ebf8ff',
    color: C.accent,
    border: `1px solid #90cdf4`,
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
  },

  // Feedback
  errorBox: {
    background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 4,
    padding: '10px 14px', color: '#c53030', fontSize: 13, marginBottom: 12,
  },
  successBox: {
    background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 4,
    padding: '10px 14px', color: '#276749', fontSize: 13, marginBottom: 12,
    fontWeight: 600,
  },
  infoBox: {
    background: '#fffaf0', border: '1px solid #fbd38d', borderRadius: 4,
    padding: '10px 14px', color: '#c05621', fontSize: 13, marginBottom: 12,
  },

  // Section accordion
  section: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    overflow: 'hidden',
  },
  sectionHead: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: '#f7f9fc',
    border: 'none',
    borderBottom: `1px solid ${C.border}`,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: C.text },
  sectionSub:   { fontSize: 12, color: C.muted, marginTop: 1 },
  sectionBody:  { padding: '16px' },

  // Fields
  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '12px 16px',
  },
  grid3: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px 16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  hint: { fontSize: 11, color: C.muted, marginTop: 1 },
  input: {
    padding: '6px 9px',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    color: C.text,
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '6px 9px',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'inherit',
    background: '#fff',
    color: C.text,
    width: '100%',
    cursor: 'pointer',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },

  // Buttons
  btnPrimary: {
    padding: '6px 16px',
    background: C.accent,
    color: '#fff',
    border: `1px solid ${C.accent}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnDanger: {
    padding: '6px 16px',
    background: '#fff',
    color: C.bad,
    border: `1px solid ${C.bad}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  actionBar: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 4,
  },

  // Loading
  spinWrap: { display: 'flex', justifyContent: 'center', padding: '40px 0' },
  spinner: {
    width: 28, height: 28,
    border: `3px solid ${C.border}`,
    borderTopColor: C.accent,
    borderRadius: '50%',
    animation: 'st-spin .7s linear infinite',
  },
};
