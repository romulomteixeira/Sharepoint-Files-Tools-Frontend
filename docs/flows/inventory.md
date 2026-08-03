# Fluxo: Inventário

O **inventário** é o resultado de um scan concluído: a lista completa de todos os arquivos encontrados no tenant SharePoint Online, com metadados de tamanho, tipo, site e drive.

---

## Como acessar o inventário

1. Vá para **Scans** (`/scans`)
2. Localize um scan concluído (status `DONE` / `DONE_WITH_ERRORS`)
3. Clique em **"Inventário"** na coluna Ações

> Um scan em `ENRICHING` (inventário pronto, enriquecimento de versões em curso)
> já tem inventário navegável, mas as métricas de **versões** ainda podem estar
> sendo preenchidas. Ele só é considerado concluído após as versões terminarem.

Ou, a partir do **Dashboard**, clique em **"Ver Inventário"** — ele aponta automaticamente para o scan mais recente concluído.

A URL do inventário tem o formato `/inventory/:scanId`.

---

## O que a tela exibe

### Cards de resumo (topo)

Quatro métricas agregadas do scan:

| Métrica | Descrição |
|---|---|
| Sites | Total de sites SharePoint encontrados |
| Drives | Total de drives (bibliotecas de documentos) |
| Arquivos | Total de arquivos indexados |
| Total | Volume total em bytes (formatado automaticamente) |

Os cards refletem o **escopo selecionado**: ao escolher um scan mostram os
totais do scan inteiro; ao **selecionar um site** no filtro, recarregam para os
totais **daquele site** (via `getInventorySummary(scanId, siteId)`).

### Tabela de arquivos

Lista paginada de arquivos com as colunas:

| Coluna | Descrição |
|---|---|
| Nome | Nome do arquivo — clicável se tiver URL no SharePoint |
| Extensão | Tipo do arquivo (`.docx`, `.xlsx`, `.pdf`, etc.) |
| Tamanho | Tamanho formatado (B, KB, MB, GB, TB) |
| Modificado | Data da última modificação |

---

## Paginação por cursor

A tabela carrega **100 arquivos por vez** usando paginação por cursor (keyset pagination). Ao chegar ao final da lista, o botão **"Carregar mais"** aparece automaticamente.

Clicando em "Carregar mais", os próximos 100 arquivos são **adicionados** à tabela (sem substituir os anteriores), permitindo navegar progressivamente por inventários com milhões de arquivos sem sobrecarregar o browser.

```
Página 1: arquivos 1–100
         ↓ [Carregar mais]
Página 2: arquivos 1–200 (acumulado)
         ↓ [Carregar mais]
...
```

---

## API utilizada

| Método | Endpoint | Parâmetros |
|---|---|---|
| `GET` | `/api/inventory/:scanId/summary` | `siteId` (opcional — totais por site) |
| `GET` | `/api/inventory/:scanId/files` | `cursor`, `pageSize`, `siteId`, `driveId`, `extension`, `sort` |
| `GET` | `/api/inventory/:scanId/sites` | `cursor`, `pageSize`, `sort` (`total_bytes` = arquivo+versões) |
| `GET` | `/api/inventory/:scanId/drives` | `cursor`, `pageSize`, `siteId` |
| `GET` | `/api/inventory/:scanId/extensions` | `limit` — extensões **reais** do scan (alimenta o filtro) |
| `GET` | `/api/inventory/:scanId/top-files` | `limit` |

> **Ordenação maior/menor** considera o **espaço total** (arquivo + versões),
> não só o tamanho do arquivo atual. O **filtro de extensões** é populado pelo
> endpoint `/extensions` (extensões efetivamente presentes no scan), não por uma
> lista fixa.

### Exemplo de resposta — `GET /api/inventory/:scanId/summary`

```json
{
  "scanId": "550e8400-e29b-41d4-a716-446655440000",
  "totalSites": 42,
  "totalDrives": 108,
  "totalFiles": 198432,
  "totalBytes": 549755813888,
  "topExtensions": [
    { "extension": ".docx", "fileCount": 54320, "totalBytes": 102400000 },
    { "extension": ".pdf",  "fileCount": 38120, "totalBytes": 214748364 }
  ]
}
```

### Exemplo de resposta — `GET /api/inventory/:scanId/files`

```json
{
  "items": [
    {
      "id": "abc123",
      "name": "Relatório Q1.xlsx",
      "extension": ".xlsx",
      "totalBytes": 204800,
      "webUrl": "https://empresa.sharepoint.com/sites/financeiro/...",
      "modifiedAt": "2026-03-31T18:00:00Z",
      "siteId": "site-uuid",
      "driveId": "drive-uuid"
    }
  ],
  "pageInfo": {
    "nextCursor": "eyJpZCI6ImFiYzEyMyJ9",
    "hasNextPage": true
  }
}
```

---

## Dicas

- Clique no nome de um arquivo para abri-lo diretamente no SharePoint Online (abre em nova aba).
- Filtre por site, drive e extensão direto na UI; selecionar um site também atualiza os cards de resumo do topo.
- Para exportar o inventário em CSV ou JSONL, consulte [Fluxo: Relatórios](./reports.md).
- O inventário de um scan não muda após a conclusão — é uma fotografia do estado do tenant naquele momento.
