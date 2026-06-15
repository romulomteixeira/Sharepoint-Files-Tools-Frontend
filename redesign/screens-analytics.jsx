/* screens-analytics.jsx — Relatórios, Licenças, Monitor Oneração, Versionados, Expurgo */
const { useState: useStateA } = React;

/* ── Relatórios & Exportações ───────────────────────────────────────── */
function ReportsScreen() {
  const { t, fmtNum, fmtDate } = useApp();
  const cols = ['name', 'site', 'ext', 'size', 'modified', 'path', 'versionsCount'];
  const history = [
    { id: 'job-7741', fmt: 'CSV', rows: 1261877, at: '2026-06-09T18:02:17', status: 'ready' },
    { id: 'job-7733', fmt: 'JSONL', rows: 214380, at: '2026-06-08T11:30:02', status: 'ready' },
    { id: 'job-7728', fmt: 'CSV', rows: 9842, at: '2026-06-07T09:14:44', status: 'ready' },
  ];
  return (
    <div className="stack" data-screen-label="Relatórios">
      <PageHead title={t('rpTitle')} sub={t('rpSub')} />
      <div className="two-col">
        <Card title={t('generate')}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="row">
              <Field label={t('scanBase')} style={{ flex: 1 }}>
                <select className="select"><option>f51b09ae — {t('completed')}</option><option>c2d77e10 — {t('completed')}</option></select>
              </Field>
              <Field label={t('format')}>
                <Seg value="csv" onChange={function () {}} options={[{ value: 'csv', label: 'CSV' }, { value: 'jsonl', label: 'JSONL' }]} />
              </Field>
            </div>
            <div className="row">
              <Field label={t('site')} style={{ flex: 1 }}>
                <select className="select"><option>{t('allSites')}</option></select>
              </Field>
              <Field label={t('ext')} style={{ flex: 1 }}>
                <select className="select"><option>{t('allExts')}</option></select>
              </Field>
              <Field label={t('minSize')} style={{ flex: 1 }}>
                <select className="select"><option>—</option><option>≥ 100 MB</option></select>
              </Field>
            </div>
            <Field label={t('columns')}>
              <div className="row" style={{ gap: 6 }}>
                {cols.map(function (c) {
                  return <label key={c} className="check-row small" style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--r-sm)', padding: '3px 9px' }}>
                    <input type="checkbox" defaultChecked={c !== 'path'} /> {t(c) || c}
                  </label>;
                })}
              </div>
            </Field>
            <div><Btn icon="download" variant="primary">{t('generate')}</Btn></div>
          </div>
        </Card>
        <Card title={t('exportHistory')}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Job</th><th>{t('format')}</th><th className="td-r">{t('rows')}</th><th>{t('generatedAt')}</th><th>{t('status')}</th><th></th></tr></thead>
              <tbody>
                {history.map(function (h) {
                  return (
                    <tr key={h.id}>
                      <td className="td-mono">{h.id}</td>
                      <td>{h.fmt}</td>
                      <td className="td-r">{fmtNum(h.rows)}</td>
                      <td className="td-mute small">{fmtDate(h.at)}</td>
                      <td><span className="pill pill-good"><span className="dot"></span>{t('ready')}</span></td>
                      <td><a className="td-link"><ICONS.download size={13} /></a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Licenças & Espaço ──────────────────────────────────────────────── */
function LicensesScreen() {
  const { t, fmtNum, fmtBytes } = useApp();
  const allocated = 7.69 * TB, used = 3.48 * TB;
  const pct = Math.round(used / allocated * 100);
  return (
    <div className="stack" data-screen-label="Licenças">
      <PageHead title={t('lcTitle')} sub={t('lcSub')}>
        <Btn icon="refresh">{t('refresh')}</Btn>
      </PageHead>
      <div className="kpi-grid">
        <Kpi label={t('allocated')} value={fmtBytes(allocated)} icon="licenses" color="var(--text)" />
        <Kpi label={t('estimated')} value={fmtBytes(7.51 * TB)} hint="1.025 licenças ativas" icon="admin" color="var(--text)" />
        <Kpi label={t('used')} value={fmtBytes(used)} hint={pct + '% ' + t('of').toLowerCase() + ' ' + fmtBytes(allocated)} icon="oneration" />
        <Kpi label={t('free')} value={fmtBytes(allocated - used)} icon="check" color="var(--good)" />
      </div>
      <Card title={t('capacityUse')} right={<span className="pill pill-warn"><ICONS.alert size={11} /> {t('projection')}</span>}>
        <div className="track" style={{ height: 14 }}>
          <div className="fill" style={{ width: pct + '%', background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, var(--warn)))' }}></div>
        </div>
        <div className="row small muted" style={{ marginTop: 6, justifyContent: 'space-between' }}>
          <span>{t('used')}: {fmtBytes(used)} ({pct}%)</span>
          <span>{t('allocated')}: {fmtBytes(allocated)}</span>
        </div>
      </Card>
      <Card title={t('skus')}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>{t('sku')}</th><th className="td-r">{t('actives')}</th><th className="td-r">{t('suspended')}</th>
              <th className="td-r">{t('warning')}</th><th className="td-r">{t('contribution')}</th><th>{t('type')}</th></tr>
            </thead>
            <tbody>
              {MOCK.skus.map(function (k) {
                return (
                  <tr key={k.sku}>
                    <td style={{ fontWeight: 650 }}>{k.sku}</td>
                    <td className="td-r">{fmtNum(k.act)}</td>
                    <td className="td-r td-mute">{fmtNum(k.susp)}</td>
                    <td className="td-r">{k.warn > 0 ? <span className="pill pill-warn">{k.warn}</span> : <span className="td-mute">0</span>}</td>
                    <td className="td-r" style={{ fontWeight: 650 }}>{fmtNum(k.gb)}</td>
                    <td className="td-mute small">{k.type}</td>
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

/* ── Monitor de Oneração ────────────────────────────────────────────── */
function OnerationScreen() {
  const { t, fmtNum, fmtBytes, lang } = useApp();
  const data = MOCK.oneration;
  const first = data[0], last = data[data.length - 1];
  const growth = (last.bytes - first.bytes) / first.bytes * 100;
  const maxB = last.bytes;
  const W = 560, H = 150, PAD = 8;
  const pts = data.map(function (d, i) {
    const x = PAD + i / (data.length - 1) * (W - PAD * 2);
    const y = H - PAD - (d.bytes / maxB) * (H - PAD * 2) * .92;
    return [x, y];
  });
  const path = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
  const area = path + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - 2) + ' L' + pts[0][0].toFixed(1) + ' ' + (H - 2) + ' Z';

  return (
    <div className="stack" data-screen-label="Monitor Oneração">
      <PageHead title={t('onTitle')} sub={t('onSub')}>
        <Btn icon="refresh">{t('refresh')}</Btn>
      </PageHead>
      <div className="kpi-grid">
        <Kpi label={t('volume')} value={fmtBytes(last.bytes)} icon="inventory" color="var(--text)" />
        <Kpi label={t('files')} value={fmtNum(last.files)} icon="topfiles" color="var(--text)" />
        <Kpi label={t('growth')} value={'+' + growth.toFixed(1).replace('.', lang === 'pt' ? ',' : '.') + '%'} hint={t('sinceFirst')} icon="oneration" color="var(--warn)" />
        <Kpi label={'Δ ' + t('volume')} value={'+' + fmtBytes(last.bytes - first.bytes)} hint={first.date + ' → ' + last.date} icon="versioned" />
      </div>
      <Card title={t('perScan')}>
        <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%', height: 'auto', display: 'block' }} preserveAspectRatio="none">
          <path d={area} fill="color-mix(in srgb, var(--accent) 14%, transparent)" />
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map(function (p, i) {
            return <circle key={i} cx={p[0]} cy={p[1]} r="3.4" fill="var(--panel)" stroke="var(--accent)" strokeWidth="2" />;
          })}
        </svg>
        <div className="row small muted" style={{ justifyContent: 'space-between', marginTop: 4 }}>
          {data.map(function (d) { return <span key={d.id}>{d.date.slice(5).split('-').reverse().join('/')}</span>; })}
        </div>
      </Card>
      <Card title={t('history')}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t('scan')}</th><th>{t('date')}</th><th className="td-r">{t('files')}</th><th className="td-r">{t('volume')}</th><th className="td-r">{t('delta')}</th></tr></thead>
            <tbody>
              {data.map(function (d, i) {
                const prev = i > 0 ? data[i - 1].bytes : null;
                const delta = prev ? d.bytes - prev : 0;
                return (
                  <tr key={d.id}>
                    <td className="td-mono">{d.id}</td>
                    <td className="td-mute">{d.date}</td>
                    <td className="td-r">{fmtNum(d.files)}</td>
                    <td className="td-r" style={{ fontWeight: 650 }}>{fmtBytes(d.bytes)}</td>
                    <td className="td-r" style={{ color: delta > 0 ? 'var(--warn)' : 'var(--muted)' }}>{prev ? '+' + fmtBytes(delta) : '—'}</td>
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

/* ── Versionados por Período ────────────────────────────────────────── */
function VersionedScreen() {
  const { t, fmtNum, fmtBytes } = useApp();
  const [unit, setUnit] = useStateA('day');
  const buckets = MOCK.versionedBuckets[unit];
  const maxV = Math.max.apply(null, buckets.map(function (b) { return b.v; }));
  const totV = buckets.reduce(function (a, b) { return a + b.v; }, 0);
  const totB = buckets.reduce(function (a, b) { return a + b.b; }, 0);
  return (
    <div className="stack" data-screen-label="Versionados por Período">
      <PageHead title={t('vpTitle')} sub={t('vpSub')}>
        <Seg value={unit} onChange={setUnit} options={[
          { value: 'day', label: t('day') }, { value: 'week', label: t('week') }, { value: 'month', label: t('month') },
        ]} />
      </PageHead>
      <div className="kpi-grid">
        <Kpi label={t('totalVersions')} value={fmtNum(totV)} icon="versioned" />
        <Kpi label={t('versionVolume')} value={fmtBytes(totB)} icon="inventory" color="var(--text)" />
        <Kpi label={t('periodsWithData')} value={fmtNum(buckets.length)} icon="topfiles" color="var(--text)" />
        <Kpi label={t('grouping')} value={t(unit)} icon="clock" color="var(--text)" />
      </div>
      <div className="two-col">
        <Card title={t('versions') + ' / ' + t('period').toLowerCase()}>
          <div className="vbar-row">
            {buckets.map(function (b) {
              return (
                <div key={b.p} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div className="vbar" style={{ height: Math.round(b.v / maxV * 100) + '%', width: '100%' }} title={fmtNum(b.v)}></div>
                  </div>
                  <span className="small faint">{b.p}</span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title={t('period')}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t('period')}</th><th className="td-r">{t('versions')}</th><th className="td-r">{t('versionVolume')}</th><th className="td-r">%</th></tr></thead>
              <tbody>
                {buckets.map(function (b) {
                  return (
                    <tr key={b.p}>
                      <td style={{ fontWeight: 650 }}>{b.p}</td>
                      <td className="td-r">{fmtNum(b.v)}</td>
                      <td className="td-r td-mute">{fmtBytes(b.b)}</td>
                      <td className="td-r td-mute">{Math.round(b.v / totV * 100)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { ReportsScreen, LicensesScreen, OnerationScreen, VersionedScreen });
