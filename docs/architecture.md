# Arquitetura do Frontend

## Visão geral em camadas

```
src/
├── api/          ← Camada de acesso à API (fetch puro, sem libs externas)
├── hooks/        ← Hooks de estado e efeitos (useApi, useJobStream)
├── pages/        ← Componentes de página (um por rota)
├── components/   ← Componentes compartilhados (Layout)
├── types/        ← Interfaces TypeScript centralizadas
├── App.tsx       ← Definição de rotas (React Router v7)
├── main.tsx      ← Entry point do Vite
└── vite-env.d.ts ← Tipos do Vite (import.meta.env)
```

---

## Roteamento

Definido em `App.tsx` usando React Router v7 com layout aninhado:

```
Layout (sidebar + navegação)
├── /                    → DashboardPage
├── /scans               → ScansPage
├── /jobs/:jobId         → JobStatusPage
├── /inventory            → InventoryPage (seletor)
├── /inventory/:scanId   → InventoryPage
├── /reports              → ReportsPage
├── /top-files            → TopFilesPage
├── /oneration-monitor    → OnerationMonitorPage
├── /versioned-by-period  → VersionedByPeriodPage
├── /expurgo              → ExpurgoPage
├── /logs                 → LogsPage
├── /audit                → AuditPage
├── /settings             → SettingsPage
├── /admin                → AdminPage
├── /licenses             → LicensesPage
└── *                    → NotFoundPage
```

O `Layout` envolve todas as rotas e fornece a estrutura visual comum (sidebar, header). As páginas individuais renderizam dentro do `<Outlet />` do Layout.

---

## Camada de API (`src/api/`)

Toda comunicação com o backend passa por `client.ts`, que fornece:

- `get<T>(path, params?)` — requisição GET com query params
- `post<T>(path, body?)` — requisição POST com corpo JSON
- `del<T>(path, body?)` — requisição DELETE
- `openEventStream(path)` — abre conexão SSE (Server-Sent Events)

### Formatos de resposta

Os endpoints modernos usam o envelope:

```typescript
{
  success: boolean,
  data: T | null,
  error: { code, message, details? } | null,
  meta: Record<string, unknown>
}
```

O `client.ts` também aceita JSON legado sem envelope, conforme os contratos ainda presentes
no backend homologado. Endpoints de autenticação, configuração, administração e licenças usam
fetchers próprios porque retornam objetos planos como `{ ok, ... }`.

### Timeout e erros

- Timeout de **30 segundos** por requisição (via `AbortController` nativo)
- Erros lançam `ApiClientError` com `code`, `message`, `status` e `details`

### Arquivos de API por domínio

| Arquivo | Endpoints cobertos |
|---|---|
| `scans.api.ts` | Criar scan, listar scans, status do scan |
| `inventory.api.ts` | Resumo, sites, drives, arquivos, top-files |
| `reports.api.ts` | Exportar inventário, status do job de export, download |
| `jobs.api.ts` | Status de jobs genéricos |

---

## Hooks customizados (`src/hooks/`)

### `useApi`

Hook genérico para chamadas assíncronas com estado de loading/error/data:

```typescript
const { data, loading, error, refetch } = useApi(fn, deps);
```

- Executa `fn()` na montagem e sempre que `deps` mudar
- Expõe `refetch()` para recarregar manualmente
- Cancela a requisição anterior se deps mudarem antes da resposta

### `useJobStream`

Hook dedicado para acompanhar jobs via **SSE (Server-Sent Events)**:

```typescript
const { status, error, done, transport } = useJobStream(jobId, options);
```

- Abre conexão com o stream SSE configurado pelo domínio
- Normaliza eventos nomeados e o evento padrão `message` com `type: progress`
- Faz fallback para polling quando o stream não entrega progresso
- Expõe o transporte ativo (`sse` ou `polling`)
- Fecha a conexão automaticamente quando o job atinge status terminal (`completed`, `failed`, `cancelled`)
- Fecha a conexão quando o componente desmonta (cleanup de `useEffect`)

---

## Tipagem central (`src/types/index.ts`)

Todas as interfaces são definidas em um único arquivo para facilitar manutenção:

| Interface | Representa |
|---|---|
| `ApiResponse<T>` | Envelope padrão de resposta da API |
| `Scan` | Objeto de scan (id, status, timestamps, totais) |
| `ScanStatus` | Union: `pending \| running \| completed \| failed \| cancelled` |
| `Job` | Job de processamento (scan, export, retention) |
| `JobStatusDetail` | Progresso detalhado de um job |
| `InventorySummary` | Totais agregados de um scan |
| `SiteRollup` | Site com rollup de armazenamento |
| `DriveRollup` | Drive com rollup de armazenamento |
| `FileItem` | Arquivo individual do inventário |
| `ExportJob` | Job de exportação com URL de download |
| `HealthDetail` | Status de saúde do backend |

---

## Build e bundling

### Vite 8 + Rolldown

O Vite 8 substitui o Rollup pelo **Rolldown** (bundler em Rust) internamente. Impacto prático:

- `manualChunks` deve ser **função**, não objeto (quebra em Rolldown)
- Plugin React oficial (`@vitejs/plugin-react`) com suporte declarado ao Vite 8

### Chunks gerados

```
dist/assets/vendor-[hash].js     ← React + ReactDOM + React Router
dist/assets/index-[hash].js      ← Código da aplicação
dist/assets/rolldown-runtime-[hash].js  ← Runtime do Rolldown
dist/index.html
```

---

## Nginx (produção)

O `nginx.conf` configura:

| Rota | Comportamento |
|---|---|
| `/api/*` | Proxy para `backend:8787/api/` |
| `/api/(scans\|jobs)/:id/stream` | Proxy SSE (buffering off, timeout 3600s) |
| `/(health\|metrics\|api-docs)` | Proxy para `backend:8787` |
| `/*.{js,css,svg,...}` | Cache de 1 ano (`immutable`) |
| `/*` | SPA fallback → `index.html` |

Headers de segurança incluídos: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

---

## Decisões técnicas notáveis

| Decisão | Motivo |
|---|---|
| Sem Redux / Zustand | Estado local (`useState`) é suficiente para a complexidade atual |
| Fetch nativo (sem axios) | Reduz dependências; timeout e abort implementados com `AbortController` |
| ESLint flat config + `typescript-eslint` | Configuração suportada pelas versões atuais do ESLint, TypeScript e React Hooks |
| `npm ci` + lockfile versionado | Instalações reproduzíveis no desenvolvimento, CI e build Docker |
| `@vitejs/plugin-react` | Plugin oficial com suporte declarado ao Vite 8 |
| Inline styles (sem CSS modules) | Simplicidade para o escopo atual; facilita migração futura para qualquer lib de UI |
