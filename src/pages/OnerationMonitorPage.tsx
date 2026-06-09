/**
 * OnerationMonitorPage.tsx — "Arquivos que mais oneraram o SharePoint".
 *
 * Lógica EQUIVALENTE ao legacy (server.js `inventoryTopCost`):
 *   - Escolhe scan + janela (Dia / Semana / Mês / Ano)
 *   - Filtra arquivos cujo modified_at (ou created_at) cai no período
 *   - Ordena por totalBytes (arquivo + versões) desc
 *
 * Backend: GET /api/analytics/topcost/{scanId}?window=day|week|month|year&limit=N
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { get } from '../api/client';

const C = {
  panel: '#ffffff', border: '#c8ced8', accent: '#2b6cb0',
  text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

type Window = 'day' | 'week' | 'month' | 'year';
type Field = 'modified' | 'created';

interface TopCostItem {
  siteId?: string; siteName?: string;
  driveName?: string; fullPath?: string;
  name?: string; extension?: string;
  sizeBytes?: number; versionCount?: number;
  versionsBytes?: number; totalBytes?: number;
  modifiedAt?: string; modified?: string;
  modifiedBy?: string; webUrl?: string;
}

interface TopCostResp { window?: string; items?: TopCostItem[] }

const WINDOW_OPTIONS: { value: Window; label: string }[] = [
  { value: 'day', label: 'Dia' }, { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' }, { value: 'year', label: 'Ano' },
];

const LIMIT_OPTIONS = [
  { value: 40, label: 'Top 40' }, { value: 80, label: 'Top 80' },
  { value: 150, label: 'Top 150' }, { value: 300, label: 'Top 300' },
];

function fmtBytes(b: number | undefined): string {
  if (!b) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
function fmtNum(n: number | undefined): string { return n == null ? '—' : n.toLocaleString('pt-BR'); }
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

function csvCell(s: string): string {
  if (!/[",\n]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function exportCsv(items: TopCostItem[], filename: string) {
  const header = 'site,biblioteca,caminho,modificado,colaborador,arquivo_bytes,versoes_count,versoes_bytes,total_bytes';
  const lines = items.map(it => [
    csvCell(it.siteName ?? ''),
    csvCell(it.driveName ?? ''),
    csvCell(it.fullPath ?? ''),
    csvCell(it.modifiedAt ?? it.modified ?? ''),
    csvCell(it.modifiedBy ?? ''),
    String(it.sizeBytes ?? 0),
    String(it.versionCount ?? 0),
    String(it.versionsBytes ?? 0),
    String(it.totalBytes ?? it.sizeBytes ?? 0),
  ].join(','));
  const csv = header + '\n' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function OnerationMonitorPage(): React.ReactElement {
  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = useMemo(
    () => (scans ?? []).filter(sc => sc.status === 'completed' || (sc.totalFiles ?? 0) > 0),
    [scans],
  );

  const [scanId, setScanId] = useState('');
  const [windowKey, setWindowKey] = useState<Window>('month');
  const [field, setField] = useState<Field>('modified');
  const [limit, setLimit] = useState<number>(80);
  const [search, setSearch] = useState('');

  const [data, setData] = useState<TopCostItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId && completedScans.length > 0) setScanId(completedScans[0].id);
  }, [completedScans, scanId]);

  useEffect(() => {
    if (!scanId) return;
    setLoading(true);
    setError(null);
    get<TopCostResp>(`/api/analytics/topcost/${scanId}`, { window: windowKey, field, limit })
      .then(resp => setData(resp.items ?? []))
      .catch(err => { setError(err instanceof Error ? err.message : 'Erro ao carregar dados'); setData([]); })
      .finally(() => setLoading(false));
  }, [scanId, windowKey, field, limit]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(it =>
      (it.siteName ?? '').toLowerCase().includes(q) ||
      (it.driveName ?? '').toLowerCase().includes(q) ||
      (it.fullPath ?? '').toLowerCase().includes(q) ||
      (it.name ?? '').toLowerCase().includes(q) ||
      (it.modifiedBy ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  function handleExport() {
    if (filtered.length === 0) return;
    exportCsv(filtered, `oneration-${windowKey}-${scanId.slice(0, 12)}.csv`);
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.pageTitle}>Arquivos que mais oneraram o SharePoint</div>
          <div style={s.pageSub}>Top itens por período. Métrica: <strong>Total</strong> (arquivo + versões).</div>
        </div>
        <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
      </div>

      <div style={s.controls}>
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>Scan</label>
          {scansLoading ? (<div style={{ fontSize: 12, color: C.muted }}>Carregando…</div>) : (
            <select value={scanId} onChange={e => setScanId(e.target.value)} style={s.select}>
              <option value="">— selecione —</option>
              {completedScans.map(sc => (
                <option key={sc.id} value={sc.id}>
                  {sc.id.slice(0, 16)}… · {fmtNum(sc.totalFiles)} arqs · {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>Período</label>
          <div style={s.segCtl}>
            {WINDOW_OPTIONS.map(opt => (
              <button key={opt.value}
                style={{ ...s.segBtn,
                  background: windowKey === opt.value ? C.accent : C.panel,
                  color: windowKey === opt.value ? '#fff' : C.text }}
                onClick={() => setWindowKey(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>Campo de data</label>
          <select value={field} onChange={e => setField(e.target.value as Field)} style={s.select}>
            <option value="modified">Por LastModified</option>
            <option value="created">Por Created</option>
          </select>
        </div>
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>Limite</label>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={s.select}>
            {LIMIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ ...s.ctrlGroup, flex: 1, minWidth: 200 }}>
          <label style={s.ctrlLabel}>Filtrar</label>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="site, caminho, pessoa…" style={{ ...s.select, width: '100%' }} />
        </div>
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>&nbsp;</label>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleExport} disabled={filtered.length === 0}>↓ CSV</button>
        </div>
      </div>

      <div style={s.callout}>
        <strong>Como ler:</strong> "Arquivo" = tamanho atual. "Versões" e "#Vers" dependem do enrichment via Graph.
        "Total" = Arquivo + Versões. Atualiza quando scan + enrichment terminam.
      </div>

      {error && <div style={s.errorMsg}>⚠ {error}</div>}
      {loading && <div style={s.loadingMsg}>Carregando…</div>}

      {!loading && filtered.length === 0 && !error && (
        <div style={s.emptyPanel}>
          <div style={s.emptyTitle}>Nenhum arquivo no período</div>
          <div style={s.emptySub}>Expanda a janela (Semana → Mês → Ano) ou aguarde o enrichment.</div>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={s.tablePanel}>
          <div style={s.tablePanelHeader}>
            <span style={s.panelTitle}>Top {fmtNum(filtered.length)} arquivos</span>
            <span style={s.countBadge}>∑ {fmtBytes(filtered.reduce((a, it) => a + (it.totalBytes ?? it.sizeBytes ?? 0), 0))}</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Site</th><th style={s.th}>Biblioteca</th><th style={s.th}>Caminho</th>
                  <th style={s.th}>Últ. modif.</th><th style={s.th}>Colaborador</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Arquivo</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>#Vers</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Versões</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, idx) => (
                  <tr key={`${it.siteId}-${it.fullPath}-${idx}`} style={idx % 2 === 0 ? s.trEven : s.trOdd}>
                    <td style={s.td}><div style={s.cellEllipsis}>{it.siteName ?? '—'}</div></td>
                    <td style={s.td}><div style={s.cellEllipsis}>{it.driveName ?? '—'}</div></td>
                    <td style={s.td}>
                      {it.webUrl
                        ? <a href={it.webUrl} target="_blank" rel="noreferrer" style={s.fileLink} title={it.fullPath}>
                            <div style={s.cellEllipsisWide}>{it.name ?? it.fullPath ?? '—'}</div></a>
                        : <div style={s.cellEllipsisWide} title={it.fullPath}>{it.name ?? it.fullPath ?? '—'}</div>}
                    </td>
                    <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(it.modifiedAt ?? it.modified)}</td>
                    <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis}>{it.modifiedBy ?? '—'}</div></td>
                    <td style={{ ...s.td, ...s.right }}>{fmtBytes(it.sizeBytes)}</td>
                    <td style={{ ...s.td, ...s.right }}>{fmtNum(it.versionCount)}</td>
                    <td style={{ ...s.td, ...s.right }}>{fmtBytes(it.versionsBytes)}</td>
                    <td style={{ ...s.td, ...s.right, fontWeight: 700 }}>{fmtBytes(it.totalBytes ?? it.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", color: C.text, display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 },
  pageTitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.2 },
  pageSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  breadcrumb: { fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600, alignSelf: 'flex-end' },
  controls: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px' },
  ctrlGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  ctrlLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' },
  select: { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, color: C.text, background: C.panel, fontFamily: 'inherit', cursor: 'pointer', minWidth: 130 },
  segCtl: { display: 'flex', border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' },
  segBtn: { padding: '6px 12px', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  btn: { padding: '6px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid transparent' },
  btnPrimary: { background: C.accent, color: '#fff', borderColor: C.accent },
  callout: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, padding: '10px 14px', fontSize: 12, color: '#78350f' },
  loadingMsg: { fontSize: 13, color: C.muted, padding: '20px 0' },
  errorMsg: { fontSize: 13, color: C.bad, fontWeight: 600, padding: '12px 14px', background: '#fff5f5', borderRadius: 5, border: '1px solid #fca5a5' },
  emptyPanel: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '40px 20px', textAlign: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  emptySub: { fontSize: 13, color: C.muted },
  tablePanel: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' },
  tablePanelHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: '#f7f9fb' },
  panelTitle: { fontSize: 12, fontWeight: 800, color: C.text, textTransform: 'uppercase', letterSpacing: '.06em' },
  countBadge: { background: C.accent, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '8px 10px', textAlign: 'left' as const, fontWeight: 700, fontSize: 10, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '.05em', background: '#f7f9fb', borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap' as const },
  trEven: { background: C.panel }, trOdd: { background: '#f9fafb' },
  td: { padding: '7px 10px', verticalAlign: 'middle', borderBottom: '1px solid #edf0f4' },
  right: { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const },
  cellMuted: { color: C.muted, fontSize: 11 },
  cellEllipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 180 },
  cellEllipsisWide: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 320 },
  fileLink: { color: C.accent, textDecoration: 'none', fontWeight: 500 },
};
