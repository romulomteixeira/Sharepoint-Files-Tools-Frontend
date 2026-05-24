/**
 * ReportsPage.tsx — Exportações configuráveis do inventário (Sprint 14)
 *
 * Funcionalidades:
 *   - Seletor de scan concluído
 *   - Configuração: formato CSV/JSONL, filtros site/drive/extensão, limite de linhas
 *   - Exportação assíncrona com polling de job e download automático
 *   - Histórico de exports da sessão corrente (até 10 entradas)
 *   - Design system idêntico ao Dashboard/Inventário
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { getInventorySummary, getInventorySites, getInventoryDrives } from '../api/inventory.api';
import { exportInventory, getExportJobStatus, getDownloadUrl } from '../api/reports.api';
import type { ExportJob, SiteRollup, DriveRollup } from '../types';

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
const MAX_HISTORY     = 10;

const FORMAT_OPTIONS = [
  { value: 'csv',  label: 'CSV  — compatível com Excel / LibreOffice' },
  { value: 'jsonl', label: 'JSONL — uma linha JSON por arquivo' },
];

const LIMIT_OPTIONS = [
  { value: '',       label: 'Sem limite (todos os arquivos)' },
  { value: '1000',   label: 'Até 1.000 linhas' },
  { value: '5000',   label: 'Até 5.000 linhas' },
  { value: '10000',  label: 'Até 10.000 linhas' },
  { value: '50000',  label: 'Até 50.000 linhas' },
];

// ─── Tipos locais ─────────────────────────────────────────────────────────────

interface HistoryEntry {
  id:        string;
  scanId:    string;
  format:    'csv' | 'jsonl';
  status:    ExportJob['status'];
  createdAt: string;
  jobId:     string;
  filters:   string;
  downloadUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={s.sectionTitle}>{children}</div>;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div style={s.field}>
      <label style={s.fieldLabel}>{label}</label>
      {children}
      {hint && <span style={s.fieldHint}>{hint}</span>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ReportsPage(): React.ReactElement {
  // ── Scan selecionado
  const [selectedScanId, setSelectedScanId] = useState('');

  // ── Configurações
  const [format,      setFormat]      = useState<'csv' | 'jsonl'>('csv');
  const [filterSite,  setFilterSite]  = useState('');
  const [filterDrive, setFilterDrive] = useState('');
  const [filterExt,   setFilterExt]   = useState('');
  const [limit,       setLimit]       = useState('');

  // ── Dropdowns dinâmicos
  const [sites,  setSites]  = useState<SiteRollup[]>([]);
  const [drives, setDrives] = useState<DriveRollup[]>([]);

  // ── Job em andamento
  const [activeJob,     setActiveJob]     = useState<ExportJob | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError,   setExportError]   = useState<string | null>(null);
  const exportPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Histórico da sessão
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // ── Scans
  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');

  // ── Summary do scan selecionado (para extensões no dropdown)
  const { data: summary } = useApi(
    () => selectedScanId ? getInventorySummary(selectedScanId) : Promise.resolve(null),
    [selectedScanId],
  );

  // ── Carrega sites ao selecionar scan
  useEffect(() => {
    setFilterSite('');
    setFilterDrive('');
    setFilterExt('');
    setSites([]);
    setDrives([]);
    if (!selectedScanId) return;
    getInventorySites(selectedScanId, { pageSize: 500 })
      .then(r => setSites(r.items))
      .catch(() => {});
  }, [selectedScanId]);

  // ── Carrega drives ao mudar site
  useEffect(() => {
    setFilterDrive('');
    setDrives([]);
    if (!selectedScanId || !filterSite) return;
    getInventoryDrives(selectedScanId, { siteId: filterSite, pageSize: 500 })
      .then(r => setDrives(r.items))
      .catch(() => {});
  }, [selectedScanId, filterSite]);

  // ── Cleanup polling
  useEffect(() => {
    return () => { if (exportPollRef.current) clearInterval(exportPollRef.current); };
  }, []);

  // ── Iniciar exportação
  async function startExport() {
    if (!selectedScanId || exportLoading) return;

    if (exportPollRef.current) { clearInterval(exportPollRef.current); exportPollRef.current = null; }
    setActiveJob(null);
    setExportError(null);
    setExportLoading(true);

    try {
      const job = await exportInventory({
        scanId:    selectedScanId,
        format,
        siteId:    filterSite  || undefined,
        driveId:   filterDrive || undefined,
        extension: filterExt   || undefined,
        limit:     limit ? Number(limit) : undefined,
      });
      setActiveJob(job);

      const filterDesc = describeFilters(filterSite, filterDrive, filterExt, limit);
      const entry: HistoryEntry = {
        id:        crypto.randomUUID(),
        scanId:    selectedScanId,
        format,
        status:    job.status,
        createdAt: new Date().toISOString(),
        jobId:     job.jobId,
        filters:   filterDesc,
        downloadUrl: job.downloadUrl,
      };

      if (job.status === 'completed') {
        entry.downloadUrl = job.downloadUrl ?? getDownloadUrl(job.jobId);
        addToHistory({ ...entry, status: 'completed' });
        triggerDownload(job);
        setExportLoading(false);
        return;
      }

      addToHistory(entry);

      exportPollRef.current = setInterval(async () => {
        try {
          const updated = await getExportJobStatus(job.jobId);
          const merged: ExportJob = {
            ...job,
            status:      updated.status,
            downloadUrl: updated.downloadUrl ?? job.downloadUrl,
            finishedAt:  updated.finishedAt,
          };
          setActiveJob(merged);
          updateHistoryEntry(job.jobId, merged.status, merged.downloadUrl);

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
    const url = job.downloadUrl ?? getDownloadUrl(job.jobId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_${selectedScanId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.${job.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function addToHistory(entry: HistoryEntry) {
    setHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY));
  }

  function updateHistoryEntry(jobId: string, status: ExportJob['status'], downloadUrl?: string) {
    setHistory(prev => prev.map(e =>
      e.jobId === jobId ? { ...e, status, downloadUrl: downloadUrl ?? e.downloadUrl } : e,
    ));
  }

  // ── Derivados
  const selectedScan = completedScans.find(sc => sc.id === selectedScanId);
  const hasConfig    = !!selectedScanId;
  const isRunning    = activeJob && (activeJob.status === 'pending' || activeJob.status === 'running');

  return (
    <>
      <style>{`@keyframes rp-spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={s.header}>
          <div>
            <div style={s.pageTitle}>Relatórios &amp; Exportações</div>
            <div style={s.pageSub}>Gere arquivos CSV ou JSONL do inventário com filtros personalizados</div>
          </div>
          <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
        </div>

        <div style={s.layout}>

          {/* ── Painel de configuração ─────────────────────────────────── */}
          <div style={s.configPanel}>

            <SectionTitle>1. Selecione o scan</SectionTitle>
            {scansLoading ? (
              <div style={s.loadingText}>Carregando scans…</div>
            ) : completedScans.length === 0 ? (
              <div style={s.emptyText}>
                Nenhum scan concluído.{' '}
                <Link to="/scans" style={{ color: C.accent }}>Iniciar scan →</Link>
              </div>
            ) : (
              <div style={s.scanList}>
                {completedScans.map(sc => (
                  <button
                    key={sc.id}
                    style={{
                      ...s.scanItem,
                      borderColor: sc.id === selectedScanId ? C.accent : C.border,
                      background:  sc.id === selectedScanId ? '#ebf4ff' : C.panel,
                    }}
                    onClick={() => setSelectedScanId(sc.id)}
                  >
                    <div style={s.scanItemTop}>
                      <span style={s.mono}>{sc.id.slice(0, 14)}…</span>
                      {sc.id === selectedScanId && (
                        <span style={s.selectedBadge}>selecionado</span>
                      )}
                    </div>
                    <div style={s.scanItemMeta}>
                      {sc.totalFiles != null && <span>{fmtNum(sc.totalFiles)} arqs</span>}
                      {sc.totalSites != null && <span>{fmtNum(sc.totalSites)} sites</span>}
                      <span>{fmtDate(sc.createdAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* ── Sumário do scan selecionado */}
            {summary && selectedScan && (
              <div style={s.scanSummary}>
                <ScanStat label="Sites"    value={fmtNum(summary.totalSites)} />
                <ScanStat label="Drives"   value={fmtNum(summary.totalDrives)} />
                <ScanStat label="Arquivos" value={fmtNum(summary.totalFiles)} />
              </div>
            )}

            <div style={s.divider} />

            <SectionTitle>2. Formato de saída</SectionTitle>
            <div style={s.formatRow}>
              {FORMAT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  style={{
                    ...s.formatBtn,
                    borderColor: format === opt.value ? C.accent : C.border,
                    background:  format === opt.value ? '#ebf4ff' : C.panel,
                    color:       format === opt.value ? C.accent  : C.text,
                  }}
                  onClick={() => setFormat(opt.value as 'csv' | 'jsonl')}
                >
                  <span style={s.formatBadge}>{opt.value.toUpperCase()}</span>
                  <span style={s.formatDesc}>{opt.label.split('—')[1]?.trim()}</span>
                </button>
              ))}
            </div>

            <div style={s.divider} />

            <SectionTitle>3. Filtros (opcional)</SectionTitle>

            <Field label="Site">
              <select
                value={filterSite}
                onChange={e => { setFilterSite(e.target.value); setFilterDrive(''); }}
                disabled={!hasConfig}
                style={{ ...s.select, opacity: !hasConfig ? 0.5 : 1 }}
              >
                <option value="">Todos os sites</option>
                {sites.map(st => (
                  <option key={st.siteId} value={st.siteId}>
                    {st.siteName || st.siteUrl} ({fmtNum(st.totalFiles)})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Drive">
              <select
                value={filterDrive}
                onChange={e => setFilterDrive(e.target.value)}
                disabled={!filterSite}
                style={{ ...s.select, opacity: !filterSite ? 0.5 : 1 }}
              >
                <option value="">{filterSite ? 'Todos os drives' : '— selecione um site —'}</option>
                {drives.map(d => (
                  <option key={d.driveId} value={d.driveId}>
                    {d.driveName} ({fmtNum(d.totalFiles)})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Extensão">
              <select
                value={filterExt}
                onChange={e => setFilterExt(e.target.value)}
                disabled={!hasConfig}
                style={{ ...s.select, opacity: !hasConfig ? 0.5 : 1 }}
              >
                <option value="">Todas as extensões</option>
                {(summary?.topExtensions ?? []).map(e => (
                  <option key={e.extension} value={e.extension}>
                    {e.extension || '(sem ext)'}  ·  {fmtNum(e.fileCount)} arqs
                  </option>
                ))}
              </select>
            </Field>

            <div style={s.divider} />

            <SectionTitle>4. Limite de linhas</SectionTitle>
            <Field label="Máximo de registros" hint="Útil para amostras rápidas ou limitações de ferramentas.">
              <select
                value={limit}
                onChange={e => setLimit(e.target.value)}
                style={s.select}
              >
                {LIMIT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <div style={s.divider} />

            {/* ── Botão gerar */}
            {exportError && <div style={s.errorBox}>⚠ {exportError}</div>}

            {activeJob && isRunning && (
              <div style={s.progressBox}>
                <span style={s.spinner} />
                Gerando exportação {activeJob.format.toUpperCase()}…
              </div>
            )}

            {activeJob?.status === 'completed' && (
              <div style={s.successBox}>
                ✓ Pronto — verifique o histórico ou{' '}
                <a
                  href={activeJob.downloadUrl ?? getDownloadUrl(activeJob.jobId)}
                  download
                  style={{ color: C.good, fontWeight: 700 }}
                >
                  baixe agora ↓
                </a>
              </div>
            )}

            <button
              style={{
                ...s.btn, ...s.btnPrimary,
                opacity: (!hasConfig || exportLoading) ? 0.5 : 1,
                width: '100%',
                marginTop: 4,
              }}
              disabled={!hasConfig || exportLoading}
              onClick={startExport}
            >
              {exportLoading
                ? '⏳ Gerando…'
                : `↓ Gerar exportação ${format.toUpperCase()}`}
            </button>

          </div>
          {/* /configPanel */}

          {/* ── Painel direito: histórico ──────────────────────────────── */}
          <div style={s.historyPanel}>
            <div style={s.historyHeader}>
              <span style={s.panelTitle}>Histórico da sessão</span>
              {history.length > 0 && (
                <button
                  style={{ ...s.btn, ...s.btnGhost, fontSize: 10 }}
                  onClick={() => setHistory([])}
                >
                  Limpar
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div style={s.emptyHistory}>
                Nenhuma exportação gerada nesta sessão.
              </div>
            ) : (
              <div style={s.historyList}>
                {history.map(entry => (
                  <HistoryCard
                    key={entry.id}
                    entry={entry}
                    onDownload={() => {
                      const url = entry.downloadUrl ?? getDownloadUrl(entry.jobId);
                      window.open(url, '_blank');
                    }}
                  />
                ))}
              </div>
            )}

            {/* ── Dica de uso */}
            <div style={s.tipBox}>
              <div style={s.tipTitle}>💡 Dicas</div>
              <ul style={s.tipList}>
                <li>Arquivos ficam disponíveis por <strong>24 horas</strong> no servidor.</li>
                <li>Para grandes volumes, prefira JSONL — processa linha a linha.</li>
                <li>Use filtros para reduzir o tamanho da exportação.</li>
                <li>Downloads são iniciados automaticamente ao concluir.</li>
              </ul>
            </div>

          </div>
          {/* /historyPanel */}

        </div>
      </div>
    </>
  );
}

// ─── HistoryCard ──────────────────────────────────────────────────────────────

function HistoryCard({ entry, onDownload }: { entry: HistoryEntry; onDownload: () => void }) {
  const isRunning  = entry.status === 'pending' || entry.status === 'running';
  const isDone     = entry.status === 'completed';
  const isFailed   = entry.status === 'failed' || entry.status === 'cancelled';

  const statusColor = isDone ? C.good : isFailed ? C.bad : C.accent;
  const statusLabel = isDone ? '✓ Pronto' : isFailed ? '✗ Falhou' : '⏳ Gerando…';

  return (
    <div style={s.historyCard}>
      <div style={s.historyCardTop}>
        <span style={{ ...s.formatTag, background: entry.format === 'csv' ? '#d1fae5' : '#dbeafe', color: entry.format === 'csv' ? '#065f46' : '#1e40af' }}>
          {entry.format.toUpperCase()}
        </span>
        <span style={{ ...s.statusTag, color: statusColor }}>{statusLabel}</span>
        {isDone && (
          <button style={{ ...s.btn, ...s.btnGhost, fontSize: 10, marginLeft: 'auto', padding: '3px 8px' }} onClick={onDownload}>
            ↓ Baixar
          </button>
        )}
      </div>
      <div style={s.historyCardMeta}>
        <span style={s.mono}>{entry.scanId.slice(0, 12)}…</span>
        <span>{entry.filters}</span>
      </div>
      <div style={{ ...s.historyCardMeta, marginTop: 1 }}>
        <span>{fmtDate(entry.createdAt)}</span>
        {isRunning && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.accent }}>
            <span style={s.spinner} /> processando
          </span>
        )}
      </div>
    </div>
  );
}

// ─── ScanStat ─────────────────────────────────────────────────────────────────

function ScanStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.scanStat}>
      <div style={s.scanStatValue}>{value}</div>
      <div style={s.scanStatLabel}>{label}</div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    color:      C.text,
    display:    'flex',
    flexDirection: 'column',
    gap:        14,
  },

  // Header
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

  // Layout
  layout: {
    display:             'grid',
    gridTemplateColumns: '380px 1fr',
    gap:                 14,
    alignItems:          'start',
  },

  // Config panel
  configPanel: {
    background:    C.panel,
    border:        `1px solid ${C.border}`,
    borderRadius:  6,
    padding:       '18px 20px',
    display:       'flex',
    flexDirection: 'column',
    gap:           10,
  },
  sectionTitle: {
    fontSize:      11,
    fontWeight:    800,
    color:         C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    marginTop:     2,
  },
  divider: { height: 1, background: C.border, margin: '4px 0' },

  // Scan list
  scanList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           4,
    maxHeight:     220,
    overflowY:     'auto',
  },
  scanItem: {
    display:       'flex',
    flexDirection: 'column',
    gap:           3,
    padding:       '8px 12px',
    border:        `1px solid ${C.border}`,
    borderRadius:  4,
    cursor:        'pointer',
    textAlign:     'left',
    fontFamily:    'inherit',
    transition:    'background .1s, border-color .1s',
  },
  scanItemTop: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  scanItemMeta: { display: 'flex', gap: 10, fontSize: 10, color: C.muted },
  selectedBadge: {
    fontSize:     9,
    fontWeight:   700,
    background:   C.accent,
    color:        '#fff',
    padding:      '1px 6px',
    borderRadius: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '.05em',
  },

  // Scan summary
  scanSummary: {
    display:             'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap:                 6,
    marginTop:           2,
  },
  scanStat: {
    background:   '#f7f9fb',
    border:       `1px solid ${C.border}`,
    borderRadius: 4,
    padding:      '6px 8px',
    textAlign:    'center',
  },
  scanStatValue: { fontSize: 16, fontWeight: 800 },
  scanStatLabel: { fontSize: 9, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '.05em' },

  // Format
  formatRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  formatBtn: {
    display:      'flex',
    alignItems:   'center',
    gap:          10,
    padding:      '8px 12px',
    border:       `1px solid ${C.border}`,
    borderRadius: 4,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'background .1s, border-color .1s',
    textAlign:    'left',
  },
  formatBadge: {
    fontFamily:   'monospace',
    fontWeight:   800,
    fontSize:     12,
    background:   'rgba(0,0,0,.06)',
    padding:      '1px 6px',
    borderRadius: 3,
    flexShrink:   0,
  },
  formatDesc: { fontSize: 11, color: C.muted },

  // Fields
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontSize:      10,
    fontWeight:    700,
    color:         C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  fieldHint:  { fontSize: 10, color: C.muted, fontStyle: 'italic' },
  select: {
    padding:      '6px 10px',
    border:       `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize:     12,
    color:        C.text,
    background:   C.panel,
    fontFamily:   'inherit',
    cursor:       'pointer',
  },

  // Export status
  errorBox: {
    background:   '#fff5f5',
    border:       `1px solid ${C.bad}`,
    borderRadius: 4,
    padding:      '8px 10px',
    fontSize:     12,
    color:        C.bad,
    fontWeight:   600,
  },
  progressBox: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    background:   '#ebf4ff',
    border:       `1px solid ${C.accent}`,
    borderRadius: 4,
    padding:      '8px 10px',
    fontSize:     12,
    color:        C.accent,
    fontWeight:   600,
  },
  successBox: {
    background:   '#f0fff4',
    border:       `1px solid ${C.good}`,
    borderRadius: 4,
    padding:      '8px 10px',
    fontSize:     12,
    color:        C.good,
    fontWeight:   600,
  },

  // History panel
  historyPanel: {
    background:    C.panel,
    border:        `1px solid ${C.border}`,
    borderRadius:  6,
    overflow:      'hidden',
    display:       'flex',
    flexDirection: 'column',
  },
  historyHeader: {
    display:      'flex',
    alignItems:   'center',
    justifyContent: 'space-between',
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
  emptyHistory: {
    padding:   '32px 20px',
    textAlign: 'center',
    color:     C.muted,
    fontSize:  13,
  },
  historyList: {
    display:       'flex',
    flexDirection: 'column',
    gap:           0,
    overflowY:     'auto',
    maxHeight:     400,
  },
  historyCard: {
    padding:      '10px 14px',
    borderBottom: `1px solid ${C.border}`,
    display:      'flex',
    flexDirection: 'column',
    gap:          4,
  },
  historyCardTop: {
    display:    'flex',
    alignItems: 'center',
    gap:        8,
  },
  historyCardMeta: {
    display:  'flex',
    gap:      10,
    fontSize: 10,
    color:    C.muted,
  },
  formatTag: {
    fontSize:     10,
    fontWeight:   700,
    padding:      '1px 6px',
    borderRadius: 3,
    fontFamily:   'monospace',
  },
  statusTag: {
    fontSize:   11,
    fontWeight: 700,
  },

  // Tip
  tipBox: {
    margin:       12,
    padding:      '10px 12px',
    background:   '#fffbeb',
    border:       `1px solid #fde68a`,
    borderRadius: 5,
    marginTop:    'auto',
  },
  tipTitle: { fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#92400e' },
  tipList:  { margin: 0, paddingLeft: 16, fontSize: 11, color: '#78350f', lineHeight: 1.8 },

  // Misc
  mono:     { fontFamily: 'monospace', fontSize: 11 },
  loadingText: { fontSize: 12, color: C.muted },
  emptyText:   { fontSize: 12, color: C.muted },

  spinner: {
    display:      'inline-block',
    width:        12,
    height:       12,
    border:       `2px solid ${C.border}`,
    borderTopColor: C.accent,
    borderRadius: '50%',
    animation:    'rp-spin 0.7s linear infinite',
    flexShrink:   0,
  },

  // Buttons
  btn: {
    padding:      '7px 14px',
    borderRadius: 4,
    fontSize:     12,
    fontWeight:   700,
    cursor:       'pointer',
    fontFamily:   'inherit',
    border:       '1px solid transparent',
    transition:   'opacity .15s',
  },
  btnPrimary: { background: C.accent, color: '#fff', borderColor: C.accent },
  btnGhost:   { background: 'transparent', color: C.muted, borderColor: C.border },
};
