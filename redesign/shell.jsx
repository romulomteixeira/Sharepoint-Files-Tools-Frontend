/* shell.jsx — Sidebar, roteamento, tweaks e montagem da aplicação */
const { useState: useStateS, useEffect: useEffectS, useMemo: useMemoS } = React;

/* ── Acentos calibrados (par claro/escuro p/ contraste AA) ──────────── */
const ACCENTS = {
  original: { label: 'Azul atual',    light: '#2b6cb0', dark: '#5b9bd9' },
  fluent:   { label: 'Azul Fluent',   light: '#0f6cbd', dark: '#479ef5' },
  deep:     { label: 'Azul profundo', light: '#1e548f', dark: '#7fb3e3' },
  teal:     { label: 'Verde-azulado', light: '#0d7377', dark: '#3fc1c9' },
};

const NAV = [
  { section: 'secExec', items: [
    { id: 'dashboard', icon: 'dashboard', title: 'navDashboard', sub: 'navDashboardSub' },
    { id: 'reports',   icon: 'reports',   title: 'navReports',   sub: 'navReportsSub' },
    { id: 'licenses',  icon: 'licenses',  title: 'navLicenses',  sub: 'navLicensesSub' },
  ]},
  { section: 'secOps', items: [
    { id: 'scans',     icon: 'scan',      title: 'navScans',     sub: 'navScansSub' },
    { id: 'sites',     icon: 'sites',     title: 'navSites',     sub: 'navSitesSub' },
    { id: 'inventory', icon: 'inventory', title: 'navInventory', sub: 'navInventorySub' },
    { id: 'topfiles',  icon: 'topfiles',  title: 'navTopFiles',  sub: 'navTopFilesSub' },
    { id: 'oneration', icon: 'oneration', title: 'navOneration', sub: 'navOnerationSub' },
    { id: 'versioned', icon: 'versioned', title: 'navVersioned', sub: 'navVersionedSub' },
    { id: 'expurgo',   icon: 'expurgo',   title: 'navExpurgo',   sub: 'navExpurgoSub' },
  ]},
  { section: 'secGov', items: [
    { id: 'logs',      icon: 'logs',      title: 'navLogs',      sub: 'navLogsSub' },
    { id: 'audit',     icon: 'audit',     title: 'navAudit',     sub: 'navAuditSub' },
    { id: 'settings',  icon: 'settings',  title: 'navSettings',  sub: 'navSettingsSub' },
    { id: 'admin',     icon: 'admin',     title: 'navAdmin',     sub: 'navAdminSub' },
  ]},
];

const SCREENS = {
  dashboard: DashboardScreen, reports: ReportsScreen, licenses: LicensesScreen,
  scans: ScansScreen, sites: SitesScreen, job: JobScreen,
  inventory: InventoryScreen, topfiles: TopFilesScreen,
  oneration: OnerationScreen, versioned: VersionedScreen, expurgo: ExpurgoScreen,
  logs: LogsScreen, audit: AuditScreen, settings: SettingsScreen, admin: AdminScreen,
};

/* ── Sidebar ────────────────────────────────────────────────────────── */
function Sidebar({ route, setRoute, onLogout, variation, collapsed, onToggle }) {
  const { t } = useApp();
  const Caret = ICONS.chevR;
  const showSubs = variation === 'a'; // conservadora mantém subtítulos
  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="brand">
          <div className="logo">SP</div>
          <div className="brand-copy">
            <div className="brand-name">SharePoint Monitor</div>
            <div className="brand-tag">{t('brandTag')}</div>
          </div>
          <button type="button" className="side-collapse"
                  title={collapsed ? t('expandMenu') : t('collapseMenu')}
                  aria-label={collapsed ? t('expandMenu') : t('collapseMenu')}
                  onClick={onToggle}>
            <ICONS.panel size={15} />
          </button>
        </div>
        <div className="ws-badge">
          <span className="ws-label">{t('workspace')}</span>
          <span className="ws-value">SharePoint Online</span>
        </div>

        <nav className="nav" aria-label="Principal">
          {NAV.map(function (group) {
            return (
              <div key={group.section} className="nav-group">
                <div className="nav-section">{t(group.section)}</div>
                {group.items.map(function (item) {
                  const IconC = ICONS[item.icon];
                  return (
                    <button key={item.id} type="button" title={t(item.title)}
                            className={'nav-btn' + (route === item.id ? ' active' : '')}
                            onClick={function () { setRoute(item.id); }}>
                      <span className="nav-icon"><IconC size={16} /></span>
                      <span className="nav-copy">
                        <span className="nav-title">{t(item.title)}</span>
                        {showSubs ? <span className="nav-sub">{t(item.sub)}</span> : null}
                      </span>
                      <span className="nav-caret"><Caret size={13} /></span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="side-footer">
          <div className="side-user">
            <div className="side-avatar">RT</div>
            <div className="side-user-copy">
              <div className="side-user-name">Rômulo M. Teixeira</div>
              <div className="side-user-role">{t('admin')}</div>
            </div>
            <button type="button" className="side-logout" title={t('exit')} onClick={onLogout}>
              <ICONS.logout size={15} />
            </button>
          </div>
          <a className="api-link" href="#api-docs" onClick={function (e) { e.preventDefault(); }}>{t('apiDocs')} ↗</a>
        </div>
      </div>
    </aside>
  );
}

/* ── App ────────────────────────────────────────────────────────────── */
function App() {
  const [tw, setTweak] = useTweaks({
    variation: 'b',
    theme: 'light',
    lang: 'pt',
    density: 'compact',
    sidebar: 'expanded',
    accent: 'original',
    radius: 100,
  });

  const [route, setRoute] = useStateS(function () {
    try { return localStorage.getItem('spm-redesign-route') || 'dashboard'; } catch (e) { return 'dashboard'; }
  });
  const [loggedIn, setLoggedIn] = useStateS(true);

  useEffectS(function () {
    try { localStorage.setItem('spm-redesign-route', route); } catch (e) {}
  }, [route]);

  /* aplica eixos no <html> */
  useEffectS(function () {
    const el = document.documentElement;
    el.setAttribute('data-theme', tw.theme);
    el.setAttribute('data-variation', tw.variation);
    el.setAttribute('data-density', tw.density);
    el.setAttribute('data-sidebar', tw.sidebar);
    el.style.setProperty('--r-scale', String(tw.radius / 100));
    const acc = ACCENTS[tw.accent] || ACCENTS.original;
    el.style.setProperty('--accent', tw.theme === 'dark' ? acc.dark : acc.light);
    // acento legível sobre a sidebar escura, em qualquer tema
    el.style.setProperty('--accent-side', acc.dark);
  }, [tw.theme, tw.variation, tw.density, tw.sidebar, tw.radius, tw.accent]);

  const lang = tw.lang;
  const ctx = useMemoS(function () {
    return {
      lang: lang,
      t: function (key) { return (I18N[lang] && I18N[lang][key]) || I18N.pt[key] || key; },
      fmtNum: fmtNumFactory(lang),
      fmtBytes: fmtBytesFactory(lang),
      fmtDate: fmtDateFactory(lang),
      go: setRoute,
    };
  }, [lang]);

  const Screen = SCREENS[route] || DashboardScreen;

  const tweaksPanel = (
    <TweaksPanel title="Tweaks">
      <TweakSection label={lang === 'pt' ? 'Direção' : 'Direction'}>
        <TweakRadio label={lang === 'pt' ? 'Variação' : 'Variation'} value={tw.variation}
          options={[
            { value: 'a', label: lang === 'pt' ? 'Conservadora' : 'Conservative' },
            { value: 'b', label: lang === 'pt' ? 'Moderna' : 'Modern' },
            { value: 'c', label: lang === 'pt' ? 'Ousada' : 'Bold' },
          ]}
          onChange={function (v) { setTweak('variation', v); }} />
      </TweakSection>
      <TweakSection label={lang === 'pt' ? 'Aparência' : 'Appearance'}>
        <TweakRadio label={lang === 'pt' ? 'Tema' : 'Theme'} value={tw.theme}
          options={[{ value: 'light', label: lang === 'pt' ? 'Claro' : 'Light' }, { value: 'dark', label: lang === 'pt' ? 'Escuro' : 'Dark' }]}
          onChange={function (v) { setTweak('theme', v); }} />
        <TweakRadio label={lang === 'pt' ? 'Cor de destaque' : 'Accent'} value={tw.accent}
          options={Object.keys(ACCENTS).map(function (k) { return { value: k, label: ACCENTS[k].label }; })}
          onChange={function (v) { setTweak('accent', v); }} />
        <TweakSlider label={lang === 'pt' ? 'Raio (cantos)' : 'Corner radius'} value={tw.radius}
          min={40} max={200} step={10} unit="%"
          onChange={function (v) { setTweak('radius', v); }} />
      </TweakSection>
      <TweakSection label={lang === 'pt' ? 'Layout' : 'Layout'}>
        <TweakRadio label={lang === 'pt' ? 'Densidade' : 'Density'} value={tw.density}
          options={[
            { value: 'compact', label: lang === 'pt' ? 'Compacta' : 'Compact' },
            { value: 'comfortable', label: lang === 'pt' ? 'Confortável' : 'Comfy' },
          ]}
          onChange={function (v) { setTweak('density', v); }} />
        <TweakRadio label="Sidebar" value={tw.sidebar}
          options={[
            { value: 'expanded', label: lang === 'pt' ? 'Expandida' : 'Expanded' },
            { value: 'compact', label: lang === 'pt' ? 'Compacta' : 'Compact' },
          ]}
          onChange={function (v) { setTweak('sidebar', v); }} />
      </TweakSection>
      <TweakSection label={lang === 'pt' ? 'Conteúdo' : 'Content'}>
        <TweakRadio label={lang === 'pt' ? 'Idioma' : 'Language'} value={tw.lang}
          options={[{ value: 'pt', label: 'PT-BR' }, { value: 'en', label: 'EN-US' }]}
          onChange={function (v) { setTweak('lang', v); }} />
        <TweakToggle label={lang === 'pt' ? 'Tela de login' : 'Login screen'} value={!loggedIn}
          onChange={function (v) { setLoggedIn(!v); }} />
      </TweakSection>
    </TweaksPanel>
  );

  if (!loggedIn) {
    return (
      <AppCtx.Provider value={ctx}>
        <LoginScreen onLogin={function () { setLoggedIn(true); }} />
        {tweaksPanel}
      </AppCtx.Provider>
    );
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="shell">
        <Sidebar route={route} setRoute={setRoute} variation={tw.variation}
                 collapsed={tw.sidebar === 'compact'}
                 onToggle={function () { setTweak('sidebar', tw.sidebar === 'compact' ? 'expanded' : 'compact'); }}
                 onLogout={function () { setLoggedIn(false); }} />
        <main className="main">
          <Screen />
        </main>
      </div>
      {tweaksPanel}
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
