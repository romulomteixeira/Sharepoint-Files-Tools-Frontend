/**
 * InventoryPage.tsx — Inventário completo de arquivos (Sprint 13)
 *
 * Funcionalidades:
 *   - Filtros por site, drive e extensão (com carregamento em cascata)
 *   - Ordenação por tamanho, nome e data
 *   - Tabela paginada por cursor keyset ("Carregar mais")
 *   - Exportação assíncrona CSV / JSONL com polling de job e download automático
 *   - Top extensões (chart de barras clicáveis → aplica filtro)
 *   - Design system idêntico ao DashboardPage (tokens CSS compartilhados)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import {
  getInventorySummary,
  getInventorySites,
  getInventoryDrives,
  getInventoryFiles,
} from '../api/inventory.api';
import {
  exportInventory,
  getExportJobStatus,
  getDownloadUrl,
} from '../api/reports.api';
import { listScans } from '../api/scans.api';
import type { FileItem, SiteRollup, DriveRollup, ExportJob } from '../types';

// ─── Design tokens (idênticos ao DashboardPage) ───────────────────────────────

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

const PAGE_SIZE      = 100;
const EXPORT_POLL_MS = 2_000;
const TERMINAL_EXPORT = new Set(['completed', 'failed', 'cancelled']);

const SORT_OPTIONS = [
  { value: 'size_desc', label: 'Maior tamanho' },
  { value: 'size_asc',  label: 'Menor tamanho' },
  { value: 'name_asc',  label: 'Nome A→Z'       },
  { value: 'name_desc', label: 'Nome Z→A'       },
  { value: 'date_desc', label: 'Mais recente'   },
  { value: 'date_asc',  label: 'Mais antigo'    },
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

// ─── ScanPicker — exibido quando não há scanId na URL ────────────────────────

function ScanPicker(): React.ReactElement {
  const navigate = useNavigate();
  const { data: scans, loading, error } = useApi(listScans, []);

  const completed = (scans ?? []).filter(sc => sc.status === 'completed');

  return (
    <div style={s.pickerPage}>
      <div style={s.pickerCard}>
        <div style={s.pageTitle}>Inventário de Arquivos</div>
        <p style={{ color: C.muted, fontSize: 13, margin: '4px 0 16px' }}>
          Selecione um scan concluído para navegar pelo inventário.
        </p>

        {loading && <div style={{ color: C.muted, fontSize: 13 }}>Carregando scans…</div>}
        {error   && <div style={{ color: C.bad,  fontSize: 13 }}>Erro: {error}</div>}

        {!loading && completed.length === 0 && !error && (
          <div style={{ color: C.muted, fontSize: 13 }}>
            Nenhum scan concluído disponível.{' '}
            <Link to="/scans" style={{ color: C.accent }}>Inicie um scan →</Link>
          </div>
        )}

        {completed.length > 0 && (
          <div style={s.pickerList}>
            {completed.map(sc => (
              <button
                key={sc.id}
                style={s.pickerItem}
                onClick={() => navigate(`/inventory/${sc.id}`)}
              >
                <div style={s.pickerItemTop}>
                  <span style={s.mono}>{sc.id.slice(0, 16)}…</span>
                  <span style={{ ...s.filterBadge, background: '#dcfce7', color: '#166534' }}>
                    concluído
                  </span>
                </div>
                <div style={s.pickerItemMeta}>
                  {sc.totalFiles != null && (
                    <span>{sc.totalFiles.toLocaleString('pt-BR')} arqs</span>
                  )}
                  {sc.totalSites != null && (
                    <span>{sc.totalSites.toLocaleString('pt-BR')} sites</span>
                  )}
                  <span>{new Date(sc.createdAt).toLocaleString('pt-BR')}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Link to="/" style={{ color: C.muted, fontSize: 12 }}>← Voltar ao Dashboard</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.kpiCard}>
      <div style={{ ...s.kpiValue, color: accent ? C.accent : C.text }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div style={s.filterGroup}>
      <label style={s.filterLabel}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{ ...s.filterSelect, opacity: disabled ? 0.5 : 1 }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ExportStatusBar({
  job,
  error,
  onDismiss,
}: {
  job: ExportJob | null;
  error: string | null;
  onDismiss: () => void;
}) {
  const isRunning = job && (job.status === 'pending' || job.status === 'running');
  const isDone    = job?.status === 'completed';
  const isFailed  = job?.status === 'failed' || job?.status === 'cancelled';

  const bg      = isDone ? '#f0fff4' : isFailed || error ? '#fff5f5' : '#ebf4ff';
  const bdColor = isDone ? C.good   : isFailed || error ? C.bad     : C.accent;

  return (
    <div style={{ ...s.exportBar, background: bg, borderColor: bdColor }}>
      {error    && <span style={{ color: C.bad }}>⚠ {error}</span>}
      {isRunning && (
        <span style={{ color: C.accent }}>
          ⏳ Gerando arquivo {job.format.toUpperCase()}…
        </span>
      )}
      {isDone && (
        <span style={{ color: C.good }}>
          ✓ Exportação {job!.format.toUpperCase()} pronta →{' '}
          <a
            href={job!.downloadUrl ?? getDownloadUrl(job!.jobId)}
            download
            style={{ color: C.good, fontWeight: 700, textDecoration: 'underline' }}
          >
            Baixar {job!.format.toUpperCase()} ↓
          </a>
        </span>
      )}
      {isFailed && (
        <span style={{ color: C.bad }}>✗ Exportação falhou ou foi cancelada</span>
      )}
      <button style={s.dismissBtn} onClick={onDismiss} title="Fechar">✕</button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function InventoryPage(): React.ReactElement {
  const { scanId } = useParams<{ scanId: string }>();

  // ── Filtros
  const [filterSite,  setFilterSite]  = useState('');
  const [filterDrive, setFilterDrive] = useState('');
  const [filterExt,   setFilterExt]   = useState('');
  const [filterSort,  setFilterSort]  = useState('size_desc');

  // ── Sites / Drives para dropdowns
  const [sites,  setSites]  = useState<SiteRollup[]>([]);
  const [drives, setDrives] = useState<DriveRollup[]>([]);

  // ── Arquivos (paginação manual)
  const [allFiles,    setAllFiles]    = useState<FileItem[]>([]);
  const [nextCursor,  setNextCursor]  = useState<string | null>(null);
  const [hasMore,     setHasMore]     = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError,   setFilesError]   = useState<string | null>(null);

  // ── Exportação
  const [exportJob,     setExportJob]     = useState<ExportJob | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError,   setExportError]   = useState<string | null>(null);
  const exportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Summary (KPIs + topExtensions)
  const { data: summary, loading: summaryLoading } = useApi(
    () => (scanId ? getInventorySummary(scanId) : Promise.resolve(null)),
    [scanId],
  );

  // ── Carrega sites para dropdown (uma única vez por scan)
  useEffect(() => {
    if (!scanId) return;
    getInventorySites(scanId, { pageSize: 500 })
      .then(r => setSites(r.items))
      .catch(() => { /* silencia — dropdown ficará vazio */ });
  }, [scanId]);

  // ── Carrega drives quando siteId muda (cascata)
  useEffect(() => {
    setFilterDrive('');
    setDrives([]);
    if (!scanId || !filterSite) return;
    getInventoryDrives(scanId, { siteId: filterSite, pageSize: 500 })
      .then(r => setDrives(r.items))
      .catch(() => { /* silencia */ });
  }, [scanId, filterSite]);

  // ── Recarrega arquivos quando filtros mudam (reset da lista)
  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;

    setAllFiles([]);
    setNextCursor(null);
    setHasMore(false);
    setFilesLoading(true);
    setFilesError(null);

    getInventoryFiles(scanId, {
      siteId:    filterSite  || undefined,
      driveId:   filterDrive || undefined,
      extension: filterExt   || undefined,
      sort:      filterSort,
      pageSize:  PAGE_SIZE,
    })
      .then(resp => {
        if (cancelled) return;
        setAllFiles(resp.items);
        setHasMore(resp.pageInfo.hasNextPage);
        setNextCursor(resp.pageInfo.nextCursor);
      })
      .catch(err => {
        if (cancelled) return;
        setFilesError(err instanceof Error ? err.message : 'Erro ao carregar arquivos');
      })
      .finally(() => { if (!cancelled) setFilesLoading(false); });

    return () => { cancelled = true; };
  }, [scanId, filterSite, filterDrive, filterExt, filterSort]);

  // ── Cleanup do polling de exportação no unmount
  useEffect(() => {
    return () => {
      if (exportPollRef.current) clearInterval(exportPollRef.current);
    };
  }, []);

  // ── Carregar mais arquivos (append)
  function loadMoreFiles() {
    if (!scanId || filesLoading || !nextCursor) return;
    setFilesLoading(true);
    setFilesError(null);

    getInventoryFiles(scanId, {
      siteId:    filterSite  || undefined,
      driveId:   filterDrive || undefined,
      extension: filterExt   || undefined,
      sort:      filterSort,
      cursor:    nextCursor,
      pageSize:  PAGE_SIZE,
    })
      .then(resp => {
        setAllFiles(prev => [...prev, ...resp.items]);
        setHasMore(resp.pageInfo.hasNextPage);
        setNextCursor(resp.pageInfo.nextCursor);
      })
      .catch(err => {
        setFilesError(err instanceof Error ? err.message : 'Erro ao carregar mais arquivos');
      })
      .finally(() => setFilesLoading(false));
  }

  // ── Exportação
  async function startExport(format: 'csv' | 'jsonl') {
    if (!scanId || exportLoading) return;

    if (exportPollRef.current) {
      clearInterval(exportPollRef.current);
      exportPollRef.current = null;
    }
    setExportJob(null);
    setExportError(null);
    setExportLoading(true);

    try {
      const job = await exportInventory({
        scanId,
        format,
        siteId:    filterSite  || undefined,
        driveId:   filterDrive || undefined,
        extension: filterExt   || undefined,
      });
      setExportJob(job);

      // Export síncrono (arquivo pequeno) — já veio pronto
      if (job.status === 'completed') {
        triggerDownload(job);
        setExportLoading(false);
        return;
      }

      // Export assíncrono — polling até terminar
      // getExportJobStatus retorna ExportJob (pode ter status/downloadUrl atualizados)
      exportPollRef.current = setInterval(async () => {
        try {
          const updated = await getExportJobStatus(job.jobId);
          // Mescla: preserva format do job original, atualiza status/downloadUrl
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
            if (merged.status === 'completed') triggerDownload(merged);
          }
        } catch {
          clearInterval(exportPollRef.current!);
          exportPollRef.current = null;
          setExportError('Erro ao verificar status da exportação');
          setExportLoading(false);
        }
      }, EXPORT_POLL_MS);

    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao iniciar exportação');
      setExportLoading(false);
    }
  }

  function triggerDownload(job: ExportJob) {
    const url  = job.downloadUrl ?? getDownloadUrl(job.jobId);
    const date = new Date().toISOString().slice(0, 10);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `inventory_${scanId}_${date}.${job.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Derivados
  const topExt = summary?.topExtensions?.slice(0, 12) ?? [];
  const maxExt = topExt[0]?.fileCount ?? 1;

  const siteMap = useMemo(
    () => Object.fromEntries(
      sites.map(st => [st.siteId, st.siteName || st.siteUrl || st.siteId]),
    ),
    [sites],
  );

  const hasActiveFilters = !!(filterSite || filterDrive || filterExt);

  // ── Guard: sem scanId → mostra seletor de scans concluídos
  if (!scanId) {
    return <ScanPicker />;
  }

  return (
    <>
      {/* Keyframes injetados inline — necessário para spinner e skeleton */}
      <style>{`
        @keyframes inv-spin  { to { transform: rotate(360deg); } }
        @keyframes inv-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
      `}</style>

      <div style={s.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
            <div style={s.pageTitle}>Inventário de Arquivos</div>
            <div style={s.scanId}>
              Scan <span style={s.mono}>{scanId}</span>
            </div>
          </div>

          <div style={s.headerRight}>
            <button
              style={{ ...s.btn, ...s.btnSecondary, opacity: exportLoading ? 0.6 : 1 }}
              disabled={exportLoading || summaryLoading}
              onClick={() => startExport('csv')}
              title="Exportar inventário filtrado como CSV"
            >
              {exportLoading && exportJob?.format === 'csv' ? '⏳ Gerando…' : '↓ Exportar CSV'}
            </button>
            <button
              style={{ ...s.btn, ...s.btnSecondary, opacity: exportLoading ? 0.6 : 1 }}
              disabled={exportLoading || summaryLoading}
              onClick={() => startExport('jsonl')}
              title="Exportar inventário filtrado como JSONL"
            >
              {exportLoading && exportJob?.format === 'jsonl' ? '⏳ Gerando…' : '↓ Exportar JSONL'}
            </button>
          </div>
        </div>

        {/* ── KPI strip ──────────────────────────────────────────────────── */}
        {summaryLoading ? (
          <div style={s.kpiStrip}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                style={{
                  ...s.kpiCard,
                  height: 58,
                  background: '#e2e8f0',
                  animation: 'inv-pulse 1.5s ease infinite',
                }}
              />
            ))}
          </div>
        ) : summary ? (
          <div style={s.kpiStrip}>
            <KpiCard label="Sites"    value={fmtNum(summary.totalSites)} />
            <KpiCard label="Drives"   value={fmtNum(summary.totalDrives)} />
            <KpiCard label="Arquivos" value={fmtNum(summary.totalFiles)} />
            <KpiCard label="Volume"   value={fmtBytes(summary.totalBytes)} />
            {summary.totalVersions != null && (
              <KpiCard label="Versões" value={fmtNum(summary.totalVersions)} accent />
            )}
          </div>
        ) : null}

        {/* ── Barra de status de exportação ──────────────────────────────── */}
        {(exportJob || exportError) && (
          <ExportStatusBar
            job={exportJob}
            error={exportError}
            onDismiss={() => { setExportJob(null); setExportError(null); }}
          />
        )}

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <div style={s.filterBar}>
          <FilterSelect
            label="Site"
            value={filterSite}
            onChange={v => { setFilterSite(v); setFilterDrive(''); }}
            options={[
              { value: '', label: 'Todos os sites' },
              ...sites.map(st => ({
                value: st.siteId,
                label: `${st.siteName || st.siteUrl} (${fmtNum(st.totalFiles)})`,
              })),
            ]}
          />
          <FilterSelect
            label="Drive"
            value={filterDrive}
            onChange={setFilterDrive}
            disabled={!filterSite}
            options={[
              { value: '', label: filterSite ? 'Todos os drives' : '— selecione um site —' },
              ...drives.map(d => ({
                value: d.driveId,
                label: `${d.driveName} (${fmtNum(d.totalFiles)})`,
              })),
            ]}
          />
          <FilterSelect
            label="Extensão"
            value={filterExt}
            onChange={setFilterExt}
            options={[
              { value: '', label: 'Todas as extensões' },
              ...(summary?.topExtensions ?? []).map(e => ({
                value: e.extension,
                label: `${e.extension || '(sem ext)'}  ·  ${fmtNum(e.fileCount)} arqs`,
              })),
            ]}
          />
          <FilterSelect
            label="Ordenar por"
            value={filterSort}
            onChange={setFilterSort}
            options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />

          {hasActiveFilters && (
            <button
              style={{ ...s.btn, ...s.btnGhost, alignSelf: 'flex-end' }}
              onClick={() => { setFilterSite(''); setFilterDrive(''); setFilterExt(''); }}
            >
              ✕ Limpar filtros
            </button>
          )}
        </div>

        {/* ── Body: tabela + top extensões ────────────────────────────────── */}
        <div style={{
          ...s.body,
          gridTemplateColumns: topExt.length > 0 ? '1fr 260px' : '1fr',
        }}>

          {/* ── Painel da tabela ────────────────────────────────────────── */}
          <div style={s.tablePanel}>

            {/* Header do painel */}
            <div style={s.tablePanelHeader}>
              <span style={s.panelTitle}>Arquivos</span>
              {allFiles.length > 0 && (
                <span style={s.countBadge}>
                  {allFiles.length.toLocaleString('pt-BR')}{hasMore ? '+' : ''}
                </span>
              )}
              {hasActiveFilters && (
                <span style={s.filterBadge}>filtrado</span>
              )}
            </div>

            {/* Erro */}
            {filesError && (
              <div style={s.errorMsg}>⚠ {filesError}</div>
            )}

            {/* Loading inicial */}
            {filesLoading && allFiles.length === 0 && (
              <div style={s.loadingMsg}>
                <span style={{
                  display: 'inline-block',
                  width: 14, height: 14,
                  border: `2px solid ${C.border}`,
                  borderTopColor: C.accent,
                  borderRadius: '50%',
                  animation: 'inv-spin 0.7s linear infinite',
                  flexShrink: 0,
                }} />
                Carregando arquivos…
              </div>
            )}

            {/* Vazio */}
            {!filesLoading && allFiles.length === 0 && !filesError && (
              <div style={s.emptyMsg}>
                {hasActiveFilters
                  ? 'Nenhum arquivo encontrado com os filtros selecionados.'
                  : 'Nenhum arquivo encontrado neste scan.'}
              </div>
            )}

            {/* Tabela */}
            {allFiles.length > 0 && (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{ ...s.th, width: '36%' }}>Nome</th>
                      <th style={{ ...s.th, width: '20%' }}>Site</th>
                      <th style={{ ...s.th, width: '9%'  }}>Ext</th>
                      <th style={{ ...s.th, width: '12%', textAlign: 'right' as const }}>Tamanho</th>
                      <th style={{ ...s.th, width: '11%' }}>Modificado</th>
                      <th style={{ ...s.th, width: '12%' }}>Criado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allFiles.map((f, idx) => (
                      <tr key={f.id} style={idx % 2 === 0 ? s.trEven : s.trOdd}>

                        {/* Nome */}
                        <td style={s.td}>
                          <div style={s.fileName}>
                            {f.webUrl ? (
                              <a
                                href={f.webUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={s.fileLink}
                                title={f.name}
                              >
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
                              cursor: 'pointer',
                              background: f.extension === filterExt ? C.accent : '#e8f0f8',
                              color:      f.extension === filterExt ? '#fff'    : C.accent,
                            }}
                            onClick={() => setFilterExt(
                              f.extension === filterExt ? '' : f.extension,
                            )}
                            title="Clique para filtrar por extensão"
                          >
                            {f.extension || '—'}
                          </span>
                        </td>

                        {/* Tamanho */}
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>
                          {fmtBytes(f.totalBytes)}
                        </td>

                        {/* Modificado */}
                        <td style={{ ...s.td, ...s.cellMuted }}>
                          {fmtDate(f.modifiedAt)}
                        </td>

                        {/* Criado por */}
                        <td style={{ ...s.td, ...s.cellMuted }}>
                          <div style={{ ...s.cellEllipsis, maxWidth: 140 }}>
                            {f.createdBy || '—'}
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Carregar mais */}
            {hasMore && (
              <div style={s.loadMoreRow}>
                <button
                  style={{ ...s.btn, ...s.btnPrimary }}
                  disabled={filesLoading}
                  onClick={loadMoreFiles}
                >
                  {filesLoading
                    ? '⏳ Carregando…'
                    : `Carregar mais (${PAGE_SIZE} por vez)`}
                </button>
              </div>
            )}

            {/* Totalizador */}
            {!hasMore && allFiles.length > 0 && (
              <div style={s.endMsg}>
                {allFiles.length.toLocaleString('pt-BR')} arquivo{allFiles.length !== 1 ? 's' : ''} carregado{allFiles.length !== 1 ? 's' : ''}
                {hasActiveFilters ? ' (filtrado)' : ' (total)'}
              </div>
            )}

          </div>
          {/* /tablePanel */}

          {/* ── Top extensões ───────────────────────────────────────────── */}
          {topExt.length > 0 && (
            <div style={s.extPanel}>
              <div style={s.panelTitle}>Top Extensões</div>
              <div style={s.extSubtitle}>Clique para filtrar</div>

              <div style={s.extList}>
                {topExt.map(ext => {
                  const isActive = ext.extension === filterExt;
                  return (
                    <div
                      key={ext.extension}
                      style={{
                        ...s.extRow,
                        background: isActive ? '#ebf4ff' : 'transparent',
                        borderRadius: 4,
                        padding: '4px 6px',
                        cursor: 'pointer',
                        border: isActive ? `1px solid ${C.accent}` : '1px solid transparent',
                      }}
                      onClick={() => setFilterExt(isActive ? '' : ext.extension)}
                      title={`Filtrar por ${ext.extension || '(sem ext)'}`}
                    >
                      <div style={s.extLabelRow}>
                        <span style={{
                          ...s.extTag,
                          background: isActive ? C.accent : '#e8f0f8',
                          color: isActive ? '#fff' : C.accent,
                        }}>
                          {ext.extension || '(sem)'}
                        </span>
                        <span style={s.extCount}>
                          {fmtNum(ext.fileCount)}
                        </span>
                      </div>
                      <div style={s.barTrack}>
                        <div
                          style={{
                            ...s.barFill,
                            width: `${Math.round((ext.fileCount / maxExt) * 100)}%`,
                            background: isActive ? C.accent : '#a0c4e8',
                          }}
                        />
                      </div>
                      <div style={s.extBytes}>{fmtBytes(ext.totalBytes)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
        {/* /body */}

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
    minHeight:  '100%',
  },

  // ── Header
  header: {
    display:        'flex',
    alignItems:     'flex-end',
    justifyContent: 'space-between',
    gap:            16,
    flexWrap:       'wrap',
  },
  headerLeft:  { display: 'flex', flexDirection: 'column', gap: 2 },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center' },

  breadcrumb: {
    fontSize:       12,
    color:          C.muted,
    textDecoration: 'none',
    fontWeight:     600,
  },
  pageTitle: {
    fontSize:   22,
    fontWeight: 800,
    color:      C.text,
    lineHeight: 1.2,
  },
  scanId: { fontSize: 11, color: C.muted },
  mono:   { fontFamily: 'monospace', letterSpacing: '.03em' },

  // ── KPIs
  kpiStrip: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap:                 10,
  },
  kpiCard: {
    background:    C.panel,
    border:        `1px solid ${C.border}`,
    borderRadius:  6,
    padding:       '12px 16px',
    display:       'flex',
    flexDirection: 'column',
    gap:           2,
  },
  kpiValue: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 },
  kpiLabel: {
    fontSize:        11,
    color:           C.muted,
    fontWeight:      600,
    textTransform:   'uppercase',
    letterSpacing:   '.05em',
  },

  // ── Export status bar
  exportBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          12,
    padding:      '9px 14px',
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
    lineHeight: 1,
  },

  // ── Filtros
  filterBar: {
    display:      'flex',
    gap:          10,
    flexWrap:     'wrap',
    alignItems:   'flex-end',
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    padding:      '12px 14px',
  },
  filterGroup:  { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 170 },
  filterLabel:  {
    fontSize:      10,
    fontWeight:    700,
    color:         C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  filterSelect: {
    padding:    '6px 10px',
    border:     `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize:   13,
    color:      C.text,
    background: C.panel,
    fontFamily: 'inherit',
    cursor:     'pointer',
  },

  // ── Body grid
  body: {
    display:     'grid',
    gap:         12,
    alignItems:  'start',
  },

  // ── Table panel
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
  filterBadge: {
    background:   '#fef3c7',
    color:        '#92400e',
    fontSize:     9,
    fontWeight:   700,
    padding:      '2px 6px',
    borderRadius: 10,
    textTransform: 'uppercase',
    letterSpacing: '.05em',
  },

  tableWrap: { overflowX: 'auto' },
  table: {
    width:           '100%',
    borderCollapse:  'collapse',
    fontSize:        12,
  },
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
  cellMuted: { color: C.muted, fontSize: 11 },
  fileName:  {
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
    maxWidth:     320,
  },
  fileLink: {
    color:          C.accent,
    textDecoration: 'none',
    fontWeight:     600,
  },
  cellEllipsis: {
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap',
    maxWidth:     200,
  },
  extBadge: {
    display:      'inline-block',
    borderRadius: 3,
    padding:      '1px 5px',
    fontSize:     10,
    fontWeight:   700,
    fontFamily:   'monospace',
    transition:   'background .15s, color .15s',
  },

  loadingMsg: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
    padding:    '24px 14px',
    color:      C.muted,
    fontSize:   13,
  },
  emptyMsg: {
    padding:   '32px 14px',
    textAlign: 'center',
    color:     C.muted,
    fontSize:  13,
  },
  errorMsg: {
    padding:    '16px 14px',
    color:      C.bad,
    fontSize:   13,
    fontWeight: 600,
  },
  loadMoreRow: {
    display:        'flex',
    justifyContent: 'center',
    padding:        '16px 14px',
    borderTop:      `1px solid ${C.border}`,
  },
  endMsg: {
    padding:   '12px 14px',
    textAlign: 'center',
    color:     C.muted,
    fontSize:  11,
    borderTop: `1px solid ${C.border}`,
  },

  // ── Extensões panel
  extPanel: {
    background:    C.panel,
    border:        `1px solid ${C.border}`,
    borderRadius:  6,
    padding:       '14px',
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
  },
  extSubtitle: {
    fontSize:  10,
    color:     C.muted,
    marginBottom: 4,
  },
  extList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           2,
  },
  extRow: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
    transition:    'background .1s',
  },
  extLabelRow: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  extTag: {
    display:      'inline-block',
    borderRadius: 3,
    padding:      '1px 6px',
    fontSize:     11,
    fontWeight:   700,
    fontFamily:   'monospace',
    transition:   'background .15s, color .15s',
  },
  extCount: { fontSize: 10, color: C.muted },
  barTrack: {
    height:       5,
    background:   '#e2e8f0',
    borderRadius: 3,
    overflow:     'hidden',
  },
  barFill: {
    height:       '100%',
    borderRadius: 3,
    transition:   'width .3s ease, background .15s',
  },
  extBytes: {
    fontSize:  10,
    color:     C.muted,
    textAlign: 'right',
  },

  // ── ScanPicker
  pickerPage: {
    display:        'flex',
    justifyContent: 'center',
    padding:        '40px 20px',
    fontFamily:     "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  pickerCard: {
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 8,
    padding:      '28px 32px',
    maxWidth:     560,
    width:        '100%',
  },
  pickerList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           6,
    maxHeight:     400,
    overflowY:     'auto',
  },
  pickerItem: {
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
    padding:       '10px 14px',
    background:    '#f7f9fb',
    border:        `1px solid ${C.border}`,
    borderRadius:  5,
    cursor:        'pointer',
    textAlign:     'left',
    fontFamily:    'inherit',
    transition:    'background .12s',
  },
  pickerItemTop: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    gap:            8,
  },
  pickerItemMeta: {
    display:  'flex',
    gap:      12,
    fontSize: 11,
    color:    C.muted,
  },

  // ── Buttons
  btn: {
    padding:      '7px 14px',
    borderRadius: 4,
    fontSize:     12,
    fontWeight:   700,
    cursor:       'pointer',
    fontFamily:   'inherit',
    border:       '1px solid transparent',
    transition:   'opacity .15s',
    whiteSpace:   'nowrap',
  },
  btnPrimary: {
    background:  C.accent,
    color:       '#fff',
    borderColor: C.accent,
  },
  btnSecondary: {
    background:  C.panel,
    color:       C.accent,
    borderColor: C.accent,
  },
  btnGhost: {
    background:  'transparent',
    color:       C.muted,
    borderColor: C.border,
    fontSize:    11,
  },
};
