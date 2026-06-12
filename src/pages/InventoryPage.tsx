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
import { Download } from 'lucide-react';

const PAGE_SIZE = 100;
const EXPORT_POLL_MS = 2_000;
const TERMINAL_EXPORT = new Set(['completed', 'failed', 'cancelled']);

const SORT_OPTIONS = [
  { value: 'size_desc', label: 'Maior tamanho' },
  { value: 'size_asc',  label: 'Menor tamanho' },
  { value: 'name_asc',  label: 'Nome A→Z' },
  { value: 'name_desc', label: 'Nome Z→A' },
  { value: 'date_desc', label: 'Mais recente' },
  { value: 'date_asc',  label: 'Mais antigo' },
];

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

// ── ScanPicker ────────────────────────────────────────────────────────────────

function ScanPicker(): React.ReactElement {
  const navigate = useNavigate();
  const { data: scans, loading, error } = useApi(listScans, []);
  const completed = (scans ?? []).filter(sc => sc.status === 'completed');

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 20px' }}>
      <div className="card" style={{ maxWidth: 560, width: '100%', padding: '28px 32px' }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Inventário de Arquivos</h1>
        <p className="small muted" style={{ marginBottom: 16 }}>Selecione um scan concluído para navegar pelo inventário.</p>

        {loading && <div className="small muted">Carregando scans…</div>}
        {error && <div className="small" style={{ color: 'var(--bad)' }}>Erro: {error}</div>}

        {!loading && completed.length === 0 && !error && (
          <div className="small muted">
            Nenhum scan concluído disponível.{' '}
            <Link to="/scans" style={{ color: 'var(--accent)' }}>Inicie um scan →</Link>
          </div>
        )}

        {completed.length > 0 && (
          <div className="stack" style={{ gap: 6, maxHeight: 400, overflowY: 'auto' }}>
            {completed.map(sc => (
              <button key={sc.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: '10px 14px' }}
                onClick={() => navigate(`/inventory/${sc.id}`)}>
                <div className="row" style={{ marginBottom: 4 }}>
                  <span className="mono small">{sc.id.slice(0, 16)}…</span>
                  <span className="pill pill-good">concluído</span>
                </div>
                <div className="row small muted" style={{ gap: 12 }}>
                  {sc.totalFiles != null && <span>{sc.totalFiles.toLocaleString('pt-BR')} arqs</span>}
                  {sc.totalSites != null && <span>{sc.totalSites.toLocaleString('pt-BR')} sites</span>}
                  <span>{new Date(sc.createdAt).toLocaleString('pt-BR')}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Link to="/" className="small muted">← Voltar ao Dashboard</Link>
        </div>
      </div>
    </div>
  );
}

// ── ExportStatusBar ────────────────────────────────────────────────────────────

function ExportStatusBar({ job, error, onDismiss }: { job: ExportJob | null; error: string | null; onDismiss: () => void; }) {
  const isRunning = job && (job.status === 'pending' || job.status === 'running');
  const isDone = job?.status === 'completed';
  const isFailed = job?.status === 'failed' || job?.status === 'cancelled';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
      borderRadius: 'var(--r-sm)', border: '1px solid',
      borderColor: isDone ? 'var(--good-bd)' : isFailed || error ? 'var(--bad-bd)' : 'var(--accent)',
      background: isDone ? 'var(--good-bg)' : isFailed || error ? 'var(--bad-bg)' : 'color-mix(in srgb, var(--accent) 8%, transparent)',
      fontSize: 'var(--fs-sm)', fontWeight: 600,
    }}>
      {error && <span style={{ color: 'var(--bad)' }}>⚠ {error}</span>}
      {isRunning && <span style={{ color: 'var(--accent)' }}>Gerando arquivo {job.format.toUpperCase()}…</span>}
      {isDone && (
        <span style={{ color: 'var(--good)' }}>
          Exportação {job!.format.toUpperCase()} pronta →{' '}
          <a href={job!.downloadUrl ?? getDownloadUrl(job!.jobId)} download style={{ color: 'var(--good)', fontWeight: 700, textDecoration: 'underline' }}>
            Baixar {job!.format.toUpperCase()} ↓
          </a>
        </span>
      )}
      {isFailed && <span style={{ color: 'var(--bad)' }}>Exportação falhou ou foi cancelada</span>}
      <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: 14, padding: '0 4px' }} onClick={onDismiss} title="Fechar">✕</button>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function InventoryPage(): React.ReactElement {
  const { scanId } = useParams<{ scanId: string }>();

  const [filterSite, setFilterSite] = useState('');
  const [filterDrive, setFilterDrive] = useState('');
  const [filterExt, setFilterExt] = useState('');
  const [filterSort, setFilterSort] = useState('size_desc');

  const [sites, setSites] = useState<SiteRollup[]>([]);
  const [drives, setDrives] = useState<DriveRollup[]>([]);

  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: summary, loading: summaryLoading } = useApi(
    () => (scanId ? getInventorySummary(scanId) : Promise.resolve(null)),
    [scanId],
  );

  useEffect(() => {
    if (!scanId) return;
    getInventorySites(scanId, { pageSize: 500 }).then(r => setSites(r.items)).catch(() => {});
  }, [scanId]);

  useEffect(() => {
    setFilterDrive(''); setDrives([]);
    if (!scanId || !filterSite) return;
    getInventoryDrives(scanId, { siteId: filterSite, pageSize: 500 }).then(r => setDrives(r.items)).catch(() => {});
  }, [scanId, filterSite]);

  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;
    setAllFiles([]); setNextCursor(null); setHasMore(false);
    setFilesLoading(true); setFilesError(null);
    getInventoryFiles(scanId, {
      siteId: filterSite || undefined, driveId: filterDrive || undefined,
      extension: filterExt || undefined, sort: filterSort, pageSize: PAGE_SIZE,
    }).then(resp => {
      if (cancelled) return;
      setAllFiles(resp.items);
      setHasMore(resp.pageInfo?.hasNextPage ?? false);
      setNextCursor(resp.pageInfo?.nextCursor ?? null);
    }).catch(err => {
      if (cancelled) return;
      setFilesError(err instanceof Error ? err.message : 'Erro ao carregar arquivos');
    }).finally(() => { if (!cancelled) setFilesLoading(false); });
    return () => { cancelled = true; };
  }, [scanId, filterSite, filterDrive, filterExt, filterSort]);

  useEffect(() => () => { if (exportPollRef.current) clearInterval(exportPollRef.current); }, []);

  function loadMoreFiles() {
    if (!scanId || filesLoading || !nextCursor) return;
    setFilesLoading(true); setFilesError(null);
    getInventoryFiles(scanId, {
      siteId: filterSite || undefined, driveId: filterDrive || undefined,
      extension: filterExt || undefined, sort: filterSort, cursor: nextCursor, pageSize: PAGE_SIZE,
    }).then(resp => {
      setAllFiles(prev => [...prev, ...resp.items]);
      setHasMore(resp.pageInfo?.hasNextPage ?? false);
      setNextCursor(resp.pageInfo?.nextCursor ?? null);
    }).catch(err => {
      setFilesError(err instanceof Error ? err.message : 'Erro ao carregar mais arquivos');
    }).finally(() => setFilesLoading(false));
  }

  async function startExport(format: 'csv' | 'jsonl') {
    if (!scanId || exportLoading) return;
    if (exportPollRef.current) { clearInterval(exportPollRef.current); exportPollRef.current = null; }
    setExportJob(null); setExportError(null); setExportLoading(true);
    try {
      const job = await exportInventory({ scanId, format, siteId: filterSite || undefined, driveId: filterDrive || undefined, extension: filterExt || undefined });
      setExportJob(job);
      if (job.status === 'completed') { triggerDownload(job); setExportLoading(false); return; }
      exportPollRef.current = setInterval(async () => {
        try {
          const updated = await getExportJobStatus(job.jobId);
          const merged: ExportJob = { ...job, status: updated.status, downloadUrl: updated.downloadUrl ?? job.downloadUrl, finishedAt: updated.finishedAt };
          setExportJob(merged);
          if (TERMINAL_EXPORT.has(merged.status)) {
            clearInterval(exportPollRef.current!); exportPollRef.current = null; setExportLoading(false);
            if (merged.status === 'completed') triggerDownload(merged);
          }
        } catch {
          clearInterval(exportPollRef.current!); exportPollRef.current = null;
          setExportError('Erro ao verificar status da exportação'); setExportLoading(false);
        }
      }, EXPORT_POLL_MS);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao iniciar exportação');
      setExportLoading(false);
    }
  }

  function triggerDownload(job: ExportJob) {
    const url = job.downloadUrl ?? getDownloadUrl(job.jobId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_${scanId}_${new Date().toISOString().slice(0, 10)}.${job.format}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  const topExt = summary?.topExtensions?.slice(0, 12) ?? [];
  const maxExt = topExt[0]?.fileCount ?? 1;
  const siteMap = useMemo(() => Object.fromEntries(sites.map(st => [st.siteId, st.siteName || st.siteUrl || st.siteId])), [sites]);
  const hasActiveFilters = !!(filterSite || filterDrive || filterExt);

  if (!scanId) return <ScanPicker />;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/" className="small muted" style={{ textDecoration: 'none', display: 'block', marginBottom: 2 }}>← Dashboard</Link>
          <h1 className="page-title">Inventário de Arquivos</h1>
          <p className="page-sub">Scan <span className="mono">{scanId}</span></p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-sm" disabled={exportLoading || summaryLoading} onClick={() => startExport('csv')}>
            <Download size={13} /> {exportLoading && exportJob?.format === 'csv' ? 'Gerando…' : 'CSV'}
          </button>
          <button type="button" className="btn btn-sm" disabled={exportLoading || summaryLoading} onClick={() => startExport('jsonl')}>
            <Download size={13} /> {exportLoading && exportJob?.format === 'jsonl' ? 'Gerando…' : 'JSONL'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {summaryLoading ? (
        <div className="kpi-grid">
          {[0,1,2,3].map(i => <div key={i} className="kpi" style={{ height: 58, opacity: 0.4 }} />)}
        </div>
      ) : summary ? (
        <div className="kpi-grid">
          <div className="kpi"><div className="kpi-value">{fmtNum(summary.totalSites)}</div><div className="kpi-label">Sites</div></div>
          <div className="kpi"><div className="kpi-value">{fmtNum(summary.totalDrives)}</div><div className="kpi-label">Drives</div></div>
          <div className="kpi"><div className="kpi-value">{fmtNum(summary.totalFiles)}</div><div className="kpi-label">Arquivos</div></div>
          <div className="kpi"><div className="kpi-value">{fmtBytes(summary.totalBytes)}</div><div className="kpi-label">Volume</div></div>
          {summary.totalVersions != null && (
            <div className="kpi"><div className="kpi-value" style={{ color: 'var(--accent)' }}>{fmtNum(summary.totalVersions)}</div><div className="kpi-label">Versões</div></div>
          )}
        </div>
      ) : null}

      {/* Export status */}
      {(exportJob || exportError) && (
        <ExportStatusBar job={exportJob} error={exportError} onDismiss={() => { setExportJob(null); setExportError(null); }} />
      )}

      {/* Filtros */}
      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }}>
          <div className="field" style={{ flex: '1 1 170px' }}>
            <label className="field-label">Site</label>
            <select className="select" value={filterSite} onChange={e => { setFilterSite(e.target.value); setFilterDrive(''); }}>
              <option value="">Todos os sites</option>
              {sites.map(st => <option key={st.siteId} value={st.siteId}>{st.siteName || st.siteUrl} ({fmtNum(st.totalFiles)})</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 170px' }}>
            <label className="field-label">Drive</label>
            <select className="select" value={filterDrive} onChange={e => setFilterDrive(e.target.value)} disabled={!filterSite}>
              <option value="">{filterSite ? 'Todos os drives' : '— selecione um site —'}</option>
              {drives.map(d => <option key={d.driveId} value={d.driveId}>{d.driveName} ({fmtNum(d.totalFiles)})</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 170px' }}>
            <label className="field-label">Extensão</label>
            <select className="select" value={filterExt} onChange={e => setFilterExt(e.target.value)}>
              <option value="">Todas as extensões</option>
              {(summary?.topExtensions ?? []).map(e => <option key={e.extension} value={e.extension}>{e.extension || '(sem ext)'} · {fmtNum(e.fileCount)} arqs</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 170px' }}>
            <label className="field-label">Ordenar por</label>
            <select className="select" value={filterSort} onChange={e => setFilterSort(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {hasActiveFilters && (
            <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-end' }}
              onClick={() => { setFilterSite(''); setFilterDrive(''); setFilterExt(''); }}>
              ✕ Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'grid', gridTemplateColumns: topExt.length > 0 ? '1fr 260px' : '1fr', gap: 12, alignItems: 'start' }}>

        {/* Tabela */}
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head">
            <span className="card-title">Arquivos</span>
            {allFiles.length > 0 && <span className="pill pill-info">{allFiles.length.toLocaleString('pt-BR')}{hasMore ? '+' : ''}</span>}
            {hasActiveFilters && <span className="pill pill-warn">filtrado</span>}
          </div>

          {filesError && <div style={{ padding: '16px 14px', color: 'var(--bad)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>⚠ {filesError}</div>}
          {filesLoading && allFiles.length === 0 && <div className="small muted" style={{ padding: '24px 14px' }}>Carregando arquivos…</div>}
          {!filesLoading && allFiles.length === 0 && !filesError && (
            <div className="small muted" style={{ padding: '32px 14px', textAlign: 'center' }}>
              {hasActiveFilters ? 'Nenhum arquivo encontrado com os filtros selecionados.' : 'Nenhum arquivo encontrado neste scan.'}
            </div>
          )}

          {allFiles.length > 0 && (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: '36%' }}>Nome</th>
                    <th style={{ width: '20%' }}>Site</th>
                    <th style={{ width: '9%' }}>Ext</th>
                    <th className="td-r" style={{ width: '12%' }}>Tamanho</th>
                    <th style={{ width: '11%' }}>Modificado</th>
                    <th style={{ width: '12%' }}>Criado por</th>
                  </tr>
                </thead>
                <tbody>
                  {allFiles.map(f => (
                    <tr key={f.id}>
                      <td className="td-ellipsis" style={{ maxWidth: 320 }}>
                        {f.webUrl ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link" title={f.name}>{f.name}</a> : <span title={f.name}>{f.name}</span>}
                      </td>
                      <td className="td-mute small td-ellipsis" style={{ maxWidth: 200 }} title={f.siteId}>{siteMap[f.siteId] ?? f.siteId}</td>
                      <td>
                        <span className="pill mono" style={{ cursor: 'pointer', background: f.extension === filterExt ? 'var(--accent)' : undefined, color: f.extension === filterExt ? '#fff' : undefined }}
                          onClick={() => setFilterExt(f.extension === filterExt ? '' : f.extension)}>
                          {f.extension || '—'}
                        </span>
                      </td>
                      <td className="td-r">{fmtBytes(f.totalBytes)}</td>
                      <td className="td-mute small">{fmtDate(f.modifiedAt)}</td>
                      <td className="td-mute small td-ellipsis" style={{ maxWidth: 140 }}>{f.createdBy || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 14px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-primary" disabled={filesLoading} onClick={loadMoreFiles}>
                {filesLoading ? 'Carregando…' : `Carregar mais (${PAGE_SIZE} por vez)`}
              </button>
            </div>
          )}

          {!hasMore && allFiles.length > 0 && (
            <div className="small muted" style={{ padding: '12px 14px', textAlign: 'center', borderTop: '1px solid var(--border)' }}>
              {allFiles.length.toLocaleString('pt-BR')} arquivo{allFiles.length !== 1 ? 's' : ''} {hasActiveFilters ? '(filtrado)' : '(total)'}
            </div>
          )}
        </div>

        {/* Top extensões */}
        {topExt.length > 0 && (
          <div className="card stack" style={{ gap: 4 }}>
            <div className="card-title">Top Extensões</div>
            <div className="small muted" style={{ marginBottom: 4 }}>Clique para filtrar</div>
            <div className="stack" style={{ gap: 2 }}>
              {topExt.map(ext => {
                const isActive = ext.extension === filterExt;
                return (
                  <div key={ext.extension} onClick={() => setFilterExt(isActive ? '' : ext.extension)}
                    style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', borderRadius: 'var(--r-sm)', cursor: 'pointer',
                      background: isActive ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                      border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}` }}>
                    <div className="row">
                      <span className="mono small" style={{ background: isActive ? 'var(--accent)' : 'var(--panel-2)', color: isActive ? '#fff' : 'var(--accent)', borderRadius: 'var(--r-sm)', padding: '1px 6px', fontWeight: 700 }}>
                        {ext.extension || '(sem)'}
                      </span>
                      <span className="small muted">{fmtNum(ext.fileCount)}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round((ext.fileCount / maxExt) * 100)}%`, background: isActive ? 'var(--accent)' : undefined }} />
                    </div>
                    <div className="small muted" style={{ textAlign: 'right' }}>{fmtBytes(ext.totalBytes)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
