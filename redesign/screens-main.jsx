/* screens-main.jsx — Dashboard, Sites (Scans), Inventário, Top Arquivos */
const { useState: useStateM } = React;

/* ── Dashboard ──────────────────────────────────────────────────────── */
function FlowNode({ label, value, sub, tone }) {
  const colors = { idle: 'var(--faint)', run: 'var(--accent)', done: 'var(--good)', bad: 'var(--bad)' };
  return (
    <div className="flow-node">
      <span className="dot" style={{ background: colors[tone] }}></span>
      <div>
        <div className="flow-label">{label}</div>
        <div className="flow-value" style={{ color: colors[tone] }}>{value}</div>
        <div className="flow-sub">{sub}</div>
      </div>
    </div>
  );
}

function DashboardScreen() {
  const { t, fmtNum, fmtBytes, fmtDate, lang } = useApp();
  const [scanIdx, setScanIdx] = useStateM(0);
  const scan = MOCK.scans[scanIdx];
  const isActive = scan.status === 'running' || scan.status === 'pending';
  const pct = isActive ? Math.round(28 + (scan.drives / scan.drivesTotal) * 58) : (scan.status === 'completed' ? 100 : 0);
  const maxExt = MOCK.topExt[0].count;
  const Arrow = ICONS.chevR;

  return (
    <div className="stack" data-screen-label="Dashboard">
      <PageHead title={t('dashTitle')} sub={t('dashSub')}>
        <Field label={t('scanBase')}>
          <select className="select" style={{ minWidth: 270 }} value={scanIdx} onChange={function (e) { setScanIdx(+e.target.value); }}>
            {MOCK.scans.map(function (s2, i) {
              return <option key={s2.id} value={i}>{s2.id} — {t(s2.status)} — {new Date(s2.date).toLocaleDateString(lang === 'pt' ? 'pt-BR' : 'en-US')}</option>;
            })}
          </select>
        </Field>
        <Btn icon="refresh">{t('refresh')}</Btn>
        {isActive ? <Btn icon="x" variant="danger">{t('cancelScan')}</Btn> : null}
        {scan.status === 'completed' ? <Btn icon="arrowR" variant="primary">{t('goInventory')}</Btn> : null}
        {!isActive ? <Btn icon="plus" variant="primary">{t('newScan')}</Btn> : null}
      </PageHead>

      <div className="row small muted">
        <span className={'pill ' + (isActive ? 'pill-good' : 'pill-info')}>
          <span className="dot"></span>{isActive ? t('live') : t('snapshot')}
        </span>
        <span>{t('updatedAt')}: {new Date().toLocaleTimeString(lang === 'pt' ? 'pt-BR' : 'en-US')}</span>
        {isActive ? <span className="faint">— {t('autoRefresh')}</span> : null}
      </div>

      <div className="kpi-grid">
        <Kpi label={t('sites')} value={fmtNum(scan.sites)} hint={fmtNum(scan.sitesTotal) + ' ' + t('total')} icon="sites" />
        <Kpi label={t('drives')} value={fmtNum(scan.drives)} hint={fmtNum(scan.drivesTotal) + ' ' + t('total')} icon="inventory" />
        <Kpi label={t('files')} value={fmtNum(scan.files)} icon="topfiles" color="var(--text)" />
        <Kpi label={t('volume')} value={fmtBytes(scan.bytes)} icon="oneration" color="var(--text)" />
        {scan.mode === 'withVersions' ? (
          <Kpi label={t('versions')} value={fmtNum(scan.versions)} hint={fmtNum(scan.versionsTotal) + ' ' + t('total') + ' • ' + fmtBytes(scan.versionsBytes)} icon="versioned" />
        ) : null}
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-label">{t('scanStatus')}</div></div>
          <div style={{ marginTop: 4 }}><StatusPill status={scan.status} /></div>
          <div className="kpi-hint">{scan.status === 'completed' ? t('completedAt') + ' ' + fmtDate(scan.date) : fmtDate(scan.date)}</div>
        </div>
      </div>

      {isActive ? (
        <Card title={t('scanProgress')} sub="Listando bibliotecas de projetos-engenharia…"
              right={<span className="pill pill-info" style={{ fontSize: 'var(--fs-base)' }}>{pct}%</span>}>
          <div className="track" style={{ marginBottom: 'var(--gap-sm)' }}>
            <div className="fill" style={{ width: pct + '%' }}></div>
          </div>
          <div className="flow">
            <FlowNode label={t('sites')} value={fmtNum(scan.sites) + '/' + fmtNum(scan.sitesTotal)} sub={t('sitesDone')} tone="done" />
            <span className="flow-arrow"><Arrow size={14} /></span>
            <FlowNode label={t('drives')} value={fmtNum(scan.drives) + '/' + fmtNum(scan.drivesTotal)} sub={t('drivesRead')} tone="run" />
            <span className="flow-arrow"><Arrow size={14} /></span>
            <FlowNode label={t('files')} value={fmtNum(scan.files)} sub={fmtBytes(scan.bytes)} tone="run" />
            <span className="flow-arrow"><Arrow size={14} /></span>
            <FlowNode label={t('versions')} value={fmtNum(scan.versions) + '/' + fmtNum(scan.versionsTotal)} sub={fmtBytes(scan.versionsBytes)} tone="run" />
            <span className="flow-arrow"><Arrow size={14} /></span>
            <FlowNode label={t('final')} value="…" sub={t('waiting')} tone="idle" />
          </div>
        </Card>
      ) : null}

      <div className="two-col">
        <Card title={t('topExt')} sub={t('byFileCount')}>
          <div className="stack" style={{ gap: 8 }}>
            {MOCK.topExt.map(function (e) {
              return (
                <div key={e.ext}>
                  <div className="row" style={{ marginBottom: 3, gap: 6 }}>
                    <span className="mono" style={{ fontWeight: 700, minWidth: 52 }}>{e.ext}</span>
                    <span className="spacer"></span>
                    <span className="small muted">{fmtNum(e.count)} {t('filesCount')}</span>
                    <span className="small faint" style={{ minWidth: 64, textAlign: 'right' }}>{fmtBytes(e.bytes)}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: Math.round(e.count / maxExt * 100) + '%' }}></div></div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title={t('top10')} sub={t('clickToOpen')}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>#</th><th>{t('name')}</th><th>{t('ext')}</th><th className="td-r">{t('size')}</th></tr></thead>
              <tbody>
                {MOCK.topFiles.map(function (f, i) {
                  return (
                    <tr key={f.name}>
                      <td className="td-mute" style={{ width: 28 }}>{i + 1}</td>
                      <td className="td-ellipsis"><a className="td-link">{f.name}</a></td>
                      <td className="td-mute">{f.ext}</td>
                      <td className="td-r">{fmtBytes(f.bytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <a className="td-link small" style={{ fontWeight: 650 }}>{t('viewFullInv')} →</a>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Inventário ─────────────────────────────────────────────────────── */
function InventoryScreen() {
  const { t, fmtNum, fmtBytes, fmtDate } = useApp();
  const [extFilter, setExtFilter] = useStateM(null);
  const scan = MOCK.scans[1];
  const rows = extFilter ? MOCK.inventoryRows.filter(function (r) { return r.ext === extFilter; }) : MOCK.inventoryRows;
  const maxExt = MOCK.topExt[0].count;

  return (
    <div className="stack" data-screen-label="Inventário">
      <PageHead title={t('invTitle')} sub={<span>{t('invSub')} — <span className="mono">{scan.id}</span></span>}>
        <Btn icon="download">{t('exportCsv')}</Btn>
        <Btn icon="download">{t('exportJsonl')}</Btn>
      </PageHead>

      <div className="kpi-grid">
        <Kpi label={t('sites')} value={fmtNum(scan.sitesTotal)} icon="sites" color="var(--text)" />
        <Kpi label={t('drives')} value={fmtNum(scan.drivesTotal)} icon="inventory" color="var(--text)" />
        <Kpi label={t('files')} value={fmtNum(scan.files)} icon="topfiles" color="var(--text)" />
        <Kpi label={t('volume')} value={fmtBytes(scan.bytes)} icon="oneration" color="var(--text)" />
        <Kpi label={t('versions')} value={fmtNum(scan.versionsTotal)} icon="versioned" />
      </div>

      <Card>
        <div className="row" style={{ gap: 'var(--gap-sm)' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <input className="input" style={{ width: '100%', paddingLeft: 30 }} placeholder={t('searchPh')} />
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)', display: 'grid' }}>
              <ICONS.search size={14} />
            </span>
          </div>
          <select className="select"><option>{t('allSites')}</option>{MOCK.sites.map(function (st) { return <option key={st.name}>{st.name}</option>; })}</select>
          <select className="select" value={extFilter || ''} onChange={function (e) { setExtFilter(e.target.value || null); }}>
            <option value="">{t('allExts')}</option>
            {MOCK.topExt.map(function (e) { return <option key={e.ext} value={e.ext}>{e.ext}</option>; })}
          </select>
          <select className="select"><option>{t('minSize')}: —</option><option>≥ 10 MB</option><option>≥ 100 MB</option><option>≥ 1 GB</option></select>
          <Btn icon="filter" small>{t('clickToFilter')}</Btn>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 'var(--gap)', alignItems: 'start' }}>
        <Card title={fmtNum(rows.length * 105156) + ' ' + t('results')}
              right={<span className="small muted">{t('page')} 1 {t('of')} {fmtNum(1052)}</span>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>{t('name')}</th><th>{t('site')}</th><th>{t('ext')}</th><th className="td-r">{t('size')}</th><th>{t('modified')}</th></tr>
              </thead>
              <tbody>
                {rows.map(function (r) {
                  return (
                    <tr key={r.name}>
                      <td className="td-ellipsis" title={r.path + '/' + r.name}><a className="td-link">{r.name}</a></td>
                      <td className="td-mono td-mute">{r.site}</td>
                      <td className="td-mute">{r.ext}</td>
                      <td className="td-r">{fmtBytes(r.bytes)}</td>
                      <td className="td-mute small">{fmtDate(r.modified)}</td>
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

        <Card title={t('topExt')} sub={t('clickToFilter')}>
          <div className="stack" style={{ gap: 7 }}>
            {MOCK.topExt.map(function (e) {
              const active = extFilter === e.ext;
              return (
                <div key={e.ext} onClick={function () { setExtFilter(active ? null : e.ext); }} style={{ cursor: 'pointer', opacity: extFilter && !active ? .45 : 1 }}>
                  <div className="row" style={{ marginBottom: 2, gap: 6 }}>
                    <span className="mono" style={{ fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text)' }}>{e.ext}</span>
                    <span className="spacer"></span>
                    <span className="small faint">{fmtNum(e.count)}</span>
                  </div>
                  <div className="bar-track"><div className="bar-fill" style={{ width: Math.round(e.count / maxExt * 100) + '%' }}></div></div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Top Arquivos ───────────────────────────────────────────────────── */
function TopFilesScreen() {
  const { t, fmtNum, fmtBytes, fmtDate } = useApp();
  const [rank, setRank] = useStateM('size');
  const rows = [...MOCK.topFiles].sort(function (a, b) { return rank === 'size' ? b.bytes - a.bytes : b.versions - a.versions; });
  const max = rank === 'size' ? rows[0].bytes : rows[0].versions;

  return (
    <div className="stack" data-screen-label="Top Arquivos">
      <PageHead title={t('topTitle')} sub={t('topSub')}>
        <Field label={t('sortBy')}>
          <Seg value={rank} onChange={setRank} options={[
            { value: 'size', label: t('rankBySize') }, { value: 'versions', label: t('rankByVersions') },
          ]} />
        </Field>
        <Field label={t('limit')}>
          <select className="select"><option>10</option><option>50</option><option>100</option><option>500</option></select>
        </Field>
        <Btn icon="download">{t('exportCsv')}</Btn>
      </PageHead>

      <Card>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th><th>{t('name')}</th><th>{t('site')}</th><th>{t('ext')}</th>
                <th className="td-r">{t('size')}</th><th className="td-r">{t('versionsCount')}</th>
                <th className="td-r">{t('versionsBytes')}</th><th>{t('modified')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function (f, i) {
                const v = rank === 'size' ? f.bytes : f.versions;
                return (
                  <tr key={f.name}>
                    <td className="td-mute" style={{ width: 28 }}>{i + 1}</td>
                    <td className="td-ellipsis" style={{ maxWidth: 300 }}>
                      <div>{f.name}</div>
                      <div className="bar-track" style={{ height: 3, marginTop: 3, maxWidth: 180 }}>
                        <div className="bar-fill" style={{ width: Math.round(v / max * 100) + '%' }}></div>
                      </div>
                    </td>
                    <td className="td-mono td-mute">{f.site}</td>
                    <td className="td-mute">{f.ext}</td>
                    <td className="td-r" style={{ fontWeight: rank === 'size' ? 700 : 400 }}>{fmtBytes(f.bytes)}</td>
                    <td className="td-r" style={{ fontWeight: rank === 'versions' ? 700 : 400 }}>{fmtNum(f.versions)}</td>
                    <td className="td-r td-mute">{fmtBytes(f.vBytes)}</td>
                    <td className="td-mute small">{fmtDate(f.modified)}</td>
                    <td><a className="td-link" title="SharePoint"><ICONS.external size={13} /></a></td>
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

Object.assign(window, { DashboardScreen, InventoryScreen, TopFilesScreen });
