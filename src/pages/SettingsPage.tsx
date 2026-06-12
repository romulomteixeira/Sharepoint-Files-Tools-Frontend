import React, { useEffect, useRef, useState } from 'react';
import {
  getConfig, getSchedule, getWorkersHealth, getSessionInfo,
  diagnoseAuth, saveConfig, saveSchedule, searchOauthGroups, validateOauthGroups,
  type AppConfig, type AuthDiagnosis, type GraphExtraApp, type OauthGroup,
  type OauthGroupValidationResult, type SchedulerConfig, type SchedulerState, type WorkersHealth,
} from '../api/settings.api';

// ── Sub-componentes ───────────────────────────────────────────────────────────

function Section({ title, subtitle, children, defaultOpen = true }: { title: string; subtitle: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="accordion-section">
      <button className="accordion-head" onClick={() => setOpen(o => !o)} type="button">
        <div>
          <div className="accordion-title">{title}</div>
          <div className="small muted">{subtitle}</div>
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-2)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

function parseGroupEntries(value: string): OauthGroup[] {
  const seen = new Set<string>();
  return value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const sep = line.indexOf('|');
    const id = (sep >= 0 ? line.slice(0, sep) : line).trim();
    const name = (sep >= 0 ? line.slice(sep + 1) : line).trim();
    return { id, name: name || id };
  }).filter(group => { const key = group.id.toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

function serializeGroupEntries(groups: OauthGroup[]): string {
  return groups.map(group => `${group.id}|${group.name || group.id}`).join('\n');
}

function redactSecrets(config: AppConfig): AppConfig {
  return { ...config, clientSecret: '', oauthClientSecret: '', smtpPass: '',
    graphExtraApps: (config.graphExtraApps ?? []).map(app => ({ ...app, clientSecret: '', hasClientSecret: app.hasClientSecret || Boolean(app.clientSecret) })) };
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

function versionModeLabel(mode: string): string {
  if (mode === 'none') return 'Não calcular automaticamente';
  if (mode === 'all') return 'Todos (muito lento)';
  return 'Somente Top arquivos (recomendado)';
}

const DEFAULT_SCHEDULE: SchedulerConfig = {
  normal: { enabled: false, freq: 'daily', time: '02:00', weekdays: [1, 2, 3, 4, 5], allSites: true, siteSearch: '*', maxSites: 5000 },
  versions: { enabled: false, freq: 'daily', time: '03:00', weekdays: [1, 2, 3, 4, 5], target: 'latest', mode: 'top', topN: 25000, maxItems: 999999999, force: false },
};

const WEEKDAYS = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];

function normalizeSchedule(schedule?: Partial<SchedulerConfig>): SchedulerConfig {
  return {
    normal: { ...DEFAULT_SCHEDULE.normal, ...(schedule?.normal ?? {}) },
    versions: { ...DEFAULT_SCHEDULE.versions, ...(schedule?.versions ?? {}) },
  };
}

function validateSchedule(schedule: SchedulerConfig): void {
  if (schedule.normal.enabled && schedule.normal.freq === 'weekly' && schedule.normal.weekdays.length === 0) throw new Error('Selecione ao menos um dia para o scan normal semanal.');
  if (schedule.versions.enabled && schedule.versions.freq === 'weekly' && schedule.versions.weekdays.length === 0) throw new Error('Selecione ao menos um dia para o scan de versões semanal.');
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function SettingsPage(): React.ReactElement {
  const [config, setConfig]   = useState<AppConfig | null>(null);
  const [draft, setDraft]     = useState<AppConfig>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
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
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getSessionInfo(), getConfig(), getSchedule()])
      .then(([session, cfg, scheduler]) => {
        const ns = normalizeSchedule(scheduler.schedule);
        setIsAdmin(session.role === 'admin'); setConfig(cfg); setDraft(cfg);
        setSchedule(ns); setScheduleDraft(ns); setScheduleState(scheduler.state ?? {});
      })
      .catch(e => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      validateVersionWorkerDraft(draft);
      await saveConfig(draft);
      const savedConfig = redactSecrets(draft);
      setConfig(savedConfig); setDraft(savedConfig); setEditMode(false); setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3500);
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setSaving(false); }
  };

  const handleCancel = () => { setDraft(config ?? {}); setScheduleDraft(schedule); setEditMode(false); setError(null); };

  const str  = (key: keyof AppConfig) => String(draft[key] ?? config?.[key] ?? '');
  const num  = (key: keyof AppConfig) => Number(draft[key] ?? config?.[key] ?? 0);
  const bool = (key: keyof AppConfig) => Boolean(draft[key] ?? config?.[key]);
  const setStr  = (key: keyof AppConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft(d => ({ ...d, [key]: e.target.value }));
  const setNum  = (key: keyof AppConfig) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft(d => ({ ...d, [key]: Number(e.target.value) }));
  const setBool = (key: keyof AppConfig) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft(d => ({ ...d, [key]: e.target.checked }));

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

  const handleDiagnoseAuth = async () => {
    setDiagnosingAuth(true); setError(null);
    try { setAuthDiagnosis(await diagnoseAuth()); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setDiagnosingAuth(false); }
  };

  const handleWorkersHealth = async () => {
    setCheckingWorkers(true); setError(null);
    try { setWorkersHealth(await getWorkersHealth()); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setCheckingWorkers(false); }
  };

  const updateSchedule = <K extends keyof SchedulerConfig>(key: K, patch: Partial<SchedulerConfig[K]>) => {
    setScheduleDraft(current => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const toggleScheduleWeekday = (key: keyof SchedulerConfig, weekday: number) => {
    const currentDays = scheduleDraft[key].weekdays;
    updateSchedule(key, { weekdays: currentDays.includes(weekday) ? currentDays.filter(d => d !== weekday) : [...currentDays, weekday] });
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true); setScheduleSaved(false); setError(null);
    try {
      validateSchedule(scheduleDraft);
      await saveSchedule(scheduleDraft);
      const refreshed = await getSchedule();
      const ns = normalizeSchedule(refreshed.schedule);
      setSchedule(ns); setScheduleDraft(ns); setScheduleState(refreshed.state ?? {}); setScheduleSaved(true);
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setSavingSchedule(false); }
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
    setGroupSearching(true); setError(null);
    try { setGroupResults(await searchOauthGroups(groupQuery)); }
    catch (e) { setGroupResults([]); setError(String((e as Error)?.message ?? e)); }
    finally { setGroupSearching(false); }
  };

  const handleValidateGroups = async (saveFirst = false) => {
    setValidatingGroups(true); setError(null);
    try {
      if (saveFirst) await saveConfig(draft);
      const result = await validateOauthGroups({
        tenantId: str('tenantId'), clientId: str('clientId'), clientSecret: str('clientSecret'),
        oauthTenantId: str('oauthTenantId'), oauthClientId: str('oauthClientId'), oauthClientSecret: str('oauthClientSecret'),
        oauthReaderGroups: str('oauthReaderGroups'), oauthAdminGroups: str('oauthAdminGroups'),
      });
      setGroupValidation(result);
      if (saveFirst) { const savedConfig = redactSecrets(draft); setConfig(savedConfig); setDraft(savedConfig); setSaved(true); }
    } catch (e) { setError(String((e as Error)?.message ?? e)); }
    finally { setValidatingGroups(false); }
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Token Microsoft Graph, motor de scan, versões e branding
            {isAdmin && <span className="pill pill-info">Admin</span>}
          </p>
        </div>
        {isAdmin && !editMode && !loading && (
          <button type="button" className="btn btn-primary" onClick={() => setEditMode(true)}>Editar Configurações</button>
        )}
        {editMode && (
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={handleCancel}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '…' : 'Salvar'}</button>
          </div>
        )}
      </div>

      {/* Feedback */}
      {error && <div className="pill-bad" style={{ padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 12 }}>{error}</div>}
      {saved && <div className="pill-good" style={{ padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 12 }}>✓ Configurações salvas com sucesso.</div>}
      {scheduleSaved && <div className="pill-good" style={{ padding: '10px 14px', borderRadius: 'var(--r-sm)', marginBottom: 12 }}>✓ Agendamentos salvos com sucesso.</div>}
      {!isAdmin && !loading && (
        <div className="info-box" style={{ marginBottom: 12 }}>
          Você está visualizando as configurações em modo leitura. Apenas administradores podem alterar.
        </div>
      )}

      {loading && <div className="small muted" style={{ padding: '40px 0', textAlign: 'center' }}>Carregando configurações…</div>}

      {!loading && config && (
        <div className="stack" style={{ gap: 12 }}>

          {/* OAuth */}
          <Section title="OAuth2 / OpenID Connect" subtitle="Login Microsoft, domínios e perfis por grupos do Entra ID">
            <div className="stack" style={{ gap: 16 }}>
              <label className="check-row">
                <input type="checkbox" checked={bool('oauthEnabled')} onChange={setBool('oauthEnabled')} disabled={!editMode} style={{ accentColor: 'var(--accent)', marginRight: 6 }} />
                <span>Habilitar autenticação Microsoft na tela inicial</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px 16px' }}>
                <Field label="Tenant OAuth" hint="Vazio = usa o Tenant ID da App Registration principal"><input aria-label="Tenant OAuth" className="input" value={str('oauthTenantId')} onChange={setStr('oauthTenantId')} readOnly={!editMode} /></Field>
                <Field label="Client ID OAuth" hint="Vazio = usa o Client ID principal"><input aria-label="Client ID OAuth" className="input" value={str('oauthClientId')} onChange={setStr('oauthClientId')} readOnly={!editMode} /></Field>
                <Field label="Client Secret OAuth" hint="Deixe vazio para manter o secret atual ou usar o principal">
                  <input className="input" type="password" aria-label="Client Secret OAuth" value={str('oauthClientSecret')} onChange={setStr('oauthClientSecret')} readOnly={!editMode} placeholder={editMode ? 'Novo secret (vazio = manter atual)' : '••••••••'} autoComplete="new-password" />
                </Field>
                <Field label="Texto do botão Microsoft"><input aria-label="Texto do botão Microsoft" className="input" value={str('oauthButtonLabel')} onChange={setStr('oauthButtonLabel')} readOnly={!editMode} /></Field>
                <Field label="Redirect URI" hint="Cadastre como plataforma Web no Entra ID; não use SPA">
                  <input className="input mono" aria-label="Redirect URI" value={`${window.location.origin}/api/session/oauth/callback`} readOnly />
                </Field>
                <Field label="Domínios permitidos" hint="Separados por vírgula"><input aria-label="Domínios permitidos" className="input" value={str('oauthAllowedDomains')} onChange={setStr('oauthAllowedDomains')} readOnly={!editMode} /></Field>
                <Field label="E-mails administradores" hint="Separados por vírgula"><input aria-label="E-mails administradores" className="input" value={str('oauthAdminEmails')} onChange={setStr('oauthAdminEmails')} readOnly={!editMode} /></Field>
              </div>

              <div style={{ padding: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                <Field label="Buscar grupo no Entra ID" hint="Pesquisa por nome para preencher os perfis abaixo">
                  <div className="row">
                    <input className="input" style={{ flex: 1 }} aria-label="Buscar grupo no Entra ID" value={groupQuery} onChange={e => setGroupQuery(e.target.value)} readOnly={!editMode} placeholder="Ex.: SharePoint Administradores" />
                    <button type="button" className="btn btn-sm" onClick={handleGroupSearch} disabled={!editMode || groupSearching}>{groupSearching ? 'Buscando…' : 'Buscar grupos'}</button>
                  </div>
                </Field>
                {groupResults.length > 0 && (
                  <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                    {groupResults.map(group => (
                      <div key={group.id} className="row" style={{ padding: '8px 10px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                        <div>
                          <strong>{group.name || group.id}</strong>
                          <div className="mono small muted">{group.id}</div>
                        </div>
                        <div className="row">
                          <button type="button" className="btn btn-sm" onClick={() => addOauthGroup('oauthReaderGroups', group)}>+ Leitura</button>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => addOauthGroup('oauthAdminGroups', group)}>+ Admin</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px 16px' }}>
                <Field label="Grupos com acesso de leitura" hint="Um Group ID por linha; nome opcional no formato ID|Nome">
                  <textarea className="input mono" aria-label="Grupos com acesso de leitura" style={{ minHeight: 110 }} value={str('oauthReaderGroups')} onChange={setStr('oauthReaderGroups')} readOnly={!editMode} />
                </Field>
                <Field label="Grupos com acesso de administrador" hint="Um Group ID por linha; nome opcional no formato ID|Nome">
                  <textarea className="input mono" aria-label="Grupos com acesso de administrador" style={{ minHeight: 110 }} value={str('oauthAdminGroups')} onChange={setStr('oauthAdminGroups')} readOnly={!editMode} />
                </Field>
              </div>

              {editMode && (
                <div className="row">
                  <button type="button" className="btn btn-sm" onClick={() => handleValidateGroups(false)} disabled={validatingGroups}>{validatingGroups ? 'Validando…' : 'Validar grupos'}</button>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => handleValidateGroups(true)} disabled={validatingGroups}>Salvar e validar grupos</button>
                </div>
              )}

              <div style={{ padding: '10px 12px', background: groupValidation?.ok ? 'var(--good-bg)' : 'var(--panel-2)', border: `1px solid ${groupValidation?.ok ? 'var(--good-bd)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', color: groupValidation?.ok ? 'var(--good)' : 'var(--text-2)', fontSize: 'var(--fs-sm)' }}>
                <strong>{groupValidation ? `${groupValidation.summary.valid} válido(s), ${groupValidation.summary.invalid} inválido(s)` : 'Nenhuma validação de grupos executada.'}</strong>
                {groupValidation && [...groupValidation.reader, ...groupValidation.admin].map(item => (
                  <div key={`${item.role}-${item.id}`} className="row" style={{ paddingTop: 6 }}>
                    <span>{item.role === 'admin' ? 'Administrador' : 'Leitura'}: {item.name || item.id}</span>
                    <span style={{ color: item.exists ? 'var(--good)' : 'var(--bad)' }}>{item.exists ? 'Válido' : item.error || 'Não localizado'}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* SMTP */}
          <Section title="SMTP" subtitle="Envio de primeiro acesso, redefinição e notificações" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px 16px' }}>
              <Field label="SMTP Host"><input aria-label="SMTP Host" className="input" value={str('smtpHost')} onChange={setStr('smtpHost')} readOnly={!editMode} placeholder="smtp.seudominio.com" /></Field>
              <Field label="SMTP Porta"><input aria-label="SMTP Porta" className="input" type="number" min={1} max={65535} value={num('smtpPort') || 587} onChange={setNum('smtpPort')} readOnly={!editMode} /></Field>
              <Field label="SMTP Usuário" hint="Opcional quando o servidor não exige autenticação"><input aria-label="SMTP Usuário" className="input" value={str('smtpUser')} onChange={setStr('smtpUser')} readOnly={!editMode} autoComplete="username" /></Field>
              <Field label="SMTP Senha" hint="Deixe vazio para manter a senha atual">
                <input className="input" type="password" aria-label="SMTP Senha" value={str('smtpPass')} onChange={setStr('smtpPass')} readOnly={!editMode} placeholder={editMode ? 'Nova senha (vazio = manter atual)' : '••••••••'} autoComplete="new-password" />
              </Field>
              <Field label="SMTP Remetente (From)"><input aria-label="SMTP Remetente" className="input" type="email" value={str('smtpFrom')} onChange={setStr('smtpFrom')} readOnly={!editMode} placeholder="no-reply@dominio.com" /></Field>
              <Field label="Segurança da conexão" hint="Marque para SMTPS/TLS direto (porta 465). Desmarcado permite STARTTLS (porta 587).">
                <label className="check-row">
                  <input type="checkbox" checked={bool('smtpSecure')} onChange={setBool('smtpSecure')} disabled={!editMode} style={{ marginRight: 6, accentColor: 'var(--accent)' }} />
                  <span>Usar TLS direto (SMTPS)</span>
                </label>
              </Field>
            </div>
          </Section>

          {/* Graph */}
          <Section title="Credenciais Microsoft Graph" subtitle="Tenant ID, Client ID e credenciais de serviço">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px 16px' }}>
              <Field label="Tenant ID"><input className="input" value={str('tenantId')} onChange={setStr('tenantId')} readOnly={!editMode} /></Field>
              <Field label="Client ID (App Registration)"><input className="input" value={str('clientId')} onChange={setStr('clientId')} readOnly={!editMode} /></Field>
              <Field label="Client Secret" hint="Campo redactado. Preencha apenas para alterar.">
                <input className="input" type="password" value={editMode ? str('clientSecret') : '••••••••'} onChange={setStr('clientSecret')} readOnly={!editMode} placeholder={editMode ? 'Novo secret (vazio = manter atual)' : undefined} autoComplete="new-password" />
              </Field>
              <Field label="Nome do Operador"><input className="input" value={str('operatorName')} onChange={setStr('operatorName')} readOnly={!editMode} /></Field>
              <Field label="E-mail do Operador"><input className="input" type="email" value={str('operatorEmail')} onChange={setStr('operatorEmail')} readOnly={!editMode} /></Field>
            </div>
          </Section>

          {/* Motor */}
          <Section title="Motor de Scan" subtitle="Concorrência de workers e limite de páginas">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 16px' }}>
              <Field label="Concorrência" hint="Número de workers paralelos (1–20)"><input className="input" type="number" min={1} max={20} value={num('concurrency') || ''} onChange={setNum('concurrency')} readOnly={!editMode} /></Field>
              <Field label="Delta Page Limit" hint="Máx. páginas por delta de lista"><input className="input" type="number" min={1000} max={100000} step={1000} value={num('deltaPageLimit') || ''} onChange={setNum('deltaPageLimit')} readOnly={!editMode} /></Field>
              <Field label="Preço por TB/mês (R$)" hint="Usado para cálculo de custo estimado"><input className="input" type="number" min={0} step={0.01} value={num('pricePerTbMonth') || ''} onChange={setNum('pricePerTbMonth')} readOnly={!editMode} /></Field>
            </div>
          </Section>

          {/* Scheduler */}
          <Section title="Agendamento (Scheduler)" subtitle="Execução server-side mesmo com o navegador fechado" defaultOpen={false}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="info-box">
                Última execução: scan normal <strong>{scheduleState.lastRun?.normal || '—'}</strong> · versões <strong>{scheduleState.lastRun?.versions || '—'}</strong>. Se já houver um scan em andamento, o scheduler aguarda.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {(['normal', 'versions'] as const).map(key => (
                  <div key={key} className="stack" style={{ gap: 12, padding: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                    <strong>{key === 'normal' ? 'Scan normal' : 'Scan de versões'}</strong>
                    <label className="check-row">
                      <input aria-label={`Habilitar ${key}`} type="checkbox" checked={scheduleDraft[key].enabled}
                        onChange={e => updateSchedule(key, { enabled: e.target.checked })} disabled={!editMode} style={{ accentColor: 'var(--accent)' }} />
                      <span style={{ marginLeft: 6 }}>Habilitar</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Field label="Frequência">
                        <select className="select" value={scheduleDraft[key].freq} onChange={e => updateSchedule(key, { freq: e.target.value as 'daily' | 'weekly' })} disabled={!editMode}>
                          <option value="daily">Diário</option><option value="weekly">Semanal</option>
                        </select>
                      </Field>
                      <Field label="Hora">
                        <input className="input" type="time" value={scheduleDraft[key].time} onChange={e => updateSchedule(key, { time: e.target.value })} readOnly={!editMode} />
                      </Field>
                    </div>
                    {scheduleDraft[key].freq === 'weekly' && (
                      <div className="row" style={{ flexWrap: 'wrap' }}>
                        {WEEKDAYS.map(day => (
                          <label key={day.value} className="check-row">
                            <input type="checkbox" checked={scheduleDraft[key].weekdays.includes(day.value)} onChange={() => toggleScheduleWeekday(key, day.value)} disabled={!editMode} style={{ accentColor: 'var(--accent)' }} />
                            <span style={{ marginLeft: 4, fontSize: 'var(--fs-xs)' }}>{day.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {key === 'normal' && (
                      <>
                        <label className="check-row">
                          <input type="checkbox" checked={scheduleDraft.normal.allSites} onChange={e => updateSchedule('normal', { allSites: e.target.checked })} disabled={!editMode} style={{ accentColor: 'var(--accent)' }} />
                          <span style={{ marginLeft: 6 }}>Todos os sites</span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <Field label="Busca"><input className="input" value={scheduleDraft.normal.siteSearch} onChange={e => updateSchedule('normal', { siteSearch: e.target.value })} readOnly={!editMode} /></Field>
                          <Field label="Máx. sites"><input className="input" type="number" min={1} max={50000} value={scheduleDraft.normal.maxSites} onChange={e => updateSchedule('normal', { maxSites: Number(e.target.value) })} readOnly={!editMode} /></Field>
                        </div>
                      </>
                    )}
                    {key === 'versions' && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          <Field label="Modo">
                            <select className="select" value={scheduleDraft.versions.mode} onChange={e => updateSchedule('versions', { mode: e.target.value as 'top' | 'all' })} disabled={!editMode}>
                              <option value="top">Top arquivos</option><option value="all">Todos até o limite</option>
                            </select>
                          </Field>
                          {scheduleDraft.versions.mode === 'top' ? (
                            <Field label="Top N"><input className="input" type="number" min={10} max={25000} value={scheduleDraft.versions.topN} onChange={e => updateSchedule('versions', { topN: Number(e.target.value) })} readOnly={!editMode} /></Field>
                          ) : (
                            <Field label="Limite"><input className="input" type="number" min={1} max={999999999} value={scheduleDraft.versions.maxItems} onChange={e => updateSchedule('versions', { maxItems: Number(e.target.value) })} readOnly={!editMode} /></Field>
                          )}
                        </div>
                        <label className="check-row">
                          <input type="checkbox" checked={scheduleDraft.versions.force} onChange={e => updateSchedule('versions', { force: e.target.checked })} disabled={!editMode} style={{ accentColor: 'var(--accent)' }} />
                          <span style={{ marginLeft: 6 }}>Recalcular (force)</span>
                        </label>
                        <span className="small muted">Executa sempre sobre o último scan finalizado.</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {editMode && (
                <div className="row">
                  <button type="button" className="btn btn-primary" onClick={handleSaveSchedule} disabled={savingSchedule}>{savingSchedule ? 'Salvando…' : 'Salvar agendamentos'}</button>
                </div>
              )}
            </div>
          </Section>

          {/* Versões automáticas */}
          <Section title="Versões Automáticas" subtitle="Coleta automática de histórico de versões">
            <div className="stack" style={{ gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 16px' }}>
                <Field label="Modelo de versionamento">
                  {editMode ? (
                    <select aria-label="Modelo de versionamento" className="select" value={str('versionsAuto')} onChange={setStr('versionsAuto')}>
                      <option value="none">Não calcular automaticamente</option>
                      <option value="top">Somente Top arquivos (recomendado)</option>
                      <option value="all">Todos (muito lento)</option>
                    </select>
                  ) : <input aria-label="Modelo de versionamento" className="input" value={versionModeLabel(str('versionsAuto'))} readOnly />}
                </Field>
                {str('versionsAuto') === 'top' && (
                  <Field label="Top N arquivos" hint="Quantidade de maiores arquivos que terão o histórico calculado">
                    <input aria-label="Top N arquivos" className="input" type="number" min={10} max={25000} value={num('versionsAutoTopN') || 25000} onChange={setNum('versionsAutoTopN')} readOnly={!editMode} />
                  </Field>
                )}
                {str('versionsAuto') === 'all' && (
                  <Field label="Máx. itens (Todos)" hint="Proteção operacional para o modo Todos">
                    <input aria-label="Máx. itens" className="input" type="number" min={100} max={999999999} value={num('versionsAutoMaxItems') || 999999999} onChange={setNum('versionsAutoMaxItems')} readOnly={!editMode} />
                  </Field>
                )}
              </div>
              {str('versionsAuto') !== 'none' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 16px' }}>
                  <Field label="Conc" hint="Requisições paralelas de histórico (1–6)"><input aria-label="Concorrência de versões" className="input" type="number" min={1} max={6} value={num('versionsAutoConcurrency') || 6} onChange={setNum('versionsAutoConcurrency')} readOnly={!editMode} /></Field>
                  <Field label="Batch" hint="Itens agrupados por lote (1–20)"><input aria-label="Batch de versões" className="input" type="number" min={1} max={20} value={num('versionsBatchSize') || 10} onChange={setNum('versionsBatchSize')} readOnly={!editMode} /></Field>
                  <Field label="Recalcular (force)" hint="Ignora o estado processado e enriquece novamente">
                    <label className="check-row">
                      <input type="checkbox" checked={bool('versionsAutoForce')} onChange={setBool('versionsAutoForce')} disabled={!editMode} style={{ marginRight: 6, accentColor: 'var(--accent)' }} />
                      <span>Forçar novo cálculo</span>
                    </label>
                  </Field>
                </div>
              )}
              {str('versionsAuto') === 'none' && (
                <div className="info-box">O scan não iniciará enriquecimento automático de versões. O cálculo ainda poderá ser executado manualmente.</div>
              )}
            </div>
          </Section>

          {/* Workers de Versão */}
          <Section title="Workers de Versão" subtitle="Processos paralelos dedicados ao enriquecimento de versões" defaultOpen={false}>
            <div className="stack" style={{ gap: 14 }}>
              <div className="info-box">
                <strong>Desabilitado:</strong> o enriquecimento roda no processo web legado.{' '}
                <strong>Habilitado:</strong> as cargas entram na fila persistente e são consumidas por processos Node separados no backend.
                O Worker 1 usa a App Registration principal; cada worker adicional exige uma Enterprise App abaixo.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 16px' }}>
                <Field label="USE_VERSION_WORKER">
                  <label className="check-row">
                    <input type="checkbox" checked={bool('useVersionWorker')} onChange={setBool('useVersionWorker')} disabled={!editMode} style={{ marginRight: 6, accentColor: 'var(--accent)' }} />
                    <span>Habilitado</span>
                  </label>
                </Field>
                <Field label="N_VERSION_WORKERS" hint="Quantidade total de processos (1–16)">
                  <input aria-label="Número de Version Workers" className="input" type="number" min={1} max={16} value={versionWorkerCount} onChange={handleVersionWorkerCount} readOnly={!editMode} disabled={!bool('useVersionWorker')} />
                </Field>
              </div>

              {bool('useVersionWorker') && requiredExtraApps === 0 && (
                <div className="pill-good" style={{ padding: '10px 12px', borderRadius: 'var(--r-sm)' }}>Apenas o Worker 1 será usado com a App Registration principal.</div>
              )}

              {bool('useVersionWorker') && requiredExtraApps > 0 && (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="info-box">N_VERSION_WORKERS={versionWorkerCount} exige {requiredExtraApps} app(s) extra(s), uma para cada Worker 2 até Worker {versionWorkerCount}.</div>
                  {Array.from({ length: requiredExtraApps }, (_, index) => {
                    const app = (draft.graphExtraApps ?? config?.graphExtraApps ?? [])[index] ?? { clientId: '' };
                    const workerNumber = index + 2;
                    return (
                      <div key={workerNumber} style={{ padding: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
                        <div className="row" style={{ marginBottom: 10 }}>
                          <strong>Worker {workerNumber}</strong>
                          <span className="mono small muted" style={{ padding: '2px 7px', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 999 }}>GRAPH_EXTRA_APPS[{index}]</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px 16px' }}>
                          <Field label="Label" hint="Nome amigável da Enterprise App">
                            <input aria-label={`Label do Worker ${workerNumber}`} className="input" value={app.label ?? ''} onChange={e => updateGraphExtraApp(index, { label: e.target.value })} readOnly={!editMode} placeholder={`app-worker-${workerNumber}`} />
                          </Field>
                          <Field label="Client ID">
                            <input aria-label={`Client ID do Worker ${workerNumber}`} className="input" value={app.clientId ?? ''} onChange={e => updateGraphExtraApp(index, { clientId: e.target.value })} readOnly={!editMode} />
                          </Field>
                          <Field label="Client Secret" hint={app.hasClientSecret ? 'Secret já salvo. Deixe vazio para manter.' : 'Cole o Secret VALUE.'}>
                            <input aria-label={`Client Secret do Worker ${workerNumber}`} className="input" type="password" value={app.clientSecret ?? ''} onChange={e => updateGraphExtraApp(index, { clientSecret: e.target.value })} readOnly={!editMode} placeholder={app.hasClientSecret ? '••••••••' : 'Secret VALUE'} autoComplete="new-password" />
                          </Field>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="row">
                <button type="button" className="btn btn-sm" onClick={handleDiagnoseAuth} disabled={diagnosingAuth}>{diagnosingAuth ? 'Diagnosticando…' : 'Diagnosticar conexão Graph'}</button>
                <button type="button" className="btn btn-sm" onClick={handleWorkersHealth} disabled={checkingWorkers}>{checkingWorkers ? 'Consultando…' : 'Verificar Version Workers'}</button>
              </div>

              {authDiagnosis && (
                <div style={{ padding: '10px 12px', background: authDiagnosis.ok ? 'var(--good-bg)' : 'var(--bad-bg)', border: `1px solid ${authDiagnosis.ok ? 'var(--good-bd)' : 'var(--bad-bd)'}`, borderRadius: 'var(--r-sm)', color: authDiagnosis.ok ? 'var(--good)' : 'var(--bad)', fontSize: 'var(--fs-sm)' }}>
                  <strong>{authDiagnosis.ok ? 'Conexão Graph válida' : 'Falha na conexão Graph'}</strong>
                  {authDiagnosis.org && <div>Tenant: {authDiagnosis.org.displayName || '—'} ({authDiagnosis.org.id || '—'})</div>}
                  {authDiagnosis.authority?.tokenUrl && <div className="mono small muted">Token: {authDiagnosis.authority.tokenUrl}</div>}
                  {authDiagnosis.openid?.ok && <div className="mono small muted">OpenID issuer: {authDiagnosis.openid.issuer}</div>}
                  {!authDiagnosis.openid?.ok && authDiagnosis.openid?.error && <div>OpenID: {authDiagnosis.openid.error}</div>}
                  {authDiagnosis.aad?.aadsts && <div>AADSTS: {authDiagnosis.aad.aadsts}</div>}
                  {authDiagnosis.error && <div>{authDiagnosis.error}</div>}
                  {authDiagnosis.tenantFormatHint && <div>{authDiagnosis.tenantFormatHint}</div>}
                </div>
              )}

              {workersHealth?.versionWorker && (
                <div style={{ padding: '10px 12px', background: !workersHealth.versionWorker.configError ? 'var(--good-bg)' : 'var(--bad-bg)', border: `1px solid ${!workersHealth.versionWorker.configError ? 'var(--good-bd)' : 'var(--bad-bd)'}`, borderRadius: 'var(--r-sm)', color: !workersHealth.versionWorker.configError ? 'var(--good)' : 'var(--bad)', fontSize: 'var(--fs-sm)' }}>
                  <strong>Version Workers: {workersHealth.versionWorker.heartbeatCount}/{workersHealth.versionWorker.expected} heartbeat(s)</strong>
                  <div>Processos locais: {workersHealth.versionWorker.localProcessCount}</div>
                  <div>Enterprise Apps extras válidas: {workersHealth.versionWorker.extraAppsConfigured}</div>
                  {workersHealth.versionWorker.extraAppsInvalid > 0 && <div>Enterprise Apps inválidas: {workersHealth.versionWorker.extraAppsInvalid}</div>}
                  {workersHealth.versionWorker.configError && <div>{workersHealth.versionWorker.configError}</div>}
                </div>
              )}
            </div>
          </Section>

          {/* Branding */}
          <Section title="Branding da Tela de Login" subtitle="Título e subtítulo exibidos na página de login" defaultOpen={false}>
            <div className="stack" style={{ gap: 12 }}>
              <Field label="Título da tela de login"><input className="input" value={str('brandingLoginTitle')} onChange={setStr('brandingLoginTitle')} readOnly={!editMode} /></Field>
              <Field label="Subtítulo da tela de login"><input className="input" value={str('brandingLoginSubtitle')} onChange={setStr('brandingLoginSubtitle')} readOnly={!editMode} /></Field>
            </div>
          </Section>

          {/* Barra inferior */}
          {editMode && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-danger" onClick={handleCancel}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '…' : 'Salvar Configurações'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
