# Primeiros passos

## Pré-requisitos

| Ferramenta | Versão mínima | Uso |
|---|---|---|
| Node.js | 22 | Desenvolvimento e build |
| npm | 8 | Gerenciador de pacotes |
| Docker | 24 | Executar o stack completo |
| Docker Compose | v2 | Orquestrar backend + frontend |

---

## Instalação para desenvolvimento

```bash
# 1. Clonar o repositório
git clone git@github.com:romulomteixeira/Sharepoint-Files-Tools-Frontend.git
cd Sharepoint-Files-Tools-Frontend

# 2. Instalar dependências
npm install --legacy-peer-deps

# 3. Iniciar o servidor de desenvolvimento
npm run dev
```

A aplicação ficará disponível em **http://localhost:3000**.

> **Nota:** o flag `--legacy-peer-deps` é necessário porque o `@vitejs/plugin-react-oxc` ainda não declarou suporte formal ao Vite 8 nos peer deps, mas funciona corretamente.

---

## Conectando ao backend

O servidor de desenvolvimento (Vite) tem um proxy configurado em `vite.config.ts`:

```
/api     → http://localhost:8787
/health  → http://localhost:8787
/metrics → http://localhost:8787
```

Para que o frontend funcione, o **backend precisa estar rodando na porta 8787**. Você pode subir o backend de duas formas:

### Opção A — Docker Compose (recomendado)

No repositório do backend:

```bash
docker compose up postgres postgres_queue backend
```

Isso sobe o PostgreSQL e o servidor Node.js sem o container do frontend (que você está rodando localmente).

### Opção B — Node.js local

No repositório do backend:

```bash
node server.js
```

---

## Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto (não é commitado):

```bash
# URL base da API — deixar vazio usa o proxy Nginx (produção) ou Vite (dev)
VITE_API_BASE_URL=
```

Em desenvolvimento com o proxy Vite ativo, `VITE_API_BASE_URL` deve estar vazio.

Para apontar para um backend remoto em desenvolvimento:

```bash
VITE_API_BASE_URL=https://api.meudominio.com
```

---

## Rodando com Docker Compose (stack completa)

No repositório do **backend** (`Sharepoint-Files-Tools`), o `docker-compose.yml` inclui o frontend:

```bash
# Sobe toda a stack: postgres, postgres_queue, backend, frontend
docker compose up

# Ou em background
docker compose up -d
```

O Docker baixa automaticamente a imagem do frontend do Docker Hub:
`romulomteixeira/sharepoint-monitor-frontend:latest`

| Serviço | URL local |
|---|---|
| Frontend (Nginx) | http://localhost:3000 |
| Backend (API) | http://localhost:8787 |
| PostgreSQL (app) | localhost:5432 |
| PostgreSQL (fila) | localhost:5433 |

Para usar uma imagem local do frontend em vez da publicada:

```bash
# Build local
docker build -t meu-usuario/sharepoint-monitor-frontend:local .

# Sobrescrever a imagem no compose
FRONTEND_IMAGE=meu-usuario/sharepoint-monitor-frontend:local docker compose up
```

---

## Build de produção manual

```bash
npm run build
```

Gera os arquivos otimizados em `dist/`. Para pré-visualizar localmente:

```bash
npm run preview   # http://localhost:4173
```

---

## Verificações de qualidade

Execute antes de abrir um PR:

```bash
# Lint (zero warnings tolerados)
npm run lint

# Type checking
npm run type-check

# Build completo (valida tudo junto)
npm run build
```

---

## Estrutura de pastas

```
.
├── src/
│   ├── api/            ← Clientes HTTP por domínio
│   ├── components/     ← Componentes compartilhados
│   ├── hooks/          ← Hooks customizados
│   ├── pages/          ← Um componente por rota
│   ├── types/          ← Interfaces TypeScript
│   ├── App.tsx         ← Roteamento
│   ├── main.tsx        ← Entry point
│   └── vite-env.d.ts   ← Tipos do Vite
├── docs/               ← Documentação
│   └── flows/          ← Fluxos por funcionalidade
├── .github/
│   ├── workflows/      ← Pipeline CI/CD
│   └── dependabot.yml  ← Atualizações automáticas
├── Dockerfile          ← Multi-stage build (Node → Nginx)
├── nginx.conf          ← Configuração do Nginx (prod)
├── vite.config.ts      ← Configuração do Vite
├── tsconfig.json       ← TypeScript
└── package.json
```

---

## Solução de problemas comuns

| Problema | Causa | Solução |
|---|---|---|
| `npm ci` falha no Docker | `package-lock.json` não commitado | Sempre commitar o lock file |
| `import.meta.env` não reconhecido | `vite-env.d.ts` ausente | Verificar se o arquivo existe em `src/` |
| `manualChunks is not a function` | Vite 8 exige função, não objeto | Usar `manualChunks(id) { ... }` |
| API retorna 401 | Sessão expirada ou não autenticado | Acessar o backend em `:8787/login` |
| Proxy não funciona | Backend não está rodando | Subir o backend na porta 8787 |
