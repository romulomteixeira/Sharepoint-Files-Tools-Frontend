# SharePoint Monitor — Sprints do Frontend React

> **Repositório:** `romulomteixeira/Sharepoint-Files-Tools-Frontend`
> **Branch de trabalho:** `feat/react-auth`
> **Stack:** React 18 + TypeScript + Vite 8 + React Router v6

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
- `src/api/reports.api.ts` — `exportInventory`, `getExportJobStatus`, `getDownloadUrl`, `requestPurgeConfirmToken`
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
- `src/contexts/AuthContext.tsx` — `AuthProvider` + `useAuth` hook; verifica sessão via `GET /api/scans/list`; escuta evento `auth:unauthorized` do `client.ts`
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

## 💡 Sprint 19 — Licenças & Espaço

**Objetivo:** Painel de capacidade e licenciamento SharePoint Online.

### Rota planejada
- `src/pages/LicensesPage.tsx` → `/licenses`

### Funcionalidades a implementar
- Quota total do tenant vs. utilizado vs. disponível
- Breakdown por site collection
- Projeção de crescimento (com base em dados históricos)
- Alerta de uso crítico (> 80% da quota)
- Endpoint a confirmar: `GET /api/tenant/quota`

### Sidebar
- Habilitar "Licenças & Espaço" → `/licenses`

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
| `/licenses` | Licenças & Espaço | 💡 Sprint 19 |

---

## Arquivos do projeto — estado atual

```
src/
├── api/
│   ├── auth.api.ts        ✅ Login, branding, primeiro admin, logout
│   ├── client.ts          ✅ HTTP centralizado, 401 → auth:unauthorized
│   ├── inventory.api.ts   ✅ Summary, sites, drives, files, top-files, versioned-by-period
│   ├── jobs.api.ts        ✅ getJobStatus
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
