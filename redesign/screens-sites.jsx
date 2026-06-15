/* screens-sites.jsx — Realizar Scans, Sites (drill-down) e Progresso de Job */
const { useState: useStateW } = React;

/* ── Realizar Scans ─────────────────────────────────────────────────── */
function ScansScreen() {
  const { t, fmtNum, fmtBytes, fmtDate, go } = useApp();
  const [scope, setScope] = useStateW('all');
  const [sel, setSel] = useStateW(['projetos-engenharia', 'marketing']);
  const toggle = function (name) {
    setSel(function (cur) { return cur.includes(name) ? cur.filter(function (x) { return x !== name; }) : cur.concat([name]); });
  };

  return (
    <div className="stack" data-screen-label="Realizar Scans">
      <PageHead title={t('scTitle')} sub={t('scSub')} />

      <Card title={t('newScanPanel')}>
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--gap)' }}>
          <Field label={t('scope')} style={{ flex: '1 1 220px' }}>
            <select className="select" value={scope} onChange={function (e) { setScope(e.target.value); }}>
              <option value="all">{t('scopeAll')}</option>
              <option value="sel">{t('scopeSel')}</option>
            </select>
          </Field>
          <Field label={t('mode')} style={{ flex: '1 1 200px' }}>
            <select className="select">
              <option>{t('withVersions')} — {t('vTop').toLowerCase()}</option>
              <option>{t('noVersions')}</option>
            </select>
          </Field>
          <Btn icon="play" variant="primary" disabled={scope === 'sel' && sel.length === 0}
               onClick={function () { go('job'); }}>
            {scope === 'all' ? t('startFull') : t('startSelected')}
          </Btn>
        </div>

        {scope === 'sel' ? (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 'var(--gap-sm)' }}>
            <div className="card-title" style={{ marginBottom: 'var(--gap-sm)' }}>{t('findSites')}</div>
            <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--gap-sm)' }}>
              <Field label={t('keyword')} style={{ flex: '1 1 240px' }}>
                <input className="input" placeholder="engenharia, marketing, https://…" />
              </Field>
              <Field label={t('listCount')}>
                <select className="select"><option>25</option><option>50</option><option>100</option></select>
              </Field>
              <Btn icon="search">{t('searchBtn')}</Btn>
              <span className="spacer"></span>
              <span className="pill pill-info">{sel.length} {t('selected')}</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th style={{ width: 34 }}></th><th>{t('siteName')}</th><th className="td-r">{t('files')}</th><th className="td-r">{t('volume')}</th><th>{t('lastScan')}</th></tr>
                </thead>
                <tbody>
                  {MOCK.sites.map(function (st) {
                    return (
                      <tr key={st.name} style={{ cursor: 'pointer' }} onClick={function () { toggle(st.name); }}>
                        <td><input type="checkbox" checked={sel.includes(st.name)} readOnly style={{ accentColor: 'var(--accent)' }} /></td>
                        <td className="td-mono">{st.name}</td>
                        <td className="td-r">{fmtNum(st.files)}</td>
                        <td className="td-r">{fmtBytes(st.bytes)}</td>
                        <td className="td-mute small">{st.lastScan}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row small muted" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              <span>{t('page')} 1 {t('of')} 1</span>
              <span>· {t('perPage')}</span>
              <select className="select" style={{ height: 26 }}><option>25</option><option>50</option></select>
            </div>
          </div>
        ) : null}
      </Card>

      <Card title={t('existingScans')}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>ID</th><th>{t('type')}</th><th>{t('mode')}</th><th>{t('status')}</th>
                <th className="td-r">{t('sites')}</th><th className="td-r">{t('files')}</th>
                <th className="td-r">{t('volume')}</th><th>{t('createdAt')}</th><th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {MOCK.scans.map(function (s2) {
                return (
                  <tr key={s2.id}>
                    <td className="td-mono">{s2.id}</td>
                    <td>{t(s2.type)}</td>
                    <td className="td-mute small">{t(s2.mode)}</td>
                    <td><StatusPill status={s2.status} /></td>
                    <td className="td-r">{fmtNum(s2.sites)}</td>
                    <td className="td-r">{fmtNum(s2.files)}</td>
                    <td className="td-r">{fmtBytes(s2.bytes)}</td>
                    <td className="td-mute small">{fmtDate(s2.date)}</td>
                    <td>
                      {s2.status === 'running' ? <a className="td-link small" onClick={function () { go('job'); }}>{t('follow')}</a> : null}
                      {s2.status === 'completed' ? <a className="td-link small" onClick={function () { go('inventory'); }}>{t('navInventory')}</a> : null}
                      {s2.status === 'failed' ? <a className="td-link small" onClick={function () { go('logs'); }}>{t('navLogs')}</a> : null}
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

/* ── Sites (último inventário + drill-down) ─────────────────────────── */
function SitesScreen() {
  const { t, fmtNum, fmtBytes, fmtDate } = useApp();
  const [drill, setDrill] = useStateW(null); // site name
  const [search, setSearch] = useStateW('');
  const site = drill ? MOCK.sites.find(function (s2) { return s2.name === drill; }) : null;

  const drillFiles = MOCK.topFiles
    .filter(function (f) { return !drill || f.site === drill || true; }) // mock: mostra amostra
    .filter(function (f) { return !search || f.name.toLowerCase().includes(search.toLowerCase()); });
  const maxExt = MOCK.topExt[0].bytes;

  return (
    <div className="stack" data-screen-label="Sites">
      <PageHead title={t('siTitle')} sub={t('siSub')}>
        <Field label={t('searchPh')}>
          <input className="input" placeholder="intranet, marketing…" style={{ minWidth: 220 }} />
        </Field>
        <Field label={t('perPage')}>
          <select className="select"><option>10</option><option>30</option><option>50</option><option>100</option></select>
        </Field>
      </PageHead>

      <Card>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>{t('siteName')}</th><th className="td-r">{t('files')}</th><th className="td-r">{t('volume')}</th><th>{t('lastScan')}</th><th></th></tr>
            </thead>
            <tbody>
              {MOCK.sites.map(function (st) {
                const active = drill === st.name;
                return (
                  <tr key={st.name}
                      style={{ cursor: 'pointer', background: active ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}
                      onClick={function () { setDrill(active ? null : st.name); }}>
                    <td className="td-mono" style={{ fontWeight: active ? 700 : 400, color: active ? 'var(--accent)' : undefined }}>{st.name}</td>
                    <td className="td-r">{fmtNum(st.files)}</td>
                    <td className="td-r">{fmtBytes(st.bytes)}</td>
                    <td className="td-mute small">{st.lastScan}</td>
                    <td style={{ width: 30, color: 'var(--faint)' }}><ICONS.chevR size={13} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row small muted" style={{ marginTop: 8, justifyContent: 'space-between' }}>
          <span>{fmtNum(MOCK.sites.length)} sites · {t('page')} 1 {t('of')} 1</span>
        </div>
      </Card>

      {site ? (
        <Card title={site.name}
              sub={<span>Scan <span className="mono">f51b09ae</span> · {fmtDate('2026-06-03T22:40:00')} · {fmtNum(site.files)} {t('filesOnServer')}</span>}
              right={
                <React.Fragment>
                  <Btn small icon="download">CSV</Btn>
                  <Btn small icon="download">JSONL</Btn>
                  <Btn small icon="x" onClick={function () { setDrill(null); }}>{t('closeDrill')}</Btn>
                </React.Fragment>
              }>
          {/* Bibliotecas */}
          <div className="row" style={{ marginBottom: 'var(--gap-sm)' }}>
            {MOCK.siteLibraries.map(function (lib) {
              return <span key={lib} className="pill pill-info">{lib}</span>;
            })}
          </div>

          {/* Extensões — espaço */}
          <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)', padding: 'var(--pad-card)', marginBottom: 'var(--gap-sm)' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>{t('extSpace')}</div>
            <div className="stack" style={{ gap: 6 }}>
              {MOCK.topExt.slice(0, 6).map(function (e) {
                return (
                  <div key={e.ext} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 80px 70px', gap: 8, alignItems: 'center' }}>
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)' }}>{e.ext}</span>
                    <div className="bar-track" style={{ height: 12 }}>
                      <div className="bar-fill" style={{ width: Math.round(e.bytes / maxExt * 100) + '%' }}></div>
                    </div>
                    <span className="small muted" style={{ textAlign: 'right' }}>{fmtBytes(e.bytes)}</span>
                    <span className="small faint" style={{ textAlign: 'right' }}>{fmtNum(e.count)} {t('filesCount')}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filtros */}
          <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--gap-sm)' }}>
            <Field label={t('searchFile')} style={{ flex: '1 1 200px' }}>
              <input className="input" placeholder={t('searchFilePh')} value={search} onChange={function (e) { setSearch(e.target.value); }} />
            </Field>
            <Field label={t('sortBy')}>
              <select className="select">
                <option>{t('sizeDesc')}</option><option>{t('sizeAsc')}</option>
                <option>{t('verDesc')}</option><option>{t('totDesc')}</option>
              </select>
            </Field>
            <Field label={t('show')}>
              <select className="select"><option>50</option><option>100</option><option>200</option></select>
            </Field>
            <span className="small muted">{fmtNum(drillFiles.length)} {t('filesCount')} {t('filtered')}</span>
          </div>

          {/* Tabela */}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('file')}</th><th>{t('path')}</th><th>{t('ext')}</th>
                  <th className="td-r">{t('size')}</th><th className="td-r">{t('versions')}</th>
                  <th className="td-r">{t('vSpace')}</th><th className="td-r">{t('totalCol')}</th>
                </tr>
              </thead>
              <tbody>
                {drillFiles.map(function (f) {
                  return (
                    <tr key={f.name}>
                      <td className="td-ellipsis" style={{ maxWidth: 260 }}><a className="td-link">{f.name}</a></td>
                      <td className="td-mute small td-ellipsis" style={{ maxWidth: 170 }}>/Documentos/{f.site}</td>
                      <td className="td-mute">{f.ext}</td>
                      <td className="td-r">{fmtBytes(f.bytes)}</td>
                      <td className="td-r">{fmtNum(f.versions)}</td>
                      <td className="td-r td-mute">{fmtBytes(f.vBytes)}</td>
                      <td className="td-r" style={{ fontWeight: 650 }}>{fmtBytes(f.bytes + f.vBytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
            <Btn small disabled>{t('prev')}</Btn>
            <Btn small>{t('next')}</Btn>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/* ── Progresso do Job (SSE) ─────────────────────────────────────────── */
function JobScreen() {
  const { t, fmtNum, fmtDate, go } = useApp();
  const [demo, setDemo] = useStateW('running'); // demo: estado do job
  const isDone = demo === 'done';
  const total = 203, completed = isDone ? 203 : 131, pending = isDone ? 0 : 64, running = isDone ? 0 : 6, failed = 2;
  const pct = Math.round(completed / total * 100);

  return (
    <div className="stack" data-screen-label="Progresso do Job" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <a className="td-link small" onClick={function () { go('scans'); }} style={{ color: 'var(--muted)' }}>← {t('backToScans')}</a>
        <Seg value={demo} onChange={setDemo} options={[
          { value: 'running', label: t('running') }, { value: 'done', label: t('completed') },
        ]} />
      </div>
      <PageHead title={t('jobTitle')} sub={<span>ID: <span className="mono">a8f3c21d-scan-full</span></span>} />

      <Card>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted" style={{ fontWeight: 700 }}>{t('jobType')}</span>
            <span className="mono small">scan.full.versions</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted" style={{ fontWeight: 700 }}>{t('status')}</span>
            <StatusPill status={isDone ? 'completed' : 'running'} />
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small muted" style={{ fontWeight: 700 }}>{t('startedAt')}</span>
            <span className="small">{fmtDate('2026-06-10T09:12:00')}</span>
          </div>

          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="small muted" style={{ fontWeight: 700 }}>{t('tasksDone')}</span>
              <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(completed)} / {fmtNum(total)} · <strong style={{ color: 'var(--accent)' }}>{pct}%</strong></span>
            </div>
            <div className="track" style={{ height: 12 }}>
              <div className="fill" style={{ width: pct + '%' }}></div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <span className="pill pill-warn"><span className="dot"></span>{t('pendingChip')}: {pending}</span>
              <span className="pill pill-info"><span className="dot"></span>{t('runningChip')}: {running}</span>
              <span className="pill pill-bad"><span className="dot"></span>{t('failedChip')}: {failed}</span>
            </div>
          </div>
        </div>
      </Card>

      {isDone ? (
        <div className="card" style={{ background: 'var(--good-bg)', borderColor: 'var(--good-bd)' }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ color: 'var(--good)', display: 'grid' }}><ICONS.check size={16} /></span>
            <span className="small" style={{ color: 'var(--good)', fontWeight: 650 }}>
              {t('jobDoneMsg')} <a className="td-link" style={{ color: 'var(--good)', textDecoration: 'underline' }} onClick={function () { go('inventory'); }}>{t('viewInv')} →</a>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

Object.assign(window, { ScansScreen, SitesScreen, JobScreen });
