# Fluxo: Scans

Um **scan** é o processo de varredura completa do seu tenant SharePoint Online. Ele enumera todos os sites, drives e arquivos e armazena os metadados no banco de dados para consulta posterior.

---

## Ciclo de vida de um scan

```
[Usuário clica "+ Novo Scan"]
        ↓
POST /api/scans
        ↓
Scan criado com status: pending
        ↓
Backend inicia jobs de varredura
        ↓
Status: running  ←──── jobs processando sites/drives
        ↓
Status: ENRICHING  ←──── inventário pronto, enriquecendo versões
        ↓
Status: DONE  (ou DONE_WITH_ERRORS / failed / cancelled)
        ↓
Inventário disponível em /inventory/:scanId
```

> **Conclusão só após as versões:** o scan permanece em `ENRICHING` enquanto o
> enriquecimento de versões não termina; só então vai a `DONE`/`DONE_WITH_ERRORS`.
> Isso garante que "concluído" signifique **inventário + versões** prontos.

---

## Como iniciar um scan

1. Acesse **http://localhost:3000/scans** (ou clique em "Ver Scans" no Dashboard)
2. Clique no botão **"+ Novo Scan"**
3. O sistema cria o scan e recarrega a lista automaticamente
4. O scan aparece na tabela com status `pending` ou `running`

> O botão fica desabilitado durante a criação para evitar cliques duplos.

### Selecionar os maiores sites do tenant

Ao montar um scan por sites específicos, o botão **"Trazer maiores sites"**
(com um limite `N`) consulta `GET /api/sites/by-storage?limit=N`, que ranqueia
os sites do tenant por armazenamento (decrescente) e os adiciona diretamente aos
**sites selecionados** (escopo "selecionados"). Cada resultado mostra um selo com
o espaço ocupado (`storageHuman`). Útil para focar o scan/expurgo nos sites que
mais oneram o tenant.

---

## Acompanhar o progresso

Enquanto o scan está `running`, a coluna **Ações** exibe o link **"Progresso"**.

Clicando nele você é levado a `/jobs/:scanId`, onde o progresso é atualizado **em tempo real** via SSE — sem necessidade de recarregar a página.

Veja mais detalhes em [Fluxo: Jobs](./jobs.md).

---

## Tabela de scans

A tabela exibe, para cada scan:

| Coluna | Descrição |
|---|---|
| ID | Primeiros 8 caracteres do UUID do scan |
| Status | Badge colorido (`pending`, `running`, `ENRICHING`, `DONE`, `DONE_WITH_ERRORS`, `failed`, `cancelled`) |
| Sites | Número de sites SharePoint encontrados |
| Arquivos | Total de arquivos indexados |
| Volume | Espaço total ocupado (formatado: B, KB, MB, GB, TB) |
| Criado em | Data e hora da criação (fuso local) |
| Ações | Link para Progresso (running) ou Inventário (completed) |

---

## Status possíveis

| Status | Cor | Significado |
|---|---|---|
| `pending` | Amarelo | Scan criado, aguardando início do processamento |
| `running` | Azul | Varredura em andamento |
| `ENRICHING` | Azul | Inventário pronto; enriquecimento de versões em curso (ainda não concluído) |
| `DONE` | Verde | Concluído com sucesso (inventário + versões) — inventário disponível |
| `DONE_WITH_ERRORS` | Laranja | Concluído, mas houve falhas no scan ou no enriquecimento |
| `failed` | Vermelho | Falha durante o processamento |
| `cancelled` | Cinza | Cancelado manualmente |

---

## API utilizada

| Método | Endpoint | Ação |
|---|---|---|
| `GET` | `/api/scans/list` | Lista todos os scans (mais recentes primeiro) |
| `POST` | `/api/scans` | Cria um novo scan |
| `GET` | `/api/scans/:scanId/status` | Retorna o status atual do scan |
| `GET` | `/api/sites/by-storage?limit=N` | Maiores sites do tenant por armazenamento (botão "Trazer maiores sites") |

### Exemplo de resposta — `GET /api/scans/list`

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "DONE",
    "createdAt": "2026-05-22T14:00:00Z",
    "startedAt": "2026-05-22T14:00:05Z",
    "finishedAt": "2026-05-22T14:23:41Z",
    "totalSites": 42,
    "totalDrives": 108,
    "totalFiles": 198432,
    "totalBytes": 549755813888
  }
]
```

---

## Dicas

- Só é possível ter um scan ativo por vez. Inicie um novo scan somente após o anterior ser concluído.
- O tempo de varredura depende do número de sites e arquivos no tenant — pode levar de minutos a horas.
- Scans concluídos ficam armazenados indefinidamente; compare scans de diferentes datas para acompanhar o crescimento do armazenamento.
