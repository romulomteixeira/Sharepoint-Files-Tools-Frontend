/**
 * TopFilesPage.tsx — Top N maiores arquivos do tenant (Sprint 14)
 *
 * Funcionalidades:
 *   - Seletor de scan concluído
 *   - Top N configurável: 50 / 100 / 500
 *   - Tabela com: posição, nome (link), site, extensão, tamanho, modificado
 *   - Ordenação por tamanho (padrão), nome, data — client-side sobre os dados carregados
 *   - Filtro inline por extensão
 *   - Botão para exportar o resultado atual como CSV/JSONL
 *   - Design system idêntico às demais páginas
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { getTopFiles, getInventorySites } from '../api/inventory.api';
import { exportInventory, getExportJobStatus, getDownloadUrl } from '../api/reports.api';
import type { SiteRollup, ExportJob } from '../types';
import { useRef, useEffect } from 'react';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:     '#eef1f5',
  panel:  '#ffffff',
  border: '#c8ced8',
  accent: '#2b6cb0',
  text:   '#1a202c',
  muted:  '#4a5568',
  good:   '#276749',
  warn:   '#c05621',
  bad:    '#c53030',
} as const;

// ─── Constantes ───────────────────────────────────────────────────────────────

const EXPORT_POLL_MS  = 2_000;
const TERMINAL_EXPORT = new Set(['completed', 'failed', 'cancelled']);

const LIMIT_OPTIONS = [
  { value: 50,  label: 'Top 50'  },
  { value: 100, label: 'Top 100' },
  { value: 500, label: 'Top 500' },
];

type SortKey = 'size' | 'name' | 'date';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'size', label: 'Maior tamanho' },
  { value: 'name', label: 'Nome A→Z'      },
  { value: 'date', label: 'Mais recente'  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(b: number | undefined): string {
  if (b == null || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtNum(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR');
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TopFilesPage(): React.ReactElement {
  // ── Controles
  const [selectedScanId, setSelectedScanId] = useState('');
  const [topN,           setTopN]           = useState<number>(100);
  const [sortKey,        setSortKey]        = useState<SortKey>('size');
  const [filterExt,      setFilterExt]      = useState('');

  // ── Exportação
  const [exportJob,     setExportJob]     = useState<ExportJob | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError,   setExportError]   = useState<string | null>(null);
  const exportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dados
  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');

  const { data: topFiles, loading: filesLoading, error: filesError } = useApi(
    () => selectedScanId
      ? getTopFiles(selectedScanId, { limit: topN })
      : Promise.resolve(null),
    [selectedScanId, topN],
  );

  const { data: sitesPage } = useApi(
    () => selectedScanId
      ? getInventorySites(selectedScanId, { pageSize: 500 })
      : Promise.resolve(null),
    [selectedScanId],
  );

  // ── Cleanup polling
  useEffect(() => {
    return () => { if (exportPollRef.current) clearInterval(exportPollRef.current); };
  }, []);

  // ── Mapa siteId → siteName
  const siteMap = useMemo(
    () => Object.fromEntries(
      (sitesPage?.items ?? []).map((st: SiteRollup) => [st.siteId, st.siteName || st.siteUrl || st.siteId]),
    ),
    [sitesPage],
  );

  // ── Extensões disponíveis nos dados carregados
  const availableExts = useMemo(() => {
    if (!topFiles) return [];
    const seen = new Set<string>();
    topFiles.forEach(f => seen.add(f.extension || ''));
    return Array.from(seen).sort();
  }, [topFiles]);

  // ── Filtragem e ordenação client-side
  const displayFiles = useMemo(() => {
    if (!topFiles) return [];
    const list = filterExt
      ? topFiles.filter(f => (f.extension || '') === filterExt)
      : [...topFiles];

    list.sort((a, b) => {
      if (sortKey === 'size') return (b.totalBytes ?? 0) - (a.totalBytes ?? 0);
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'pt-BR');
      if (sortKey === 'date') {
        const da = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
        const db = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
        return db - da;
      }
      return 0;
    });
    return list;
  }, [topFiles, filterExt, sortKey]);

  // ── Exportação
  async function startExport(format: 'csv' | 'jsonl') {
    if (!selectedScanId || exportLoading) return;

    if (exportPollRef.current) { clearInterval(exportPollRef.current); exportPollRef.current = null; }
    setExportJob(null);
    setExportError(null);
    setExportLoading(true);

    try {
      const job = await exportInventory({
        scanId:    selectedScanId,
        format,
        extension: filterExt || undefined,
        limit:     topN,
      });
      setExportJob(job);

      if (job.status === 'completed') {
        triggerDownload(job, format);
        setExportLoading(false);
        return;
      }

      exportPollRef.current = setInterval(async () => {
        try {
          const updated = await getExportJobStatus(job.jobId);
          const merged: ExportJob = {
            ...job,
            status:      updated.status,
            downloadUrl: updated.downloadUrl ?? job.downloadUrl,
            finishedAt:  updated.finishedAt,
          };
          setExportJob(merged);
          if (TERMINAL_EXPORT.has(merged.status)) {
            clearInterval(exportPollRef.current!);
            exportPollRef.current = null;
            setExportLoading(false);
            if (merged.status === 'completed') triggerDownload(merged, format);
          }
        } catch {
          clearInterval(exportPollRef.current!);
          exportPollRef.current = null;
          setExportError('Erro ao verificar status da exportação');
          setExportLoading(false);
        }
      }, EXPORT_POLL_MS);

    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao exportar');
      setExportLoading(false);
    }
  }

  function triggerDownload(job: ExportJob, format: 'csv' | 'jsonl') {
    const url = job.downloadUrl ?? getDownloadUrl(job.jobId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top${topN}_${selectedScanId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Derivados
  const maxBytes = displayFiles[0]?.totalBytes ?? 1;

  return (
    <>
      <style>{`@keyframes tf-spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={s.header}>
          <div>
            <div style={s.pageTitle}>Top Arquivos</div>
            <div style={s.pageSub}>Maiores arquivos do inventário — ordenados por tamanho</div>
          </div>
          <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
        </div>

        {/* ── Controles ───────────────────────────────────────────────────── */}
        <div style={s.controls}>

          {/* Scan selector */}
          <div style={s.ctrlGroup}>
            <label style={s.ctrlLabel}>Scan</label>
            {scansLoading ? (
              <div style={{ fontSize: 12, color: C.muted }}>Carregando…</div>
            ) : (
              <select
                value={selectedScanId}
                onChange={e => { setSelectedScanId(e.target.value); setFilterExt(''); }}
                style={s.select}
              >
                <option value="">— selecione um scan —</option>
                {completedScans.map(sc => (
                  <option key={sc.id} value={sc.id}>
                    {sc.id.slice(0, 16)}…  ·  {fmtNum(sc.totalFiles)} arqs  ·  {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Top N */}
          <div style={s.ctrlGroup}>
            <label style={s.ctrlLabel}>Quantidade</label>
            <div style={s.btnGroup}>
              {LIMIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  style={{
                    ...s.toggleBtn,
                    background:  topN === opt.value ? C.accent : C.panel,
                    color:       topN === opt.value ? '#fff'    : C.text,
                    borderColor: topN === opt.value ? C.accent  : C.border,
                  }}
                  onClick={() => setTopN(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ordenação */}
          <div style={s.ctrlGroup}>
            <label style={s.ctrlLabel}>Ordenar por</label>
            <div style={s.btnGroup}>
              {SORT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  style={{
                    ...s.toggleBtn,
                    background:  sortKey === opt.value ? C.accent : C.panel,
                    color:       sortKey === opt.value ? '#fff'    : C.text,
                    borderColor: sortKey === opt.value ? C.accent  : C.border,
                  }}
                  onClick={() => setSortKey(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro extensão */}
          {availableExts.length > 0 && (
            <div style={s.ctrlGroup}>
              <label style={s.ctrlLabel}>Extensão</label>
              <select
                value={filterExt}
                onChange={e => setFilterExt(e.target.value)}
                style={s.select}
              >
                <option value="">Todas ({topFiles?.length ?? 0})</option>
                {availableExts.map(ext => (
                  <option key={ext} value={ext}>
                    {ext || '(sem ext)'} ({topFiles?.filter(f => (f.extension || '') === ext).length ?? 0})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Exportar */}
          <div style={{ ...s.ctrlGroup, marginLeft: 'auto' }}>
            <label style={s.ctrlLabel}>Exportar resultado</label>
            <div style={s.btnGroup}>
              <button
                style={{ ...s.btn, ...s.btnSecondary, opacity: (!selectedScanId || exportLoading) ? 0.5 : 1 }}
                disabled={!selectedScanId || exportLoading}
                onClick={() => startExport('csv')}
              >
                {exportLoading && exportJob?.format === 'csv' ? '⏳…' : '↓ CSV'}
              </button>
              <button
                style={{ ...s.btn, ...s.btnSecondary, opacity: (!selectedScanId || exportLoading) ? 0.5 : 1 }}
                disabled={!selectedScanId || exportLoading}
                onClick={() => startExport('jsonl')}
              >
                {exportLoading && exportJob?.format === 'jsonl' ? '⏳…' : '↓ JSONL'}
              </button>
            </div>
          </div>

        </div>
        {/* /controls */}

        {/* ── Status de exportação ─────────────────────────────────────────── */}
        {(exportJob || exportError) && (
          <div style={{
            ...s.exportBar,
            background:   exportJob?.status === 'completed' ? '#f0fff4' : exportJob?.status === 'failed' ? '#fff5f5' : '#ebf4ff',
            borderColor:  exportJob?.status === 'completed' ? C.good    : exportJob?.status === 'failed' ? C.bad     : C.accent,
          }}>
            {exportError && <span style={{ color: C.bad }}>⚠ {exportError}</span>}
            {exportJob?.status === 'completed' && (
              <span style={{ color: C.good }}>
                ✓ Pronto →{' '}
                <a href={exportJob.downloadUrl ?? getDownloadUrl(exportJob.jobId)} download style={{ color: C.good, fontWeight: 700 }}>
                  Baixar {exportJob.format.toUpperCase()} ↓
                </a>
              </span>
            )}
            {(exportJob?.status === 'pending' || exportJob?.status === 'running') && (
              <span style={{ color: C.accent, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={s.spinner} /> Gerando {exportJob.format.toUpperCase()}…
              </span>
            )}
            {(exportJob?.status === 'failed' || exportJob?.status === 'cancelled') && (
              <span style={{ color: C.bad }}>✗ Exportação falhou</span>
            )}
            <button style={s.dismissBtn} onClick={() => { setExportJob(null); setExportError(null); }}>✕</button>
          </div>
        )}

        {/* ── Tabela + barra de volume ─────────────────────────────────────── */}
        <div style={s.tablePanel}>

          {/* Header do painel */}
          <div style={s.tablePanelHeader}>
            <span style={s.panelTitle}>
              {selectedScanId ? `Top ${topN} arquivos` : 'Arquivos'}
            </span>
            {displayFiles.length > 0 && (
              <span style={s.countBadge}>
                {filterExt
                  ? `${displayFiles.length} de ${topFiles?.length ?? 0}`
                  : displayFiles.length}
              </span>
            )}
            {filterExt && (
              <span
                style={{ ...s.extBadge, cursor: 'pointer' }}
                onClick={() => setFilterExt('')}
                title="Remover filtro"
              >
                {filterExt} ✕
              </span>
            )}
          </div>

          {/* States */}
          {!selectedScanId && (
            <div style={s.emptyMsg}>Selecione um scan para visualizar os maiores arquivos.</div>
          )}
          {selectedScanId && filesLoading && (
            <div style={s.loadingMsg}>
              <span style={s.spinner} /> Carregando top {topN} arquivos…
            </div>
          )}
          {filesError && <div style={s.errorMsg}>⚠ {filesError}</div>}
          {selectedScanId && !filesLoading && !filesError && displayFiles.length === 0 && (
            <div style={s.emptyMsg}>Nenhum arquivo encontrado.</div>
          )}

          {/* Tabela */}
          {displayFiles.length > 0 && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, width: '4%', textAlign: 'center' as const }}>#</th>
                    <th style={{ ...s.th, width: '33%' }}>Nome</th>
                    <th style={{ ...s.th, width: '22%' }}>Site</th>
                    <th style={{ ...s.th, width: '8%'  }}>Ext</th>
                    <th style={{ ...s.th, width: '16%' }}>Tamanho</th>
                    <th style={{ ...s.th, width: '10%' }}>Modificado</th>
                    <th style={{ ...s.th, width: '7%'  }}>Criado por</th>
                  </tr>
                </thead>
                <tbody>
                  {displayFiles.map((f, idx) => {
                    const pct = Math.round((f.totalBytes / maxBytes) * 100);
                    return (
                      <tr key={f.id} style={idx % 2 === 0 ? s.trEven : s.trOdd}>

                        {/* Posição */}
                        <td style={{ ...s.td, textAlign: 'center', fontWeight: 700, color: idx < 3 ? C.accent : C.muted, fontSize: 11 }}>
                          {idx + 1}
                        </td>

                        {/* Nome */}
                        <td style={s.td}>
                          <div style={s.nameCell}>
                            {f.webUrl ? (
                              <a href={f.webUrl} target="_blank" rel="noreferrer" style={s.fileLink} title={f.name}>
                                {f.name}
                              </a>
                            ) : (
                              <span title={f.name}>{f.name}</span>
                            )}
                          </div>
                        </td>

                        {/* Site */}
                        <td style={{ ...s.td, ...s.cellMuted }}>
                          <div style={s.cellEllipsis} title={f.siteId}>
                            {siteMap[f.siteId] ?? f.siteId}
                          </div>
                        </td>

                        {/* Extensão */}
                        <td style={s.td}>
                          <span
                            style={{
                              ...s.extBadge,
                              cursor:     'pointer',
                              background: (f.extension || '') === filterExt && filterExt ? C.accent : '#e8f0f8',
                              color:      (f.extension || '') === filterExt && filterExt ? '#fff'    : C.accent,
                            }}
                            onClick={() => setFilterExt(
                              (f.extension || '') === filterExt ? '' : (f.extension || ''),
                            )}
                            title="Filtrar por extensão"
                          >
                            {f.extension || '—'}
                          </span>
                        </td>

                        {/* Tamanho + barra */}
                        <td style={s.td}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontVariantNumeric: 'tabular-nums' as const, fontWeight: 700, fontSize: 12 }}>
                              {fmtBytes(f.totalBytes)}
                            </span>
                            <div style={s.barTrack}>
                              <div style={{ ...s.barFill, width: `${pct}%` }} />
                            </div>
                          </div>
                        </td>

                        {/* Modificado */}
                        <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(f.modifiedAt)}</td>

                        {/* Criado por */}
                        <td style={{ ...s.td, ...s.cellMuted }}>
                          <div style={{ ...s.cellEllipsis, maxWidth: 100 }}>
                            {f.createdBy || '—'}
                          </div>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
        {/* /tablePanel */}

      </div>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    color:      C.text,
    display:    'flex',
    flexDirection: 'column',
    gap:        12,
  },

  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    flexWrap:       'wrap',
    gap:            8,
  },
  pageTitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.2 },
  pageSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  breadcrumb: { fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600, alignSelf: 'flex-end' },

  // Controls bar
  controls: {
    display:      'flex',
    gap:          14,
    flexWrap:     'wrap',
    alignItems:   'flex-end',
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    padding:      '12px 14px',
  },
  ctrlGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  ctrlLabel: {
    fontSize:      10,
    fontWeight:    700,
    color:         C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  select: {
    padding:      '6px 10px',
    border:       `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize:     12,
    color:        C.text,
    background:   C.panel,
    fontFamily:   'inherit',
    cursor:       'pointer',
    minWidth:     220,
  },
  btnGroup: { display: 'flex', gap: 4 },
  toggleBtn: {
    padding:      '5px 12px',
    border:       '1px solid',
    borderRadius: 4,
    fontSize:     11,
    fontWeight:   700,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'background .12s, color .12s',
  },

  // Export bar
  exportBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          12,
    padding:      '8px 14px',
    borderRadius: 6,
    border:       '1px solid',
    fontSize:     13,
    fontWeight:   600,
  },
  dismissBtn: {
    marginLeft: 'auto',
    background: 'none',
    border:     'none',
    cursor:     'pointer',
    color:      C.muted,
    fontSize:   14,
    padding:    '0 4px',
  },

  // Table panel
  tablePanel: {
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    overflow:     'hidden',
  },
  tablePanelHeader: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    padding:      '10px 14px',
    borderBottom: `1px solid ${C.border}`,
    background:   '#f7f9fb',
  },
  panelTitle: {
    fontSize:      12,
    fontWeight:    800,
    color:         C.text,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  countBadge: {
    background:   C.accent,
    color:        '#fff',
    fontSize:     10,
    fontWeight:   700,
    padding:      '2px 7px',
    borderRadius: 10,
  },
  extBadge: {
    display:      'inline-block',
    background:   '#e8f0f8',
    color:        C.accent,
    borderRadius: 3,
    padding:      '1px 6px',
    fontSize:     10,
    fontWeight:   700,
    fontFamily:   'monospace',
  },

  emptyMsg:   { padding: '32px 14px', textAlign: 'center', color: C.muted, fontSize: 13 },
  loadingMsg: { display: 'flex', alignItems: 'center', gap: 8, padding: '24px 14px', color: C.muted, fontSize: 13 },
  errorMsg:   { padding: '16px 14px', color: C.bad, fontSize: 13, fontWeight: 600 },

  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding:       '8px 10px',
    textAlign:     'left',
    fontWeight:    700,
    fontSize:      10,
    color:         C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    background:    '#f7f9fb',
    borderBottom:  `2px solid ${C.border}`,
    whiteSpace:    'nowrap',
  },
  trEven: { background: C.panel },
  trOdd:  { background: '#f9fafb' },
  td: {
    padding:       '7px 10px',
    verticalAlign: 'middle',
    borderBottom:  '1px solid #edf0f4',
  },
  cellMuted:    { color: C.muted, fontSize: 11 },
  nameCell:     { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 },
  fileLink:     { color: C.accent, textDecoration: 'none', fontWeight: 600 },
  cellEllipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 },

  barTrack: { height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden', minWidth: 60 },
  barFill:  { height: '100%', background: C.accent, borderRadius: 2, transition: 'width .3s ease' },

  spinner: {
    display:        'inline-block',
    width:          12,
    height:         12,
    border:         `2px solid ${C.border}`,
    borderTopColor: C.accent,
    borderRadius:   '50%',
    animation:      'tf-spin 0.7s linear infinite',
    flexShrink:     0,
  },

  btn: {
    padding:      '6px 12px',
    borderRadius: 4,
    fontSize:     11,
    fontWeight:   700,
    cursor:       'pointer',
    fontFamily:   'inherit',
    border:       '1px solid transparent',
    transition:   'opacity .15s',
  },
  btnSecondary: { background: C.panel, color: C.accent, borderColor: C.accent },
  mono: { fontFamily: 'monospace', fontSize: 11 },
};
