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

## 📋 Sprint 14 — Relatórios + Top Arquivos

**Objetivo:** Página de exportações configuráveis e visualização dos maiores arquivos do tenant.

### Rota planejada
- `src/pages/ReportsPage.tsx` → `/reports`
- `src/pages/TopFilesPage.tsx` → `/top-files`

### Funcionalidades a implementar

#### ReportsPage (`/reports`)
- Seletor de scan (dropdown com scans concluídos)
- Configurações de exportação: formato (CSV/JSONL), filtros (site, drive, extensão), limite de linhas
- Histórico de exportações da sessão (lista de jobs gerados)
- Download de exportações antigas (se ainda disponíveis — TTL 24h no backend)
- Estado persistido no `localStorage` (último scan selecionado, últimas configurações)

#### TopFilesPage (`/top-files`)
- Selector de scan
- Top N configurável (50 / 100 / 500)
- Tabela: Nome, Site, Drive, Extensão, Tamanho, Modificado, Link
- Ordenação por tamanho (padrão), nome, data
- Filtro por extensão (inline)
- Botão de exportação do resultado atual
- Endpoint: `GET /api/inventory/:scanId/top-files?limit=500`

### Sidebar
- Habilitar "Relatórios" → `/reports`
- Habilitar "Top Arquivos" → `/top-files`

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

## 📋 Sprint 16 — Simulação de Expurgo

**Objetivo:** Interface de retenção e expurgo com confirmação dupla (replica lógica de `purge.service.js`).

### Rota planejada
- `src/pages/ExpurgoPage.tsx` → `/expurgo`

### Funcionalidades a implementar
- Seletor de scan
- Painel de regras de retenção: por extensão, por data, por tamanho mínimo, por site
- Preview: tabela de arquivos que seriam expurgados + totais (contagem, bytes liberados)
- Simulação (read-only) vs. Execução real (requer token de confirmação)
- Fluxo de confirmação dupla:
  1. Usuário configura regras → clica "Simular"
  2. Preview exibido → clica "Executar expurgo"
  3. Modal de confirmação → digita código recebido por e-mail / exibido
  4. `POST /api/purge/confirm` → recebe `confirmToken`
  5. `POST /api/retention/execute-job` com `confirmToken` → job assíncrono
  6. Progresso via polling do job
- Botão cancelar expurgo em andamento

### Endpoints relevantes
```
POST /api/purge/confirm            → { confirmToken, expiresAt, requestHash }
POST /api/retention/execute-job    → { jobId } (requer confirmToken no body)
GET  /api/jobs/:jobId/status       → progresso do job
```

### Sidebar
- Habilitar "Simulação de Expurgo" → `/expurgo`

---

## 📋 Sprint 17 — Logs + Auditoria

**Objetivo:** Visibilidade operacional de jobs e trilha de auditoria de ações.

### Rota planejada
- `src/pages/LogsPage.tsx` → `/logs`
- `src/pages/AuditPage.tsx` → `/audit`

### Funcionalidades a implementar

#### LogsPage (`/logs`)
- Lista paginada de jobs (todos os tipos: scan, export, version, purge)
- Filtros: tipo, status, período
- Detalhes do job (clique expande): `progressJsonb`, `lastError`, duração
- Link para `JobStatusPage` para jobs em andamento
- Auto-refresh para jobs ativos
- Endpoint a confirmar: `GET /api/jobs?type=&status=&cursor=`

#### AuditPage (`/audit`)
- Trilha de ações administrativas (criação de scans, execuções de expurgo, exports)
- Filtro por usuário, tipo de ação, período
- Exportação da trilha como CSV
- Endpoint a confirmar: `GET /api/audit?cursor=`

### Sidebar
- Habilitar "Logs" → `/logs`
- Habilitar "Auditoria" → `/audit`

---

## 📋 Sprint 18 — Configurações + Administração

**Objetivo:** Gestão de configurações do sistema e usuários.

### Rota planejada
- `src/pages/SettingsPage.tsx` → `/settings`
- `src/pages/AdminPage.tsx` → `/admin`

### Funcionalidades a implementar

#### SettingsPage (`/settings`)
- Token Microsoft Graph: visualizar status (válido/expirado), renovar
- Limites de scan: `MAX_CONCURRENT_WORKERS`, `SCAN_PAGE_SIZE`
- Feature flags visíveis: `USE_PERSISTENT_JOBS`, `USE_ROLLUP_DASHBOARDS`, etc.
- Configurações de retenção: TTL de exports, purge TTL
- Endpoints a confirmar: `GET /api/config` + `PUT /api/config`

#### AdminPage (`/admin`)
- Lista de usuários cadastrados
- Criar usuário (nome, e-mail, papel: admin/operador)
- Resetar senha
- Desativar/reativar usuário
- Endpoints a confirmar: `GET /api/users` + `POST /api/users` + `PUT /api/users/:id`

### Sidebar
- Habilitar "Configurações" → `/settings`
- Habilitar "Administração" → `/admin`

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
| `/reports` | Relatórios | 📋 Sprint 14 |
| `/top-files` | Top Arquivos | 📋 Sprint 14 |
| `/oneration-monitor` | Monitor Oneração | ✅ Funcional |
| `/versioned-by-period` | Versionados por Período | ✅ Funcional |
| `/expurgo` | Simulação de Expurgo | 📋 Sprint 16 |
| `/logs` | Logs | 📋 Sprint 17 |
| `/audit` | Auditoria | 📋 Sprint 17 |
| `/settings` | Configurações | 📋 Sprint 18 |
| `/admin` | Administração | 📋 Sprint 18 |
| `/licenses` | Licenças & Espaço | 💡 Sprint 19 |

---

## Arquivos do projeto — estado atual

```
src/
├── api/
│   ├── auth.api.ts        ✅ Login, branding, primeiro admin, logout
│   ├── client.ts          ✅ HTTP centralizado, 401 → auth:unauthorized
│   ├── inventory.api.ts   ✅ Summary, sites, drives, files, top-files
│   ├── jobs.api.ts        ✅ getJobStatus
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
│   ├── DashboardPage.tsx  ✅ KPIs, fluxo, top ext, top files, auto-refresh
│   ├── InventoryPage.tsx  ✅ Filtros, tabela, export, seletor de scans
│   ├── JobStatusPage.tsx  ✅ Progresso SSE de jobs
│   ├── LoginPage.tsx      ✅ 3 modos, branding, modais
│   ├── NotFoundPage.tsx   ✅ 404
│   └── ScansPage.tsx      ✅ Lista + iniciar scan
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
