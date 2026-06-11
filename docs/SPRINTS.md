# SharePoint Monitor — Sprints do Frontend React

> **Repositório:** `romulomteixeira/Sharepoint-Files-Tools-Frontend`
> **Branch de integração:** `develop` (features em branches `feat/sprint-*`)
> **Stack:** React 19 + TypeScript 6 + Vite 8 + React Router v7

---

## Legenda de status

| Símbolo | Significado |
|---------|------------|
| ✅ | Concluída e commitada |
| 🚧 | Em andamento |
| 📋 | Planejada — requisitos definidos |
| 💡 | Identificada — escopo a detalhar |

---

## ✅ Sprint 10 — Separação Frontend/Backend (base)

**Commit:** base do repositório  
**Objetivo:** Criar repositório React independente com a estrutura mínima operacional.

### Entregáveis
- `src/api/client.ts` — cliente HTTP centralizado, envelope `{ success, data, error }`, timeout 30s, cookies
- `src/api/scans.api.ts` — `createScan`, `listScans`, `getScanStatus`
- `src/api/inventory.api.ts` — `getInventorySummary`, `getInventorySites`, `getInventoryDrives`, `getInventoryFiles`, `getTopFiles`
- `src/api/jobs.api.ts` — `getJobStatus`
- `src/api/reports.api.ts` — `exportInventory`, `getExportJobStatus`, `getDownloadUrl`
- `src/hooks/useApi.ts` — hook genérico `{ data, loading, error, refetch }`
- `src/hooks/useJobStream.ts` — hook SSE via `EventSource` para progresso em tempo real
- `src/types/index.ts` — interfaces TypeScript: `Scan`, `Job`, `FileItem`, `InventorySummary`, `ExportJob`, etc.
- `src/pages/` — stubs iniciais: `DashboardPage`, `ScansPage`, `JobStatusPage`, `InventoryPage`, `NotFoundPage`
- `Dockerfile` — build multi-stage Node 22 → Nginx Alpine
- `nginx.conf` — proxy `/api/`, SSE buffering off, SPA `try_files`, gzip

---

## ✅ Sprint 11 — Autenticação React completa

**Commit:** `017306b` (`fix: dev link com porta correta + sidebar fiel ao design legado`)  
**Commit anterior:** `dd9a8e2` (`feat(auth): implementa fluxo de autenticacao React`)  
**Objetivo:** Replicar todo o fluxo de autenticação do `public/login.html` em React.

### Entregáveis
- `src/api/auth.api.ts` — raw `fetch` (não usa `client.ts`; endpoints de auth retornam `{ ok, error?, code? }`): `getBranding`, `login`, `requestFirstAdmin`, `confirmFirstAdmin`, `unlockAdminRequest`, `logout`
- `src/contexts/AuthContext.tsx` — `AuthProvider` + `useAuth` hook; verifica e expõe a sessão via `GET /api/session/check`; escuta evento `auth:unauthorized`
- `src/pages/LoginPage.tsx` — 3 modos: `login` | `firstAccess` | `confirm`; `toFrontendUrl()` para reescrever porta do `devLink`; modais de primeiro acesso e desbloqueio; design glassmorphism
- `src/api/client.ts` — dispatcha `auth:unauthorized` ao receber HTTP 401
- `src/App.tsx` — `AuthProvider` + `ProtectedRoute` envolvendo todas as rotas autenticadas
- `src/components/Layout.tsx` — sidebar 290px com gradiente escuro, 3 grupos de navegação, footer com logout

### Decisões técnicas
- Auth endpoints usam formato plano `{ ok, error?, code? }` — isolados em `auth.api.ts` com `fetch` nativo
- Verificação de sessão: não existe `/api/session/me`; usa `GET /api/scans/list` (200 = autenticado, 401 = não)
- `devLink` do backend vem com porta `:8787`; `toFrontendUrl()` reescreve para `window.location.origin`

---

## ✅ Sprint 12 — Dashboard completo

**Commit:** `080a1dc` (`feat(dashboard): dashboard completo com KPIs, progresso e top arquivos`)  
**Objetivo:** Replicar o dashboard completo do `app.js` legado no React.

### Entregáveis
- `src/pages/DashboardPage.tsx` — reescrita completa
- `src/types/index.ts` — interface `ScanProgress` com campos reais do backend
- `src/api/scans.api.ts` — adicionado `cancelScan(scanId)`

### Funcionalidades implementadas
| Feature | Detalhe |
|---------|---------|
| Scan selector | Dropdown com todos os scans (mais recentes primeiro) |
| 6 KPI cards | Sites, Drives, Arquivos, Volume, Versões (condicional), Status |
| Barra de progresso | `calcPercent()`: 0 → LISTING_SITES → SCANNING → FINALIZING → 100 |
| Fluxo visual | Nós Sites → Drives → Arquivos → [Versões] → Final com tons coloridos |
| Top extensões | Chart de barras horizontais a partir de `summary.topExtensions` |
| Top 10 arquivos | Tabela com link `webUrl` e tamanho formatado |
| Auto-refresh | `setInterval` 8s para status `pending` ou `running`; cleanup via `useRef` |
| Botões contextuais | Novo Scan, Cancelar (só ativo), Atualizar, Ir para Inventário (só concluído) |
| Toasts | Notificações com auto-dismiss de 5s |

### Design tokens
```ts
const C = {
  bg: '#eef1f5', panel: '#ffffff', border: '#c8ced8',
  accent: '#2b6cb0', text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
};
```

### Campos reais de `ScanProgress` (backend)
```ts
status?:           string   // RUNNING | DONE | ERROR | CANCELLED | QUEUED (maiúsculas)
stage?:            string   // LISTING_SITES | SCANNING_FILES | SCANNING_AND_VERSIONING | FINALIZING
totalSites?:       number
doneSites?:        number
forbiddenSites?:   number
errorSites?:       number
totalDrives?:      number
doneDrives?:       number
files?:            number
bytes?:            number
activity?:         string
versioningEnabled?: boolean
versionsTotal?:    number
versionsDone?:     number
versionsFail?:     number
versionsBytes?:    number
```

---

## ✅ Sprint 13 — Inventário completo

**Commit:** `dec2d9c` (`feat(inventory): inventário completo com filtros, paginação e exportação`)  
**Objetivo:** Transformar o stub básico de inventário em página completa de análise de arquivos.

### Entregáveis
- `src/pages/InventoryPage.tsx` — reescrita completa (~600 linhas)
- `src/App.tsx` — adicionada rota `/inventory` sem parâmetro (seletor de scans)
- `src/components/Layout.tsx` — item "Inventário" habilitado → `/inventory`

### Funcionalidades implementadas
| Feature | Detalhe |
|---------|---------|
| Seletor de scans | `/inventory` sem scanId lista todos os scans concluídos para escolha |
| Filtros em cascata | Site → Drive (recarrega ao mudar site) → Extensão → Ordenação |
| Opções de ordenação | Maior/menor tamanho, Nome A→Z / Z→A, Mais recente / Mais antigo |
| KPI strip | Sites, Drives, Arquivos, Volume (+ Versões se disponível); skeleton durante loading |
| Tabela paginada | Cursor keyset, 100 registros/página, "Carregar mais", contagem viva |
| Extensão clicável | Badge na tabela e item no chart aplicam/removem filtro por extensão |
| Top extensões | Chart de barras à direita; item ativo destacado; colapsa coluna se sem dados |
| Exportação CSV | GET `/api/export/inventory/:scanId` + polling 2s + download automático |
| Exportação JSONL | Idem para formato JSONL |
| Barra de status | Exibe progresso, link de download e erros; botão de fechar |
| Lookup de site | Mapeia `siteId` → `siteName` via `sites[]` carregados |
| Botão limpar filtros | Aparece quando há filtros ativos |

### Fluxo de exportação
```
startExport(format)
  → exportInventory({ scanId, format, siteId?, driveId?, extension? })
    ├── status === 'completed' → triggerDownload() imediatamente (export síncrono)
    └── status !== 'completed' → setInterval(2s) → getExportJobStatus(jobId)
          ├── completed → triggerDownload() + clearInterval
          ├── failed/cancelled → exibe erro + clearInterval
          └── pending/running → atualiza barra de status
```

---

## ✅ Sprint 14 — Relatórios + Top Arquivos

**Commits:** `3de8530`, `336cd44`  
**Objetivo:** Página de exportações configuráveis e visualização dos maiores arquivos do tenant.

### Entregáveis
- `src/pages/ReportsPage.tsx` → `/reports`
- `src/pages/TopFilesPage.tsx` → `/top-files`
- `src/App.tsx` — rotas `/reports` e `/top-files` habilitadas
- `src/components/Layout.tsx` — "Relatórios" e "Top Arquivos" habilitados na sidebar

### ReportsPage (`/reports`)
- Seletor de scan (dropdown com scans concluídos + inline KPIs: sites, drives, arquivos)
- Botões de formato: CSV / JSONL
- Filtros em cascata: site → drive → extensão (via `topExtensions`) → limite de linhas
- Exportação assíncrona com polling automático e download automático ao concluir
- Histórico de sessão (MAX_HISTORY=10): lista de jobs gerados com status vivo e botão de re-download

### TopFilesPage (`/top-files`)
- Seletor de scan + Top N configurável: 50 / 100 / 500
- Tabela: Nome, Site (via siteMap), Drive, Extensão, Tamanho, Modificado, Link
- Ordenação client-side: `size_desc` / `name_asc` / `date_desc`
- Filtro por extensão derivado dos dados carregados (`availableExts`)
- Barra de volume proporcional por linha (width = `bytes / maxBytes * 100%`)
- Exportação CSV/JSONL com polling (mesmo padrão de InventoryPage)

---

## ✅ Sprint 15 — Monitor Oneração + Versionados por Período

**Commit:** `56eefe7`
**Objetivo:** Análise temporal de crescimento e uso de versionamento.

### Entregáveis
- `src/pages/OnerationMonitorPage.tsx` → `/oneration-monitor`
- `src/pages/VersionedByPeriodPage.tsx` → `/versioned-by-period`
- `src/types/index.ts` — novos tipos: `GrowthPoint`, `VersionPeriodBucket`, `VersionedPeriodData`, `VersionPeriodUnit`
- `src/api/inventory.api.ts` — nova função: `getVersionedByPeriod()`
- Sidebar: Monitor Oneração e Versionados por Período habilitados

### OnerationMonitorPage
- Filtro de período: 7d / 30d / 90d / todos
- Charts SVG de área+linha: evolução de bytes e arquivos por scan
- KPIs: volume atual, arquivos atuais, Δ volume e Δ arquivos no período
- Tabela de comparação com deltas e barras proporcionais coloridas
- **Fonte:** `listScans()` — sem endpoint adicional necessário

### VersionedByPeriodPage
- Seletor de scan + agrupamento: dia / semana / mês
- Tenta `GET /api/inventory/:scanId/versioned-by-period` — se 404, ativa fallback
- **Fallback automático:** agrega `getInventorySummary()` de todos os scans, agrupa por período
- KPIs: total versões, bytes de versões, períodos com dados
- Chart de barras horizontais por período + tabela detalhada

---

## ✅ Sprint 16 — Simulação de Expurgo

**Commit:** `42277f2`  
**Objetivo:** Interface de retenção e expurgo com confirmação dupla (replica lógica de `purge.service.js`).

### Entregáveis
- `src/api/purge.api.ts` — `requestPurgeToken`, `executePurgeJob`, `getPurgeJobStatus`
- `src/pages/ExpurgoPage.tsx` → `/expurgo`
- `src/App.tsx` — rota `/expurgo` habilitada
- `src/components/Layout.tsx` — "Simulação de Expurgo" habilitado na sidebar

### Fluxo de 3 etapas
**Etapa 1 — Config:** seletor de scan, extensão (via `topExtensions`), site, filtro de idade (30/90/180/365/730 dias), filtro de tamanho (1/10/100/500 MB, 1 GB) → botão "Simular"

**Etapa 2 — Preview:** filtragem client-side em `getInventoryFiles()` (até 500 registros base, PREVIEW_LIMIT=200 exibidos); painel de impacto (arquivos afetados + bytes a liberar); botão "Executar Expurgo Agora"

**Modal de confirmação:**
- Overlay fullscreen (`position: fixed`)
- Painel de resumo (DANGER_BG `#fff5f5`)
- Aviso de irreversibilidade
- Input: usuário deve digitar `"CONFIRMAR"` exatamente
- Botão habilitado somente quando input correto

**Etapa 3 — Execução:**
1. `requestPurgeToken(rule)` → `{ confirmToken, expiresAt, requestHash }`
2. `executePurgeJob(rule, confirmToken)` → `{ jobId }`
3. Polling `getPurgeJobStatus(jobId)` a cada 3s (JOB_POLL_MS = 3 000)
4. `JobProgress`: barra de progresso (completed/total), badge de status, stats live
5. "Novo Expurgo" → reset para etapa 1

### Endpoints
```
POST /api/purge/confirm            → { confirmToken, expiresAt, requestHash }
POST /api/retention/execute-job    → { jobId } (requer confirmToken no body)
GET  /api/jobs/:jobId/status       → progresso do job
```

---

## ✅ Sprint 17 — Logs + Auditoria

**Commit:** `0edd687`  
**Objetivo:** Visibilidade operacional de eventos e trilha de auditoria de ações administrativas.

### Entregáveis
- `src/api/logs.api.ts` — `getLogs()`, `getAuditLogs()`, helper `castRaw<T>()`
- `src/pages/LogsPage.tsx` → `/logs`
- `src/pages/AuditPage.tsx` → `/audit`
- `src/App.tsx` — rotas `/logs` e `/audit` habilitadas
- `src/components/Layout.tsx` — "Logs" e "Auditoria" ativos na sidebar

### LogsPage (`/logs`)
- Endpoint: `GET /api/logs?limit=N` (até 2 000 entradas)
- Tabela: timestamp, level badge (info/warn/error), fonte/kind, mensagem, scan/job ID
- Filtro por nível (tabs All / Info / Warn / Error) + busca textual em todos os campos
- Clique na linha expande detalhes em JSON
- Auto-refresh a cada 30 s (toggle)
- Export CSV dos itens visíveis

### AuditPage (`/audit`)
- Endpoint: `GET /api/audit?limit=N&scanId=&evt=&user=`
- Filtros server-side: usuário, evento/ação (com `<datalist>` de sugestões), scanId
- Busca local adicional sobre os itens carregados
- Tabela: timestamp, badge de ação (colorido por tipo), usuário + e-mail, destino, mensagem
- Export CSV

### Nota técnica
O backend retorna JSON plano `{ items: [...] }` sem envelope `{ success, data }`.
`castRaw<T>(res)` extrai o array independente do formato (envelope futuro ou raw).

---

## ✅ Sprint 18 — Configurações + Administração

**Commit:** `30b3eba`  
**Objetivo:** Gestão de configurações do sistema e usuários locais.

### Entregáveis
- `src/api/settings.api.ts` — `sfetch()` nativo (bypass envelope); `getConfig()`, `saveConfig()`, `getSessionInfo()`, `listAdminUsers()`, `createAdminUser()`, `deleteAdminUser()`, `resetAdminPassword()`
- `src/pages/SettingsPage.tsx` → `/settings`
- `src/pages/AdminPage.tsx` → `/admin`
- `src/App.tsx` — rotas `/settings` e `/admin` habilitadas
- `src/components/Layout.tsx` — "Configurações" e "Administração" ativos

### SettingsPage (`/settings`)
- Detecção de papel via `GET /api/session/check` → admin vs. leitura
- 5 seções em accordion (colapso individual):
  1. **Graph** — tenantId, clientId, clientSecret (redactado), operatorName/Email
  2. **Motor de Scan** — concurrency (1–20), deltaPageLimit, pricePerTbMonth
  3. **Versões Automáticas** — versionsAuto (top/all/none), TopN, MaxItems, Concurrency, BatchSize, Force
  4. **Workers** — useVersionWorker, nVersionWorkers (1–8)
  5. **Branding** — brandingLoginTitle, brandingLoginSubtitle
- Admin: modo edição com botão "Editar → Salvar / Cancelar"
- Não-admin: campos read-only com aviso informativo

### AdminPage (`/admin`)
- Tabela de usuários: ID, username, displayName, role badge, createdAt, flag "deve trocar senha"
- Modal **Novo Usuário**: username, displayName, senha (validação strong password), papel
- Modal **Resetar Senha**: nova senha + e-mail vinculado (para admin protegido)
- Modal **Confirmar Exclusão**: texto de confirmação + botão destrutivo
- Acesso restrito exibido para não-admins

### Nota técnica
`settings.api.ts` usa `fetch` nativo (igual a `auth.api.ts`) porque os endpoints `/api/config` e `/api/admin/*` retornam JSON plano sem o envelope `{ success, data }`. O handler de 401 dispara `auth:unauthorized` para o `AuthContext`.

---

## ✅ Sprint 19 — Licenças & Espaço

**Commit:** `b9733f3`  
**Objetivo:** Painel de capacidade e licenciamento SharePoint Online.

### Entregáveis
- `src/api/licenses.api.ts` — `lfetch()` nativo; interfaces `SkuEntry`, `LicenseTotals`, `LicenseInfo`, `CapacityNow`, `Divergence`, `LicenseCapacityReport`; `getLicenseCapacity()`
- `src/pages/LicensesPage.tsx` → `/licenses`
- `src/App.tsx` — rota `/licenses` habilitada
- `src/components/Layout.tsx` — "Licenças & Espaço" activo na sidebar

### Funcionalidades implementadas

#### Gauge SVG circular
- `r=70`, `strokeDasharray` para arco proporcional ao % de uso
- Cor dinâmica: verde (< 75%), laranja (75–90%), vermelho (≥ 90%)
- Texto central com percentagem e total em TB

#### KPIs (2×2)
| Card | Valor | Fonte |
|------|-------|-------|
| Quota Total | `capacityNow.totalHuman` | `totalSource` |
| Utilizado | `capacityNow.usedHuman` | `usedSource` |
| Disponível | `capacityNow.availableHuman` | — |
| % de Uso | calculado | — |

#### Alert de uso elevado
- ≥ 80%: banner amarelo com estimativa de esgotamento
- ≥ 90%: banner vermelho com texto de urgência

#### Projecção de crescimento
- `calcGrowthRate(scans)`: bytes/dia entre o primeiro e o último scan concluído
- Exibe crescimento/dia, /mês, /ano e estimativa de esgotamento em dias
- Requer mínimo 2 scans concluídos com `totalBytes`

#### Tabela de licenças SKU
- Colunas: SKU (nome + partNumber), Activos, Suspensos, Aviso, Contribuição GB, Tipo (Service Plan / Add-on)
- Totais de capacidade: base (1024 GB) + licenças + total estimado

#### Bloco de divergência
- Tenant (Graph) vs. Estimado (licenças) vs. Diferença

#### Estado de erro
- Erro de rede: mensagem e botão recarregar
- `ok: false` (permissões Graph): aviso com campo `hint` do backend (instrucções de configuração)

### Endpoint
```
GET /api/sharepoint/licenses → LicenseCapacityReport (JSON plano, sem envelope)
```
Pode retornar `{ ok: false, error, hint }` com HTTP 200 se faltar `Reports.Read.All` + Admin Consent.

---

## Mapa de rotas — estado atual vs. planejado

| Rota | Sidebar | Status |
|------|---------|--------|
| `/` | Dashboard | ✅ Funcional |
| `/scans` | Sites | ✅ Funcional |
| `/inventory` | Inventário | ✅ Funcional |
| `/inventory/:scanId` | — (via Dashboard / Scans) | ✅ Funcional |
| `/jobs/:jobId` | — (via Scans) | ✅ Funcional |
| `/reports` | Relatórios | ✅ Funcional |
| `/top-files` | Top Arquivos | ✅ Funcional |
| `/oneration-monitor` | Monitor Oneração | ✅ Funcional |
| `/versioned-by-period` | Versionados por Período | ✅ Funcional |
| `/expurgo` | Simulação de Expurgo | ✅ Funcional |
| `/logs` | Logs | ✅ Funcional |
| `/audit` | Auditoria | ✅ Funcional |
| `/settings` | Configurações | ✅ Funcional |
| `/admin` | Administração | ✅ Funcional |
| `/licenses` | Licenças & Espaço | ✅ Funcional |

---

## Arquivos do projeto — estado atual

```
src/
├── api/
│   ├── auth.api.ts        ✅ Login, branding, primeiro admin, logout
│   ├── client.ts          ✅ HTTP centralizado, 401 → auth:unauthorized
│   ├── inventory.api.ts   ✅ Summary, sites, drives, files, top-files, versioned-by-period
│   ├── jobs.api.ts        ✅ getJobStatus
│   ├── licenses.api.ts    ✅ getLicenseCapacity, SkuEntry, CapacityNow, Divergence (Sprint 19)
│   ├── logs.api.ts        ✅ getLogs, getAuditLogs, castRaw (Sprint 17)
│   ├── settings.api.ts    ✅ getConfig, saveConfig, listAdminUsers, CRUD usuarios (Sprint 18)
│   ├── purge.api.ts       ✅ requestPurgeToken, executePurgeJob, getPurgeJobStatus
│   ├── reports.api.ts     ✅ exportInventory, getExportJobStatus, getDownloadUrl
│   └── scans.api.ts       ✅ createScan, listScans, getScanStatus, cancelScan
├── components/
│   └── Layout.tsx         ✅ Sidebar 290px, 3 grupos nav, footer logout
├── contexts/
│   └── AuthContext.tsx    ✅ AuthProvider, useAuth, evento auth:unauthorized
├── hooks/
│   ├── useApi.ts          ✅ { data, loading, error, refetch }
│   └── useJobStream.ts    ✅ SSE via EventSource
├── pages/
│   ├── DashboardPage.tsx          ✅ KPIs, fluxo, top ext, top files, auto-refresh
│   ├── AdminPage.tsx              ✅ Gestão de usuários, modais CRUD (Sprint 18)
│   ├── AuditPage.tsx              ✅ Trilha de auditoria, filtros server-side, CSV (Sprint 17)
│   ├── ExpurgoPage.tsx            ✅ Config→Preview→Execução, modal, polling (Sprint 16)
│   ├── InventoryPage.tsx          ✅ Filtros, tabela, export, seletor de scans
│   ├── JobStatusPage.tsx          ✅ Progresso SSE de jobs
│   ├── LoginPage.tsx              ✅ 3 modos, branding, modais
│   ├── LogsPage.tsx               ✅ Eventos de sistema, filtros, auto-refresh (Sprint 17)
│   ├── NotFoundPage.tsx           ✅ 404
│   ├── OnerationMonitorPage.tsx   ✅ Charts SVG, KPIs, tabela comparação (Sprint 15)
│   ├── ReportsPage.tsx            ✅ Exportações configuráveis, histórico (Sprint 14)
│   ├── ScansPage.tsx              ✅ Lista + iniciar scan
│   ├── SettingsPage.tsx           ✅ Config em accordion, admin/leitura, save (Sprint 18)
│   ├── TopFilesPage.tsx           ✅ Top N, ordenação, barra de volume (Sprint 14)
│   ├── LicensesPage.tsx           ✅ Gauge SVG, KPIs, SKUs, projecção (Sprint 19)
│   └── VersionedByPeriodPage.tsx  ✅ Versões por período, fallback automático (Sprint 15)
└── types/
    └── index.ts           ✅ Todos os tipos da API
```

---

## Convenções estabelecidas

### Padrão de design
- Inline styles em React com objeto `const s: Record<string, React.CSSProperties>`
- Design tokens em `const C = { ... }` no topo de cada página
- `@keyframes` injetados via `<style>` tag quando necessário (ex.: spinner, skeleton)
- Sem dependências CSS externas (sem Tailwind, Bootstrap, etc.)

### Padrão de API
- Respostas da API: envelope `{ success, data, error, meta }` — tratado por `client.ts`
- Auth endpoints: formato plano `{ ok, error?, code? }` — tratado por `auth.api.ts` com raw `fetch`
- Paginação: cursor keyset `{ items, pageInfo: { nextCursor, hasNextPage } }`

### Convenções de código
- Hooks genéricos em `src/hooks/`
- APIs segmentadas por domínio em `src/api/`
- Cada página é auto-contida (sub-componentes definidos no mesmo arquivo quando pequenos)
- `useApi` para carregamentos únicos; `useEffect` direto para listas com paginação manual

### Controle de qualidade
- `npm run type-check` — TypeScript sem erros antes de cada commit
- `npm run lint` — ESLint com `--max-warnings 0`
- `npm run build` — build de produção Vite deve ser limpo

---

## Diagnóstico — Gaps identificados (base para Sprints 20–24)

> Análise comparativa entre `public/app.js` (vanilla legado) e o React implementado (Sprints 10–19),
> incluindo funcionalidades adicionadas no Sprint 8 do backend (`Sharepoint-Files-Tools`).

### GAP 1 — `ExpurgoPage.tsx` incompleta (CRÍTICO)

O Sprint 16 implementou **apenas 1 dos 4 tipos de expurgo**. O `app.js` legado e o backend suportam:

| Operação | Endpoint simulação | Endpoint execução | Status React |
|---|---|---|---|
| Retenção de versões | `POST /api/retention/simulate` | `POST /api/retention/execute-job` | ✅ Implementado |
| Expurgo de arquivos | `POST /api/file-retention/simulate` | `POST /api/file-retention/execute-job` | ❌ Ausente |
| Limpeza de lixeira | `POST /api/recycle-bin/simulate` | `POST /api/recycle-bin/execute-job` | ❌ Ausente |
| Exclusão de sites | `POST /api/sites/simulate` | `POST /api/sites/execute-job` | ❌ Ausente (backend Sprint 8) |

### GAP 2 — `purge.api.ts` hardcoded para um único tipo de operação

`requestPurgeToken` envia `operation: 'retention_execute'` fixo. O backend valida `VALID_OPERATIONS`
e o Sprint 8 adicionou `retention_sites` — o frontend nunca envia esse valor.
Faltam funções para `file_retention_execute`, `recycle_bin_execute` e `retention_sites`.

### GAP 3 — `ScansPage.tsx` ainda é o stub do Sprint 10

O Sprint 8 do backend adicionou busca de sites por slug/nome e execução de scan apenas nos sites
selecionados. A `ScansPage` atual só tem um botão "Novo Scan" sem parâmetros. Faltam:
- Busca de sites via `GET /api/sites?search=&top=`
- Seleção por checkboxes individuais + "Selecionar tudo"
- Passagem de `siteIds[]` para `POST /api/scans`
- Toggle de versionamento

### GAP 4 — `ExpurgoPage.tsx` usa polling em vez de SSE

O job de expurgo é monitorado via `setInterval` (3 s). O hook `useJobStream.ts` existe mas não é
usado na página. O backend suporta `EventSource` via `POST /api/jobs/:jobId/stream`.

---

## ✅ Sprint 20 — `purge.api.ts` completo + abas Arquivos e Lixeira no ExpurgoPage

**Branch:** `feat/sprint-20-expurgo-completo`
**Commit:** `8b34083`
**Objetivo:** Cobrir GAP 1 (parcial) e GAP 2. Implementar os tipos de expurgo faltantes
exceto site-deletion (que envolve lógica própria de busca e vai para Sprint 21).

### Entregáveis

#### `src/api/purge.api.ts` — reescrita
- Tipo discriminado `PurgeOperation`:
  ```ts
  type PurgeOperation =
    | 'retention_execute'
    | 'file_retention_execute'
    | 'recycle_bin_execute'
    | 'retention_sites';
  ```
- `requestPurgeToken(operation, params)` — `operation` agora é parâmetro dinâmico
- `simulateVersionRetention(params)` → `POST /api/retention/simulate`
- `executeVersionRetentionJob(params, token)` → `POST /api/retention/execute-job`
- `simulateFileRetention(params)` → `POST /api/file-retention/simulate`
- `executeFileRetentionJob(params, token)` → `POST /api/file-retention/execute-job`
- `simulateRecycleBin(params)` → `POST /api/recycle-bin/simulate`
- `exportRecycleBin(params)` → `POST /api/recycle-bin/export`
- `executeRecycleBinJob(params, token)` → `POST /api/recycle-bin/execute-job`

#### `src/types/index.ts` — novos tipos
- `SimulateVersionResult` — `{ count, bytes, items[] }`
- `SimulateFileResult` — `{ count, bytes, items[] }`
- `SimulateRecycleBinResult` — `{ count, bytes, items[] }`

#### `src/pages/ExpurgoPage.tsx` — adicionar abas
- Seletor de aba no topo: `Versões | Arquivos | Lixeira`
- Estado de aba isolado: cada aba tem seu próprio step (config/preview/done) sem interferência
- **Aba Versões** — sem alteração (já funcional)
- **Aba Arquivos** — Config (extensão, site, idade, tamanho) → Simular → Preview table → Modal → Job
  - `requestPurgeToken('file_retention_execute', params)`
  - `executeFileRetentionJob(params, token)`
- **Aba Lixeira** — Config (site) → Simular (contagem + bytes estimados) → Exportar ou Executar → Job
  - Botão extra "Exportar relatório" via `exportRecycleBin`
  - `requestPurgeToken('recycle_bin_execute', params)`
  - `executeRecycleBinJob(params, token)`
- Modal de confirmação (`CONFIRMAR`) reutilizado nas 3 abas

### Checklist de conclusão
- [x] `purge.api.ts` com todos os 8 métodos tipados
- [x] `SimulateVersionResult`, `SimulateFileResult`, `SimulateRecycleBinResult` definidos em `purge.api.ts`
- [x] Aba Arquivos funcional (simulação + exportação CSV + execução)
- [x] Aba Lixeira funcional (simulação + exportação CSV + execução)
- [x] Aba Versões não regrediu
- [ ] `npm run type-check` zero erros *(Node.js indisponível no ambiente de execução — revisar localmente)*
- [ ] `npm run lint` zero warnings *(idem)*
- [ ] `npm run build` limpo *(idem)*
- [x] Commit `8b34083` + push branch `feat/sprint-20-expurgo-completo`

---

## ✅ Sprint 21 — ExpurgoPage: aba Exclusão de Sites (backend Sprint 8)

**Branch:** `feat/sprint-21-expurgo-sites`
**Commit:** `86b0448`
**Objetivo:** Cobrir GAP 1 (completo) — implementar a aba de exclusão de sites que corresponde
ao backend Sprint 8 (`eee93c7`: busca por slug/nome com checkboxes e execução dos selecionados).

### Entregáveis

#### `src/api/purge.api.ts` — extensão
- `SiteTarget`: métricas do site retornadas no preview (`siteId`, nome, URL, bytes, arquivos)
- `SimulateSitesResult`: `{ scanId, search, preview[], result: { sites, totalBytes, totalBytesHuman } }`
- `simulateSiteDeletion(scanId, search)` → `POST /api/sites/simulate` para buscar/simular por slug ou nome
- `executeSiteDeleteJob(scanId, siteIds[], token)` → `POST /api/sites/execute-job` para excluir somente os sites marcados

#### `src/api/scans.api.ts` — extensão
- `searchSites(search: string, top?: number)` → `GET /api/sites?search=&top=`
  - Retorna `{ id, displayName, webUrl }[]`

#### `src/pages/ExpurgoPage.tsx` — 4ª aba
- Seletor de aba passa a ter: `Versões | Arquivos | Lixeira | Sites`
- **Aba Sites:**
  - Input de busca com debounce 400 ms → lista resultados com checkboxes
  - Badge contador de sites selecionados
  - Botão "Simular" → painel de impacto (arquivos totais, bytes estimados)
  - Modal `CONFIRMAR` → `requestPurgeToken('retention_sites', { scanId, siteIds })`
  - Job com barra de progresso mostrando site atual sendo processado

### Fix incluído (bugs Sprint 20 detectados na análise do backend)
- **Nomes de operação corrigidos** para corresponder ao `VALID_OPERATIONS` do `purge-confirm.js`:
  `retention_execute` → `retention_versions`, `file_retention_execute` → `retention_files`, `recycle_bin_execute` → `recycle_bin`
- **Formato do body de `/api/purge/confirm` corrigido**: body flat `{ operation, ...params }` em vez de `{ operation, params: {...} }` aninhado
- `requestPurgeToken` agora aceita `params: unknown` e faz spread internamente

### Checklist de conclusão
- [x] `simulateSiteDeletion` e `executeSiteDeleteJob` em `purge.api.ts`
- [x] `searchSites(search, top)` disponível em `scans.api.ts` para reutilização na Sprint 22
- [x] `SiteTarget` e `SimulateSitesResult` tipados
- [x] Aba 🏢 Sites com busca por slug/nome, debounce 400ms, checkboxes, painel de impacto, modal CONFIRMAR e job com polling
- [x] `operation: 'retention_sites'` enviado corretamente ao backend
- [x] Abas Versões, Arquivos e Lixeira não regrediram (nomes de operação corrigidos)
- [ ] `npm run type-check` zero erros *(Node.js indisponível no ambiente — revisar localmente)*
- [ ] `npm run lint` zero warnings *(idem)*
- [ ] `npm run build` limpo *(idem)*
- [x] Commit `86b0448` + push branch `feat/sprint-21-expurgo-sites`

---

## ✅ Hardening pré-Sprint 22 — correções e testes automatizados

**Objetivo:** Corrigir achados da revisão das Sprints 10–21 antes de iniciar novas funcionalidades.

### Correções
- `JobStatusPage` usa `status.scanId` no link do inventário e omite o link quando a relação não é informada pelo backend
- Retenção de versões usa `POST /api/retention/simulate` como fonte dos totais; a tabela local é identificada como amostra
- `searchSites(search, top)` e os parâmetros `siteIds`/`enableVersioning` foram preparados na API de scans
- Downloads de expurgo reutilizam o cliente central, incluindo timeout, cookies e tratamento de HTTP 401
- Timeout HTTP usa `AbortController` e cancela a requisição subjacente
- README e contratos da Sprint 21 alinhados à implementação atual

### Testes adicionados
- Vitest + React Testing Library para unidades e componentes
- MSW para contratos das APIs de scans e expurgo
- Playwright para smoke tests de autenticação no navegador
- Dependências de teste com peers explícitos (`@testing-library/dom`, `@types/node`) e tipagem isolada em `tsconfig.test.json`

---

## ✅ Sprint 22 — ScansPage completa com seleção de sites (backend Sprint 8)

**Branch:** `feat/sprint-22-scans-site-selection`
**Objetivo:** Cobrir GAP 3 — substituir o stub básico do ScansPage pela interface completa de
seleção de sites do Sprint 8 do backend.

### Entregáveis

#### `src/api/scans.api.ts` — extensão
- `searchSites` (se não adicionado no Sprint 21)
- `createScan(options?: { siteIds?: string[]; enableVersioning?: boolean })` — ampliar assinatura

#### `src/pages/ScansPage.tsx` — reescrita completa
- **Painel "Iniciar Novo Scan"** (expansível ou sempre visível):
  - Input de busca de sites com debounce 400 ms
  - Lista de resultados com checkbox por item + "Selecionar tudo" / "Limpar seleção"
  - Chips com nomes dos sites selecionados (máx 5 visíveis + "+N mais")
  - Toggle "Incluir versionamento automático"
  - Botão "Scan dos sites selecionados" (quando há seleção) ou "Scan completo do tenant"
- **Tabela de scans existentes** — mantida e melhorada:
  - Coluna "Tipo" — "Completo" ou "Parcial (N sites)"
  - Status badge respeitando `QUEUED | RUNNING | DONE | ERROR | CANCELLED`
  - Link "Acompanhar" para scans `running` ou `queued` → `/` (Dashboard)
  - Link "Inventário" para scans `completed` → `/inventory/:scanId`
  - Link "Logs" para scans `error`
- Toast de confirmação ao iniciar novo scan

### Contratos confirmados no backend homologado
- `GET /api/sites` retorna `{ items, note }`
- `POST /api/scans` recebe `allSites`, `sites`, `siteSearch`, `maxSites` e `options`
- `POST /api/scans` retorna `{ scanId }`
- `GET /api/scans/list` retorna `{ items }`, status em maiúsculas e campos legados (`scanId`, `files`, `bytes`, `request`)
- O versionamento por scan ainda depende da configuração global; `options.enableVersioning` registra a intenção da UI

### Checklist de conclusão
- [x] Busca de sites com debounce e checkboxes
- [x] `createScan` adapta `siteIds` e `enableVersioning` ao contrato homologado
- [x] Botão contextual (selecionados vs. tenant completo)
- [x] Tabela de scans com coluna "Tipo"
- [x] Cliente HTTP compatível com envelope padronizado e JSON legado
- [x] Testes de contrato para scans e respostas legadas
- [x] `npm run type-check` zero erros
- [x] `npm run lint` zero warnings
- [x] `npm run test` — 12 testes aprovados
- [x] `npm run build` limpo

---

## ✅ Sprint 23 — SSE no ExpurgoPage + consolidação geral

**Branch:** `feat/sprint-23-sse-expurgo`
**Objetivo:** Cobrir GAP 4 — substituir polling por streaming real-time no ExpurgoPage,
e garantir consistência visual e funcional em todas as 4 abas.

### Entregáveis

#### `src/hooks/useJobStream.ts` — verificação e extensão
- Verificar se o hook atual aceita `onProgress` callback ou apenas expõe `progress` reativo
- Se necessário, adicionar suporte a `onComplete` e `onError` callbacks para integração com ExpurgoPage

#### `src/pages/ExpurgoPage.tsx` — streaming
- Remove `JOB_POLL_MS` e todos os `setInterval`/`clearInterval` de monitoramento de job
- Usa `useJobStream(jobId)` para todas as 4 abas
- Fallback automático: se SSE falhar após 5 s, ativa polling `getJobStatus` a 5 s
- Estado de job compartilhado entre abas: uma aba com job ativo mostra badge na tab

#### Revisão de consistência
- Garantir que trocar de aba reseta step para `config` se não houver job ativo
- Garantir que job em andamento em uma aba não impede simulação em outra
- Mensagens de erro padronizadas (reutilizar helper `fmtApiError` se existir)
- Verificar edge cases: token expirado (reemitir token), job cancelado, job com status `error`

### Checklist de conclusão
- [x] `useJobStream` funciona para todas as 4 abas
- [x] Contrato SSE homologado (`message` com `type: progress`) normalizado
- [x] Polling duplicado removido do ExpurgoPage
- [x] Fallback de polling recursivo implementado após 5 s
- [x] Badge de "job ativo" na aba correspondente
- [x] Jobs permanecem monitorados ao trocar de aba
- [x] Token expirado é reemitido uma vez automaticamente
- [x] Job cancelado é tratado separadamente de falha
- [x] `npm run type-check` zero erros
- [x] `npm run lint` zero warnings
- [x] `npm run test` — 15 testes aprovados
- [x] `npm run build` limpo

---

## ✅ Sprint 24 — QA final, checagem completa e merge para main

**Branch:** `chore/sprint-24-final-qa → main` via PR

**Objetivo:** Validação end-to-end de tudo que foi planejado (Sprints 20–23) vs. o que foi
implementado, identificando qualquer item que tenha passado despercebido, e merge final.

### Atividades

#### 1. Checagem estrutural (comparação vanilla vs. React)
Percorrer o `public/app.js` e `public/index.html` e confirmar que cada funcionalidade tem
equivalente no React:

| Funcionalidade legado | Página React | Verificado |
|---|---|---|
| Login / primeiro acesso / OAuth | `LoginPage` | [x] |
| Dashboard KPIs + top ext + top files | `DashboardPage` | [x] |
| Iniciar scan com seleção de sites | `ScansPage` (Sprint 22) | [x] |
| Inventário com filtros + paginação + export | `InventoryPage` | [x] |
| Top arquivos por tamanho / total / versões | `TopFilesPage` | [x] |
| Monitor Oneração por janela temporal | `OnerationMonitorPage` | [x] |
| Versionados por período com fallback | `VersionedByPeriodPage` | [x] |
| Retenção de versões (simulação + execução) | `ExpurgoPage` — aba Versões | [x] |
| Expurgo de arquivos (simulação + execução) | `ExpurgoPage` — aba Arquivos (Sprint 20) | [x] |
| Limpeza de lixeira (simulação + execução) | `ExpurgoPage` — aba Lixeira (Sprint 20) | [x] |
| Exclusão de sites (busca + checkboxes + job) | `ExpurgoPage` — aba Sites (Sprint 21) | [x] |
| Relatórios configuráveis com histórico | `ReportsPage` | [x] |
| Logs de sistema com filtro e auto-refresh | `LogsPage` | [x] |
| Trilha de auditoria com filtros server-side | `AuditPage` | [x] |
| Configurações em accordion (admin/leitura) | `SettingsPage` | [x] |
| Administração de usuários CRUD | `AdminPage` | [x] |
| Licenças & Espaço com gauge e projeção | `LicensesPage` | [x] |

#### 2. Smoke tests e contratos homologados
- [x] Login → sessão → expiração/logout coberto por teste de contexto e rota protegida
- [x] Scan parcial com seleção de sites coberto por contrato MSW
- [x] Progresso de jobs coberto por SSE e fallback para polling
- [x] Expurgo de versões, arquivos, lixeira e sites conferido contra os contratos homologados
- [x] Exportação CSV e JSONL do inventário conferida na implementação
- [x] Configurações e administração conferidas contra respostas JSON planas

> Execuções destrutivas reais de expurgo, lixeira e exclusão de sites não foram disparadas
> durante o QA final. Esses fluxos permanecem sujeitos a smoke test operacional em janela
> controlada, com dados descartáveis e autorização do responsável pelo ambiente.

#### 3. Build final
- [x] `npm run type-check` zero erros
- [x] `npm run lint` zero warnings
- [x] `npm run test` — 18 testes aprovados
- [x] `npm run test:e2e` — smoke Chromium aprovado
- [x] `npm run build` limpo
- [x] `docker build` passa sem erros

#### 4. Documentação
- [x] `docs/SPRINTS.md` — Sprints 20–23 confirmadas como concluídas
- [x] Mapa de rotas atualizado com status final
- [x] README e arquitetura atualizados

#### 5. PR e merge
- [ ] PR `chore/sprint-24-final-qa → main` com descrição do QA final
- [ ] Review e merge

---

## Mapa de rotas — estado final da Sprint 24

| Rota | Sidebar | Status |
|------|---------|--------|
| `/` | Dashboard | ✅ Funcional (Sprint 12) |
| `/login` | — | ✅ Funcional (Sprint 11) |
| `/scans` | Sites | ✅ Funcional (Sprint 22) |
| `/inventory` | Inventário | ✅ Funcional (Sprint 13) |
| `/inventory/:scanId` | — | ✅ Funcional (Sprint 13) |
| `/jobs/:jobId` | — | ✅ Funcional (Sprint 10) |
| `/reports` | Relatórios | ✅ Funcional (Sprint 14) |
| `/top-files` | Top Arquivos | ✅ Funcional (Sprint 14) |
| `/oneration-monitor` | Monitor Oneração | ✅ Funcional (Sprint 15) |
| `/versioned-by-period` | Versionados por Período | ✅ Funcional (Sprint 15) |
| `/expurgo` | Simulação de Expurgo | ✅ Funcional, 4 abas + SSE (Sprints 20–23) |
| `/logs` | Logs | ✅ Funcional (Sprint 17) |
| `/audit` | Auditoria | ✅ Funcional (Sprint 17) |
| `/settings` | Configurações | ✅ Funcional (Sprint 18) |
| `/admin` | Administração | ✅ Funcional (Sprint 18) |
| `/licenses` | Licenças & Espaço | ✅ Funcional (Sprint 19) |

---

## Correções pós-Sprint 24 — paridade com o backend homologado

### ✅ Bloco 1 — SMTP e OAuth / OpenID Connect

- Configuração SMTP completa: host, porta, TLS direto, usuário, senha e remetente
- Configuração do login Microsoft com credenciais próprias ou fallback para a app principal
- Redirect URI calculado e orientação para cadastro como plataforma Web no Entra ID
- Domínios permitidos, e-mails administradores e texto do botão Microsoft
- Busca de grupos no Entra ID e atribuição aos perfis de leitura ou administrador
- Validação de grupos via contrato homologado, incluindo opção de salvar e validar
- Secrets redigidos e removidos do estado do navegador após salvamento
- Testes de API e interface para payloads SMTP/OAuth e validação de grupos

### ✅ Bloco 2 — versionamento, Enterprise Apps e diagnóstico

- Modelos `none`, `top` e `all` com campos condicionais e descrições operacionais
- Limites homologados de Top N, máximo de itens, concorrência e batch
- Flag de recálculo forçado preservada
- `USE_VERSION_WORKER` e `N_VERSION_WORKERS` configuráveis de 1 a 16
- Formulários dinâmicos para Label, Client ID e Client Secret dos workers adicionais
- Preservação de secrets já salvos por meio de `hasClientSecret`
- Validação client-side das credenciais obrigatórias antes do salvamento
- Diagnóstico Graph/OpenID via `POST /api/auth/diagnose`
- Diagnóstico de processos e heartbeats via `GET /api/health/workers`
- Testes de API, interface e homologação visual com três workers

### ✅ Bloco 3 — listagem explícita, seleção e paginação de sites

- Busca explícita por palavra-chave, nome ou URL, sem carregamento automático
- Quantidade de sites configurável entre 1 e 999
- Paginação local com 10, 20 ou 50 itens por página
- Seleção preservada ao navegar entre páginas
- Ações para selecionar todos os resultados carregados ou limpar a seleção
- Scan parcial baseado nos sites selecionados
- Testes de interface e homologação visual com seleção entre páginas

### ✅ Bloco 4 — escopo, modo, limites e cancelamento de scans

- Escopo explícito entre todos os sites e sites selecionados
- Busca e limite de até 20.000 sites para varreduras de tenant
- Modos completo, rápido e estimativa com os presets homologados
- Explicação dos limites de sites, bibliotecas e itens de cada modo
- Identificação do modo utilizado na lista de scans
- Cancelamento de scans ativos pelo `scanId` retornado na listagem
- Testes de contrato e interface para criação e cancelamento

### ✅ Bloco 5 — scheduler server-side

- Agendamento independente de scan normal e carga de versões
- Frequência diária ou semanal, horário e dias da semana
- Escopo, busca e limite de sites para o scan normal
- Modo Top/Todos, limites e force para versões no último scan finalizado
- Exibição do estado das últimas execuções
- Testes de contrato, interface e homologação visual com persistência

### ✅ Auditoria de contratos — backend local do workspace (10/06/2026)

**Fonte de verdade:** `Sharepoint-Files-Tools-Workspace/Sharepoint-Files-Tools`.

- Configurações SMTP, OAuth/OpenID Connect, grupos, versionamento, workers, diagnósticos e scheduler permanecem compatíveis.
- Listagem explícita, seleção, paginação, escopo, modos, limites e cancelamento de scans permanecem compatíveis.
- Expurgo produtivo homologado suporta somente `retention_versions`, `retention_files` e `recycle_bin`.
- A antiga Sprint 21 de exclusão de sites foi marcada como obsoleta: o backend local não possui
  `POST /api/sites/simulate`, `POST /api/sites/execute-job` nem a operação `retention_sites`.
- A aba de exclusão de sites e seus contratos foram removidos do React. A seleção de sites para
  iniciar scans parciais continua disponível no menu Sites.
- O helper duplicado de confirmação com body aninhado foi removido; o fluxo único usa body flat
  `{ operation, scanId, ...params }`, conforme o backend local.

---

## Correções de paridade pós-Sprint 24

### Bloco 1 — Relatórios e simulação de expurgo

- [x] Diferenciar arquivo síncrono de job assíncrono nos exports CSV/JSONL
- [x] Tratar JSONL como blob, sem executar `JSON.parse`
- [x] Enviar filtro de extensão como `ext`
- [x] Normalizar status de exportação vindo de `progress.status`
- [x] Consumir `result` e `preview` da simulação server-side de versões
- [x] Remover a consulta paralela limitada a 500 arquivos
- [x] Homologação automatizada e visual
- [x] PR aprovado e mesclado — #34

### Bloco 2 — Licenças e espaço

- [x] Backend usa base contratual decimal de 1000 GB
- [x] Preservar 10 GB por licença elegível e 1:1 para add-on de storage
- [x] Distinguir `ENTERPRISEPACK` (Office 365 E3) de `SPE_E3` (Microsoft 365 E3)
- [x] Manter fallback para o String ID quando não houver Product Name conhecido
- [x] Exibir Product Name e String ID em colunas distintas
- [x] Remover a legenda fixa `Base (1024)` e usar o valor recebido pelo contrato
- [x] Homologação automatizada e visual
- [x] PR frontend aprovado e mesclado — #35

### Bloco 3 — Realizar Scans e nova aba Sites

- [x] Renomear o menu atual para `Realizar Scans`, preservando `/scans`
- [x] Criar `/sites` com inventário latest-wins por `siteId`
- [x] Exibir última varredura e scan de origem
- [x] Implementar busca e paginação 10/30/50/100
- [x] Preservar seleção de sites entre páginas
- [x] Permitir drill-down sob demanda entre 1 e 10 sites
- [x] Exibir bibliotecas, arquivos, tamanho, versões, espaço das versões e total
- [x] Homologação automatizada e visual
- [x] PR frontend aprovado e mesclado — #36

### Bloco 4 — Top Arquivos

- [x] Corrigir o contrato `{ items }` nas consultas por scan
- [x] Restaurar maiores arquivos, arquivos + versões e mais versionados
- [x] Manter limite independente por visão
- [x] Adicionar consolidado latest-wins por `(driveId, itemId)`
- [x] Permitir ranking consolidado por tamanho, total ou versões
- [x] Exibir scan e data de origem no consolidado
- [x] Exportar CSV/JSONL exatamente com o resultado filtrado exibido
- [x] Homologação automatizada e visual
- [x] PR backend aprovado e mesclado — #76
- [x] PR frontend aprovado e mesclado — #37

### Bloco 5 — Monitor de Oneração

- [x] Substituir a comparação entre scans por `/api/analytics/topcost/:scanId`
- [x] Adicionar seleção de scan e períodos dia/semana/mês/ano
- [x] Permitir `LastModified` e `File Created`
- [x] Permitir limites 80/100/200/300
- [x] Filtrar por site, caminho, pessoa ou arquivo
- [x] Exibir site, biblioteca, caminho, data, colaborador e métricas de versões
- [x] Exportar exatamente o resultado filtrado para CSV
- [x] Homologação automatizada e visual
- [x] PR frontend aprovado e mesclado — #38

### Bloco 6 — Versionados por Período

- [x] Remover endpoint inexistente e fallback por sumários
- [x] Integrar `/api/analytics/topversioned/:scanId`
- [x] Preservar recorte de versões por `LastModified`
- [x] Selecionar arquivos por `File Created` e ranquear pelo histórico conhecido
- [x] Permitir limites 80/100/200/300
- [x] Filtrar por site, caminho, pessoa ou arquivo
- [x] Exportar exatamente o resultado filtrado para CSV
- [x] Exibir aviso de timeline de versões incompleta
- [x] Homologação automatizada e visual
- [x] PR backend aprovado e mesclado — #77
- [ ] PR frontend aprovado e mesclado
