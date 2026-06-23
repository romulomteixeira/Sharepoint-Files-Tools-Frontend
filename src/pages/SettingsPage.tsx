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
  getSchedule,
  getWorkersHealth,
  getSessionInfo,
  diagnoseAuth,
  saveConfig,
  saveSchedule,
  searchOauthGroups,
  validateOauthGroups,
  type AppConfig,
  type AuthDiagnosis,
  type GraphExtraApp,
  type OauthGroup,
  type OauthGroupValidationResult,
  type SchedulerConfig,
  type SchedulerState,
  type WorkersHealth,
} from '../api/settings.api';
import { listScans } from '../api/scans.api';
import { getInventorySites } from '../api/inventory.api';
import { enrichVersions } from '../api/versions.api';
import type { Scan, SiteRollup } from '../types';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: 'var(--bg)', panel: 'var(--panel)', border: 'var(--border)',
  accent: 'var(--accent)', text: 'var(--text)', muted: 'var(--muted)',
  good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)',
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

function parseGroupEntries(value: string): OauthGroup[] {
  const seen = new Set<string>();
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const separator = line.indexOf('|');
      const id = (separator >= 0 ? line.slice(0, separator) : line).trim();
      const name = (separator >= 0 ? line.slice(separator + 1) : line).trim();
      return { id, name: name || id };
    })
    .filter(group => {
      const key = group.id.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function serializeGroupEntries(groups: OauthGroup[]): string {
  return groups.map(group => `${group.id}|${group.name || group.id}`).join('\n');
}

function redactSecrets(config: AppConfig): AppConfig {
  return {
    ...config,
    clientSecret: '',
    oauthClientSecret: '',
    smtpPass: '',
    graphExtraApps: (config.graphExtraApps ?? []).map(app => ({
      ...app,
      clientSecret: '',
      hasClientSecret: app.hasClientSecret || Boolean(app.clientSecret),
    })),
  };
}

function validateVersionWorkerDraft(config: AppConfig): void {
  if (!config.useVersionWorker) return;
  const count = Math.max(1, Math.min(16, Math.trunc(Number(config.nVersionWorkers) || 1)));
  const requiredApps = Math.max(0, count - 1);
  const apps = config.graphExtraApps ?? [];

  for (let index = 0; index < requiredApps; index += 1) {
    const app = apps[index];
    if (!app?.clientId?.trim() || (!app.clientSecret?.trim() && !app.hasClientSecret)) {
      throw new Error(`Preencha Client ID e Client Secret do Worker ${index + 2}.`);
    }
  }
}

function validateScanWorkerDraft(config: AppConfig): void {
  const count = Math.max(1, Math.min(16, Math.trunc(Number(config.scanWorkers) || 1)));
  if (count <= 1) return;
  const requiredApps = count - 1;
  const apps = config.graphExtraApps ?? [];

  for (let index = 0; index < requiredApps; index += 1) {
    const app = apps[index];
    if (!app?.clientId?.trim() || (!app.clientSecret?.trim() && !app.hasClientSecret)) {
      throw new Error(`Scan Worker ${index + 2}: preencha Client ID e Client Secret no pool de App Registrations.`);
    }
  }
}

function versionModeLabel(mode: string): string {
  if (mode === 'none') return 'Não calcular automaticamente';
  if (mode === 'all') return 'Todos (muito lento)';
  return 'Somente Top arquivos (recomendado)';
}

const DEFAULT_SCHEDULE: SchedulerConfig = {
  normal: {
    enabled: false,
    freq: 'daily',
    time: '02:00',
    weekdays: [1, 2, 3, 4, 5],
    allSites: true,
    siteSearch: '*',
    maxSites: 5000,
  },
  versions: {
    enabled: false,
    freq: 'daily',
    time: '03:00',
    weekdays: [1, 2, 3, 4, 5],
    target: 'latest',
    mode: 'top',
    topN: 25000,
    maxItems: 999999999,
    force: false,
  },
};

const WEEKDAYS = [
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

function normalizeSchedule(schedule?: Partial<SchedulerConfig>): SchedulerConfig {
  return {
    normal: { ...DEFAULT_SCHEDULE.normal, ...(schedule?.normal ?? {}) },
    versions: { ...DEFAULT_SCHEDULE.versions, ...(schedule?.versions ?? {}) },
  };
}

function validateSchedule(schedule: SchedulerConfig): void {
  if (schedule.normal.enabled && schedule.normal.freq === 'weekly' && schedule.normal.weekdays.length === 0) {
    throw new Error('Selecione ao menos um dia para o scan normal semanal.');
  }
  if (schedule.versions.enabled && schedule.versions.freq === 'weekly' && schedule.versions.weekdays.length === 0) {
    throw new Error('Selecione ao menos um dia para o scan de versões semanal.');
  }
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
  const [groupQuery, setGroupQuery] = useState('');
  const [groupResults, setGroupResults] = useState<OauthGroup[]>([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const [groupValidation, setGroupValidation] = useState<OauthGroupValidationResult | null>(null);
  const [validatingGroups, setValidatingGroups] = useState(false);
  const [authDiagnosis, setAuthDiagnosis] = useState<AuthDiagnosis | null>(null);
  const [workersHealth, setWorkersHealth] = useState<WorkersHealth | null>(null);
  const [diagnosingAuth, setDiagnosingAuth] = useState(false);
  const [checkingWorkers, setCheckingWorkers] = useState(false);
  const [schedule, setSchedule] = useState<SchedulerConfig>(DEFAULT_SCHEDULE);
  const [scheduleDraft, setScheduleDraft] = useState<SchedulerConfig>(DEFAULT_SCHEDULE);
  const [scheduleState, setScheduleState] = useState<SchedulerState>({});
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  // ── Enriquecimento de versões (Configurações > Enriquecimento de Versões) ──
  const [enrichScans, setEnrichScans] = useState<Scan[]>([]);
  const [enrichScanId, setEnrichScanId] = useState<string>('');
  const [enrichSites, setEnrichSites] = useState<SiteRollup[]>([]);
  const [enrichSelectedSites, setEnrichSelectedSites] = useState<Set<string>>(new Set());
  const [enrichLoadingSites, setEnrichLoadingSites] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mount: sessão + config ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([getSessionInfo(), getConfig(), getSchedule()])
      .then(([session, cfg, scheduler]) => {
        const normalizedSchedule = normalizeSchedule(scheduler.schedule);
        setIsAdmin(session.role === 'admin');
        setConfig(cfg);
        setDraft(cfg);
        setSchedule(normalizedSchedule);
        setScheduleDraft(normalizedSchedule);
        setScheduleState(scheduler.state ?? {});
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
      validateVersionWorkerDraft(draft);
      validateScanWorkerDraft(draft);
      await saveConfig(draft);
      const savedConfig = redactSecrets(draft);
      setConfig(savedConfig);
      setDraft(savedConfig);
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
    setScheduleDraft(schedule);
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

  const versionWorkerCount = Math.max(1, Math.min(16, Math.trunc(num('nVersionWorkers') || 1)));
  const requiredExtraApps = bool('useVersionWorker') ? Math.max(0, versionWorkerCount - 1) : 0;

  const updateGraphExtraApp = (index: number, patch: Partial<GraphExtraApp>) => {
    setDraft(current => {
      const apps = [...(current.graphExtraApps ?? config?.graphExtraApps ?? [])];
      while (apps.length <= index) apps.push({ clientId: '', clientSecret: '' });
      apps[index] = { ...apps[index], ...patch };
      return { ...current, graphExtraApps: apps };
    });
  };

  const handleVersionWorkerCount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = Math.max(1, Math.min(16, Math.trunc(Number(e.target.value) || 1)));
    setDraft(current => {
      const apps = [...(current.graphExtraApps ?? config?.graphExtraApps ?? [])];
      while (apps.length < Math.max(0, count - 1)) apps.push({ clientId: '', clientSecret: '' });
      return { ...current, nVersionWorkers: count, graphExtraApps: apps };
    });
  };

  const scanWorkerCount = Math.max(1, Math.min(16, Math.trunc(num('scanWorkers') || 1)));
  const scanRequiredExtraApps = Math.max(0, scanWorkerCount - 1);

  const handleScanWorkerCount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = Math.max(1, Math.min(16, Math.trunc(Number(e.target.value) || 1)));
    setDraft(current => {
      const apps = [...(current.graphExtraApps ?? config?.graphExtraApps ?? [])];
      while (apps.length < Math.max(0, count - 1)) apps.push({ clientId: '', clientSecret: '' });
      return { ...current, scanWorkers: count, graphExtraApps: apps };
    });
  };

  const handleDiagnoseAuth = async () => {
    setDiagnosingAuth(true);
    setError(null);
    try {
      setAuthDiagnosis(await diagnoseAuth());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setDiagnosingAuth(false);
    }
  };

  const handleWorkersHealth = async () => {
    setCheckingWorkers(true);
    setError(null);
    try {
      setWorkersHealth(await getWorkersHealth());
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setCheckingWorkers(false);
    }
  };

  // ── Enriquecimento de versões ──────────────────────────────────────────────
  useEffect(() => {
    listScans().then(setEnrichScans).catch(() => setEnrichScans([]));
  }, []);

  const handleSelectEnrichScan = async (scanId: string) => {
    setEnrichScanId(scanId);
    setEnrichSelectedSites(new Set());
    setEnrichSites([]);
    setEnrichMsg(null);
    if (!scanId) return;
    setEnrichLoadingSites(true);
    try {
      const res = await getInventorySites(scanId, { pageSize: 500 });
      setEnrichSites(res.items ?? []);
    } catch (e) {
      setEnrichMsg({ ok: false, text: `Falha ao carregar sites: ${String((e as Error)?.message ?? e)}` });
    } finally {
      setEnrichLoadingSites(false);
    }
  };

  const toggleEnrichSite = (siteId: string) => {
    setEnrichSelectedSites((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId); else next.add(siteId);
      return next;
    });
  };

  const runEnrich = async (siteIds?: string[]) => {
    if (!enrichScanId) return;
    setEnrichBusy(true);
    setEnrichMsg(null);
    try {
      const r = await enrichVersions({ scanId: enrichScanId, siteIds });
      const escopo = siteIds && siteIds.length ? `${siteIds.length} site(s)` : 'todos os sites (FULL)';
      setEnrichMsg({ ok: true, text: `Enriquecimento enfileirado (${escopo}): ${r.total.toLocaleString('pt-BR')} arquivo(s). Job ${r.jobId}. Se houver scan em execução, aguarda na fila.` });
    } catch (e) {
      setEnrichMsg({ ok: false, text: `Falha ao enfileirar: ${String((e as Error)?.message ?? e)}` });
    } finally {
      setEnrichBusy(false);
    }
  };

  const updateSchedule = <K extends keyof SchedulerConfig>(
    key: K,
    patch: Partial<SchedulerConfig[K]>,
  ) => {
    setScheduleDraft(current => ({
      ...current,
      [key]: { ...current[key], ...patch },
    }));
  };

  const toggleScheduleWeekday = (key: keyof SchedulerConfig, weekday: number) => {
    const currentDays = scheduleDraft[key].weekdays;
    updateSchedule(key, {
      weekdays: currentDays.includes(weekday)
        ? currentDays.filter(day => day !== weekday)
        : [...currentDays, weekday],
    });
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    setScheduleSaved(false);
    setError(null);
    try {
      validateSchedule(scheduleDraft);
      await saveSchedule(scheduleDraft);
      const refreshed = await getSchedule();
      const normalizedSchedule = normalizeSchedule(refreshed.schedule);
      setSchedule(normalizedSchedule);
      setScheduleDraft(normalizedSchedule);
      setScheduleState(refreshed.state ?? {});
      setScheduleSaved(true);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSavingSchedule(false);
    }
  };

  const addOauthGroup = (key: 'oauthReaderGroups' | 'oauthAdminGroups', group: OauthGroup) => {
    setDraft(current => {
      const groups = parseGroupEntries(String(current[key] ?? config?.[key] ?? ''));
      if (!groups.some(item => item.id.toLowerCase() === group.id.toLowerCase())) groups.push(group);
      return { ...current, [key]: serializeGroupEntries(groups) };
    });
    setGroupValidation(null);
  };

  const handleGroupSearch = async () => {
    setGroupSearching(true);
    setError(null);
    try {
      setGroupResults(await searchOauthGroups(groupQuery));
    } catch (e) {
      setGroupResults([]);
      setError(String((e as Error)?.message ?? e));
    } finally {
      setGroupSearching(false);
    }
  };

  const handleValidateGroups = async (saveFirst = false) => {
    setValidatingGroups(true);
    setError(null);
    try {
      if (saveFirst) await saveConfig(draft);
      const result = await validateOauthGroups({
        tenantId: str('tenantId'),
        clientId: str('clientId'),
        clientSecret: str('clientSecret'),
        oauthTenantId: str('oauthTenantId'),
        oauthClientId: str('oauthClientId'),
        oauthClientSecret: str('oauthClientSecret'),
        oauthReaderGroups: str('oauthReaderGroups'),
        oauthAdminGroups: str('oauthAdminGroups'),
      });
      setGroupValidation(result);
      if (saveFirst) {
        const savedConfig = redactSecrets(draft);
        setConfig(savedConfig);
        setDraft(savedConfig);
        setSaved(true);
      }
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setValidatingGroups(false);
    }
  };

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
      {scheduleSaved && <div style={ss.successBox}>✓ Agendamentos salvos com sucesso.</div>}
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

          {/* ── OAuth / OpenID Connect ──────────────────────────────────── */}
          <Section
            title="OAuth2 / OpenID Connect"
            subtitle="Login Microsoft, domínios e perfis por grupos do Entra ID"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label style={ss.checkRow}>
                <input
                  type="checkbox"
                  checked={bool('oauthEnabled')}
                  onChange={setBool('oauthEnabled')}
                  disabled={!editMode}
                  style={{ marginRight: 6 }}
                />
                <span style={{ fontSize: 13, color: C.text }}>
                  Habilitar autenticação Microsoft na tela inicial
                </span>
              </label>

              <div style={ss.grid2}>
                <Field label="Tenant OAuth" hint="Vazio = usa o Tenant ID da App Registration principal">
                  <input aria-label="Tenant OAuth" style={ss.input} value={str('oauthTenantId')} onChange={setStr('oauthTenantId')} readOnly={!editMode} />
                </Field>
                <Field label="Client ID OAuth" hint="Vazio = usa o Client ID principal">
                  <input aria-label="Client ID OAuth" style={ss.input} value={str('oauthClientId')} onChange={setStr('oauthClientId')} readOnly={!editMode} />
                </Field>
                <Field label="Client Secret OAuth" hint="Deixe vazio para manter o secret atual ou usar o principal">
                  <input
                    style={ss.input}
                    type="password"
                    aria-label="Client Secret OAuth"
                    value={str('oauthClientSecret')}
                    onChange={setStr('oauthClientSecret')}
                    readOnly={!editMode}
                    placeholder={editMode ? 'Novo secret (vazio = manter atual)' : '••••••••'}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Texto do botão Microsoft">
                  <input aria-label="Texto do botão Microsoft" style={ss.input} value={str('oauthButtonLabel')} onChange={setStr('oauthButtonLabel')} readOnly={!editMode} />
                </Field>
                <Field label="Redirect URI" hint="Cadastre como plataforma Web no Entra ID; não use SPA">
                  <input
                    style={{ ...ss.input, fontFamily: 'monospace' }}
                    aria-label="Redirect URI"
                    value={`${window.location.origin}/api/session/oauth/callback`}
                    readOnly
                  />
                </Field>
                <Field label="Domínios permitidos" hint="Separados por vírgula">
                  <input aria-label="Domínios permitidos" style={ss.input} value={str('oauthAllowedDomains')} onChange={setStr('oauthAllowedDomains')} readOnly={!editMode} />
                </Field>
                <Field label="E-mails administradores" hint="Separados por vírgula">
                  <input aria-label="E-mails administradores" style={ss.input} value={str('oauthAdminEmails')} onChange={setStr('oauthAdminEmails')} readOnly={!editMode} />
                </Field>
              </div>

              <div style={ss.groupSearch}>
                <Field label="Buscar grupo no Entra ID" hint="Pesquisa por nome para preencher os perfis abaixo">
                  <div style={ss.inlineRow}>
                    <input
                      style={ss.input}
                      aria-label="Buscar grupo no Entra ID"
                      value={groupQuery}
                      onChange={e => setGroupQuery(e.target.value)}
                      readOnly={!editMode}
                      placeholder="Ex.: SharePoint Administradores"
                    />
                    <button
                      type="button"
                      style={ss.btnSecondary}
                      onClick={handleGroupSearch}
                      disabled={!editMode || groupSearching}
                    >
                      {groupSearching ? 'Buscando…' : 'Buscar grupos'}
                    </button>
                  </div>
                </Field>
                {groupResults.length > 0 && (
                  <div style={ss.groupResults}>
                    {groupResults.map(group => (
                      <div key={group.id} style={ss.groupResult}>
                        <div>
                          <strong>{group.name || group.id}</strong>
                          <div style={ss.monoHint}>{group.id}</div>
                        </div>
                        <div style={ss.inlineRow}>
                          <button type="button" style={ss.btnSecondary} onClick={() => addOauthGroup('oauthReaderGroups', group)}>
                            + Leitura
                          </button>
                          <button type="button" style={ss.btnPrimary} onClick={() => addOauthGroup('oauthAdminGroups', group)}>
                            + Admin
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={ss.grid2}>
                <Field label="Grupos com acesso de leitura" hint="Um Group ID por linha; nome opcional no formato ID|Nome">
                  <textarea
                    style={{ ...ss.input, minHeight: 110, fontFamily: 'monospace' }}
                    aria-label="Grupos com acesso de leitura"
                    value={str('oauthReaderGroups')}
                    onChange={setStr('oauthReaderGroups')}
                    readOnly={!editMode}
                  />
                </Field>
                <Field label="Grupos com acesso de administrador" hint="Um Group ID por linha; nome opcional no formato ID|Nome">
                  <textarea
                    style={{ ...ss.input, minHeight: 110, fontFamily: 'monospace' }}
                    aria-label="Grupos com acesso de administrador"
                    value={str('oauthAdminGroups')}
                    onChange={setStr('oauthAdminGroups')}
                    readOnly={!editMode}
                  />
                </Field>
              </div>

              {editMode && (
                <div style={ss.inlineRow}>
                  <button type="button" style={ss.btnSecondary} onClick={() => handleValidateGroups(false)} disabled={validatingGroups}>
                    {validatingGroups ? 'Validando…' : 'Validar grupos'}
                  </button>
                  <button type="button" style={ss.btnPrimary} onClick={() => handleValidateGroups(true)} disabled={validatingGroups}>
                    Salvar e validar grupos
                  </button>
                </div>
              )}

              <div style={groupValidation?.ok ? ss.validationOk : ss.validationBox}>
                <strong>
                  {groupValidation
                    ? `${groupValidation.summary.valid} válido(s), ${groupValidation.summary.invalid} inválido(s)`
                    : 'Nenhuma validação de grupos executada.'}
                </strong>
                {groupValidation && [...groupValidation.reader, ...groupValidation.admin].map(item => (
                  <div key={`${item.role}-${item.id}`} style={ss.validationRow}>
                    <span>{item.role === 'admin' ? 'Administrador' : 'Leitura'}: {item.name || item.id}</span>
                    <span style={{ color: item.exists ? C.good : C.bad }}>
                      {item.exists ? 'Válido' : item.error || 'Não localizado'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── SMTP ────────────────────────────────────────────────────── */}
          <Section title="SMTP" subtitle="Envio de primeiro acesso, redefinição e notificações" defaultOpen={false}>
            <div style={ss.grid2}>
              <Field label="SMTP Host">
                <input aria-label="SMTP Host" style={ss.input} value={str('smtpHost')} onChange={setStr('smtpHost')} readOnly={!editMode} placeholder="smtp.seudominio.com" />
              </Field>
              <Field label="SMTP Porta">
                <input aria-label="SMTP Porta" style={ss.input} type="number" min={1} max={65535} value={num('smtpPort') || 587} onChange={setNum('smtpPort')} readOnly={!editMode} />
              </Field>
              <Field label="SMTP Usuário" hint="Opcional quando o servidor não exige autenticação">
                <input aria-label="SMTP Usuário" style={ss.input} value={str('smtpUser')} onChange={setStr('smtpUser')} readOnly={!editMode} autoComplete="username" />
              </Field>
              <Field label="SMTP Senha" hint="Deixe vazio para manter a senha atual">
                <input
                  style={ss.input}
                  type="password"
                  aria-label="SMTP Senha"
                  value={str('smtpPass')}
                  onChange={setStr('smtpPass')}
                  readOnly={!editMode}
                  placeholder={editMode ? 'Nova senha (vazio = manter atual)' : '••••••••'}
                  autoComplete="new-password"
                />
              </Field>
              <Field label="SMTP Remetente (From)">
                <input aria-label="SMTP Remetente (From)" style={ss.input} type="email" value={str('smtpFrom')} onChange={setStr('smtpFrom')} readOnly={!editMode} placeholder="no-reply@dominio.com" />
              </Field>
              <Field label="Segurança da conexão" hint="Marque para SMTPS/TLS direto, normalmente porta 465. Desmarcado permite STARTTLS, normalmente porta 587.">
                <label style={ss.checkRow}>
                  <input
                    type="checkbox"
                    checked={bool('smtpSecure')}
                    onChange={setBool('smtpSecure')}
                    disabled={!editMode}
                    style={{ marginRight: 6 }}
                  />
                  <span style={{ fontSize: 13, color: C.text }}>Usar TLS direto (SMTPS)</span>
                </label>
              </Field>
            </div>
          </Section>

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

          {/* ── Scheduler ───────────────────────────────────────────────── */}
          <Section title="Agendamento (Scheduler)" subtitle="Execução server-side mesmo com o navegador fechado" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={ss.infoInline}>
                Última execução: scan normal <strong>{scheduleState.lastRun?.normal || '—'}</strong>
                {' · '}
                versões <strong>{scheduleState.lastRun?.versions || '—'}</strong>.
                Se já houver um scan em andamento, o scheduler aguarda.
              </div>

              <div style={ss.grid2}>
                <div style={ss.scheduleCard}>
                  <strong>Scan normal</strong>
                  <label style={ss.checkRow}>
                    <input
                      aria-label="Habilitar scan normal agendado"
                      type="checkbox"
                      checked={scheduleDraft.normal.enabled}
                      onChange={event => updateSchedule('normal', { enabled: event.target.checked })}
                      disabled={!editMode}
                    />
                    <span style={ss.checkText}>Habilitar</span>
                  </label>
                  <div style={ss.grid2}>
                    <Field label="Frequência">
                      <select
                        aria-label="Frequência do scan normal"
                        style={ss.select}
                        value={scheduleDraft.normal.freq}
                        onChange={event => updateSchedule('normal', { freq: event.target.value as 'daily' | 'weekly' })}
                        disabled={!editMode}
                      >
                        <option value="daily">Diário</option>
                        <option value="weekly">Semanal</option>
                      </select>
                    </Field>
                    <Field label="Hora">
                      <input
                        aria-label="Hora do scan normal"
                        style={ss.input}
                        type="time"
                        value={scheduleDraft.normal.time}
                        onChange={event => updateSchedule('normal', { time: event.target.value })}
                        readOnly={!editMode}
                      />
                    </Field>
                  </div>
                  {scheduleDraft.normal.freq === 'weekly' && (
                    <div style={ss.weekdays}>
                      {WEEKDAYS.map(day => (
                        <label key={day.value} style={ss.checkRow}>
                          <input
                            aria-label={`${day.label} no scan normal`}
                            type="checkbox"
                            checked={scheduleDraft.normal.weekdays.includes(day.value)}
                            onChange={() => toggleScheduleWeekday('normal', day.value)}
                            disabled={!editMode}
                          />
                          <span style={ss.checkText}>{day.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <label style={ss.checkRow}>
                    <input
                      aria-label="Todos os sites no scan agendado"
                      type="checkbox"
                      checked={scheduleDraft.normal.allSites}
                      onChange={event => updateSchedule('normal', { allSites: event.target.checked })}
                      disabled={!editMode}
                    />
                    <span style={ss.checkText}>Todos os sites</span>
                  </label>
                  <div style={ss.grid2}>
                    <Field label="Busca">
                      <input
                        aria-label="Busca do scan agendado"
                        style={ss.input}
                        value={scheduleDraft.normal.siteSearch}
                        onChange={event => updateSchedule('normal', { siteSearch: event.target.value })}
                        readOnly={!editMode}
                      />
                    </Field>
                    <Field label="Máx. sites">
                      <input
                        aria-label="Máximo de sites do scan agendado"
                        style={ss.input}
                        type="number"
                        min={1}
                        max={50000}
                        value={scheduleDraft.normal.maxSites}
                        onChange={event => updateSchedule('normal', { maxSites: Number(event.target.value) })}
                        readOnly={!editMode}
                      />
                    </Field>
                  </div>
                </div>

                <div style={ss.scheduleCard}>
                  <strong>Scan de versões</strong>
                  <label style={ss.checkRow}>
                    <input
                      aria-label="Habilitar scan de versões agendado"
                      type="checkbox"
                      checked={scheduleDraft.versions.enabled}
                      onChange={event => updateSchedule('versions', { enabled: event.target.checked })}
                      disabled={!editMode}
                    />
                    <span style={ss.checkText}>Habilitar</span>
                  </label>
                  <div style={ss.grid2}>
                    <Field label="Frequência">
                      <select
                        aria-label="Frequência do scan de versões"
                        style={ss.select}
                        value={scheduleDraft.versions.freq}
                        onChange={event => updateSchedule('versions', { freq: event.target.value as 'daily' | 'weekly' })}
                        disabled={!editMode}
                      >
                        <option value="daily">Diário</option>
                        <option value="weekly">Semanal</option>
                      </select>
                    </Field>
                    <Field label="Hora">
                      <input
                        aria-label="Hora do scan de versões"
                        style={ss.input}
                        type="time"
                        value={scheduleDraft.versions.time}
                        onChange={event => updateSchedule('versions', { time: event.target.value })}
                        readOnly={!editMode}
                      />
                    </Field>
                  </div>
                  {scheduleDraft.versions.freq === 'weekly' && (
                    <div style={ss.weekdays}>
                      {WEEKDAYS.map(day => (
                        <label key={day.value} style={ss.checkRow}>
                          <input
                            aria-label={`${day.label} no scan de versões`}
                            type="checkbox"
                            checked={scheduleDraft.versions.weekdays.includes(day.value)}
                            onChange={() => toggleScheduleWeekday('versions', day.value)}
                            disabled={!editMode}
                          />
                          <span style={ss.checkText}>{day.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div style={ss.grid2}>
                    <Field label="Modo">
                      <select
                        aria-label="Modo do scan de versões agendado"
                        style={ss.select}
                        value={scheduleDraft.versions.mode}
                        onChange={event => updateSchedule('versions', { mode: event.target.value as 'top' | 'all' })}
                        disabled={!editMode}
                      >
                        <option value="top">Top arquivos</option>
                        <option value="all">Todos até o limite</option>
                      </select>
                    </Field>
                    {scheduleDraft.versions.mode === 'top' ? (
                      <Field label="Top N">
                        <input
                          aria-label="Top N do scan de versões agendado"
                          style={ss.input}
                          type="number"
                          min={10}
                          max={25000}
                          value={scheduleDraft.versions.topN}
                          onChange={event => updateSchedule('versions', { topN: Number(event.target.value) })}
                          readOnly={!editMode}
                        />
                      </Field>
                    ) : (
                      <Field label="Limite">
                        <input
                          aria-label="Limite do scan de versões agendado"
                          style={ss.input}
                          type="number"
                          min={1}
                          max={999999999}
                          value={scheduleDraft.versions.maxItems}
                          onChange={event => updateSchedule('versions', { maxItems: Number(event.target.value) })}
                          readOnly={!editMode}
                        />
                      </Field>
                    )}
                  </div>
                  <label style={ss.checkRow}>
                    <input
                      aria-label="Recalcular versões no agendamento"
                      type="checkbox"
                      checked={scheduleDraft.versions.force}
                      onChange={event => updateSchedule('versions', { force: event.target.checked })}
                      disabled={!editMode}
                    />
                    <span style={ss.checkText}>Recalcular (force)</span>
                  </label>
                  <div style={ss.hint}>Executa sempre sobre o último scan finalizado.</div>
                </div>
              </div>

              {editMode && (
                <div style={ss.inlineRow}>
                  <button type="button" style={ss.btnPrimary} onClick={handleSaveSchedule} disabled={savingSchedule}>
                    {savingSchedule ? 'Salvando…' : 'Salvar agendamentos'}
                  </button>
                </div>
              )}
            </div>
          </Section>

          {/* ── Versões Automáticas ──────────────────────────────────────── */}
          <Section title="Versões Automáticas" subtitle="Coleta automática de histórico de versões">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={ss.grid3}>
                <Field label="Modelo de versionamento">
                {editMode
                  ? (
                    <select aria-label="Modelo de versionamento" style={ss.select} value={str('versionsAuto')} onChange={setStr('versionsAuto')}>
                      <option value="none">Não calcular automaticamente</option>
                      <option value="top">Somente Top arquivos (recomendado)</option>
                      <option value="all">Todos (muito lento)</option>
                    </select>
                  )
                  : <input aria-label="Modelo de versionamento" style={ss.input} value={versionModeLabel(str('versionsAuto'))} readOnly />
                }
                </Field>
                {str('versionsAuto') === 'top' && (
                  <Field label="Top N arquivos" hint="Quantidade de maiores arquivos que terão o histórico calculado">
                    <input
                      aria-label="Top N arquivos"
                      style={ss.input}
                      type="number" min={10} max={25000}
                      value={num('versionsAutoTopN') || 25000}
                      onChange={setNum('versionsAutoTopN')}
                      readOnly={!editMode}
                    />
                  </Field>
                )}
                {str('versionsAuto') === 'all' && (
                  <Field label="Máx. itens (Todos)" hint="Proteção operacional para o modo Todos">
                    <input
                      aria-label="Máx. itens (Todos)"
                      style={ss.input}
                      type="number" min={100} max={999999999}
                      value={num('versionsAutoMaxItems') || 999999999}
                      onChange={setNum('versionsAutoMaxItems')}
                      readOnly={!editMode}
                    />
                  </Field>
                )}
              </div>

              {str('versionsAuto') !== 'none' && (
                <div style={ss.grid3}>
                  <Field label="Conc" hint="Requisições paralelas de histórico (1–6)">
                    <input
                      aria-label="Concorrência de versões"
                      style={ss.input}
                      type="number" min={1} max={6}
                      value={num('versionsAutoConcurrency') || 6}
                      onChange={setNum('versionsAutoConcurrency')}
                      readOnly={!editMode}
                    />
                  </Field>
                  <Field label="Batch" hint="Itens agrupados por lote (1–20)">
                    <input
                      aria-label="Batch de versões"
                      style={ss.input}
                      type="number" min={1} max={20}
                      value={num('versionsBatchSize') || 10}
                      onChange={setNum('versionsBatchSize')}
                      readOnly={!editMode}
                    />
                  </Field>
                  <Field label="Recalcular (force)" hint="Ignora o estado processado e enriquece novamente">
                    <label style={ss.checkRow}>
                      <input
                        type="checkbox"
                        checked={bool('versionsAutoForce')}
                        onChange={setBool('versionsAutoForce')}
                        disabled={!editMode}
                        style={{ marginRight: 6 }}
                      />
                      <span style={{ fontSize: 13, color: C.text }}>Forçar novo cálculo</span>
                    </label>
                  </Field>
                </div>
              )}

              {str('versionsAuto') === 'none' && (
                <div style={ss.infoInline}>
                  O scan não iniciará enriquecimento automático de versões. O cálculo ainda poderá ser executado manualmente.
                </div>
              )}
            </div>
          </Section>

          {/* ── Enriquecimento de Versões ─────────────────────────────────── */}
          <Section title="Enriquecimento de Versões" subtitle="Selecione um scan e enriqueça as versões dos arquivos — completo (FULL) ou por site (parcial)" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={ss.infoInline}>
                Busca no MS-Graph a contagem e o tamanho das versões dos arquivos do scan. Entra na <strong>fila sequencial</strong>: se houver um scan em execução, aguarda para não estourar o throttling do Graph. Só arquivos ainda sem versão são processados (re-disparo não duplica).
              </div>
              <div style={ss.grid3}>
                <Field label="Scan" hint="Scan de referência">
                  <select
                    aria-label="Selecionar scan para enriquecimento"
                    style={ss.input}
                    value={enrichScanId}
                    onChange={(e) => handleSelectEnrichScan(e.target.value)}
                    disabled={!isAdmin || enrichBusy}
                  >
                    <option value="">— selecione —</option>
                    {enrichScans.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id.slice(0, 8)} — {new Date(s.createdAt).toLocaleString('pt-BR')}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {enrichScanId && (
                <>
                  <div style={ss.inlineRow}>
                    <button type="button" style={ss.btnPrimary} disabled={!isAdmin || enrichBusy} onClick={() => runEnrich()}>
                      {enrichBusy ? 'Enfileirando…' : 'Enriquecer TUDO (FULL)'}
                    </button>
                    <button
                      type="button"
                      style={ss.btnSecondary}
                      disabled={!isAdmin || enrichBusy || enrichSelectedSites.size === 0}
                      onClick={() => runEnrich([...enrichSelectedSites])}
                    >
                      Enriquecer sites selecionados ({enrichSelectedSites.size})
                    </button>
                  </div>

                  {enrichLoadingSites && <div style={ss.infoInline}>Carregando sites…</div>}

                  {!enrichLoadingSites && enrichSites.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
                      {enrichSites.map((site) => (
                        <label key={site.siteId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text }}>
                          <input
                            type="checkbox"
                            checked={enrichSelectedSites.has(site.siteId)}
                            onChange={() => toggleEnrichSite(site.siteId)}
                            disabled={!isAdmin || enrichBusy}
                          />
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {site.siteName || site.siteId}
                          </span>
                          <span style={{ color: C.muted, fontSize: 12 }}>{site.totalFiles.toLocaleString('pt-BR')} arq.</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {enrichMsg && (
                    <div style={enrichMsg.ok ? ss.validationOk : ss.diagnosticError}>{enrichMsg.text}</div>
                  )}
                </>
              )}
            </div>
          </Section>

          {/* ── Workers de Scan ──────────────────────────────────────────── */}
          <Section title="Workers de Scan" subtitle="Processos paralelos que aceleram a varredura de sites/drives (1 por App Registration do pool)" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={ss.infoInline}>
                Mais workers = mais paralelismo na varredura. Cada worker usa uma App Registration distinta do <strong>pool compartilhado</strong> (o mesmo dos Version Workers): o Worker 1 usa a App principal e cada worker adicional usa uma app extra abaixo.
                O ganho é limitado pelo throttling do Microsoft Graph (por tenant/recurso) — distribuir entre apps ajuda só até certo ponto.
              </div>
              <div style={ss.grid3}>
                <Field label="Scan Workers" hint="Quantidade total de processos (1–16)">
                  <input
                    aria-label="Número de Scan Workers"
                    style={ss.input}
                    type="number" min={1} max={16}
                    value={scanWorkerCount}
                    onChange={handleScanWorkerCount}
                    readOnly={!editMode}
                  />
                </Field>
              </div>

              {scanRequiredExtraApps === 0 && (
                <div style={ss.validationOk}>Apenas o Worker 1 será usado com a App Registration principal.</div>
              )}

              {scanRequiredExtraApps > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={ss.validationBox}>
                    {scanWorkerCount} Scan Workers exigem {scanRequiredExtraApps} app(s) extra(s) no pool, uma para cada Worker 2 até Worker {scanWorkerCount}. As credenciais são compartilhadas com os Version Workers (Worker N = mesma App Registration).
                  </div>
                  {Array.from({ length: scanRequiredExtraApps }, (_, index) => {
                    const app = (draft.graphExtraApps ?? config?.graphExtraApps ?? [])[index] ?? { clientId: '' };
                    const workerNumber = index + 2;
                    return (
                      <div key={workerNumber} style={ss.workerCard}>
                        <div style={ss.workerHead}>
                          <strong>Worker {workerNumber}</strong>
                          <span style={ss.workerPill}>GRAPH_EXTRA_APPS[{index}]</span>
                        </div>
                        <div style={ss.grid3}>
                          <Field label="Label" hint="Nome amigável da Enterprise App">
                            <input
                              aria-label={`Label do Scan Worker ${workerNumber}`}
                              style={ss.input}
                              value={app.label ?? ''}
                              onChange={e => updateGraphExtraApp(index, { label: e.target.value })}
                              readOnly={!editMode}
                              placeholder={`app-worker-${workerNumber}`}
                            />
                          </Field>
                          <Field label="Client ID">
                            <input
                              aria-label={`Client ID do Scan Worker ${workerNumber}`}
                              style={ss.input}
                              value={app.clientId ?? ''}
                              onChange={e => updateGraphExtraApp(index, { clientId: e.target.value })}
                              readOnly={!editMode}
                            />
                          </Field>
                          <Field
                            label="Client Secret"
                            hint={app.hasClientSecret ? 'Secret já salvo. Deixe vazio para manter.' : 'Cole o Secret VALUE.'}
                          >
                            <input
                              aria-label={`Client Secret do Scan Worker ${workerNumber}`}
                              style={ss.input}
                              type="password"
                              value={app.clientSecret ?? ''}
                              onChange={e => updateGraphExtraApp(index, { clientSecret: e.target.value })}
                              readOnly={!editMode}
                              placeholder={app.hasClientSecret ? '••••••••' : 'Secret VALUE'}
                              autoComplete="new-password"
                            />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={ss.inlineRow}>
                <button type="button" style={ss.btnSecondary} onClick={handleWorkersHealth} disabled={checkingWorkers}>
                  {checkingWorkers ? 'Consultando…' : 'Verificar Scan Workers'}
                </button>
              </div>

              {workersHealth?.scanWorker && (
                <div style={!workersHealth.scanWorker.configError ? ss.validationOk : ss.diagnosticError}>
                  <strong>
                    Scan Workers: {workersHealth.scanWorker.heartbeatCount}/{workersHealth.scanWorker.expected} heartbeat(s)
                  </strong>
                  <div>Processos locais: {workersHealth.scanWorker.localProcessCount}</div>
                  <div>Apps no pool: {workersHealth.scanWorker.extraAppsConfigured}</div>
                  {workersHealth.scanWorker.configError && <div>{workersHealth.scanWorker.configError}</div>}
                </div>
              )}
            </div>
          </Section>

          {/* ── Workers de Versão ────────────────────────────────────────── */}
          <Section title="Workers de Versão" subtitle="Processos paralelos dedicados ao enriquecimento de versões" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={ss.infoInline}>
                <strong>Desabilitado:</strong> o enriquecimento roda no processo web legado.{' '}
                <strong>Habilitado:</strong> as cargas entram na fila persistente e são consumidas por processos Node separados no backend.
                O Worker 1 usa a App Registration principal; cada worker adicional exige uma Enterprise App abaixo.
              </div>
              <div style={ss.grid3}>
                <Field label="USE_VERSION_WORKER">
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
                <Field label="N_VERSION_WORKERS" hint="Quantidade total de processos (1–16)">
                  <input
                    aria-label="Número de Version Workers"
                    style={ss.input}
                    type="number" min={1} max={16}
                    value={versionWorkerCount}
                    onChange={handleVersionWorkerCount}
                    readOnly={!editMode}
                    disabled={!bool('useVersionWorker')}
                  />
                </Field>
              </div>

              {bool('useVersionWorker') && requiredExtraApps === 0 && (
                <div style={ss.validationOk}>Apenas o Worker 1 será usado com a App Registration principal.</div>
              )}

              {bool('useVersionWorker') && requiredExtraApps > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={ss.validationBox}>
                    N_VERSION_WORKERS={versionWorkerCount} exige {requiredExtraApps} app(s) extra(s), uma para cada Worker 2 até Worker {versionWorkerCount}.
                  </div>
                  {Array.from({ length: requiredExtraApps }, (_, index) => {
                    const app = (draft.graphExtraApps ?? config?.graphExtraApps ?? [])[index] ?? { clientId: '' };
                    const workerNumber = index + 2;
                    return (
                      <div key={workerNumber} style={ss.workerCard}>
                        <div style={ss.workerHead}>
                          <strong>Worker {workerNumber}</strong>
                          <span style={ss.workerPill}>GRAPH_EXTRA_APPS[{index}]</span>
                        </div>
                        <div style={ss.grid3}>
                          <Field label="Label" hint="Nome amigável da Enterprise App">
                            <input
                              aria-label={`Label do Worker ${workerNumber}`}
                              style={ss.input}
                              value={app.label ?? ''}
                              onChange={e => updateGraphExtraApp(index, { label: e.target.value })}
                              readOnly={!editMode}
                              placeholder={`app-worker-${workerNumber}`}
                            />
                          </Field>
                          <Field label="Client ID">
                            <input
                              aria-label={`Client ID do Worker ${workerNumber}`}
                              style={ss.input}
                              value={app.clientId ?? ''}
                              onChange={e => updateGraphExtraApp(index, { clientId: e.target.value })}
                              readOnly={!editMode}
                            />
                          </Field>
                          <Field
                            label="Client Secret"
                            hint={app.hasClientSecret ? 'Secret já salvo. Deixe vazio para manter.' : 'Cole o Secret VALUE.'}
                          >
                            <input
                              aria-label={`Client Secret do Worker ${workerNumber}`}
                              style={ss.input}
                              type="password"
                              value={app.clientSecret ?? ''}
                              onChange={e => updateGraphExtraApp(index, { clientSecret: e.target.value })}
                              readOnly={!editMode}
                              placeholder={app.hasClientSecret ? '••••••••' : 'Secret VALUE'}
                              autoComplete="new-password"
                            />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={ss.inlineRow}>
                <button type="button" style={ss.btnSecondary} onClick={handleDiagnoseAuth} disabled={diagnosingAuth}>
                  {diagnosingAuth ? 'Diagnosticando…' : 'Diagnosticar conexão Graph'}
                </button>
                <button type="button" style={ss.btnSecondary} onClick={handleWorkersHealth} disabled={checkingWorkers}>
                  {checkingWorkers ? 'Consultando…' : 'Verificar Version Workers'}
                </button>
              </div>

              {authDiagnosis && (
                <div style={authDiagnosis.ok ? ss.validationOk : ss.diagnosticError}>
                  <strong>{authDiagnosis.ok ? 'Conexão Graph válida' : 'Falha na conexão Graph'}</strong>
                  {authDiagnosis.org && <div>Tenant: {authDiagnosis.org.displayName || '—'} ({authDiagnosis.org.id || '—'})</div>}
                  {authDiagnosis.authority?.tokenUrl && <div style={ss.monoHint}>Token: {authDiagnosis.authority.tokenUrl}</div>}
                  {authDiagnosis.openid?.ok && <div style={ss.monoHint}>OpenID issuer: {authDiagnosis.openid.issuer}</div>}
                  {!authDiagnosis.openid?.ok && authDiagnosis.openid?.error && <div>OpenID: {authDiagnosis.openid.error}</div>}
                  {authDiagnosis.aad?.aadsts && <div>AADSTS: {authDiagnosis.aad.aadsts}</div>}
                  {authDiagnosis.error && <div>{authDiagnosis.error}</div>}
                  {authDiagnosis.tenantFormatHint && <div>{authDiagnosis.tenantFormatHint}</div>}
                </div>
              )}

              {workersHealth?.versionWorker && (
                <div style={!workersHealth.versionWorker.configError ? ss.validationOk : ss.diagnosticError}>
                  <strong>
                    Version Workers: {workersHealth.versionWorker.heartbeatCount}/{workersHealth.versionWorker.expected} heartbeat(s)
                  </strong>
                  <div>Processos locais: {workersHealth.versionWorker.localProcessCount}</div>
                  <div>Enterprise Apps extras válidas: {workersHealth.versionWorker.extraAppsConfigured}</div>
                  {workersHealth.versionWorker.extraAppsInvalid > 0 && (
                    <div>Enterprise Apps inválidas: {workersHealth.versionWorker.extraAppsInvalid}</div>
                  )}
                  {workersHealth.versionWorker.configError && <div>{workersHealth.versionWorker.configError}</div>}
                </div>
              )}
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
  checkText: { marginLeft: 6, fontSize: 13, color: C.text },
  weekdays: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  scheduleCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    background: '#f7f9fc',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
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
  btnSecondary: {
    padding: '6px 12px',
    background: '#fff',
    color: C.accent,
    border: `1px solid ${C.accent}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },

  inlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  groupSearch: {
    padding: 12,
    background: '#f7f9fc',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
  },
  groupResults: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 10,
  },
  groupResult: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '8px 10px',
    background: '#fff',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
  },
  monoHint: {
    marginTop: 2,
    color: C.muted,
    fontFamily: 'monospace',
    fontSize: 11,
  },
  validationBox: {
    padding: '10px 12px',
    background: '#f7f9fc',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.muted,
    fontSize: 12,
  },
  validationOk: {
    padding: '10px 12px',
    background: '#f0fff4',
    border: '1px solid #9ae6b4',
    borderRadius: 4,
    color: C.good,
    fontSize: 12,
  },
  diagnosticError: {
    padding: '10px 12px',
    background: '#fff5f5',
    border: '1px solid #fca5a5',
    borderRadius: 4,
    color: C.bad,
    fontSize: 12,
  },
  validationRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 6,
  },
  infoInline: {
    padding: '10px 12px',
    background: '#ebf8ff',
    border: '1px solid #90cdf4',
    borderRadius: 4,
    color: '#2c5282',
    fontSize: 12,
    lineHeight: 1.5,
  },
  workerCard: {
    padding: 12,
    background: '#f7f9fc',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
  },
  workerHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  workerPill: {
    padding: '2px 7px',
    background: '#edf2f7',
    border: `1px solid ${C.border}`,
    borderRadius: 999,
    color: C.muted,
    fontFamily: 'monospace',
    fontSize: 10,
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
