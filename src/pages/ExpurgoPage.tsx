import React, { useState, useEffect, useRef } from 'react';
import { useApi }               from '../hooks/useApi';
import { useJobStream }         from '../hooks/useJobStream';
import { listScans }            from '../api/scans.api';
import { getInventorySummary, getInventorySites } from '../api/inventory.api';
import {
  requestPurgeToken,
  simulateVersionRetention,
  executeVersionRetentionJob,
  simulateFileRetention,
  executeFileRetentionJob,
  exportFileRetentionBlob,
  simulateRecycleBin,
  executeRecycleBinJob,
  exportRecycleBinBlob,
  getPurgeJobStatus,
} from '../api/purge.api';
import type { SiteRollup, JobStatusDetail, InventorySummary } from '../types';
import type {
  VersionRetentionRule,
  FileRetentionParams,
  RecycleBinParams,
  ScopeParam,
  SimulateFileResult,
  SimulateRecycleBinResult,
  VersionRetentionPreviewItem,
} from '../api/purge.api';
import { ApiClientError } from '../api/client';

type Step   = 'config' | 'preview' | 'done';
type TabKey = 'versions' | 'files' | 'recycle';

const PREVIEW_LIMIT = 200;
const TERMINAL_JOB  = new Set(['completed', 'failed', 'cancelled']);

const AGE_OPTIONS = [
  { value: '',    label: 'Qualquer idade' },
  { value: '30',  label: 'Não modificado há 30 dias' },
  { value: '90',  label: 'Não modificado há 90 dias' },
  { value: '180', label: 'Não modificado há 180 dias' },
  { value: '365', label: 'Não modificado há 1 ano' },
  { value: '730', label: 'Não modificado há 2 anos' },
];

const SIZE_OPTIONS = [
  { value: '',     label: 'Qualquer tamanho' },
  { value: '1',    label: 'Maior que 1 MB' },
  { value: '10',   label: 'Maior que 10 MB' },
  { value: '100',  label: 'Maior que 100 MB' },
  { value: '500',  label: 'Maior que 500 MB' },
  { value: '1024', label: 'Maior que 1 GB' },
];

function fmtBytes(b: number | undefined): string {
  if (b == null || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtNum(n: number | undefined): string { return n == null ? '—' : n.toLocaleString('pt-BR'); }
function fmtDate(iso: string | undefined): string { if (!iso) return '—'; return new Date(iso).toLocaleDateString('pt-BR'); }
function apiErrMsg(err: unknown): string {
  return err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : 'Erro desconhecido';
}

function isExpiredTokenError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false;
  return /token.*expir|expir.*token|confirm.*expir/i.test(`${err.code} ${err.message}`);
}

async function executeWithPurgeToken<T>(
  operation: Parameters<typeof requestPurgeToken>[0],
  params: unknown,
  execute: (confirmToken: string) => Promise<T>,
): Promise<T> {
  let { confirmToken } = await requestPurgeToken(operation, params);
  try { return await execute(confirmToken); }
  catch (err) {
    if (!isExpiredTokenError(err)) throw err;
    ({ confirmToken } = await requestPurgeToken(operation, params));
    return execute(confirmToken);
  }
}

interface TabJobActivity { jobId: string | null; status: JobStatusDetail | null; active: boolean; }

function usePurgeJobMonitor(onActivity: (activity: TabJobActivity) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  const stream = useJobStream(jobId, { getStatus: getPurgeJobStatus });
  useEffect(() => {
    activityRef.current({ jobId, status: stream.status, active: Boolean(jobId && !stream.done) });
  }, [jobId, stream.status, stream.done]);
  return { ...stream, start: (nextJobId: string) => setJobId(nextJobId), reset: () => setJobId(null) };
}

// ── ConfirmModal ───────────────────────────────────────────────────────────────

function ConfirmModal({ title = 'Confirmar Expurgo Permanente', summaryLines, warningText, onConfirm, onCancel, loading, error }: {
  title?: string; summaryLines: Array<{ label: string; value: string }>; warningText: string;
  onConfirm: () => void; onCancel: () => void; loading: boolean; error: string | null;
}) {
  const [input, setInput] = useState('');
  const KEYWORD = 'CONFIRMAR';
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ border: '2px solid var(--bad-bd)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 800, color: 'var(--bad)', marginBottom: 16 }}>
          <span>⚠</span><span>{title}</span>
        </div>
        <div style={{ background: 'var(--bad-bg)', border: '1px solid var(--bad-bd)', borderRadius: 'var(--r-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {summaryLines.map(l => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span className="small muted">{l.label}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--bad)' }}>{l.value}</span>
            </div>
          ))}
        </div>
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--r-sm)', padding: '10px 12px', fontSize: 'var(--fs-sm)', color: '#78350f', lineHeight: 1.5, marginBottom: 12 }}>
          {warningText}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          <label className="small">Digite <strong>{KEYWORD}</strong> para habilitar o botão de execução:</label>
          <input type="text" value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder={KEYWORD}
            className="input" style={{ borderColor: input === KEYWORD ? 'var(--good)' : undefined, fontFamily: 'monospace', letterSpacing: '.1em', fontWeight: 700 }} autoFocus />
        </div>
        {error && <div className="pill-bad" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', marginBottom: 12 }}>⚠ {error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>Cancelar</button>
          <button type="button" className="btn btn-danger" disabled={input !== KEYWORD || loading} onClick={onConfirm}
            style={{ opacity: (input !== KEYWORD || loading) ? 0.4 : 1 }}>
            {loading ? 'Solicitando token…' : 'Confirmar Expurgo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── JobProgress ────────────────────────────────────────────────────────────────

function JobProgress({ job, itemLabel = 'arquivo' }: { job: JobStatusDetail; itemLabel?: string }) {
  const total = job.progress.total || 0;
  const completed = job.progress.completed || 0;
  const failed = job.progress.failed || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isDone = job.status === 'completed';
  const isCancelled = job.status === 'cancelled';
  const isFailed = job.status === 'failed' || isCancelled;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row">
        <span style={{ fontWeight: 700 }}>Job de Expurgo</span>
        <span className={`pill ${isDone ? 'pill-good' : isFailed ? 'pill-bad' : 'pill-info'}`}>
          {isDone ? '✓ Concluído' : isCancelled ? 'Cancelado' : isFailed ? '✗ Falhou' : 'Em andamento'}
        </span>
      </div>
      <div className="track"><div className="fill" style={{ width: `${pct}%`, background: isDone ? 'var(--good)' : isFailed ? 'var(--bad)' : undefined }} /></div>
      <div className="row small muted">
        <span>{pct}% concluído</span>
        <span>✓ {fmtNum(completed)} · ✗ {fmtNum(failed)} · total {fmtNum(total)}</span>
      </div>
      {isDone && (
        <div className="small" style={{ color: 'var(--good)', fontWeight: 600 }}>
          Expurgo concluído. {fmtNum(completed)} {itemLabel}{completed !== 1 ? 's' : ''} processado{completed !== 1 ? 's' : ''}.
          {failed > 0 && <span style={{ color: 'var(--warn)' }}> {fmtNum(failed)} falha{failed !== 1 ? 's' : ''}.</span>}
        </div>
      )}
      {isFailed && (
        <div className="small" style={{ color: 'var(--bad)', fontWeight: 600 }}>
          {isCancelled ? 'Job cancelado.' : `Job ${job.status}.`}{job.lastError ? ` Erro: ${job.lastError}` : ''}
        </div>
      )}
    </div>
  );
}

// ── SiteCheckboxList ───────────────────────────────────────────────────────────

function SiteCheckboxList({ sites, selected, onChange, disabled }: {
  sites: SiteRollup[]; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean;
}) {
  function toggle(siteId: string) {
    onChange(selected.includes(siteId) ? selected.filter(id => id !== siteId) : [...selected, siteId]);
  }
  return (
    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', opacity: disabled ? 0.5 : 1 }}>
      {sites.length === 0 && <div className="small muted" style={{ padding: '8px 10px' }}>Nenhum site disponível</div>}
      {sites.map(st => (
        <label key={st.siteId} className="check-row" style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', cursor: disabled ? 'default' : 'pointer' }}>
          <input type="checkbox" checked={selected.includes(st.siteId)} onChange={() => !disabled && toggle(st.siteId)} disabled={disabled} style={{ accentColor: 'var(--accent)' }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.siteName || st.siteUrl}</span>
          <span className="small muted">{fmtNum(st.totalFiles)}</span>
        </label>
      ))}
    </div>
  );
}

// ── StepBar ────────────────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  return (
    <div className="stepper">
      {(['config', 'preview', 'done'] as Step[]).map((st, i) => {
        const labels = ['1. Configurar', '2. Simular', '3. Executar'];
        const isActive = step === st;
        const isPast = (st === 'config' && step !== 'config') || (st === 'preview' && step === 'done');
        return (
          <React.Fragment key={st}>
            <div className={`step-item${isActive ? ' active' : isPast ? ' past' : ''}`}>
              {isPast ? '✓ ' : ''}{labels[i]}
            </div>
            {i < 2 && <div className="step-sep">›</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── ImpactBar ──────────────────────────────────────────────────────────────────

function ImpactBar({ stats, note }: { stats: Array<{ value: string; label: string }>; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bad-bg)', borderBottom: '1px solid var(--bad-bd)', padding: '12px 16px', flexWrap: 'wrap', gap: 0 }}>
      {stats.map((s, i) => (
        <React.Fragment key={s.label}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 20 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--bad)' }}>{s.value}</span>
            <span className="small muted" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</span>
          </div>
          {i < stats.length - 1 && <div style={{ width: 1, height: 40, background: 'var(--bad-bd)', marginRight: 20, flexShrink: 0 }} />}
        </React.Fragment>
      ))}
      {note && <span className="small muted" style={{ fontStyle: 'italic', marginLeft: 8 }}>{note}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ABA: VERSÕES
// ─────────────────────────────────────────────────────────────────────────────

interface TabSharedProps {
  scanId: string; sites: SiteRollup[]; summary: InventorySummary | null;
  onJobActivity: (activity: TabJobActivity) => void;
}

function VersionsTab({ scanId, sites, summary, onJobActivity }: TabSharedProps) {
  const [step, setStep] = useState<Step>('config');
  const [filterExt, setFilterExt] = useState('');
  const [filterAge, setFilterAge] = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [keepVersions, setKeepVersions] = useState('5');
  const [dateMode, setDateMode] = useState<'age' | 'range'>('age');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [previewFiles, setPreviewFiles] = useState<VersionRetentionPreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [totalMatches, setTotalMatches] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } = usePurgeJobMonitor(onJobActivity);

  function buildRule(): VersionRetentionRule {
    return {
      scanId, extensions: filterExt ? [filterExt] : undefined,
      olderThanDays: dateMode === 'age' && filterAge ? Number(filterAge) : undefined,
      largerThanMb: filterSize ? Number(filterSize) : undefined,
      siteId: filterSite || undefined, keepVersions: keepVersions ? Number(keepVersions) : undefined,
      fromDate: dateMode === 'range' && fromDate ? fromDate : undefined,
      toDate: dateMode === 'range' && toDate ? toDate : undefined,
    };
  }

  function describeRule(): string {
    const parts: string[] = [];
    if (filterExt) parts.push(`ext: ${filterExt}`);
    if (keepVersions) parts.push(`manter ${keepVersions} versão(ões)`);
    if (dateMode === 'age' && filterAge) parts.push(`não modificado há ${filterAge} dias`);
    if (dateMode === 'range' && fromDate) parts.push(`de ${fromDate}`);
    if (dateMode === 'range' && toDate) parts.push(`até ${toDate}`);
    if (filterSize) parts.push(`> ${filterSize} MB`);
    if (filterSite) { const site = sites.find(s => s.siteId === filterSite); parts.push(`site: ${site?.siteName || filterSite.slice(0, 12)}…`); }
    return parts.length ? parts.join(' · ') : 'sem filtros';
  }

  const hasRule = !!(filterExt || filterAge || filterSize || filterSite || fromDate || toDate || keepVersions);

  function exportPreviewCsv() {
    if (!previewFiles.length) return;
    const header = 'Nome,Site,Extensão,Versões,Versões a remover,Bytes a liberar,Modificado,URL\n';
    const rows = previewFiles.map(f => [
      `"${(f.name || '').replace(/"/g, '""')}"`, `"${(f.siteName || f.siteId || '').replace(/"/g, '""')}"`,
      f.extension || '', f.versionCount ?? '', f.purgeCount ?? '', f.purgeBytes ?? '',
      f.modified ? new Date(f.modified).toLocaleDateString('pt-BR') : '', `"${(f.webUrl || '').replace(/"/g, '""')}"`,
    ].join(',')).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `expurgo_versoes_preview_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function runPreview() {
    if (!scanId) return;
    setPreviewFiles([]); setTotalMatches(0); setTotalBytes(0);
    setPreviewError(null); setPreviewLoading(true); setStep('preview');
    try {
      const simulation = await simulateVersionRetention(buildRule());
      setTotalMatches(simulation.result.filesAffected);
      setTotalBytes(simulation.result.purgeBytes);
      setPreviewFiles(simulation.preview.slice(0, PREVIEW_LIMIT));
    } catch (err) { setPreviewError(apiErrMsg(err)); }
    finally { setPreviewLoading(false); }
  }

  async function handleConfirm() {
    setModalLoading(true); setModalError(null);
    const rule = buildRule();
    try {
      const { jobId } = await executeWithPurgeToken('retention_versions', rule, (confirmToken) => executeVersionRetentionJob(rule, confirmToken));
      setShowModal(false); setModalLoading(false); setStep('done'); startJob(jobId);
    } catch (err) { setModalError(apiErrMsg(err)); setModalLoading(false); }
  }

  return (
    <>
      {showModal && (
        <ConfirmModal
          summaryLines={[{ label: 'Arquivos afetados', value: fmtNum(totalMatches) }, { label: 'Espaço a liberar', value: fmtBytes(totalBytes) }, { label: 'Regras aplicadas', value: describeRule() }]}
          warningText="Esta operação é irreversível. As versões excedentes serão removidas permanentemente do SharePoint."
          onConfirm={handleConfirm} onCancel={() => { setShowModal(false); setModalError(null); }} loading={modalLoading} error={modalError}
        />
      )}
      <StepBar step={step} />

      <div className="card" style={{ padding: 0 }}>
        <div className="card-head"><div className="card-title">Configuração das Regras</div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, padding: '16px 14px' }}>
          <div className="field">
            <label className="field-label">Extensão alvo</label>
            <select className="select" value={filterExt} onChange={e => setFilterExt(e.target.value)}>
              <option value="">Todas as extensões</option>
              {(summary?.topExtensions ?? []).map(e => <option key={e.extension} value={e.extension}>{e.extension || '(sem ext)'} · {fmtNum(e.fileCount)} arqs · {fmtBytes(e.totalBytes)}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Restringir a site</label>
            <select className="select" value={filterSite} onChange={e => setFilterSite(e.target.value)}>
              <option value="">Todos os sites</option>
              {sites.map(st => <option key={st.siteId} value={st.siteId}>{st.siteName || st.siteUrl} ({fmtNum(st.totalFiles)})</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Versões a manter</label>
            <input type="number" min={1} max={100} value={keepVersions} onChange={e => setKeepVersions(e.target.value)} className="input" placeholder="5" />
          </div>
          <div className="field">
            <label className="field-label">Tamanho mínimo</label>
            <select className="select" value={filterSize} onChange={e => setFilterSize(e.target.value)}>
              {SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: '0 14px 10px' }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <button type="button" className={`btn btn-sm${dateMode === 'age' ? ' btn-primary' : ''}`} onClick={() => setDateMode('age')}>Por antiguidade</button>
            <button type="button" className={`btn btn-sm${dateMode === 'range' ? ' btn-primary' : ''}`} onClick={() => setDateMode('range')}>Por intervalo de datas</button>
          </div>
          {dateMode === 'age' ? (
            <div className="field">
              <label className="field-label">Idade do arquivo</label>
              <select className="select" value={filterAge} onChange={e => setFilterAge(e.target.value)}>
                {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label className="field-label">Data inicial</label><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input" /></div>
              <div className="field"><label className="field-label">Data final</label><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input" /></div>
            </div>
          )}
        </div>
        {hasRule && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '8px 14px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderTop: '1px solid var(--border)' }}>
            <span className="small" style={{ color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase' }}>Regra atual:</span>
            <span className="small">{describeRule()}</span>
          </div>
        )}
        {!hasRule && (
          <div className="info-box" style={{ margin: '0 14px 14px' }}>⚠ Nenhum filtro configurado. Sem regras, o expurgo afetaria <strong>todas</strong> as versões do scan.</div>
        )}
        <div style={{ padding: '0 14px 14px' }}>
          <button type="button" className="btn btn-primary" disabled={!scanId || !hasRule} style={{ opacity: (!scanId || !hasRule) ? 0.4 : 1 }} onClick={runPreview}>
            Simular — ver arquivos afetados
          </button>
        </div>
      </div>

      {(step === 'preview' || step === 'done') && (
        <div className="card" style={{ padding: 0, border: '1px solid var(--bad-bd)' }}>
          <div className="card-head">
            <div className="card-title">Preview do Expurgo</div>
            {totalMatches > 0 && <span className="pill pill-bad">{fmtNum(totalMatches)} arquivo{totalMatches !== 1 ? 's' : ''}</span>}
            {previewFiles.length > 0 && <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={exportPreviewCsv}>↓ CSV</button>}
          </div>
          {previewLoading && <div className="small muted" style={{ padding: '24px 14px' }}>Calculando impacto…</div>}
          {previewError && <div className="small" style={{ padding: 14, color: 'var(--bad)', fontWeight: 600 }}>⚠ {previewError}</div>}
          {!previewLoading && totalMatches === 0 && !previewError && (
            <div className="small muted" style={{ padding: '32px 14px', textAlign: 'center' }}>Nenhum arquivo corresponde às regras.</div>
          )}
          {totalMatches > 0 && (
            <>
              <ImpactBar stats={[{ value: fmtNum(totalMatches), label: 'Arquivos afetados' }, { value: fmtBytes(totalBytes), label: 'Espaço a liberar' }]} note={`Amostra: ${fmtNum(previewFiles.length)} de ${fmtNum(totalMatches)}`} />
              {previewFiles.length > 0 && (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Nome</th><th>Site</th><th>Ext</th><th className="td-r">Versões</th><th className="td-r">A remover</th><th className="td-r">Liberar</th><th>Modificado</th></tr></thead>
                    <tbody>
                      {previewFiles.map((f, i) => (
                        <tr key={`${f.driveId || 'drive'}:${f.itemId || i}`}>
                          <td className="td-ellipsis">{f.webUrl ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link">{f.name}</a> : f.name}</td>
                          <td className="td-mute small td-ellipsis">{f.siteName || f.siteId}</td>
                          <td className="td-mono">{f.extension || '—'}</td>
                          <td className="td-r">{fmtNum(f.versionCount)}</td>
                          <td className="td-r" style={{ color: 'var(--bad)' }}>{fmtNum(f.purgeCount)}</td>
                          <td className="td-r">{fmtBytes(f.purgeBytes)}</td>
                          <td className="td-mute small">{fmtDate(f.modified)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {totalMatches > 0 && step !== 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--bad-bg)', borderTop: '1px solid var(--bad-bd)', flexWrap: 'wrap' }}>
              <span className="small" style={{ color: 'var(--bad)' }}>⚠ Esta operação é <strong>irreversível</strong>.</span>
              <button type="button" className="btn btn-danger" onClick={() => { setModalError(null); setShowModal(true); }}>Executar Expurgo Agora</button>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head"><div className="card-title">Progresso do Expurgo</div></div>
          <div style={{ padding: 14 }}>
            {jobError && <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>⚠ {jobError}</div>}
            {transport === 'polling' && <div className="small" style={{ color: 'var(--warn)', marginBottom: 8 }}>Atualização em modo de contingência (polling).</div>}
            {activeJob ? <JobProgress job={activeJob} itemLabel="arquivo" /> : <div className="small muted">Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setStep('config'); resetJob(); setPreviewFiles([]); }}>← Novo Expurgo</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ABA: ARQUIVOS
// ─────────────────────────────────────────────────────────────────────────────

function FilesTab({ scanId, sites, onJobActivity }: TabSharedProps) {
  const [step, setStep] = useState<Step>('config');
  const [scopeType, setScopeType] = useState<'all' | 'sites'>('all');
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [mode, setMode] = useState<'years' | 'date_range'>('years');
  const [keepYears, setKeepYears] = useState('5');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [simResult, setSimResult] = useState<SimulateFileResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } = usePurgeJobMonitor(onJobActivity);

  function buildParams(): FileRetentionParams {
    const scope: ScopeParam = scopeType === 'sites' ? { type: 'sites', siteIds: selectedSites } : { type: 'all' };
    return { scanId, scope, mode, keepYears: mode === 'years' ? Number(keepYears) : undefined, fromDate: mode === 'date_range' ? (fromDate || null) : undefined, toDate: mode === 'date_range' ? (toDate || null) : undefined, previewLimit: PREVIEW_LIMIT };
  }

  function describeParams(): string {
    const parts: string[] = [];
    if (scopeType === 'sites') parts.push(`${selectedSites.length} site(s) selecionados`);
    if (mode === 'years') parts.push(`arquivos com mais de ${keepYears} anos`);
    if (mode === 'date_range') parts.push(`modificados entre ${fromDate || '?'} e ${toDate || '?'}`);
    return parts.join(' · ') || 'todos os arquivos';
  }

  const canSimulate = scanId && (scopeType === 'all' || selectedSites.length > 0) && (mode === 'years' || (fromDate && toDate));

  async function runSim() {
    setSimResult(null); setSimError(null); setSimLoading(true); setStep('preview');
    try { const res = await simulateFileRetention(buildParams()); setSimResult(res); }
    catch (err) { setSimError(apiErrMsg(err)); }
    finally { setSimLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try { await exportFileRetentionBlob(buildParams(), 'csv'); }
    catch (err) { setSimError(apiErrMsg(err)); }
    finally { setExporting(false); }
  }

  async function handleConfirm() {
    setModalLoading(true); setModalError(null);
    const params = buildParams();
    try {
      const { jobId } = await executeWithPurgeToken('retention_files', params, (confirmToken) => executeFileRetentionJob(params, confirmToken));
      setShowModal(false); setModalLoading(false); setStep('done'); startJob(jobId);
    } catch (err) { setModalError(apiErrMsg(err)); setModalLoading(false); }
  }

  const affected = simResult?.result.filesAffected ?? 0;
  const sizeHuman = simResult?.result.purgeHuman ?? '0 B';

  return (
    <>
      {showModal && (
        <ConfirmModal title="Confirmar Exclusão de Arquivos"
          summaryLines={[{ label: 'Arquivos a excluir', value: fmtNum(affected) }, { label: 'Espaço a liberar', value: sizeHuman }, { label: 'Critério', value: describeParams() }]}
          warningText="Esta operação é irreversível. Os arquivos serão movidos para a Lixeira do SharePoint e removidos após o período de retenção do tenant."
          onConfirm={handleConfirm} onCancel={() => { setShowModal(false); setModalError(null); }} loading={modalLoading} error={modalError}
        />
      )}
      <StepBar step={step} />

      <div className="card" style={{ padding: 0 }}>
        <div className="card-head"><div className="card-title">Critérios de Exclusão de Arquivos</div></div>
        <div className="stack" style={{ padding: '16px 14px', gap: 16 }}>
          <div className="field">
            <label className="field-label">Escopo</label>
            <div className="row">
              {(['all', 'sites'] as const).map(v => (
                <label key={v} className="check-row" style={{ cursor: 'pointer' }}>
                  <input type="radio" name="files-scope" value={v} checked={scopeType === v} onChange={() => { setScopeType(v); setSelectedSites([]); }} />
                  <span className="small" style={{ marginLeft: 4 }}>{v === 'all' ? 'Todos os sites' : 'Sites específicos'}</span>
                </label>
              ))}
            </div>
            {scopeType === 'sites' && (
              <div style={{ marginTop: 8 }}>
                <div className="small muted" style={{ marginBottom: 4 }}>{selectedSites.length === 0 ? 'Nenhum site selecionado' : `${selectedSites.length} selecionado(s)`}</div>
                <SiteCheckboxList sites={sites} selected={selectedSites} onChange={setSelectedSites} disabled={!scanId} />
              </div>
            )}
          </div>
          <div className="field">
            <label className="field-label">Critério de idade</label>
            <div className="row">
              {([['years', 'Último acesso há mais de N anos'], ['date_range', 'Intervalo de datas']] as const).map(([v, label]) => (
                <label key={v} className="check-row" style={{ cursor: 'pointer' }}>
                  <input type="radio" name="files-mode" value={v} checked={mode === v} onChange={() => setMode(v)} />
                  <span className="small" style={{ marginLeft: 4 }}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          {mode === 'years' && (
            <div className="field">
              <label className="field-label">Manter arquivos dos últimos</label>
              <div className="row">
                <select className="select" style={{ width: 120 }} value={keepYears} onChange={e => setKeepYears(e.target.value)}>
                  {[1,2,3,5,7,10].map(y => <option key={y} value={y}>{y} ano{y !== 1 ? 's' : ''}</option>)}
                </select>
                <span className="small muted">arquivos não acessados antes disso serão excluídos</span>
              </div>
            </div>
          )}
          {mode === 'date_range' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field"><label className="field-label">Data inicial</label><input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input" /></div>
              <div className="field"><label className="field-label">Data final</label><input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input" /></div>
            </div>
          )}
        </div>
        <div style={{ padding: '0 14px 14px' }}>
          <button type="button" className="btn btn-primary" disabled={!canSimulate} style={{ opacity: !canSimulate ? 0.4 : 1 }} onClick={runSim}>Simular — ver arquivos afetados</button>
        </div>
      </div>

      {(step === 'preview' || step === 'done') && (
        <div className="card" style={{ padding: 0, border: '1px solid var(--bad-bd)' }}>
          <div className="card-head">
            <div className="card-title">Preview do Expurgo de Arquivos</div>
            {affected > 0 && <span className="pill pill-bad">{fmtNum(affected)} arquivo{affected !== 1 ? 's' : ''}</span>}
          </div>
          {simLoading && <div className="small muted" style={{ padding: '24px 14px' }}>Calculando impacto…</div>}
          {simError && <div className="small" style={{ padding: 14, color: 'var(--bad)', fontWeight: 600 }}>⚠ {simError}</div>}
          {!simLoading && simResult && affected === 0 && <div className="small muted" style={{ padding: '32px 14px', textAlign: 'center' }}>Nenhum arquivo corresponde aos critérios.</div>}
          {simResult && affected > 0 && (
            <>
              <ImpactBar stats={[{ value: fmtNum(affected), label: 'Arquivos afetados' }, { value: sizeHuman, label: 'Espaço a liberar' }]} note={simResult.result.summary} />
              {simResult.preview.length > 0 && (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead><tr><th>Nome</th><th>Site</th><th>Ext</th><th className="td-r">Tamanho</th><th>Modificado</th></tr></thead>
                    <tbody>
                      {simResult.preview.map((f, i) => (
                        <tr key={i}>
                          <td className="td-ellipsis">{f.webUrl ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link">{f.name}</a> : f.name || '—'}</td>
                          <td className="td-mute small td-ellipsis">{f.siteName || f.siteId || '—'}</td>
                          <td className="td-mono">{f.extension || '—'}</td>
                          <td className="td-r">{f.sizeHuman || fmtBytes(f.sizeBytes)}</td>
                          <td className="td-mute small">{fmtDate(f.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {simResult && affected > 0 && step !== 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--bad-bg)', borderTop: '1px solid var(--bad-bd)', flexWrap: 'wrap' }}>
              <span className="small" style={{ color: 'var(--bad)' }}>⚠ Esta operação é <strong>irreversível</strong>.</span>
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={exporting} onClick={handleExport}>{exporting ? 'Exportando…' : 'Exportar CSV'}</button>
                <button type="button" className="btn btn-danger" onClick={() => { setModalError(null); setShowModal(true); }}>Executar Expurgo Agora</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head"><div className="card-title">Progresso do Expurgo de Arquivos</div></div>
          <div style={{ padding: 14 }}>
            {jobError && <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>⚠ {jobError}</div>}
            {transport === 'polling' && <div className="small" style={{ color: 'var(--warn)', marginBottom: 8 }}>Modo de contingência (polling).</div>}
            {activeJob ? <JobProgress job={activeJob} itemLabel="arquivo" /> : <div className="small muted">Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setStep('config'); resetJob(); setSimResult(null); }}>← Novo Expurgo</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ABA: LIXEIRA
// ─────────────────────────────────────────────────────────────────────────────

function RecycleTab({ scanId, sites, onJobActivity }: TabSharedProps) {
  const [step, setStep] = useState<Step>('config');
  const [scopeType, setScopeType] = useState<'all' | 'sites'>('all');
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [simResult, setSimResult] = useState<SimulateRecycleBinResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } = usePurgeJobMonitor(onJobActivity);

  function buildParams(): RecycleBinParams {
    const scope: ScopeParam = scopeType === 'sites' ? { type: 'sites', siteIds: selectedSites } : { type: 'all' };
    return { scanId, scope, previewLimit: 5 };
  }

  const canSimulate = scanId && (scopeType === 'all' || selectedSites.length > 0);

  async function runSim() {
    setSimResult(null); setSimError(null); setSimLoading(true); setStep('preview');
    try { const res = await simulateRecycleBin(buildParams()); setSimResult(res); }
    catch (err) { setSimError(apiErrMsg(err)); }
    finally { setSimLoading(false); }
  }

  async function handleExport() {
    setExporting(true);
    try { await exportRecycleBinBlob(buildParams(), 'csv'); }
    catch (err) { setSimError(apiErrMsg(err)); }
    finally { setExporting(false); }
  }

  async function handleConfirm() {
    setModalLoading(true); setModalError(null);
    const params = buildParams();
    try {
      const { jobId } = await executeWithPurgeToken('recycle_bin', params, (confirmToken) => executeRecycleBinJob(params, confirmToken));
      setShowModal(false); setModalLoading(false); setStep('done'); startJob(jobId);
    } catch (err) { setModalError(apiErrMsg(err)); setModalLoading(false); }
  }

  const items = simResult?.result.items ?? 0;
  const sizeHuman = simResult?.result.purgeHuman ?? '0 B';
  const sitesAffected = simResult?.result.sitesAffected ?? 0;

  return (
    <>
      {showModal && (
        <ConfirmModal title="Confirmar Limpeza da Lixeira"
          summaryLines={[{ label: 'Itens na lixeira', value: fmtNum(items) }, { label: 'Espaço a liberar', value: sizeHuman }, { label: 'Sites afetados', value: fmtNum(sitesAffected) }]}
          warningText="Esta operação é irreversível. Os itens serão removidos permanentemente da lixeira do SharePoint."
          onConfirm={handleConfirm} onCancel={() => { setShowModal(false); setModalError(null); }} loading={modalLoading} error={modalError}
        />
      )}
      <StepBar step={step} />

      <div className="card" style={{ padding: 0 }}>
        <div className="card-head"><div className="card-title">Escopo da Limpeza</div></div>
        <div className="stack" style={{ padding: '16px 14px', gap: 16 }}>
          <div className="field">
            <label className="field-label">Escopo</label>
            <div className="row">
              {(['all', 'sites'] as const).map(v => (
                <label key={v} className="check-row" style={{ cursor: 'pointer' }}>
                  <input type="radio" name="recycle-scope" value={v} checked={scopeType === v} onChange={() => { setScopeType(v); setSelectedSites([]); }} />
                  <span className="small" style={{ marginLeft: 4 }}>{v === 'all' ? 'Todos os sites' : 'Sites específicos'}</span>
                </label>
              ))}
            </div>
            {scopeType === 'sites' && (
              <div style={{ marginTop: 8 }}>
                <div className="small muted" style={{ marginBottom: 4 }}>{selectedSites.length === 0 ? 'Nenhum site selecionado' : `${selectedSites.length} selecionado(s)`}</div>
                <SiteCheckboxList sites={sites} selected={selectedSites} onChange={setSelectedSites} disabled={!scanId} />
              </div>
            )}
          </div>
          <div className="info-box">ℹ A simulação consulta a lixeira do SharePoint. O resultado mostra até 5 itens como preview — use "Exportar CSV" para o relatório completo.</div>
        </div>
        <div style={{ padding: '0 14px 14px' }}>
          <button type="button" className="btn btn-primary" disabled={!canSimulate} style={{ opacity: !canSimulate ? 0.4 : 1 }} onClick={runSim}>Consultar Lixeira</button>
        </div>
      </div>

      {(step === 'preview' || step === 'done') && (
        <div className="card" style={{ padding: 0, border: '1px solid var(--bad-bd)' }}>
          <div className="card-head">
            <div className="card-title">Preview da Lixeira</div>
            {items > 0 && <span className="pill pill-bad">{fmtNum(items)} item{items !== 1 ? 'ns' : ''}</span>}
          </div>
          {simLoading && <div className="small muted" style={{ padding: '24px 14px' }}>Consultando lixeira…</div>}
          {simError && <div className="small" style={{ padding: 14, color: 'var(--bad)', fontWeight: 600 }}>⚠ {simError}</div>}
          {!simLoading && simResult && items === 0 && <div className="small muted" style={{ padding: '32px 14px', textAlign: 'center' }}>A lixeira está vazia para o escopo selecionado.</div>}
          {simResult && items > 0 && (
            <>
              <ImpactBar stats={[
                { value: fmtNum(items), label: 'Itens na lixeira' },
                { value: sizeHuman, label: 'Espaço a liberar' },
                ...(sitesAffected > 0 ? [{ value: fmtNum(sitesAffected), label: 'Sites afetados' }] : []),
              ]} />
              {simResult.result.summary && (
                <div className="small muted" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>{simResult.result.summary}</div>
              )}
              {simResult.preview.length > 0 && (
                <>
                  <div className="tbl-wrap">
                    <table className="tbl">
                      <thead><tr><th>Item</th><th>Site</th><th>Pasta</th><th>Excluído por</th><th>Excluído em</th><th className="td-r">Tamanho</th></tr></thead>
                      <tbody>
                        {simResult.preview.map((r, i) => (
                          <tr key={i}>
                            <td className="td-ellipsis">{r.leafName || r.title || '—'}</td>
                            <td className="td-mute small td-ellipsis">{r.siteName || r.siteId || '—'}</td>
                            <td className="td-mute small td-ellipsis">{r.dirName || '—'}</td>
                            <td className="td-mute small">{r.deletedBy || '—'}</td>
                            <td className="td-mute small">{fmtDate(r.deletedAt)}</td>
                            <td className="td-r">{r.sizeHuman || fmtBytes(r.sizeBytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {items > simResult.preview.length && (
                    <div className="small muted" style={{ padding: '8px 14px', fontStyle: 'italic' }}>
                      Exibindo apenas os {simResult.preview.length} primeiros itens. Exporte o CSV para visualizar todos.
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {simResult && items > 0 && step !== 'done' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--bad-bg)', borderTop: '1px solid var(--bad-bd)', flexWrap: 'wrap' }}>
              <span className="small" style={{ color: 'var(--bad)' }}>⚠ Esta operação é <strong>irreversível</strong>.</span>
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={exporting} onClick={handleExport}>{exporting ? 'Exportando…' : 'Exportar CSV'}</button>
                <button type="button" className="btn btn-danger" onClick={() => { setModalError(null); setShowModal(true); }}>Limpar Lixeira Agora</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="card-head"><div className="card-title">Progresso da Limpeza</div></div>
          <div style={{ padding: 14 }}>
            {jobError && <div className="small" style={{ color: 'var(--bad)', marginBottom: 8 }}>⚠ {jobError}</div>}
            {transport === 'polling' && <div className="small" style={{ color: 'var(--warn)', marginBottom: 8 }}>Modo de contingência (polling).</div>}
            {activeJob ? <JobProgress job={activeJob} itemLabel="item" /> : <div className="small muted">Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button type="button" className="btn btn-primary" onClick={() => { setStep('config'); resetJob(); setSimResult(null); }}>← Nova Limpeza</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function ExpurgoPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('versions');
  const [scanId, setScanId] = useState('');
  const [sites, setSites] = useState<SiteRollup[]>([]);
  const [jobActivity, setJobActivity] = useState<Record<TabKey, TabJobActivity>>({
    versions: { jobId: null, status: null, active: false },
    files:    { jobId: null, status: null, active: false },
    recycle:  { jobId: null, status: null, active: false },
  });
  const [tabEpochs, setTabEpochs] = useState<Record<TabKey, number>>({ versions: 0, files: 0, recycle: 0 });

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');
  const { data: summary } = useApi(() => scanId ? getInventorySummary(scanId) : Promise.resolve(null), [scanId]);

  useEffect(() => {
    setSites([]);
    setJobActivity({ versions: { jobId: null, status: null, active: false }, files: { jobId: null, status: null, active: false }, recycle: { jobId: null, status: null, active: false } });
    if (!scanId) return;
    getInventorySites(scanId, { pageSize: 500 }).then(r => setSites(r.items)).catch(() => {});
  }, [scanId]);

  const TAB_LABELS: Record<TabKey, string> = { versions: 'Versões', files: 'Arquivos', recycle: 'Lixeira' };

  function updateJobActivity(tab: TabKey, activity: TabJobActivity): void {
    setJobActivity((current) => ({ ...current, [tab]: activity }));
  }

  function changeTab(tab: TabKey): void {
    if (!jobActivity[tab].active) setTabEpochs((current) => ({ ...current, [tab]: current[tab] + 1 }));
    setActiveTab(tab);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Simulação de Expurgo</h1>
          <p className="page-sub">Configure regras de retenção, simule o impacto e execute com confirmação dupla</p>
        </div>
      </div>

      {/* Seletor de scan */}
      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <span className="field-label" style={{ flexShrink: 0 }}>Scan de origem *</span>
          {scansLoading ? (
            <span className="small muted">Carregando…</span>
          ) : (
            <select className="select" style={{ minWidth: 320 }} value={scanId} onChange={e => setScanId(e.target.value)}>
              <option value="">— selecione um scan concluído —</option>
              {completedScans.map(sc => (
                <option key={sc.id} value={sc.id}>{sc.id.slice(0, 16)}… · {sc.totalFiles != null ? sc.totalFiles.toLocaleString('pt-BR') + ' arqs' : ''} · {new Date(sc.createdAt).toLocaleDateString('pt-BR')}</option>
              ))}
            </select>
          )}
          {summary && scanId && (
            <span className="small muted">{summary.totalFiles?.toLocaleString('pt-BR')} arqs · {fmtBytes(summary.totalBytes)} · {summary.totalSites?.toLocaleString('pt-BR')} sites</span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'flex' }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => (
            <button key={tab} type="button"
              style={{
                flex: 1, padding: '10px 16px', border: 0, borderRight: '1px solid var(--border)', cursor: 'pointer',
                fontFamily: 'inherit', fontWeight: 600, fontSize: 'var(--fs-sm)', transition: 'background .15s, color .15s',
                background: activeTab === tab ? 'var(--accent)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--text-2)',
              }}
              onClick={() => changeTab(tab)}
            >
              {TAB_LABELS[tab]}
              {jobActivity[tab].active && <span className="pill pill-info" style={{ marginLeft: 7, fontSize: 9, fontWeight: 800 }}>Ativo</span>}
            </button>
          ))}
        </div>
      </div>

      {!scanId && (
        <div className="info-box">Selecione um scan concluído acima para habilitar as simulações.</div>
      )}

      {scanId && (
        <>
          <div style={{ display: activeTab === 'versions' ? 'contents' : 'none' }}>
            <VersionsTab key={`${scanId}-versions-${tabEpochs.versions}`} scanId={scanId} sites={sites} summary={summary} onJobActivity={(a) => updateJobActivity('versions', a)} />
          </div>
          <div style={{ display: activeTab === 'files' ? 'contents' : 'none' }}>
            <FilesTab key={`${scanId}-files-${tabEpochs.files}`} scanId={scanId} sites={sites} summary={summary} onJobActivity={(a) => updateJobActivity('files', a)} />
          </div>
          <div style={{ display: activeTab === 'recycle' ? 'contents' : 'none' }}>
            <RecycleTab key={`${scanId}-recycle-${tabEpochs.recycle}`} scanId={scanId} sites={sites} summary={summary} onJobActivity={(a) => updateJobActivity('recycle', a)} />
          </div>
        </>
      )}
    </>
  );
}
