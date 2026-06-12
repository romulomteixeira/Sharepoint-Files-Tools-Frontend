/**
 * ReportsPage.tsx — Exportações configuráveis do inventário (Sprint 14)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { getInventorySummary, getInventorySites, getInventoryDrives } from '../api/inventory.api';
import { exportInventory, getExportJobStatus, getDownloadUrl } from '../api/reports.api';
import type { ExportJob, SiteRollup, DriveRollup } from '../types';

const EXPORT_POLL_MS  = 2_000;
const TERMINAL_EXPORT = new Set(['completed', 'failed', 'cancelled']);
const MAX_HISTORY     = 10;

const FORMAT_OPTIONS = [
  { value: 'csv',   label: 'CSV — compatível com Excel / LibreOffice' },
  { value: 'jsonl', label: 'JSONL — uma linha JSON por arquivo' },
];

const LIMIT_OPTIONS = [
  { value: '',       label: 'Sem limite (todos os arquivos)' },
  { value: '1000',   label: 'Até 1.000 linhas' },
  { value: '5000',   label: 'Até 5.000 linhas' },
  { value: '10000',  label: 'Até 10.000 linhas' },
  { value: '50000',  label: 'Até 50.000 linhas' },
];

interface HistoryEntry {
  id:          string;
  scanId:      string;
  format:      'csv' | 'jsonl';
  status:      ExportJob['status'];
  createdAt:   string;
  jobId:       string;
  filters:     string;
  downloadUrl?: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtNum(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR');
}

function describeFilters(siteId: string, driveId: string, ext: string, limit: string): string {
  const parts: string[] = [];
  if (siteId)  parts.push(`site: ${siteId.slice(0, 12)}…`);
  if (driveId) parts.push(`drive: ${driveId.slice(0, 12)}…`);
  if (ext)     parts.push(`ext: ${ext}`);
  if (limit)   parts.push(`máx: ${Number(limit).toLocaleString('pt-BR')}`);
  return parts.length ? parts.join(' · ') : 'sem filtros';
}

export default function ReportsPage(): React.ReactElement {
  const [selectedScanId, setSelectedScanId] = useState('');
  const [format,         setFormat]         = useState<'csv' | 'jsonl'>('csv');
  const [filterSite,     setFilterSite]     = useState('');
  const [filterDrive,    setFilterDrive]    = useState('');
  const [filterExt,      setFilterExt]      = useState('');
  const [limit,          setLimit]          = useState('');
  const [sites,          setSites]          = useState<SiteRollup[]>([]);
  const [drives,         setDrives]         = useState<DriveRollup[]>([]);
  const [activeJob,      setActiveJob]      = useState<ExportJob | null>(null);
  const [exportLoading,  setExportLoading]  = useState(false);
  const [exportError,    setExportError]    = useState<string | null>(null);
  const [history,        setHistory]        = useState<HistoryEntry[]>([]);
  const exportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');

  const { data: summary } = useApi(
    () => selectedScanId ? getInventorySummary(selectedScanId) : Promise.resolve(null),
    [selectedScanId],
  );

  useEffect(() => {
    setFilterSite(''); setFilterDrive(''); setFilterExt(''); setSites([]); setDrives([]);
    if (!selectedScanId) return;
    getInventorySites(selectedScanId, { pageSize: 500 }).then(r => setSites(r.items)).catch(() => {});
  }, [selectedScanId]);

  useEffect(() => {
    setFilterDrive(''); setDrives([]);
    if (!selectedScanId || !filterSite) return;
    getInventoryDrives(selectedScanId, { siteId: filterSite, pageSize: 500 }).then(r => setDrives(r.items)).catch(() => {});
  }, [selectedScanId, filterSite]);

  useEffect(() => {
    return () => { if (exportPollRef.current) clearInterval(exportPollRef.current); };
  }, []);

  async function startExport() {
    if (!selectedScanId || exportLoading) return;
    if (exportPollRef.current) { clearInterval(exportPollRef.current); exportPollRef.current = null; }
    setActiveJob(null); setExportError(null); setExportLoading(true);
    try {
      const job = await exportInventory({
        scanId: selectedScanId, format,
        siteId: filterSite || undefined, driveId: filterDrive || undefined,
        extension: filterExt || undefined, limit: limit ? Number(limit) : undefined,
      });
      setActiveJob(job);
      const filterDesc = describeFilters(filterSite, filterDrive, filterExt, limit);
      const entry: HistoryEntry = {
        id: crypto.randomUUID(), scanId: selectedScanId, format,
        status: job.status, createdAt: new Date().toISOString(),
        jobId: job.jobId, filters: filterDesc, downloadUrl: job.downloadUrl,
      };
      if (job.status === 'completed') {
        entry.downloadUrl = job.downloadUrl ?? getDownloadUrl(job.jobId);
        addToHistory({ ...entry, status: 'completed' });
        triggerDownload(job); setExportLoading(false); return;
      }
      addToHistory(entry);
      exportPollRef.current = setInterval(async () => {
        try {
          const updated = await getExportJobStatus(job.jobId);
          const merged: ExportJob = { ...job, status: updated.status, downloadUrl: updated.downloadUrl ?? job.downloadUrl, finishedAt: updated.finishedAt };
          setActiveJob(merged);
          updateHistoryEntry(job.jobId, merged.status, merged.downloadUrl);
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
    a.download = `export_${selectedScanId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.${job.format}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  function addToHistory(entry: HistoryEntry) {
    setHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY));
  }

  function updateHistoryEntry(jobId: string, status: ExportJob['status'], downloadUrl?: string) {
    setHistory(prev => prev.map(e => e.jobId === jobId ? { ...e, status, downloadUrl: downloadUrl ?? e.downloadUrl } : e));
  }

  const hasConfig = !!selectedScanId;
  const isRunning = activeJob && (activeJob.status === 'pending' || activeJob.status === 'running');

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Relatórios &amp; Exportações</h1>
          <p className="page-sub">Gere arquivos CSV ou JSONL do inventário com filtros personalizados</p>
        </div>
        <Link to="/" className="td-link" style={{ fontWeight: 600, fontSize: 'var(--fs-sm)', alignSelf: 'flex-end' }}>← Dashboard</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14, alignItems: 'start' }}>

        {/* ── Painel de configuração */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div className="overline muted">1. Selecione o scan</div>

          {scansLoading ? (
            <p className="small muted">Carregando scans…</p>
          ) : completedScans.length === 0 ? (
            <p className="small muted">Nenhum scan concluído. <Link to="/scans" className="td-link">Iniciar scan →</Link></p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {completedScans.map(sc => (
                <button
                  key={sc.id}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3,
                    padding: '8px 12px', border: '1px solid',
                    borderColor: sc.id === selectedScanId ? 'var(--accent)' : 'var(--border)',
                    borderRadius: 'var(--r-sm)',
                    background: sc.id === selectedScanId ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                  onClick={() => setSelectedScanId(sc.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="mono small">{sc.id.slice(0, 14)}…</span>
                    {sc.id === selectedScanId && <span className="pill pill-info" style={{ fontSize: 9 }}>selecionado</span>}
                  </div>
                  <div className="row small muted" style={{ gap: 10 }}>
                    {sc.totalFiles != null && <span>{fmtNum(sc.totalFiles)} arqs</span>}
                    {sc.totalSites != null && <span>{fmtNum(sc.totalSites)} sites</span>}
                    <span>{fmtDate(sc.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[
                { label: 'Sites',    value: fmtNum(summary.totalSites) },
                { label: 'Drives',   value: fmtNum(summary.totalDrives) },
                { label: 'Arquivos', value: fmtNum(summary.totalFiles) },
              ].map(({ label, value }) => (
                <div key={label} className="kpi" style={{ textAlign: 'center', padding: '6px 8px' }}>
                  <div className="kpi-value" style={{ fontSize: 16 }}>{value}</div>
                  <div className="kpi-label">{label}</div>
                </div>
              ))}
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <div className="overline muted">2. Formato de saída</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', border: '1px solid',
                  borderColor: format === opt.value ? 'var(--accent)' : 'var(--border)',
                  borderRadius: 'var(--r-sm)',
                  background: format === opt.value ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel)',
                  color: format === opt.value ? 'var(--accent)' : 'var(--text)',
                  cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
                onClick={() => setFormat(opt.value as 'csv' | 'jsonl')}
              >
                <span className="mono" style={{ fontWeight: 800, fontSize: 12, background: 'rgba(0,0,0,.06)', padding: '1px 6px', borderRadius: 3 }}>
                  {opt.value.toUpperCase()}
                </span>
                <span className="small muted">{opt.label.split('—')[1]?.trim()}</span>
              </button>
            ))}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <div className="overline muted">3. Filtros (opcional)</div>

          <div className="field">
            <label className="field-label">Site</label>
            <select className="select" value={filterSite} disabled={!hasConfig} style={{ opacity: !hasConfig ? 0.5 : 1 }}
              onChange={e => { setFilterSite(e.target.value); setFilterDrive(''); }}>
              <option value="">Todos os sites</option>
              {sites.map(st => <option key={st.siteId} value={st.siteId}>{st.siteName || st.siteUrl} ({fmtNum(st.totalFiles)})</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Drive</label>
            <select className="select" value={filterDrive} disabled={!filterSite} style={{ opacity: !filterSite ? 0.5 : 1 }}
              onChange={e => setFilterDrive(e.target.value)}>
              <option value="">{filterSite ? 'Todos os drives' : '— selecione um site —'}</option>
              {drives.map(d => <option key={d.driveId} value={d.driveId}>{d.driveName} ({fmtNum(d.totalFiles)})</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Extensão</label>
            <select className="select" value={filterExt} disabled={!hasConfig} style={{ opacity: !hasConfig ? 0.5 : 1 }}
              onChange={e => setFilterExt(e.target.value)}>
              <option value="">Todas as extensões</option>
              {(summary?.topExtensions ?? []).map(e => <option key={e.extension} value={e.extension}>{e.extension || '(sem ext)'} · {fmtNum(e.fileCount)} arqs</option>)}
            </select>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2px 0' }} />
          <div className="overline muted">4. Limite de linhas</div>
          <div className="field">
            <label className="field-label">Máximo de registros</label>
            <select className="select" value={limit} onChange={e => setLimit(e.target.value)}>
              {LIMIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="field-hint">Útil para amostras rápidas ou limitações de ferramentas.</span>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '2px 0' }} />

          {exportError && <div className="alert-bad">{exportError}</div>}
          {activeJob && isRunning && (
            <div className="alert-info row" style={{ gap: 8 }}>
              <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              Gerando exportação {activeJob.format.toUpperCase()}…
            </div>
          )}
          {activeJob?.status === 'completed' && (
            <div className="alert-good">
              ✓ Pronto —{' '}
              <a href={activeJob.downloadUrl ?? getDownloadUrl(activeJob.jobId)} download style={{ color: 'var(--good)', fontWeight: 700 }}>
                baixe agora ↓
              </a>
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', opacity: (!hasConfig || exportLoading) ? 0.5 : 1 }}
            disabled={!hasConfig || exportLoading}
            onClick={startExport}
          >
            {exportLoading ? '⏳ Gerando…' : `↓ Gerar exportação ${format.toUpperCase()}`}
          </button>
        </div>

        {/* ── Painel histórico */}
        <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--panel-2)' }}>
            <span className="overline">Histórico da sessão</span>
            {history.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={() => setHistory([])}>Limpar</button>
            )}
          </div>

          {history.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }} className="muted small">
              Nenhuma exportação gerada nesta sessão.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', maxHeight: 400 }}>
              {history.map(entry => {
                const isDone    = entry.status === 'completed';
                const isFailed  = entry.status === 'failed' || entry.status === 'cancelled';
                const isRunning2 = entry.status === 'pending' || entry.status === 'running';
                const statusColor = isDone ? 'var(--good)' : isFailed ? 'var(--bad)' : 'var(--accent)';
                const statusLabel = isDone ? '✓ Pronto' : isFailed ? '✗ Falhou' : '⏳ Gerando…';
                return (
                  <div key={entry.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <span className={`pill ${entry.format === 'csv' ? 'pill-good' : 'pill-info'}`} style={{ fontFamily: 'monospace', fontSize: 10 }}>
                        {entry.format.toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                      {isDone && (
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, marginLeft: 'auto', padding: '3px 8px' }}
                          onClick={() => window.open(entry.downloadUrl ?? getDownloadUrl(entry.jobId), '_blank')}>
                          ↓ Baixar
                        </button>
                      )}
                    </div>
                    <div className="row small muted" style={{ gap: 10 }}>
                      <span className="mono">{entry.scanId.slice(0, 12)}…</span>
                      <span>{entry.filters}</span>
                    </div>
                    <div className="row small muted" style={{ gap: 10 }}>
                      <span>{fmtDate(entry.createdAt)}</span>
                      {isRunning2 && (
                        <span className="row" style={{ gap: 4, color: 'var(--accent)', alignItems: 'center' }}>
                          <div className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> processando
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ margin: 12, padding: '10px 12px', background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)', borderRadius: 'var(--r-sm)', marginTop: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--warn)' }}>💡 Dicas</div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--warn)', lineHeight: 1.8 }}>
              <li>Arquivos ficam disponíveis por <strong>24 horas</strong> no servidor.</li>
              <li>Para grandes volumes, prefira JSONL — processa linha a linha.</li>
              <li>Use filtros para reduzir o tamanho da exportação.</li>
              <li>Downloads são iniciados automaticamente ao concluir.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
