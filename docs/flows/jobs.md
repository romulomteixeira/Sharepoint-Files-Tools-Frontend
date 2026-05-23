# Fluxo: Jobs e Monitoramento em Tempo Real

Um **job** é uma unidade de trabalho assíncrona executada pelo backend. Scans, exportações e operações de manutenção são todos representados como jobs. O frontend acompanha o progresso em tempo real via **SSE (Server-Sent Events)**.

---

## Tipos de job

| Tipo | Gerado por | Descrição |
|---|---|---|
| `scan_list_sites` | Novo scan | Enumera todos os sites do tenant |
| `scan_site` | scan_list_sites | Escaneia um site específico |
| `scan_drive` | scan_site | Indexa os arquivos de um drive |
| `version_item` | Varredura de versões | Coleta versões de um item |
| `export_inventory` | Exportação | Gera arquivo CSV ou JSONL |
| `retention_execute` | Operação de retenção | Aplica política de retenção |
| `recycle_execute` | Operação de expurgo | Move arquivos para a lixeira |

---

## Acompanhar um job em tempo real

1. Navegue para **Scans** (`/scans`)
2. Em um scan com status `running`, clique em **"Progresso"**
3. A URL muda para `/jobs/:jobId`
4. A página conecta automaticamente ao stream SSE e exibe o progresso

### O que a tela mostra

| Campo | Descrição |
|---|---|
| Tipo | Tipo do job (`scan_list_sites`, `export_inventory`, etc.) |
| Status | Status atual com cor (azul = running, verde = completed, vermelho = failed) |
| Iniciado em | Timestamp de início |
| Concluído em | Timestamp de conclusão (quando disponível) |
| Último erro | Mensagem de erro, se houver |
| Barra de progresso | `concluídas / total` em percentual |
| Chips de detalhe | Pendentes, em execução e com falha |

### Banner de conclusão

Ao finalizar com sucesso, exibe um banner verde com link direto para o inventário (quando o job é de scan).

---

## Como funciona o SSE internamente

O hook `useJobStream` gerencia a conexão:

```
Frontend                     Backend
   │                            │
   │── GET /api/jobs/:id/stream ─→
   │                            │
   │←── event: progress ────────│  (a cada atualização)
   │    { jobId, status, progress: { total, pending, running, completed, failed } }
   │                            │
   │←── event: done ────────────│  (quando termina)
   │    { jobId, status: "completed"|"failed"|"cancelled" }
   │                            │
   │── conexão fechada ─────────│
```

- A conexão é **aberta automaticamente** ao montar o componente
- É **fechada automaticamente** quando o job atinge um status terminal (`completed`, `failed`, `cancelled`)
- É **fechada automaticamente** ao navegar para outra página (cleanup do `useEffect`)
- Em caso de erro de conexão (`onerror`), exibe mensagem "Conexão com o servidor perdida."

---

## Consultar status de um job via API

### Status atual (polling)

```http
GET /api/jobs/:jobId/status
```

```json
{
  "success": true,
  "data": {
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "type": "scan_list_sites",
    "status": "running",
    "progress": {
      "total": 250,
      "pending": 180,
      "running": 5,
      "completed": 62,
      "failed": 3
    },
    "startedAt": "2026-05-22T14:00:05Z"
  }
}
```

### Stream SSE (tempo real)

```bash
# Exemplo com curl
curl -N "http://localhost:8787/api/jobs/550e8400.../stream"

# Saída esperada:
event: progress
data: {"jobId":"550e8400-...","status":"running","progress":{"total":250,"pending":180,"running":5,"completed":62,"failed":3}}

event: progress
data: {"jobId":"550e8400-...","status":"running","progress":{"total":250,"pending":120,"running":5,"completed":122,"failed":3}}

event: done
data: {"jobId":"550e8400-...","status":"completed","progress":{"total":250,"pending":0,"running":0,"completed":247,"failed":3}}
```

---

## Status dos jobs

| Status | Descrição | Terminal? |
|---|---|---|
| `pending` | Aguardando na fila | Não |
| `running` | Em execução | Não |
| `completed` | Concluído com sucesso | **Sim** |
| `failed` | Falhou | **Sim** |
| `cancelled` | Cancelado | **Sim** |

Jobs em status terminal fecham automaticamente a conexão SSE.

---

## Dicas

- Não é necessário manter a página aberta para o job continuar: o processamento ocorre no backend independentemente.
- Se fechar e reabrir a página de progresso de um job ainda em execução, a conexão SSE é restabelecida automaticamente e mostra o estado atual.
- O campo `failed` no progresso indica sub-tarefas com falha (por exemplo, um drive inacessível), mas o job principal pode ainda completar com sucesso se as demais tarefas foram bem-sucedidas.
