# Fluxo: Relatórios e Exportação

O SharePoint Monitor permite exportar o inventário completo de um scan em dois formatos: **CSV** e **JSONL**. A exportação é assíncrona — para inventários grandes, o backend processa em background e disponibiliza o arquivo para download quando concluído.

---

## Formatos disponíveis

| Formato | Extensão | Uso recomendado |
|---|---|---|
| CSV | `.csv` | Excel, Power BI, análises ad-hoc |
| JSONL | `.jsonl` | Pipelines de dados, scripts, ferramentas de linha de comando |

---

## Fluxo de exportação

```
[Solicitar exportação]
        ↓
GET /api/export/inventory/:scanId?format=csv
        ↓
   ┌────────────────────────────┐
   │ Lote pequeno (≤ limite)?   │
   └────────────────────────────┘
        ↓ SIM                      ↓ NÃO
  Retorna downloadUrl         Retorna { jobId }
  direto na resposta               ↓
        ↓              Polling em /api/jobs/:jobId/status
        ↓                          ↓ status = completed
        ↓                    downloadUrl disponível
        ↓                          ↓
   GET /api/export/download/:jobId  ←──────────────┘
        ↓
   Download do arquivo
```

---

## Como exportar via API

### Passo 1 — Solicitar exportação

```http
GET /api/export/inventory/{scanId}?format=csv
```

**Parâmetros disponíveis:**

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `format` | `csv` \| `jsonl` | `csv` | Formato do arquivo exportado |
| `limit` | number | sem limite | Número máximo de arquivos |
| `siteId` | string | — | Filtrar por site específico |
| `driveId` | string | — | Filtrar por drive específico |
| `extension` | string | — | Filtrar por extensão (ex: `.pdf`) |

**Exemplo de requisição:**

```bash
curl "http://localhost:8787/api/export/inventory/550e8400-e29b-41d4-a716-446655440000?format=csv&extension=.pdf"
```

**Resposta — lote pequeno (download imediato):**

```json
{
  "success": true,
  "data": {
    "jobId": "job-uuid-123",
    "status": "completed",
    "downloadUrl": "/api/export/download/job-uuid-123",
    "format": "csv",
    "createdAt": "2026-05-22T18:00:00Z",
    "finishedAt": "2026-05-22T18:00:01Z"
  }
}
```

**Resposta — lote grande (job assíncrono):**

```json
{
  "success": true,
  "data": {
    "jobId": "job-uuid-456",
    "status": "pending",
    "format": "csv",
    "createdAt": "2026-05-22T18:00:00Z"
  }
}
```

### Passo 2 — Aguardar conclusão (lotes grandes)

Faça polling em `/api/jobs/:jobId/status` até `status === "completed"`:

```bash
curl "http://localhost:8787/api/jobs/job-uuid-456/status"
```

```json
{
  "success": true,
  "data": {
    "jobId": "job-uuid-456",
    "status": "completed",
    "downloadUrl": "/api/export/download/job-uuid-456"
  }
}
```

### Passo 3 — Baixar o arquivo

```bash
curl -o inventario.csv "http://localhost:8787/api/export/download/job-uuid-456"
```

---

## Expurgo (operação destrutiva)

Para operações de expurgo (remoção de arquivos), o sistema exige um token de confirmação antes de executar:

### Passo 1 — Solicitar token de confirmação

```http
POST /api/purge/confirm
Content-Type: application/json

{
  "operation": "retention_execute",
  "params": {
    "scanId": "550e8400-...",
    "criteria": { "extension": ".tmp", "olderThan": "2025-01-01" }
  }
}
```

**Resposta:**

```json
{
  "success": true,
  "data": {
    "confirmToken": "tkn_abc123...",
    "expiresAt": "2026-05-22T18:05:00Z",
    "requestHash": "sha256-hash-da-operacao"
  }
}
```

> O token expira em **5 minutos** e é válido apenas para a operação e parâmetros exatos informados.

### Passo 2 — Executar com o token

Inclua o `confirmToken` no header ou body da requisição de execução conforme documentação do endpoint específico de expurgo.

---

## Dicas

- Para exportações de inventários com milhões de arquivos, use `JSONL` — é mais eficiente para processamento em streaming.
- Combine filtros (`siteId`, `extension`) para exportações menores e mais direcionadas.
- O `downloadUrl` retornado é relativo ao backend — em Docker, acesse como `http://localhost:8787{downloadUrl}`.
- Arquivos exportados ficam disponíveis temporariamente no backend. Faça o download logo após a conclusão do job.
