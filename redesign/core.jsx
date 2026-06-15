/* core.jsx — ícones, i18n, mock data, componentes compartilhados */
const { createContext, useContext, useState, useMemo } = React;

/* ── Ícones (estilo Lucide, stroke 1.8) ─────────────────────────────── */
const Ic = (paths) => (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" width={props.size || 16} height={props.size || 16}
       style={props.style}>{paths}</svg>
);
const ICONS = {
  dashboard: Ic(<><rect x="3" y="3" width="7" height="9" rx="1.2"/><rect x="14" y="3" width="7" height="5" rx="1.2"/><rect x="14" y="12" width="7" height="9" rx="1.2"/><rect x="3" y="16" width="7" height="5" rx="1.2"/></>),
  reports: Ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 17v-2"/><path d="M12 17v-4"/><path d="M16 17v-6"/></>),
  licenses: Ic(<><circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 8.5-8.5"/><path d="m15 5 3 3"/><path d="m18 8 2-2"/></>),
  sites: Ic(<><circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c2.7 2.6 4 6 4 9.5s-1.3 6.9-4 9.5c-2.7-2.6-4-6-4-9.5s1.3-6.9 4-9.5z"/></>),
  inventory: Ic(<><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></>),
  topfiles: Ic(<><path d="M3 3v17a1 1 0 0 0 1 1h17"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></>),
  oneration: Ic(<><path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></>),
  versioned: Ic(<><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 9.5h18"/><path d="M12 13v3.2l2.2 1.3"/></>),
  expurgo: Ic(<><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></>),
  scan: Ic(<><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v2"/></>),
  logs: Ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/><path d="M8 9h2"/></>),
  audit: Ic(<><path d="M12 22s8-3.6 8-10V5.5L12 2.5 4 5.5V12c0 6.4 8 10 8 10z"/><path d="m9 11.5 2 2 4-4"/></>),
  settings: Ic(<><path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/></>),
  admin: Ic(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>),
  refresh: Ic(<><path d="M3 12a9 9 0 0 1 15.3-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.3 6.4L3 16"/><path d="M3 21v-5h5"/></>),
  search: Ic(<><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.5-4.5"/></>),
  download: Ic(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>),
  plus: Ic(<><path d="M12 5v14"/><path d="M5 12h14"/></>),
  x: Ic(<><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>),
  check: Ic(<path d="M20 6 9 17l-5-5"/>),
  chevR: Ic(<path d="m9 18 6-6-6-6"/>),
  chevD: Ic(<path d="m6 9 6 6 6-6"/>),
  logout: Ic(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>),
  external: Ic(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></>),
  filter: Ic(<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>),
  alert: Ic(<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>),
  clock: Ic(<><circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.5 2"/></>),
  panel: Ic(<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9.5 3v18"/></>),
  arrowR: Ic(<><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>),
  play: Ic(<path d="m6 4 14 8-14 8z"/>),
  stop: Ic(<rect x="6" y="6" width="12" height="12" rx="1.5"/>),
  eye: Ic(<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>),
  key: Ic(<><circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 8.5-8.5"/><path d="m15 5 3 3"/></>),
  user: Ic(<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  lock: Ic(<><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></>),
};

/* ── i18n ───────────────────────────────────────────────────────────── */
const I18N = {
  pt: {
    brandTag: 'Inventário • Consumo • Retenção', workspace: 'Workspace',
    secExec: 'Visão executiva', secOps: 'Operação', secGov: 'Governança e suporte',
    navDashboard: 'Dashboard', navDashboardSub: 'KPIs, tendência e consumo',
    navReports: 'Relatórios', navReportsSub: 'Exportações e Top 500',
    navLicenses: 'Licenças & Espaço', navLicensesSub: 'Origem da capacidade',
    navSites: 'Sites', navSitesSub: 'Último inventário por site',
    navScans: 'Realizar Scans', navScansSub: 'Configurar e executar varreduras',
    navInventory: 'Inventário', navInventorySub: 'Arquivos, filtros e base',
    navTopFiles: 'Top Arquivos', navTopFilesSub: 'Maiores e mais versionados',
    navOneration: 'Monitor Oneração', navOnerationSub: 'Crescimento e impacto',
    navVersioned: 'Versionados por Período', navVersionedSub: 'Dia, semana e mês',
    navExpurgo: 'Simulação de Expurgo', navExpurgoSub: 'Retenção e economia',
    navLogs: 'Logs', navLogsSub: 'Jobs, erros e auditoria',
    navAudit: 'Auditoria', navAuditSub: 'Trilha de ações',
    navSettings: 'Configurações', navSettingsSub: 'Token, limites e motor',
    navAdmin: 'Administração', navAdminSub: 'Usuários e acesso',
    operator: 'Operador', admin: 'Administrador', exit: 'Sair', apiDocs: 'API Docs',
    collapseMenu: 'Recolher menu', expandMenu: 'Expandir menu',
    refresh: 'Atualizar', newScan: 'Novo Scan', cancelScan: 'Cancelar scan',
    goInventory: 'Ir para Inventário', scanBase: 'Base do scan', live: 'Ao vivo',
    snapshot: 'Snapshot', updatedAt: 'Atualizado', autoRefresh: 'atualização automática a cada 8 s',
    sites: 'Sites', drives: 'Drives', files: 'Arquivos', volume: 'Volume total',
    versions: 'Versões', scanStatus: 'Status do scan', total: 'total',
    completed: 'Concluído', running: 'Em execução', pending: 'Aguardando',
    failed: 'Com falha', cancelled: 'Cancelado', completedAt: 'Concluído em',
    scanProgress: 'Progresso da varredura', final: 'Final', baseReady: 'Base pronta',
    waiting: 'Aguardando', sitesDone: 'Sites processados', drivesRead: 'Bibliotecas lidas',
    topExt: 'Extensões mais frequentes', byFileCount: 'Por quantidade de arquivos',
    top10: 'Top 10 maiores arquivos', clickToOpen: 'Clique no nome para abrir no SharePoint',
    name: 'Nome', ext: 'Ext.', size: 'Tamanho', viewFullInv: 'Ver inventário completo',
    filesCount: 'arq.',
    dashTitle: 'Dashboard', dashSub: 'Visão geral do consumo e inventário',
    sitesTitle: 'Sites', sitesSub: 'Inicie um inventário completo ou escolha sites específicos.',
    fullScan: 'Scan completo do tenant', fullScanSub: 'Varre todos os sites e bibliotecas do SharePoint Online.',
    selectiveScan: 'Scan por seleção', selectiveScanSub: 'Escolha sites específicos para varrer.',
    startFull: 'Iniciar scan completo', startSelected: 'Varrer selecionados',
    siteName: 'Site', lastScan: 'Último scan', history: 'Histórico de scans',
    type: 'Tipo', mode: 'Modo', status: 'Status', createdAt: 'Criado em', actions: 'Ações',
    full: 'Completo', selective: 'Seleção', withVersions: 'Com versões', noVersions: 'Sem versões',
    invTitle: 'Inventário de Arquivos', invSub: 'Arquivos, filtros e exportação da base',
    searchPh: 'Buscar por nome de arquivo…', allSites: 'Todos os sites', allExts: 'Todas extensões',
    minSize: 'Tamanho mín.', exportCsv: 'Exportar CSV', exportJsonl: 'Exportar JSONL',
    site: 'Site', modified: 'Modificado', path: 'Caminho', clickToFilter: 'Clique para filtrar',
    results: 'resultados', page: 'Página', of: 'de', prev: 'Anterior', next: 'Próxima',
    topTitle: 'Top Arquivos', topSub: 'Maiores arquivos do inventário — ordenados por tamanho',
    rankBySize: 'Por tamanho', rankByVersions: 'Por versões', limit: 'Limite',
    versionsCount: 'Versões', versionsBytes: 'Volume versões',
    onTitle: 'Monitor de Oneração', onSub: 'Evolução do consumo de armazenamento entre scans',
    growth: 'Crescimento', sinceFirst: 'desde o 1º scan', perScan: 'Consumo por scan',
    scan: 'Scan', date: 'Data', delta: 'Variação',
    vpTitle: 'Versionados por Período', vpSub: 'Arquivos versionados agrupados por dia, semana ou mês',
    day: 'Diário', week: 'Semanal', month: 'Mensal', period: 'Período',
    totalVersions: 'Total versões', versionVolume: 'Volume das versões',
    periodsWithData: 'Períodos com dados', grouping: 'Agrupamento',
    exTitle: 'Simulação de Expurgo', exSub: 'Configure regras de retenção, simule o impacto e execute com confirmação dupla',
    retentionRules: 'Regras de retenção', keepLast: 'Manter últimas N versões',
    olderThan: 'Versões mais antigas que', days: 'dias', minVersionSize: 'Tamanho mínimo da versão',
    simulate: 'Simular impacto', executing: 'Executar expurgo', simResult: 'Resultado da simulação',
    versionsToPurge: 'Versões a expurgar', spaceFreed: 'Espaço liberado', filesAffected: 'Arquivos afetados',
    preview: 'Pré-visualização do impacto', folder: 'Pasta', deletedBy: 'Excluído por', deletedAt: 'Excluído em', item: 'Item',
    confirmTitle: 'Confirmação dupla necessária', confirmBody: 'Esta ação remove versões permanentemente. Digite EXPURGAR para confirmar.',
    confirmPh: 'Digite EXPURGAR', confirm: 'Confirmar execução', cancel: 'Cancelar',
    lgTitle: 'Logs de Sistema', lgSub: 'Eventos de jobs, scans, versões e erros do servidor',
    level: 'Nível', source: 'Fonte / Kind', message: 'Mensagem', scanJob: 'Scan / Job',
    allLevels: 'Todos os níveis', auto: 'Auto-refresh',
    auTitle: 'Trilha de Auditoria', auSub: 'Ações administrativas: criação de scans, expurgos, exports e configurações',
    when: 'Quando', userCol: 'Usuário', target: 'Destino', action: 'Ação',
    cfTitle: 'Configurações', cfSub: 'Token Microsoft Graph, motor de scan, versões e branding',
    tabToken: 'Token Graph', tabEngine: 'Motor de scan', tabVersions: 'Versões', tabBranding: 'Branding',
    tenantId: 'Tenant ID', clientId: 'Client ID', clientSecret: 'Client Secret',
    testConn: 'Testar conexão', connOk: 'Conexão válida — expira em 54 min',
    parallel: 'Drives em paralelo', pageSize: 'Tamanho de página (Graph)', timeout: 'Timeout por request (s)',
    versionsModel: 'Modelo de versionamento', vNone: 'Não calcular automaticamente',
    vTop: 'Somente Top arquivos (recomendado)', vAll: 'Todos (muito lento)', topLimit: 'Limite do Top',
    loginTitle2: 'Título da tela de login', loginSub2: 'Subtítulo da tela de login',
    save: 'Salvar alterações', edit: 'Editar', saved: 'Configurações salvas.',
    adTitle: 'Administração de Usuários', adSub: 'Criação, restrição e gerenciamento de contas locais',
    newUser: 'Novo usuário', username: 'Username', displayName: 'Nome de Exibição',
    role: 'Papel', active: 'Ativo', restricted: 'Restrito', roleAdmin: 'Admin', roleOperator: 'Operador', roleViewer: 'Leitor',
    lcTitle: 'Licenças & Espaço', lcSub: 'Capacidade alocada, consumo atual e projeção de crescimento',
    allocated: 'Alocado pelo tenant', estimated: 'Estimado por licenças', used: 'Em uso',
    free: 'Disponível', skus: 'SKUs e contribuição de espaço', sku: 'SKU', actives: 'Ativos',
    suspended: 'Suspensos', warning: 'Aviso', contribution: 'Contribuição (GB)',
    capacityUse: 'Uso da capacidade', projection: 'Projeção: capacidade esgota em ~14 meses no ritmo atual',
    rpTitle: 'Relatórios & Exportações', rpSub: 'Gere arquivos CSV ou JSONL do inventário com filtros personalizados',
    format: 'Formato', columns: 'Colunas', generate: 'Gerar relatório',
    exportHistory: 'Histórico de exportações', generatedAt: 'Gerado em', rows: 'Linhas', ready: 'Pronto', generating: 'Gerando…',
    loginWelcome: 'Acesse com sua conta local', loginUser: 'Usuário', loginPass: 'Senha',
    loginBtn: 'Entrar', loginHint: 'Acesso restrito a operadores autorizados',
    selectAll: 'Selecionar todos', selected: 'selecionados',
    sortBy: 'Ordenar por',
    /* Realizar Scans */
    scTitle: 'Realizar Scans', scSub: 'Inicie um inventário completo ou escolha sites específicos.',
    newScanPanel: 'Iniciar novo scan', scope: 'Escopo da varredura',
    scopeAll: 'Tenant completo (todos os sites)', scopeSel: 'Sites selecionados',
    findSites: 'Localizar e selecionar sites', keyword: 'Palavra-chave, nome ou URL',
    listCount: 'Quantidade a listar', perPage: 'Itens/página', existingScans: 'Scans existentes',
    follow: 'Acompanhar', searchBtn: 'Buscar',
    /* Sites */
    siTitle: 'Sites', siSub: 'Último inventário disponível por site — clique em um site para detalhar',
    libraries: 'Bibliotecas', extSpace: 'Extensões — espaço utilizado',
    searchFile: 'Buscar arquivo', searchFilePh: 'Nome ou caminho…', show: 'Exibir',
    filtered: 'filtrados', file: 'Arquivo', vSpace: 'Esp. versões', totalCol: 'Total',
    filesOnServer: 'arquivos no servidor', closeDrill: 'Fechar detalhe',
    sizeDesc: 'Tamanho ↓', sizeAsc: 'Tamanho ↑', verDesc: 'Versões ↓', totDesc: 'Total ↓',
    /* Expurgo (abas + etapas) */
    tabVersionsE: 'Versões', tabFilesE: 'Arquivos', tabRecycleE: 'Lixeira',
    step1: '1. Configurar', step2: '2. Simular', step3: '3. Executar',
    cfgRules: 'Configuração das Regras', fileCriteria: 'Critérios de Exclusão de Arquivos',
    cleanScope: 'Escopo da Limpeza', previewExp: 'Preview do Expurgo',
    previewFiles: 'Preview do Expurgo de Arquivos', previewBin: 'Preview da Lixeira',
    irreversible: 'Esta operação é irreversível.',
    jobProgressE: 'Progresso do Expurgo', newPurgeBtn: 'Novo Expurgo',
    queryBin: 'Consultar Lixeira', cleanBin: 'Limpar Lixeira Agora',
    itemsInBin: 'Itens na lixeira', sitesAffected: 'Sites afetados',
    anyAge: 'Qualquer idade', anySize: 'Qualquer tamanho', notModified: 'Não modificado há',
    biggerThan: 'Maior que', appliedRules: 'Regras aplicadas', criterion: 'Critério',
    affectedFiles: 'Arquivos afetados', toFree: 'Espaço a liberar', filesToDelete: 'Arquivos a excluir',
    allSitesScope: 'Todos os sites', selSitesScope: 'Sites selecionados',
    binEmpty: 'A lixeira está vazia para o escopo selecionado.',
    verWarn: 'As versões excedentes serão removidas permanentemente do SharePoint.',
    fileWarn: 'Os arquivos serão movidos para a Lixeira do SharePoint e removidos após o período de retenção do tenant.',
    binWarn: 'Os itens serão removidos permanentemente da lixeira do SharePoint.',
    activeBadge: 'Ativo',
    /* Job */
    jobTitle: 'Progresso do Job', jobType: 'Tipo', startedAt: 'Iniciado em',
    tasksDone: 'Tarefas concluídas', pendingChip: 'Pendentes', runningChip: 'Em execução',
    failedChip: 'Com falha', jobDoneMsg: 'Job concluído com sucesso!', viewInv: 'Ver Inventário',
    backToScans: 'Scans',
    /* Configurações (acordeão) */
    secOauth: 'OAuth2 / OpenID Connect', secOauthSub: 'Login Microsoft, domínios e perfis por grupos do Entra ID',
    secSmtp: 'SMTP', secSmtpSub: 'Envio de primeiro acesso, redefinição e notificações',
    secGraph: 'Credenciais Microsoft Graph', secGraphSub: 'Tenant ID, Client ID e credenciais de serviço',
    secEngine: 'Motor de Scan', secEngineSub: 'Concorrência de workers e limite de páginas',
    secSched: 'Agendamento (Scheduler)', secSchedSub: 'Execução server-side mesmo com o navegador fechado',
    secAutoV: 'Versões Automáticas', secAutoVSub: 'Coleta automática de histórico de versões',
    secVWork: 'Workers de Versão', secVWorkSub: 'Processos paralelos dedicados ao enriquecimento de versões',
    secBrand: 'Branding da Tela de Login', secBrandSub: 'Título e subtítulo exibidos na página de login',
    oauthEnable: 'Habilitar login Microsoft', allowedDomains: 'Domínios permitidos',
    smtpHost: 'SMTP Host', smtpPort: 'Porta', smtpUser: 'Usuário', smtpFrom: 'Remetente (From)',
    concurrency: 'Concorrência', concurrencyHint: 'Workers paralelos (1–20)', maxPages: 'Limite de páginas',
    schedEnable: 'Habilitar agendamento', cron: 'Expedição (cron)', nextRun: 'Próxima execução',
    vWorkers: 'Workers dedicados', vWorkersHint: 'Processos paralelos de enriquecimento',
    /* Login */
    orSep: 'ou', msLogin: 'Entrar com Microsoft', firstAccess: 'Primeiro acesso do admin',
  },
  en: {
    brandTag: 'Inventory • Usage • Retention', workspace: 'Workspace',
    secExec: 'Executive view', secOps: 'Operations', secGov: 'Governance & support',
    navDashboard: 'Dashboard', navDashboardSub: 'KPIs, trends and usage',
    navReports: 'Reports', navReportsSub: 'Exports and Top 500',
    navLicenses: 'Licenses & Space', navLicensesSub: 'Capacity source',
    navSites: 'Sites', navSitesSub: 'Latest inventory per site',
    navScans: 'Run Scans', navScansSub: 'Configure and execute scans',
    navInventory: 'Inventory', navInventorySub: 'Files, filters and base',
    navTopFiles: 'Top Files', navTopFilesSub: 'Largest and most versioned',
    navOneration: 'Storage Monitor', navOnerationSub: 'Growth and impact',
    navVersioned: 'Versioned by Period', navVersionedSub: 'Day, week and month',
    navExpurgo: 'Purge Simulation', navExpurgoSub: 'Retention and savings',
    navLogs: 'Logs', navLogsSub: 'Jobs, errors and audit',
    navAudit: 'Audit Trail', navAuditSub: 'Action tracking',
    navSettings: 'Settings', navSettingsSub: 'Token, limits and engine',
    navAdmin: 'Administration', navAdminSub: 'Users and access',
    operator: 'Operator', admin: 'Administrator', exit: 'Sign out', apiDocs: 'API Docs',
    collapseMenu: 'Collapse menu', expandMenu: 'Expand menu',
    refresh: 'Refresh', newScan: 'New Scan', cancelScan: 'Cancel scan',
    goInventory: 'Go to Inventory', scanBase: 'Scan base', live: 'Live',
    snapshot: 'Snapshot', updatedAt: 'Updated', autoRefresh: 'auto-refresh every 8 s',
    sites: 'Sites', drives: 'Drives', files: 'Files', volume: 'Total volume',
    versions: 'Versions', scanStatus: 'Scan status', total: 'total',
    completed: 'Completed', running: 'Running', pending: 'Pending',
    failed: 'Failed', cancelled: 'Cancelled', completedAt: 'Completed',
    scanProgress: 'Scan progress', final: 'Final', baseReady: 'Base ready',
    waiting: 'Waiting', sitesDone: 'Sites processed', drivesRead: 'Libraries read',
    topExt: 'Most frequent extensions', byFileCount: 'By file count',
    top10: 'Top 10 largest files', clickToOpen: 'Click a name to open in SharePoint',
    name: 'Name', ext: 'Ext.', size: 'Size', viewFullInv: 'View full inventory',
    filesCount: 'files',
    dashTitle: 'Dashboard', dashSub: 'Overview of usage and inventory',
    sitesTitle: 'Sites', sitesSub: 'Start a full inventory or pick specific sites.',
    fullScan: 'Full tenant scan', fullScanSub: 'Scans every SharePoint Online site and library.',
    selectiveScan: 'Selective scan', selectiveScanSub: 'Pick specific sites to scan.',
    startFull: 'Start full scan', startSelected: 'Scan selected',
    siteName: 'Site', lastScan: 'Last scan', history: 'Scan history',
    type: 'Type', mode: 'Mode', status: 'Status', createdAt: 'Created at', actions: 'Actions',
    full: 'Full', selective: 'Selective', withVersions: 'With versions', noVersions: 'No versions',
    invTitle: 'File Inventory', invSub: 'Files, filters and base export',
    searchPh: 'Search by file name…', allSites: 'All sites', allExts: 'All extensions',
    minSize: 'Min. size', exportCsv: 'Export CSV', exportJsonl: 'Export JSONL',
    site: 'Site', modified: 'Modified', path: 'Path', clickToFilter: 'Click to filter',
    results: 'results', page: 'Page', of: 'of', prev: 'Previous', next: 'Next',
    topTitle: 'Top Files', topSub: 'Largest files in the inventory — sorted by size',
    rankBySize: 'By size', rankByVersions: 'By versions', limit: 'Limit',
    versionsCount: 'Versions', versionsBytes: 'Version volume',
    onTitle: 'Storage Monitor', onSub: 'Storage usage evolution across scans',
    growth: 'Growth', sinceFirst: 'since first scan', perScan: 'Usage per scan',
    scan: 'Scan', date: 'Date', delta: 'Delta',
    vpTitle: 'Versioned by Period', vpSub: 'Versioned files grouped by day, week or month',
    day: 'Daily', week: 'Weekly', month: 'Monthly', period: 'Period',
    totalVersions: 'Total versions', versionVolume: 'Version volume',
    periodsWithData: 'Periods with data', grouping: 'Grouping',
    exTitle: 'Purge Simulation', exSub: 'Configure retention rules, simulate impact and execute with double confirmation',
    retentionRules: 'Retention rules', keepLast: 'Keep last N versions',
    olderThan: 'Versions older than', days: 'days', minVersionSize: 'Minimum version size',
    simulate: 'Simulate impact', executing: 'Execute purge', simResult: 'Simulation result',
    versionsToPurge: 'Versions to purge', spaceFreed: 'Space freed', filesAffected: 'Files affected',
    preview: 'Impact preview', folder: 'Folder', deletedBy: 'Deleted by', deletedAt: 'Deleted at', item: 'Item',
    confirmTitle: 'Double confirmation required', confirmBody: 'This action removes versions permanently. Type PURGE to confirm.',
    confirmPh: 'Type PURGE', confirm: 'Confirm execution', cancel: 'Cancel',
    lgTitle: 'System Logs', lgSub: 'Job, scan, version events and server errors',
    level: 'Level', source: 'Source / Kind', message: 'Message', scanJob: 'Scan / Job',
    allLevels: 'All levels', auto: 'Auto-refresh',
    auTitle: 'Audit Trail', auSub: 'Administrative actions: scans, purges, exports and settings',
    when: 'When', userCol: 'User', target: 'Target', action: 'Action',
    cfTitle: 'Settings', cfSub: 'Microsoft Graph token, scan engine, versions and branding',
    tabToken: 'Graph Token', tabEngine: 'Scan engine', tabVersions: 'Versions', tabBranding: 'Branding',
    tenantId: 'Tenant ID', clientId: 'Client ID', clientSecret: 'Client Secret',
    testConn: 'Test connection', connOk: 'Valid connection — expires in 54 min',
    parallel: 'Parallel drives', pageSize: 'Page size (Graph)', timeout: 'Request timeout (s)',
    versionsModel: 'Versioning model', vNone: 'Do not compute automatically',
    vTop: 'Top files only (recommended)', vAll: 'All (very slow)', topLimit: 'Top limit',
    loginTitle2: 'Login screen title', loginSub2: 'Login screen subtitle',
    save: 'Save changes', edit: 'Edit', saved: 'Settings saved.',
    adTitle: 'User Administration', adSub: 'Create, restrict and manage local accounts',
    newUser: 'New user', username: 'Username', displayName: 'Display Name',
    role: 'Role', active: 'Active', restricted: 'Restricted', roleAdmin: 'Admin', roleOperator: 'Operator', roleViewer: 'Viewer',
    lcTitle: 'Licenses & Space', lcSub: 'Allocated capacity, current usage and growth projection',
    allocated: 'Tenant allocated', estimated: 'License estimated', used: 'In use',
    free: 'Available', skus: 'SKUs and space contribution', sku: 'SKU', actives: 'Active',
    suspended: 'Suspended', warning: 'Warning', contribution: 'Contribution (GB)',
    capacityUse: 'Capacity usage', projection: 'Projection: capacity runs out in ~14 months at current pace',
    rpTitle: 'Reports & Exports', rpSub: 'Generate CSV or JSONL files from inventory with custom filters',
    format: 'Format', columns: 'Columns', generate: 'Generate report',
    exportHistory: 'Export history', generatedAt: 'Generated at', rows: 'Rows', ready: 'Ready', generating: 'Generating…',
    loginWelcome: 'Sign in with your local account', loginUser: 'Username', loginPass: 'Password',
    loginBtn: 'Sign in', loginHint: 'Restricted to authorized operators',
    selectAll: 'Select all', selected: 'selected',
    sortBy: 'Sort by',
    /* Run Scans */
    scTitle: 'Run Scans', scSub: 'Start a full inventory or pick specific sites.',
    newScanPanel: 'Start new scan', scope: 'Scan scope',
    scopeAll: 'Full tenant (all sites)', scopeSel: 'Selected sites',
    findSites: 'Find and select sites', keyword: 'Keyword, name or URL',
    listCount: 'Items to list', perPage: 'Items/page', existingScans: 'Existing scans',
    follow: 'Follow', searchBtn: 'Search',
    /* Sites */
    siTitle: 'Sites', siSub: 'Latest available inventory per site — click a site to drill down',
    libraries: 'Libraries', extSpace: 'Extensions — space used',
    searchFile: 'Search file', searchFilePh: 'Name or path…', show: 'Show',
    filtered: 'filtered', file: 'File', vSpace: 'Version space', totalCol: 'Total',
    filesOnServer: 'files on server', closeDrill: 'Close detail',
    sizeDesc: 'Size ↓', sizeAsc: 'Size ↑', verDesc: 'Versions ↓', totDesc: 'Total ↓',
    /* Purge (tabs + steps) */
    tabVersionsE: 'Versions', tabFilesE: 'Files', tabRecycleE: 'Recycle Bin',
    step1: '1. Configure', step2: '2. Simulate', step3: '3. Execute',
    cfgRules: 'Rule Configuration', fileCriteria: 'File Deletion Criteria',
    cleanScope: 'Cleanup Scope', previewExp: 'Purge Preview',
    previewFiles: 'File Purge Preview', previewBin: 'Recycle Bin Preview',
    irreversible: 'This operation is irreversible.',
    jobProgressE: 'Purge Progress', newPurgeBtn: 'New Purge',
    queryBin: 'Query Recycle Bin', cleanBin: 'Empty Recycle Bin Now',
    itemsInBin: 'Items in bin', sitesAffected: 'Sites affected',
    anyAge: 'Any age', anySize: 'Any size', notModified: 'Not modified for',
    biggerThan: 'Larger than', appliedRules: 'Applied rules', criterion: 'Criterion',
    affectedFiles: 'Affected files', toFree: 'Space to free', filesToDelete: 'Files to delete',
    allSitesScope: 'All sites', selSitesScope: 'Selected sites',
    binEmpty: 'The recycle bin is empty for the selected scope.',
    verWarn: 'Excess versions will be permanently removed from SharePoint.',
    fileWarn: 'Files will be moved to the SharePoint Recycle Bin and removed after the tenant retention period.',
    binWarn: 'Items will be permanently removed from the SharePoint recycle bin.',
    activeBadge: 'Active',
    /* Job */
    jobTitle: 'Job Progress', jobType: 'Type', startedAt: 'Started at',
    tasksDone: 'Tasks completed', pendingChip: 'Pending', runningChip: 'Running',
    failedChip: 'Failed', jobDoneMsg: 'Job completed successfully!', viewInv: 'View Inventory',
    backToScans: 'Scans',
    /* Settings (accordion) */
    secOauth: 'OAuth2 / OpenID Connect', secOauthSub: 'Microsoft login, domains and Entra ID group profiles',
    secSmtp: 'SMTP', secSmtpSub: 'First-access, reset and notification e-mails',
    secGraph: 'Microsoft Graph Credentials', secGraphSub: 'Tenant ID, Client ID and service credentials',
    secEngine: 'Scan Engine', secEngineSub: 'Worker concurrency and page limits',
    secSched: 'Scheduling (Scheduler)', secSchedSub: 'Server-side execution even with the browser closed',
    secAutoV: 'Automatic Versions', secAutoVSub: 'Automatic version history collection',
    secVWork: 'Version Workers', secVWorkSub: 'Parallel processes dedicated to version enrichment',
    secBrand: 'Login Screen Branding', secBrandSub: 'Title and subtitle shown on the login page',
    oauthEnable: 'Enable Microsoft login', allowedDomains: 'Allowed domains',
    smtpHost: 'SMTP Host', smtpPort: 'Port', smtpUser: 'User', smtpFrom: 'Sender (From)',
    concurrency: 'Concurrency', concurrencyHint: 'Parallel workers (1–20)', maxPages: 'Page limit',
    schedEnable: 'Enable scheduling', cron: 'Schedule (cron)', nextRun: 'Next run',
    vWorkers: 'Dedicated workers', vWorkersHint: 'Parallel enrichment processes',
    /* Login */
    orSep: 'or', msLogin: 'Sign in with Microsoft', firstAccess: 'Admin first access',
  },
};

/* ── Contexto da aplicação ──────────────────────────────────────────── */
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

/* ── Formatadores ───────────────────────────────────────────────────── */
function fmtBytesFactory(lang) {
  return (n) => {
    if (!n) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let v = n, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    const s = v >= 10 ? v.toFixed(1) : v.toFixed(2);
    return `${lang === 'pt' ? s.replace('.', ',') : s} ${units[i]}`;
  };
}
function fmtNumFactory(lang) {
  return (n) => n != null ? n.toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US') : '—';
}
function fmtDateFactory(lang) {
  return (iso) => new Date(iso).toLocaleString(lang === 'pt' ? 'pt-BR' : 'en-US', { dateStyle: 'short', timeStyle: 'short' });
}

/* ── Mock data ──────────────────────────────────────────────────────── */
const GB = 1024 ** 3, MB = 1024 ** 2, TB = 1024 ** 4;
const MOCK = {
  scans: [
    { id: 'a8f3c21d', status: 'running',   date: '2026-06-10T09:12:00', sites: 42, sitesTotal: 67, drives: 118, drivesTotal: 203, files: 1284503, bytes: 3.62 * TB, versions: 88210, versionsTotal: 191400, versionsBytes: 0.94 * TB, type: 'full', mode: 'withVersions' },
    { id: 'f51b09ae', status: 'completed', date: '2026-06-03T22:40:00', sites: 67, sitesTotal: 67, drives: 203, drivesTotal: 203, files: 1261877, bytes: 3.48 * TB, versions: 189342, versionsTotal: 189342, versionsBytes: 0.91 * TB, type: 'full', mode: 'withVersions' },
    { id: 'c2d77e10', status: 'completed', date: '2026-05-27T21:15:00', sites: 67, sitesTotal: 67, drives: 201, drivesTotal: 201, files: 1240212, bytes: 3.39 * TB, versions: 184501, versionsTotal: 184501, versionsBytes: 0.88 * TB, type: 'full', mode: 'withVersions' },
    { id: '9e04b6c7', status: 'completed', date: '2026-05-20T20:58:00', sites: 12, sitesTotal: 12, drives: 31,  drivesTotal: 31,  files: 198311,  bytes: 0.61 * TB, versions: 31280, versionsTotal: 31280, versionsBytes: 0.16 * TB, type: 'selective', mode: 'withVersions' },
    { id: '4b1a8d92', status: 'failed',    date: '2026-05-13T23:02:00', sites: 38, sitesTotal: 67, drives: 96,  drivesTotal: 199, files: 704228,  bytes: 1.92 * TB, versions: 0, versionsTotal: 0, versionsBytes: 0, type: 'full', mode: 'noVersions' },
  ],
  topExt: [
    { ext: '.pptx', count: 214380, bytes: 1.21 * TB }, { ext: '.xlsx', count: 198204, bytes: 0.48 * TB },
    { ext: '.docx', count: 187930, bytes: 0.31 * TB }, { ext: '.pdf', count: 164102, bytes: 0.56 * TB },
    { ext: '.mp4', count: 22841, bytes: 0.49 * TB },   { ext: '.psd', count: 9384, bytes: 0.22 * TB },
    { ext: '.zip', count: 8112, bytes: 0.18 * TB },    { ext: '.png', count: 96433, bytes: 0.09 * TB },
  ],
  topFiles: [
    { name: 'Video_Institucional_2026_final_v8.mp4', site: 'marketing', ext: '.mp4', bytes: 18.4 * GB, versions: 8, vBytes: 96.2 * GB, modified: '2026-04-18T10:22:00' },
    { name: 'Backup_Projeto_Aurora_completo.zip', site: 'projetos-engenharia', ext: '.zip', bytes: 12.1 * GB, versions: 3, vBytes: 33.9 * GB, modified: '2026-03-02T16:01:00' },
    { name: 'Treinamento_Onboarding_Q1.mp4', site: 'rh-pessoas', ext: '.mp4', bytes: 9.8 * GB, versions: 5, vBytes: 44.7 * GB, modified: '2026-02-11T09:45:00' },
    { name: 'Catalogo_Produtos_master.psd', site: 'marketing', ext: '.psd', bytes: 7.2 * GB, versions: 42, vBytes: 271.3 * GB, modified: '2026-06-01T14:30:00' },
    { name: 'Base_Historica_Vendas_2019-2025.xlsx', site: 'comercial', ext: '.xlsx', bytes: 4.9 * GB, versions: 118, vBytes: 412.5 * GB, modified: '2026-06-08T08:12:00' },
    { name: 'Planta_Fabrica_Unidade_SP_rev32.dwg', site: 'projetos-engenharia', ext: '.dwg', bytes: 3.8 * GB, versions: 32, vBytes: 98.1 * GB, modified: '2026-05-22T11:08:00' },
    { name: 'Apresentacao_Diretoria_Resultados.pptx', site: 'diretoria', ext: '.pptx', bytes: 2.7 * GB, versions: 64, vBytes: 144.0 * GB, modified: '2026-06-09T17:55:00' },
    { name: 'Manual_Integracao_ERP_v12.pdf', site: 'ti-corporativo', ext: '.pdf', bytes: 2.1 * GB, versions: 12, vBytes: 21.4 * GB, modified: '2026-01-28T13:20:00' },
    { name: 'Fotos_Evento_Convencao_2025.zip', site: 'marketing', ext: '.zip', bytes: 1.9 * GB, versions: 2, vBytes: 3.7 * GB, modified: '2025-11-30T19:42:00' },
    { name: 'Dataset_Telemetria_Maquinas.csv', site: 'operacoes', ext: '.csv', bytes: 1.6 * GB, versions: 27, vBytes: 38.9 * GB, modified: '2026-06-05T07:30:00' },
  ],
  sites: [
    { name: 'intranet-corporativa', files: 312840, bytes: 0.84 * TB, lastScan: '2026-06-03' },
    { name: 'projetos-engenharia', files: 248113, bytes: 1.12 * TB, lastScan: '2026-06-03' },
    { name: 'marketing', files: 196402, bytes: 0.71 * TB, lastScan: '2026-06-03' },
    { name: 'comercial', files: 152230, bytes: 0.28 * TB, lastScan: '2026-06-03' },
    { name: 'rh-pessoas', files: 121857, bytes: 0.19 * TB, lastScan: '2026-06-03' },
    { name: 'ti-corporativo', files: 98441, bytes: 0.16 * TB, lastScan: '2026-06-03' },
    { name: 'financeiro', files: 74019, bytes: 0.09 * TB, lastScan: '2026-06-03' },
    { name: 'diretoria', files: 31206, bytes: 0.07 * TB, lastScan: '2026-06-03' },
  ],
  logs: [
    { t: '2026-06-10T09:31:42', level: 'info',  src: 'scan.engine', msg: 'Drive "Documentos Compartilhados" concluído — 18.302 arquivos', ref: 'a8f3c21d' },
    { t: '2026-06-10T09:30:11', level: 'info',  src: 'scan.engine', msg: 'Iniciando varredura do site projetos-engenharia', ref: 'a8f3c21d' },
    { t: '2026-06-10T09:28:55', level: 'warn',  src: 'graph.api',   msg: 'Throttling 429 — aguardando 12 s (retry 2/5)', ref: 'a8f3c21d' },
    { t: '2026-06-10T09:25:03', level: 'info',  src: 'versions',    msg: 'Versões enriquecidas para 4.218 arquivos do top', ref: 'a8f3c21d' },
    { t: '2026-06-10T08:14:30', level: 'error', src: 'graph.api',   msg: 'Falha ao ler drive b!9f2: itemNotFound (site arquivado?)', ref: 'a8f3c21d' },
    { t: '2026-06-09T18:02:17', level: 'info',  src: 'export',      msg: 'Export CSV concluído — 1.261.877 linhas (214 MB)', ref: 'job-7741' },
    { t: '2026-06-09T17:58:40', level: 'info',  src: 'export',      msg: 'Export CSV solicitado por mteixeira', ref: 'job-7741' },
    { t: '2026-06-08T03:00:02', level: 'info',  src: 'scheduler',   msg: 'Limpeza de jobs antigos: 12 registros removidos', ref: '—' },
    { t: '2026-06-07T22:41:09', level: 'warn',  src: 'auth',        msg: 'Token Graph expira em 7 dias — renovação recomendada', ref: '—' },
    { t: '2026-06-03T22:40:51', level: 'info',  src: 'scan.engine', msg: 'Scan f51b09ae concluído em 4h12min', ref: 'f51b09ae' },
  ],
  audit: [
    { t: '2026-06-10T09:12:00', user: 'mteixeira', action: 'scan.create', target: 'a8f3c21d', msg: 'Scan completo iniciado (com versões)' },
    { t: '2026-06-09T17:58:40', user: 'mteixeira', action: 'export.csv', target: 'f51b09ae', msg: 'Export CSV do inventário completo' },
    { t: '2026-06-09T11:20:13', user: 'paula.souza', action: 'expurgo.simulate', target: 'f51b09ae', msg: 'Simulação: manter 5 versões, >180 dias' },
    { t: '2026-06-08T16:44:02', user: 'admin', action: 'settings.update', target: 'engine', msg: 'Drives em paralelo: 4 → 6' },
    { t: '2026-06-08T16:40:55', user: 'admin', action: 'user.create', target: 'paula.souza', msg: 'Conta criada com papel Operador' },
    { t: '2026-06-05T10:02:38', user: 'paula.souza', action: 'expurgo.execute', target: 'c2d77e10', msg: 'Expurgo executado: 38.114 versões, 412 GB' },
    { t: '2026-06-02T09:15:21', user: 'admin', action: 'settings.update', target: 'token', msg: 'Client Secret renovado' },
  ],
  users: [
    { user: 'admin', name: 'Administrador do Sistema', role: 'roleAdmin', created: '2025-09-12', active: true },
    { user: 'mteixeira', name: 'Rômulo M. Teixeira', role: 'roleAdmin', created: '2025-09-12', active: true },
    { user: 'paula.souza', name: 'Paula Souza', role: 'roleOperator', created: '2026-06-08', active: true },
    { user: 'carlos.lima', name: 'Carlos Lima', role: 'roleViewer', created: '2026-01-15', active: true },
    { user: 'tmp.consultor', name: 'Consultor Externo', role: 'roleViewer', created: '2025-11-03', active: false },
  ],
  skus: [
    { sku: 'Microsoft 365 E3', act: 480, susp: 12, warn: 0, gb: 4800, type: 'User' },
    { sku: 'Microsoft 365 E5', act: 85, susp: 0, warn: 2, gb: 850, type: 'User' },
    { sku: 'SharePoint Online Plan 1', act: 140, susp: 5, warn: 0, gb: 1400, type: 'User' },
    { sku: 'Office 365 F3', act: 320, susp: 18, warn: 6, gb: 640, type: 'Frontline' },
  ],
  oneration: [
    { id: '7a01', date: '2026-02-25', bytes: 2.86 * TB, files: 1102400 },
    { id: '8b12', date: '2026-03-25', bytes: 3.02 * TB, files: 1148210 },
    { id: '9c23', date: '2026-04-22', bytes: 3.18 * TB, files: 1190034 },
    { id: 'c2d7', date: '2026-05-27', bytes: 3.39 * TB, files: 1240212 },
    { id: 'f51b', date: '2026-06-03', bytes: 3.48 * TB, files: 1261877 },
  ],
  versionedBuckets: {
    day: [
      { p: '04/06', v: 1820, b: 14.2 * GB }, { p: '05/06', v: 2410, b: 22.8 * GB },
      { p: '06/06', v: 880, b: 6.1 * GB },  { p: '07/06', v: 412, b: 2.9 * GB },
      { p: '08/06', v: 3105, b: 31.4 * GB }, { p: '09/06', v: 2890, b: 27.2 * GB },
      { p: '10/06', v: 1106, b: 9.8 * GB },
    ],
    week: [
      { p: 'S18', v: 9120, b: 88.1 * GB }, { p: 'S19', v: 11240, b: 104.6 * GB },
      { p: 'S20', v: 8431, b: 71.2 * GB }, { p: 'S21', v: 13822, b: 131.9 * GB },
      { p: 'S22', v: 10215, b: 94.3 * GB }, { p: 'S23', v: 12623, b: 114.0 * GB },
    ],
    month: [
      { p: 'Jan', v: 38110, b: 0.34 * TB }, { p: 'Fev', v: 41208, b: 0.38 * TB },
      { p: 'Mar', v: 44302, b: 0.41 * TB }, { p: 'Abr', v: 3984, b: 0.36 * TB },
      { p: 'Mai', v: 47120, b: 0.44 * TB }, { p: 'Jun', v: 18934, b: 0.17 * TB },
    ],
  },
  inventoryRows: [
    { name: 'Apresentacao_Diretoria_Resultados.pptx', site: 'diretoria', ext: '.pptx', bytes: 2.7 * GB, modified: '2026-06-09T17:55:00', path: '/Documentos/2026/Resultados' },
    { name: 'Base_Historica_Vendas_2019-2025.xlsx', site: 'comercial', ext: '.xlsx', bytes: 4.9 * GB, modified: '2026-06-08T08:12:00', path: '/Planilhas/Histórico' },
    { name: 'Contrato_Fornecedor_Atlas_assinado.pdf', site: 'financeiro', ext: '.pdf', bytes: 18.2 * MB, modified: '2026-06-07T15:30:00', path: '/Contratos/2026' },
    { name: 'Catalogo_Produtos_master.psd', site: 'marketing', ext: '.psd', bytes: 7.2 * GB, modified: '2026-06-01T14:30:00', path: '/Criativos/Catálogo' },
    { name: 'Ata_Reuniao_Conselho_junho.docx', site: 'diretoria', ext: '.docx', bytes: 2.4 * MB, modified: '2026-06-09T11:05:00', path: '/Atas/2026' },
    { name: 'Dataset_Telemetria_Maquinas.csv', site: 'operacoes', ext: '.csv', bytes: 1.6 * GB, modified: '2026-06-05T07:30:00', path: '/Telemetria/Raw' },
    { name: 'Politica_Seguranca_Informacao_v4.pdf', site: 'ti-corporativo', ext: '.pdf', bytes: 8.1 * MB, modified: '2026-05-29T10:00:00', path: '/Políticas' },
    { name: 'Folha_Pagamento_maio_consolidada.xlsx', site: 'rh-pessoas', ext: '.xlsx', bytes: 64.3 * MB, modified: '2026-06-02T09:18:00', path: '/Folha/2026' },
    { name: 'Briefing_Campanha_Inverno.docx', site: 'marketing', ext: '.docx', bytes: 5.8 * MB, modified: '2026-06-06T16:47:00', path: '/Campanhas/2026-Inverno' },
    { name: 'Planta_Fabrica_Unidade_SP_rev32.dwg', site: 'projetos-engenharia', ext: '.dwg', bytes: 3.8 * GB, modified: '2026-05-22T11:08:00', path: '/Plantas/SP' },
    { name: 'Relatorio_Auditoria_Interna_Q2.pdf', site: 'financeiro', ext: '.pdf', bytes: 22.9 * MB, modified: '2026-06-04T14:55:00', path: '/Auditoria/2026' },
    { name: 'Treinamento_Onboarding_Q1.mp4', site: 'rh-pessoas', ext: '.mp4', bytes: 9.8 * GB, modified: '2026-02-11T09:45:00', path: '/Vídeos/Treinamento' },
  ],
  expurgoPreview: [
    { name: 'Catalogo_Produtos_master.psd', site: 'marketing', ext: '.psd', bytes: 6.4 * GB, modified: '2025-08-14T10:12:00' },
    { name: 'Base_Historica_Vendas_2019-2025.xlsx', site: 'comercial', ext: '.xlsx', bytes: 4.1 * GB, modified: '2025-06-20T09:00:00' },
    { name: 'Video_Institucional_2026_final_v8.mp4', site: 'marketing', ext: '.mp4', bytes: 3.9 * GB, modified: '2025-04-02T13:40:00' },
    { name: 'Planta_Fabrica_Unidade_SP_rev32.dwg', site: 'projetos-engenharia', ext: '.dwg', bytes: 2.2 * GB, modified: '2025-09-11T15:25:00' },
    { name: 'Apresentacao_Diretoria_Resultados.pptx', site: 'diretoria', ext: '.pptx', bytes: 1.8 * GB, modified: '2025-10-30T17:10:00' },
  ],
  siteLibraries: ['Documentos Compartilhados', 'Biblioteca de Mídia', 'Arquivos de Projeto'],
  recyclePreview: [
    { name: 'Backup_antigo_2023.zip', site: 'ti-corporativo', deletedBy: 'carlos.lima', deletedAt: '2026-05-28T14:20:00', bytes: 8.7 * GB },
    { name: 'Rascunho_apresentacao_v1.pptx', site: 'diretoria', deletedBy: 'mteixeira', deletedAt: '2026-05-30T09:11:00', bytes: 412 * MB },
    { name: 'Fotos_evento_brutas', site: 'marketing', deletedBy: 'paula.souza', deletedAt: '2026-06-01T16:45:00', bytes: 14.2 * GB },
    { name: 'Export_inventario_tmp.csv', site: 'ti-corporativo', deletedBy: 'admin', deletedAt: '2026-06-04T08:02:00', bytes: 230 * MB },
    { name: 'Video_treinamento_old.mp4', site: 'rh-pessoas', deletedBy: 'paula.souza', deletedAt: '2026-06-07T11:30:00', bytes: 6.1 * GB },
  ],
};

/* ── Componentes compartilhados ─────────────────────────────────────── */
function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {children ? <div className="head-actions">{children}</div> : null}
    </div>
  );
}

function Kpi({ label, value, hint, icon, color }) {
  const IconC = icon ? ICONS[icon] : null;
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        {IconC ? <div className="kpi-ico"><IconC size={14} /></div> : null}
      </div>
      <div className="kpi-value" style={color ? { color } : { color: 'var(--accent)' }}>{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

function Card({ title, sub, right, children, className }) {
  return (
    <div className={'card' + (className ? ' ' + className : '')}>
      {(title || right) ? (
        <div className="card-head">
          <div>
            <div className="card-title">{title}</div>
            {sub ? <div className="card-sub">{sub}</div> : null}
          </div>
          {right ? <div className="row">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function Btn({ children, icon, variant, small, ...rest }) {
  const IconC = icon ? ICONS[icon] : null;
  const cls = 'btn' + (variant ? ' btn-' + variant : '') + (small ? ' btn-sm' : '');
  return <button type="button" className={cls} {...rest}>{IconC ? <IconC size={14} /> : null}{children}</button>;
}

function StatusPill({ status }) {
  const { t } = useApp();
  const map = {
    completed: ['good', t('completed')], running: ['info', t('running')],
    pending: ['warn', t('pending')], failed: ['bad', t('failed')], cancelled: ['mute', t('cancelled')],
  };
  const [kind, label] = map[status] || ['mute', status];
  return <span className={'pill pill-' + kind}><span className="dot"></span>{label}</span>;
}

function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(function (o) {
        return <button key={o.value} className={value === o.value ? 'active' : ''} onClick={function () { onChange(o.value); }}>{o.label}</button>;
      })}
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div className="field" style={style}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}

Object.assign(window, {
  ICONS, I18N, AppCtx, useApp, MOCK, GB, MB, TB,
  fmtBytesFactory, fmtNumFactory, fmtDateFactory,
  PageHead, Kpi, Card, Btn, StatusPill, Seg, Field,
});
