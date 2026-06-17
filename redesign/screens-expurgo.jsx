/* screens-expurgo.jsx — Simulação de Expurgo: 3 abas × fluxo em 3 etapas */
const { useState: useStateX } = React;

/* ── StepBar ────────────────────────────────────────────────────────── */
function StepBar({ step }) {
  const { t } = useApp();
  const steps = [['config', t('step1')], ['preview', t('step2')], ['done', t('step3')]];
  const order = { config: 0, preview: 1, done: 2 };
  return (
    <div className="stepper">
      {steps.map(function (pair, i) {
        const isActive = step === pair[0];
        const isPast = order[step] > i;
        const color = isActive ? 'var(--accent)' : isPast ? 'var(--good)' : 'var(--muted)';
        return (
          <React.Fragment key={pair[0]}>
            <span className="step-item" style={{ color: color, fontWeight: isActive ? 800 : 650 }}>
              {isPast ? <ICONS.check size={12} /> : null}{pair[1]}
            </span>
            {i < 2 ? <span className="step-sep"><ICONS.chevR size={13} /></span> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Barra de impacto ───────────────────────────────────────────────── */
function ImpactBar({ stats }) {
  return (
    <div className="impact-bar">
      {stats.map(function (st, i) {
        return (
          <React.Fragment key={st.label}>
            {i > 0 ? <div className="impact-div"></div> : null}
            <div className="impact-stat">
              <span className="impact-value" style={st.color ? { color: st.color } : null}>{st.value}</span>
              <span className="impact-label">{st.label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ── Modal de confirmação dupla ─────────────────────────────────────── */
function ConfirmPurgeModal({ title, lines, warning, onCancel, onConfirm }) {
  const { t } = useApp();
  const [text, setText] = useStateX('');
  const word = t('confirmPh').split(' ').pop();
  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal" onClick={function (e) { e.stopPropagation(); }}>
        <div className="row" style={{ gap: 9, marginBottom: 10 }}>
          <span style={{ color: 'var(--bad)', display: 'grid' }}><ICONS.alert size={20} /></span>
          <div className="card-title">{title}</div>
        </div>
        <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
          {lines.map(function (l) {
            return (
              <div key={l.label} className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">{l.label}</span>
                <span className="small" style={{ fontWeight: 700 }}>{l.value}</span>
              </div>
            );
          })}
        </div>
        <p className="small" style={{ margin: '0 0 12px', color: 'var(--bad)', fontWeight: 650 }}>
          {t('irreversible')} {warning}
        </p>
        <input className="input" style={{ width: '100%' }} placeholder={t('confirmPh')} value={text}
               onChange={function (e) { setText(e.target.value); }} />
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <Btn onClick={onCancel}>{t('cancel')}</Btn>
          <Btn variant="danger" icon="expurgo" disabled={text.trim().toUpperCase() !== word} onClick={onConfirm}>{t('confirm')}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ── Painel de job (etapa Executar) ─────────────────────────────────── */
function PurgeJobPanel({ title, onReset }) {
  const { t, fmtNum } = useApp();
  const pct = 42;
  return (
    <Card title={title} right={<span className="pill pill-info"><span className="dot"></span>{t('running')}</span>}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="small muted" style={{ fontWeight: 700 }}>{t('tasksDone')}</span>
        <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(17803)} / {fmtNum(42388)} · <strong style={{ color: 'var(--accent)' }}>{pct}%</strong></span>
      </div>
      <div className="track" style={{ height: 12 }}>
        <div className="fill" style={{ width: pct + '%' }}></div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <span className="pill pill-warn"><span className="dot"></span>{t('pendingChip')}: {fmtNum(24121)}</span>
        <span className="pill pill-info"><span className="dot"></span>{t('runningChip')}: 6</span>
        <span className="pill pill-bad"><span className="dot"></span>{t('failedChip')}: 14</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <Btn icon="refresh" onClick={onReset}>{t('newPurgeBtn')}</Btn>
      </div>
    </Card>
  );
}

/* ── Aba: Versões ───────────────────────────────────────────────────── */
function VersionsTab() {
  const { t, fmtNum, fmtBytes, fmtDate } = useApp();
  const [step, setStep] = useStateX('config');
  const [modal, setModal] = useStateX(false);

  return (
    <div className="stack">
      <StepBar step={step} />
      <Card title={t('cfgRules')}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label={t('scanBase')} style={{ flex: '1 1 180px' }}>
            <select className="select"><option>f51b09ae — {t('completed')}</option></select>
          </Field>
          <Field label={t('keepLast')}>
            <input className="input" type="number" defaultValue="5" style={{ width: 90 }} />
          </Field>
          <Field label={t('olderThan')}>
            <select className="select">
              <option>{t('anyAge')}</option>
              <option>{t('notModified')} 90 {t('days')}</option>
              <option>{t('notModified')} 180 {t('days')}</option>
              <option>{t('notModified')} 365 {t('days')}</option>
            </select>
          </Field>
          <Field label={t('minVersionSize')}>
            <select className="select"><option>{t('anySize')}</option><option>{t('biggerThan')} 10 MB</option><option>{t('biggerThan')} 50 MB</option></select>
          </Field>
          <Btn icon="eye" variant="primary" onClick={function () { setStep('preview'); }}>{t('simulate')}</Btn>
        </div>
      </Card>

      {step !== 'config' ? (
        <Card title={t('previewExp')}
              right={<span className="pill pill-bad">{fmtNum(42388)} {t('filesCount')}</span>}>
          <ImpactBar stats={[
            { value: fmtNum(42388), label: t('versionsToPurge'), color: 'var(--bad)' },
            { value: fmtBytes(486 * GB), label: t('spaceFreed'), color: 'var(--good)' },
            { value: fmtNum(7204), label: t('filesAffected') },
          ]} />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t('name')}</th><th>{t('site')}</th><th>{t('ext')}</th><th className="td-r">{t('size')}</th><th>{t('modified')}</th></tr></thead>
              <tbody>
                {MOCK.expurgoPreview.map(function (r) {
                  return (
                    <tr key={r.name}>
                      <td className="td-ellipsis">{r.name}</td>
                      <td className="td-mono td-mute">{r.site}</td>
                      <td className="td-mute">{r.ext}</td>
                      <td className="td-r" style={{ color: 'var(--bad)', fontWeight: 650 }}>{fmtBytes(r.bytes)}</td>
                      <td className="td-mute small">{fmtDate(r.modified)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {step === 'preview' ? (
            <div className="exec-bar">
              <span className="small" style={{ color: 'var(--bad)', fontWeight: 650, display: 'flex', gap: 6, alignItems: 'center' }}>
                <ICONS.alert size={14} /> {t('irreversible')}
              </span>
              <Btn variant="danger" icon="expurgo" onClick={function () { setModal(true); }}>{t('executing')}</Btn>
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === 'done' ? <PurgeJobPanel title={t('jobProgressE')} onReset={function () { setStep('config'); }} /> : null}

      {modal ? (
        <ConfirmPurgeModal
          title={t('confirmTitle')}
          lines={[
            { label: t('affectedFiles'), value: fmtNum(7204) },
            { label: t('toFree'), value: fmtBytes(486 * GB) },
            { label: t('appliedRules'), value: t('keepLast') + ': 5 · > 180 ' + t('days') },
          ]}
          warning={t('verWarn')}
          onCancel={function () { setModal(false); }}
          onConfirm={function () { setModal(false); setStep('done'); }} />
      ) : null}
    </div>
  );
}

/* ── Aba: Arquivos ──────────────────────────────────────────────────── */
function FilesTab() {
  const { t, fmtNum, fmtBytes, fmtDate } = useApp();
  const [step, setStep] = useStateX('config');
  const [modal, setModal] = useStateX(false);
  const [scope, setScope] = useStateX('all');

  return (
    <div className="stack">
      <StepBar step={step} />
      <Card title={t('fileCriteria')}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label={t('scope')}>
              <Seg value={scope} onChange={setScope} options={[
                { value: 'all', label: t('allSitesScope') }, { value: 'sites', label: t('selSitesScope') },
              ]} />
            </Field>
            <Field label={t('olderThan')}>
              <select className="select">
                <option>{t('notModified')} 365 {t('days')}</option>
                <option>{t('notModified')} 730 {t('days')}</option>
                <option>{t('anyAge')}</option>
              </select>
            </Field>
            <Field label={t('minSize')}>
              <select className="select"><option>{t('biggerThan')} 100 MB</option><option>{t('biggerThan')} 500 MB</option><option>{t('biggerThan')} 1 GB</option></select>
            </Field>
            <Btn icon="eye" variant="primary" onClick={function () { setStep('preview'); }}>{t('simulate')}</Btn>
          </div>
          {scope === 'sites' ? (
            <div className="row" style={{ gap: 6 }}>
              {MOCK.sites.slice(0, 5).map(function (st, i) {
                return (
                  <label key={st.name} className="check-row small" style={{ border: '1px solid var(--border-soft)', borderRadius: 'var(--r-sm)', padding: '3px 9px' }}>
                    <input type="checkbox" defaultChecked={i < 2} /> <span className="mono">{st.name}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      </Card>

      {step !== 'config' ? (
        <Card title={t('previewFiles')} right={<span className="pill pill-bad">{fmtNum(1842)} {t('filesCount')}</span>}>
          <ImpactBar stats={[
            { value: fmtNum(1842), label: t('filesToDelete'), color: 'var(--bad)' },
            { value: fmtBytes(312 * GB), label: t('toFree'), color: 'var(--good)' },
            { value: '14', label: t('sitesAffected') },
          ]} />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t('name')}</th><th>{t('site')}</th><th>{t('ext')}</th><th className="td-r">{t('size')}</th><th>{t('modified')}</th></tr></thead>
              <tbody>
                {MOCK.expurgoPreview.map(function (r) {
                  return (
                    <tr key={r.name}>
                      <td className="td-ellipsis">{r.name}</td>
                      <td className="td-mono td-mute">{r.site}</td>
                      <td className="td-mute">{r.ext}</td>
                      <td className="td-r" style={{ color: 'var(--bad)', fontWeight: 650 }}>{fmtBytes(r.bytes)}</td>
                      <td className="td-mute small">{fmtDate(r.modified)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {step === 'preview' ? (
            <div className="exec-bar">
              <span className="small" style={{ color: 'var(--bad)', fontWeight: 650, display: 'flex', gap: 6, alignItems: 'center' }}>
                <ICONS.alert size={14} /> {t('irreversible')}
              </span>
              <Btn variant="danger" icon="expurgo" onClick={function () { setModal(true); }}>{t('executing')}</Btn>
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === 'done' ? <PurgeJobPanel title={t('jobProgressE')} onReset={function () { setStep('config'); }} /> : null}

      {modal ? (
        <ConfirmPurgeModal
          title={t('confirmTitle')}
          lines={[
            { label: t('filesToDelete'), value: fmtNum(1842) },
            { label: t('toFree'), value: fmtBytes(312 * GB) },
            { label: t('criterion'), value: '> 365 ' + t('days') + ' · > 100 MB' },
          ]}
          warning={t('fileWarn')}
          onCancel={function () { setModal(false); }}
          onConfirm={function () { setModal(false); setStep('done'); }} />
      ) : null}
    </div>
  );
}

/* ── Aba: Lixeira ───────────────────────────────────────────────────── */
function RecycleTab() {
  const { t, fmtNum, fmtBytes, fmtDate } = useApp();
  const [step, setStep] = useStateX('config');
  const [modal, setModal] = useStateX(false);
  const [scope, setScope] = useStateX('all');

  return (
    <div className="stack">
      <StepBar step={step} />
      <Card title={t('cleanScope')}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <Field label={t('scope')}>
              <Seg value={scope} onChange={setScope} options={[
                { value: 'all', label: t('allSitesScope') }, { value: 'sites', label: t('selSitesScope') },
              ]} />
            </Field>
            <Btn icon="search" variant="primary" onClick={function () { setStep('preview'); }}>{t('queryBin')}</Btn>
          </div>
          <div className="info-box">
            {t('previewBin')} — {t('exportCsv')} ↓
          </div>
        </div>
      </Card>

      {step !== 'config' ? (
        <Card title={t('previewBin')} right={<span className="pill pill-bad">{fmtNum(3127)} itens</span>}>
          <ImpactBar stats={[
            { value: fmtNum(3127), label: t('itemsInBin'), color: 'var(--bad)' },
            { value: fmtBytes(94 * GB), label: t('toFree'), color: 'var(--good)' },
            { value: '21', label: t('sitesAffected') },
          ]} />
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t('item')}</th><th>{t('site')}</th><th>{t('deletedBy')}</th><th>{t('deletedAt')}</th><th className="td-r">{t('size')}</th></tr></thead>
              <tbody>
                {MOCK.recyclePreview.map(function (r) {
                  return (
                    <tr key={r.name}>
                      <td className="td-ellipsis">{r.name}</td>
                      <td className="td-mono td-mute">{r.site}</td>
                      <td className="td-mute">{r.deletedBy}</td>
                      <td className="td-mute small">{fmtDate(r.deletedAt)}</td>
                      <td className="td-r" style={{ color: 'var(--bad)', fontWeight: 650 }}>{fmtBytes(r.bytes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {step === 'preview' ? (
            <div className="exec-bar">
              <span className="small" style={{ color: 'var(--bad)', fontWeight: 650, display: 'flex', gap: 6, alignItems: 'center' }}>
                <ICONS.alert size={14} /> {t('irreversible')}
              </span>
              <Btn variant="danger" icon="expurgo" onClick={function () { setModal(true); }}>{t('cleanBin')}</Btn>
            </div>
          ) : null}
        </Card>
      ) : null}

      {step === 'done' ? <PurgeJobPanel title={t('jobProgressE')} onReset={function () { setStep('config'); }} /> : null}

      {modal ? (
        <ConfirmPurgeModal
          title={t('confirmTitle')}
          lines={[
            { label: t('itemsInBin'), value: fmtNum(3127) },
            { label: t('toFree'), value: fmtBytes(94 * GB) },
            { label: t('sitesAffected'), value: '21' },
          ]}
          warning={t('binWarn')}
          onCancel={function () { setModal(false); }}
          onConfirm={function () { setModal(false); setStep('done'); }} />
      ) : null}
    </div>
  );
}

/* ── Tela principal ─────────────────────────────────────────────────── */
function ExpurgoScreen() {
  const { t } = useApp();
  const [tab, setTab] = useStateX('versions');
  const tabs = [
    { id: 'versions', icon: 'versioned', label: t('tabVersionsE') },
    { id: 'files', icon: 'topfiles', label: t('tabFilesE') },
    { id: 'recycle', icon: 'expurgo', label: t('tabRecycleE') },
  ];
  return (
    <div className="stack" data-screen-label="Simulação de Expurgo">
      <PageHead title={t('exTitle')} sub={t('exSub')} />
      <div className="xtabs">
        {tabs.map(function (tb) {
          const IconC = ICONS[tb.icon];
          return (
            <button key={tb.id} type="button" className={'xtab' + (tab === tb.id ? ' active' : '')}
                    onClick={function () { setTab(tb.id); }}>
              <IconC size={14} />{tb.label}
            </button>
          );
        })}
      </div>
      {tab === 'versions' ? <VersionsTab /> : null}
      {tab === 'files' ? <FilesTab /> : null}
      {tab === 'recycle' ? <RecycleTab /> : null}
    </div>
  );
}

Object.assign(window, { ExpurgoScreen });
