# SharePoint Monitor — Frontend

Interface web do **SharePoint Monitor**: visibilidade completa sobre o inventário de arquivos, consumo de armazenamento e jobs de processamento do seu tenant SharePoint Online.

---

## Visão geral

O frontend é uma SPA (Single Page Application) em **React + TypeScript**, servida por **Nginx** e comunicando-se exclusivamente com o backend via API REST e SSE (Server-Sent Events). Em produção Docker, o Nginx atua como proxy reverso entre o browser e o backend — sem necessidade de configurar CORS ou endereço do servidor na aplicação.

```
Browser → Nginx :3000
              ├── /api/*     → proxy → backend:8787
              ├── /health    → proxy → backend:8787
              └── /*         → SPA (index.html)
```

---

## Funcionalidades

| Tela | Rota | O que faz |
|---|---|---|
| Dashboard | `/` | Resumo do último scan: sites, drives, arquivos e volume total |
| Scans | `/scans` | Lista todos os scans e inicia novos |
| Progresso | `/jobs/:jobId` | Acompanha em tempo real o andamento de um job via SSE |
| Inventário | `/inventory/:scanId` | Navega pelos arquivos de um scan com paginação por cursor |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 18 |
| Linguagem | TypeScript 5 |
| Build | Vite 8 (bundler Rolldown) |
| Roteamento | React Router v6 |
| Runtime plugin | `@vitejs/plugin-react-oxc` (OXC, sem Babel) |
| Servidor (prod) | Nginx 1.27 Alpine |
| CI/CD | GitHub Actions → Docker Hub |
| Scan de segurança | Trivy (filesystem + imagem Docker) |

---

## Quick start

### Pré-requisitos

- Node.js ≥ 22
- Docker + Docker Compose (para rodar com o backend)

### Desenvolvimento local

```bash
git clone git@github.com:romulomteixeira/Sharepoint-Files-Tools-Frontend.git
cd Sharepoint-Files-Tools-Frontend

npm install --legacy-peer-deps
npm run dev        # http://localhost:3000
```

> O Vite proxy repassa `/api`, `/health` e `/metrics` para `http://localhost:8787` (backend local).

### Com Docker Compose (stack completa)

No repositório do backend (`Sharepoint-Files-Tools`):

```bash
docker compose up
```

O `docker-compose.yml` do backend baixa automaticamente a imagem publicada do frontend no Docker Hub. Acesse em **http://localhost:3000**.

---

## Scripts disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com hot-reload |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Pré-visualiza o build de produção |
| `npm run lint` | ESLint em `src/` (zero warnings tolerados) |
| `npm run type-check` | Verificação de tipos via `tsc --noEmit` |
| `npm test` | Testes unitários e de componentes com Vitest + Testing Library + MSW |
| `npm run test:coverage` | Testes com relatório de cobertura V8 |
| `npm run test:e2e` | Smoke tests end-to-end com Playwright/Chromium |

---

## Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `VITE_API_BASE_URL` | `""` (vazio) | URL base da API. Vazio = proxy relativo via Nginx. Só necessário fora do Docker. |

Em desenvolvimento, o proxy do Vite cuida do roteamento para o backend. Em produção Docker, o Nginx cuida disso — `VITE_API_BASE_URL` deve permanecer vazio.

---

## Documentação detalhada

| Documento | Conteúdo |
|---|---|
| [Arquitetura](docs/architecture.md) | Estrutura de pastas, camadas e decisões técnicas |
| [Primeiros passos](docs/getting-started.md) | Setup completo, variáveis e dicas de desenvolvimento |
| [Fluxo: Scans](docs/flows/scans.md) | Como criar e acompanhar um scan |
| [Fluxo: Inventário](docs/flows/inventory.md) | Como navegar e filtrar o inventário de arquivos |
| [Fluxo: Relatórios](docs/flows/reports.md) | Como exportar dados em CSV ou JSONL |
| [Fluxo: Jobs](docs/flows/jobs.md) | Como monitorar jobs em tempo real via SSE |

---

## Autenticação

A autenticação é validada pelo **backend**, mas toda a experiência de login é renderizada pelo frontend React na rota `/login`. O fluxo cobre login local, primeiro acesso, confirmação do primeiro administrador e desbloqueio. Ao receber HTTP 401 de um endpoint protegido, o cliente emite `auth:unauthorized` e as rotas protegidas encaminham o usuário para `/login`.

---

## Testes automatizados

A suíte mínima está dividida em:

- **Vitest + React Testing Library** — unidades e componentes React.
- **MSW** — contratos HTTP sem depender de um backend real.
- **Playwright** — smoke tests no navegador, inicialmente cobrindo o redirecionamento para o login React.

Para preparar o navegador do Playwright pela primeira vez:

```bash
npx playwright install --with-deps chromium
```

Os testes de API validam, entre outros pontos, o payload flat dos tokens de expurgo, a simulação server-side de retenção e os parâmetros de scans parciais.

---

## Pipeline CI/CD

Cada push para `main` dispara automaticamente:

1. **Code quality** — ESLint + TypeScript type-check + Vitest + build
2. **Smoke tests E2E** — Playwright em Chromium
3. **Dockerfile lint** — Hadolint
4. **Secret scan** — Gitleaks
5. **Trivy filesystem** — CVEs em dependências npm e IaC
6. **Build e scan da imagem Docker** — Trivy na imagem gerada
7. **Publish** — Push para Docker Hub (`romulomteixeira/sharepoint-monitor-frontend:latest`)

Configure em **Settings → Secrets and variables → Actions** do repositório:

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `IMAGE_NAME` | `romulomteixeira/sharepoint-monitor-frontend` |
| Secret | `DOCKERHUB_USERNAME` | seu usuário Docker Hub |
| Secret | `DOCKERHUB_TOKEN` | token de acesso Docker Hub |
