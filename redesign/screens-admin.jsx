/* screens-admin.jsx — Logs, Auditoria, Configurações (acordeão), Administração, Login */
const { useState: useStateG } = React;

/* ── Logs ───────────────────────────────────────────────────────────── */
function LogsScreen() {
  const { t, fmtDate } = useApp();
  const [level, setLevel] = useStateG('');
  const rows = level ? MOCK.logs.filter(function (l) { return l.level === level; }) : MOCK.logs;
  const pill = { info: 'pill-info', warn: 'pill-warn', error: 'pill-bad' };
  return (
    <div className="stack" data-screen-label="Logs">
      <PageHead title={t('lgTitle')} sub={t('lgSub')}>
        <Field label={t('level')}>
          <select className="select" value={level} onChange={function (e) { setLevel(e.target.value); }}>
            <option value="">{t('allLevels')}</option>
            <option value="info">info</option><option value="warn">warn</option><option value="error">error</option>
          </select>
        </Field>
        <label className="check-row small" style={{ height: 'var(--ctl-h)' }}>
          <input type="checkbox" defaultChecked={true} /> {t('auto')}
        </label>
        <Btn icon="refresh">{t('refresh')}</Btn>
      </PageHead>
      <Card>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>{t('when')}</th><th>{t('level')}</th><th>{t('source')}</th><th>{t('message')}</th><th>{t('scanJob')}</th></tr>
            </thead>
            <tbody>
              {rows.map(function (l, i) {
                return (
                  <tr key={i}>
                    <td className="td-mute small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.t)}</td>
                    <td><span className={'pill ' + pill[l.level]}>{l.level}</span></td>
                    <td className="td-mono td-mute">{l.src}</td>
                    <td className="td-ellipsis" style={{ maxWidth: 420 }}>{l.msg}</td>
                    <td className="td-mono td-mute">{l.ref}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Auditoria ──────────────────────────────────────────────────────── */
function AuditScreen() {
  const { t, fmtDate } = useApp();
  const actionPill = function (a) {
    if (a.indexOf('expurgo.execute') === 0) return 'pill-bad';
    if (a.indexOf('expurgo') === 0) return 'pill-warn';
    if (a.indexOf('settings') === 0 || a.indexOf('user') === 0) return 'pill-info';
    return 'pill-mute';
  };
  return (
    <div className="stack" data-screen-label="Auditoria">
      <PageHead title={t('auTitle')} sub={t('auSub')}>
        <Field label={t('userCol')}>
          <select className="select"><option>—</option>{MOCK.users.map(function (u) { return <option key={u.user}>{u.user}</option>; })}</select>
        </Field>
        <Btn icon="download">{t('exportCsv')}</Btn>
      </PageHead>
      <Card>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>{t('when')}</th><th>{t('userCol')}</th><th>{t('action')}</th><th>{t('target')}</th><th>{t('message')}</th></tr>
            </thead>
            <tbody>
              {MOCK.audit.map(function (a, i) {
                return (
                  <tr key={i}>
                    <td className="td-mute small" style={{ whiteSpace: 'nowrap' }}>{fmtDate(a.t)}</td>
                    <td style={{ fontWeight: 650 }}>{a.user}</td>
                    <td><span className={'pill ' + actionPill(a.action)}>{a.action}</span></td>
                    <td className="td-mono td-mute">{a.target}</td>
                    <td className="td-ellipsis" style={{ maxWidth: 380 }}>{a.msg}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Configurações (acordeão) ───────────────────────────────────────── */
function AccSection({ title, sub, defaultOpen, badge, children }) {
  const [open, setOpen] = useStateG(!!defaultOpen);
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button type="button"
              onClick={function () { setOpen(!open); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                       padding: 'var(--pad-card)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="card-title">{title}</span>
          <span className="card-sub">{sub}</span>
        </span>
        <span className="row" style={{ flexShrink: 0 }}>
          {badge ? badge : null}
          <span style={{ color: 'var(--faint)', display: 'grid', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>
            <ICONS.chevD size={15} />
          </span>
        </span>
      </button>
      {open ? (
        <div style={{ padding: 'var(--pad-card)', borderTop: '1px solid var(--border-soft)' }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SettingsScreen() {
  const { t } = useApp();
  const [editing, setEditing] = useStateG(false);
  const dis = !editing;
  return (
    <div className="stack" data-screen-label="Configurações">
      <PageHead title={t('cfTitle')} sub={t('cfSub')}>
        {editing
          ? <Btn icon="check" variant="primary" onClick={function () { setEditing(false); }}>{t('save')}</Btn>
          : <Btn icon="settings" onClick={function () { setEditing(true); }}>{t('edit')}</Btn>}
      </PageHead>

      <AccSection title={t('secOauth')} sub={t('secOauthSub')} defaultOpen={true}
                  badge={<span className="pill pill-good"><span className="dot"></span>{t('activeBadge')}</span>}>
        <div className="stack" style={{ gap: 14 }}>
          <label className="check-row"><input type="checkbox" defaultChecked={true} disabled={dis} /> {t('oauthEnable')}</label>
          <div className="grid-3">
            <Field label={t('tenantId')}><input className="input" disabled={dis} defaultValue="3f2a81c4-••••-••••-a9d2" /></Field>
            <Field label={t('clientId')}><input className="input" disabled={dis} defaultValue="8c14d0fe-••••-••••-b771" /></Field>
            <Field label={t('allowedDomains')}><input className="input" disabled={dis} defaultValue="empresa.com.br; empresa.com" /></Field>
          </div>
        </div>
      </AccSection>

      <AccSection title={t('secGraph')} sub={t('secGraphSub')} defaultOpen={true}
                  badge={<span className="pill pill-good"><ICONS.check size={11} /> {t('connOk')}</span>}>
        <div className="grid-3">
          <Field label={t('tenantId')}><input className="input" disabled={dis} defaultValue="3f2a81c4-••••-••••-a9d2" /></Field>
          <Field label={t('clientId')}><input className="input" disabled={dis} defaultValue="8c14d0fe-••••-••••-b771" /></Field>
          <Field label={t('clientSecret')}><input className="input" type="password" disabled={dis} defaultValue="secretsecret" /></Field>
        </div>
        <div style={{ marginTop: 14 }}><Btn icon="refresh">{t('testConn')}</Btn></div>
      </AccSection>

      <AccSection title={t('secEngine')} sub={t('secEngineSub')}>
        <div className="grid-3">
          <Field label={t('concurrency') + ' — ' + t('concurrencyHint')}><input className="input" type="number" disabled={dis} defaultValue="6" /></Field>
          <Field label={t('pageSize')}><input className="input" type="number" disabled={dis} defaultValue="999" /></Field>
          <Field label={t('maxPages')}><input className="input" type="number" disabled={dis} defaultValue="0" /></Field>
        </div>
      </AccSection>

      <AccSection title={t('secSched')} sub={t('secSchedSub')}>
        <div className="stack" style={{ gap: 14 }}>
          <label className="check-row"><input type="checkbox" defaultChecked={true} disabled={dis} /> {t('schedEnable')}</label>
          <div className="grid-3">
            <Field label={t('cron')}><input className="input mono" disabled={dis} defaultValue="0 22 * * 3" /></Field>
            <Field label={t('nextRun')}><input className="input" disabled={true} defaultValue="17/06/2026 22:00" /></Field>
            <Field label={t('mode')}>
              <select className="select" disabled={dis}><option>{t('withVersions')}</option><option>{t('noVersions')}</option></select>
            </Field>
          </div>
        </div>
      </AccSection>

      <AccSection title={t('secAutoV')} sub={t('secAutoVSub')}>
        <div className="grid-3">
          <Field label={t('versionsModel')}>
            <select className="select" disabled={dis} defaultValue="top">
              <option value="none">{t('vNone')}</option>
              <option value="top">{t('vTop')}</option>
              <option value="all">{t('vAll')}</option>
            </select>
          </Field>
          <Field label={t('topLimit')}><input className="input" type="number" disabled={dis} defaultValue="500" /></Field>
        </div>
      </AccSection>

      <AccSection title={t('secVWork')} sub={t('secVWorkSub')}>
        <div className="grid-3">
          <Field label={t('vWorkers') + ' — ' + t('vWorkersHint')}><input className="input" type="number" disabled={dis} defaultValue="3" /></Field>
          <Field label={t('timeout')}><input className="input" type="number" disabled={dis} defaultValue="120" /></Field>
        </div>
      </AccSection>

      <AccSection title={t('secSmtp')} sub={t('secSmtpSub')}>
        <div className="grid-3">
          <Field label={t('smtpHost')}><input className="input" disabled={dis} defaultValue="smtp.empresa.com.br" /></Field>
          <Field label={t('smtpPort')}><input className="input" type="number" disabled={dis} defaultValue="587" /></Field>
          <Field label={t('smtpFrom')}><input className="input" disabled={dis} defaultValue="no-reply@empresa.com.br" /></Field>
        </div>
      </AccSection>

      <AccSection title={t('secBrand')} sub={t('secBrandSub')}>
        <div className="two-col">
          <Field label={t('loginTitle2')}><input className="input" disabled={dis} defaultValue="SharePoint Monitor" /></Field>
          <Field label={t('loginSub2')}><input className="input" disabled={dis} defaultValue="Inventário • Consumo • Retenção" /></Field>
        </div>
      </AccSection>
    </div>
  );
}

/* ── Administração de Usuários ──────────────────────────────────────── */
function AdminScreen() {
  const { t } = useApp();
  const rolePill = { roleAdmin: 'pill-bad', roleOperator: 'pill-info', roleViewer: 'pill-mute' };
  return (
    <div className="stack" data-screen-label="Administração">
      <PageHead title={t('adTitle')} sub={t('adSub')}>
        <Btn icon="plus" variant="primary">{t('newUser')}</Btn>
      </PageHead>
      <Card>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>{t('username')}</th><th>{t('displayName')}</th><th>{t('role')}</th><th>{t('createdAt')}</th><th>{t('status')}</th><th>{t('actions')}</th></tr>
            </thead>
            <tbody>
              {MOCK.users.map(function (u, i) {
                return (
                  <tr key={u.user}>
                    <td className="td-mute" style={{ width: 34 }}>{i + 1}</td>
                    <td className="td-mono" style={{ fontWeight: 650 }}>{u.user}</td>
                    <td>{u.name}</td>
                    <td><span className={'pill ' + rolePill[u.role]}>{t(u.role)}</span></td>
                    <td className="td-mute small">{u.created}</td>
                    <td>{u.active
                      ? <span className="pill pill-good"><span className="dot"></span>{t('active')}</span>
                      : <span className="pill pill-mute"><span className="dot"></span>{t('restricted')}</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <Btn small icon="settings"></Btn>
                        <Btn small icon="lock"></Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Login (local + OAuth Microsoft + primeiro acesso) ──────────────── */
function LoginScreen({ onLogin }) {
  const { t } = useApp();
  const [mode, setMode] = useStateG('login'); // login | firstAccess
  return (
    <div className="login-wrap" data-screen-label="Login">
      <div className="login-card">
        <div className="row" style={{ gap: 12, marginBottom: 18 }}>
          <div className="logo" style={{ width: 44, height: 44, fontSize: 15 }}>SP</div>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--title-size)', fontWeight: 750 }}>SharePoint Monitor</h1>
            <p className="small muted" style={{ margin: '2px 0 0' }}>{t('brandTag')}</p>
          </div>
        </div>

        {mode === 'login' ? (
          <React.Fragment>
            <p className="small muted" style={{ margin: '0 0 16px' }}>{t('loginWelcome')}</p>
            <div className="stack" style={{ gap: 12 }}>
              <Field label={t('loginUser')}>
                <input className="input" defaultValue="mteixeira" autoComplete="username" />
              </Field>
              <Field label={t('loginPass')}>
                <input className="input" type="password" defaultValue="password" autoComplete="current-password" />
              </Field>
              <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: 'calc(var(--ctl-h) + 6px)' }} onClick={onLogin}>
                {t('loginBtn')}
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              <a className="td-link small" onClick={function () { setMode('firstAccess'); }}>{t('firstAccess')}</a>
            </div>

            <div className="row" style={{ margin: '16px 0 12px', gap: 10, flexWrap: 'nowrap' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border-soft)' }}></span>
              <span className="small faint">{t('orSep')}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border-soft)' }}></span>
            </div>
            <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', height: 'calc(var(--ctl-h) + 6px)', gap: 9 }} onClick={onLogin}>
              <svg width="15" height="15" viewBox="0 0 21 21" aria-hidden="true">
                <rect x="0" y="0" width="10" height="10" fill="#f25022"></rect>
                <rect x="11" y="0" width="10" height="10" fill="#7fba00"></rect>
                <rect x="0" y="11" width="10" height="10" fill="#00a4ef"></rect>
                <rect x="11" y="11" width="10" height="10" fill="#ffb900"></rect>
              </svg>
              {t('msLogin')}
            </button>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p className="small muted" style={{ margin: '0 0 16px' }}>{t('firstAccess')}</p>
            <div className="stack" style={{ gap: 12 }}>
              <Field label="E-mail">
                <input className="input" placeholder="admin@empresa.com.br" />
              </Field>
              <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', height: 'calc(var(--ctl-h) + 6px)' }} onClick={function () { setMode('login'); }}>
                {t('confirm')}
              </button>
              <div style={{ textAlign: 'center' }}>
                <a className="td-link small" onClick={function () { setMode('login'); }}>← {t('loginBtn')}</a>
              </div>
            </div>
          </React.Fragment>
        )}

        <p className="small faint" style={{ textAlign: 'center', margin: '16px 0 0' }}>
          <ICONS.lock size={11} style={{ verticalAlign: '-1px' }} /> {t('loginHint')}
        </p>
      </div>
    </div>
  );
}

Object.assign(window, { LogsScreen, AuditScreen, SettingsScreen, AdminScreen, LoginScreen });
