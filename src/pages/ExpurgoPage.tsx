/**
 * ExpurgoPage.tsx — Simulação e execução de expurgo (Sprint 20)
 *
 * 3 abas independentes, cada uma com fluxo em 3 etapas:
 *   1. CONFIGURAR → 2. SIMULAR (preview) → 3. EXECUTAR (job assíncrono)
 *
 * Abas:
 *   - Versões   → retenção de versões de arquivos
 *   - Arquivos  → exclusão de arquivos por idade/escopo
 *   - Lixeira   → limpeza da lixeira do SharePoint
 *
 * Segurança:
 *   - Execução sempre requer confirmação dupla (token + input "CONFIRMAR")
 *   - requestPurgeToken + execute-job com hash validado pelo backend
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApi }               from '../hooks/useApi';
import { useJobStream }         from '../hooks/useJobStream';
import { listScans }            from '../api/scans.api';
import { getInventorySummary, getInventorySites, getInventoryFiles } from '../api/inventory.api';
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
  simulateSiteDeletion,
  executeSiteDeleteJob,
  getPurgeJobStatus,
} from '../api/purge.api';
import type { FileItem, SiteRollup, JobStatusDetail, InventorySummary } from '../types';
import type {
  VersionRetentionRule,
  FileRetentionParams,
  RecycleBinParams,
  ScopeParam,
  SimulateFileResult,
  SimulateRecycleBinResult,
  SiteTarget,
  SimulateSitesResult,
} from '../api/purge.api';
import { ApiClientError } from '../api/client';

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

const DANGER        = '#991b1b';
const DANGER_BG     = '#fff5f5';
const DANGER_BORDER = '#fca5a5';

// ─── Constantes ───────────────────────────────────────────────────────────────

type Step    = 'config' | 'preview' | 'done';
type TabKey  = 'versions' | 'files' | 'recycle' | 'sites';

const PREVIEW_LIMIT = 200;
const TERMINAL_JOB  = new Set(['completed', 'failed', 'cancelled']);

const AGE_OPTIONS = [
  { value: '',    label: 'Qualquer idade'               },
  { value: '30',  label: 'Não modificado há 30 dias'    },
  { value: '90',  label: 'Não modificado há 90 dias'    },
  { value: '180', label: 'Não modificado há 180 dias'   },
  { value: '365', label: 'Não modificado há 1 ano'      },
  { value: '730', label: 'Não modificado há 2 anos'     },
];

const SIZE_OPTIONS = [
  { value: '',     label: 'Qualquer tamanho'  },
  { value: '1',    label: 'Maior que 1 MB'    },
  { value: '10',   label: 'Maior que 10 MB'   },
  { value: '100',  label: 'Maior que 100 MB'  },
  { value: '500',  label: 'Maior que 500 MB'  },
  { value: '1024', label: 'Maior que 1 GB'    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(b: number | undefined): string {
  if (b == null || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtNum(n: number | undefined): string {
  return n == null ? '—' : n.toLocaleString('pt-BR');
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function apiErrMsg(err: unknown): string {
  return err instanceof ApiClientError ? err.message
    : err instanceof Error              ? err.message
    : 'Erro desconhecido';
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
  try {
    return await execute(confirmToken);
  } catch (err) {
    if (!isExpiredTokenError(err)) throw err;
    ({ confirmToken } = await requestPurgeToken(operation, params));
    return execute(confirmToken);
  }
}

interface TabJobActivity {
  jobId: string | null;
  status: JobStatusDetail | null;
  active: boolean;
}

function usePurgeJobMonitor(onActivity: (activity: TabJobActivity) => void) {
  const [jobId, setJobId] = useState<string | null>(null);
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;
  const stream = useJobStream(jobId, { getStatus: getPurgeJobStatus });

  useEffect(() => {
    activityRef.current({
      jobId,
      status: stream.status,
      active: Boolean(jobId && !stream.done),
    });
  }, [jobId, stream.status, stream.done]);

  return {
    ...stream,
    start: (nextJobId: string) => setJobId(nextJobId),
    reset: () => setJobId(null),
  };
}

// ─── ConfirmModal (genérico) ──────────────────────────────────────────────────

function ConfirmModal({
  title = 'Confirmar Expurgo Permanente',
  summaryLines,
  warningText,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  title?:        string;
  summaryLines:  Array<{ label: string; value: string }>;
  warningText:   string;
  onConfirm:     () => void;
  onCancel:      () => void;
  loading:       boolean;
  error:         string | null;
}) {
  const [input, setInput] = useState('');
  const KEYWORD = 'CONFIRMAR';
  return (
    <div style={ms.overlay}>
      <div style={ms.modal}>
        <div style={ms.modalHeader}>
          <span style={ms.dangerIcon}>⚠</span>
          <span>{title}</span>
        </div>
        <div style={ms.summary}>
          {summaryLines.map(l => (
            <div key={l.label} style={ms.summaryRow}>
              <span style={ms.summaryLabel}>{l.label}</span>
              <span style={ms.summaryValue}>{l.value}</span>
            </div>
          ))}
        </div>
        <div style={ms.warning}>{warningText}</div>
        <div style={ms.inputGroup}>
          <label style={ms.inputLabel}>
            Digite <strong>{KEYWORD}</strong> para habilitar o botão de execução:
          </label>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder={KEYWORD}
            style={{ ...ms.input, borderColor: input === KEYWORD ? C.good : C.border }}
            autoFocus
          />
        </div>
        {error && <div style={ms.errorBox}>⚠ {error}</div>}
        <div style={ms.modalFooter}>
          <button style={{ ...ms.btn, ...ms.btnCancel }} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            style={{ ...ms.btn, ...ms.btnDanger, opacity: (input !== KEYWORD || loading) ? 0.4 : 1 }}
            disabled={input !== KEYWORD || loading}
            onClick={onConfirm}
          >
            {loading ? '⏳ Solicitando token…' : '🗑 Confirmar Expurgo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── JobProgress ──────────────────────────────────────────────────────────────

function JobProgress({ job, itemLabel = 'arquivo' }: { job: JobStatusDetail; itemLabel?: string }) {
  const total     = job.progress.total     || 0;
  const completed = job.progress.completed || 0;
  const failed    = job.progress.failed    || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isDone    = job.status === 'completed';
  const isCancelled = job.status === 'cancelled';
  const isFailed  = job.status === 'failed' || isCancelled;
  return (
    <div style={jp.wrap}>
      <div style={jp.header}>
        <span style={jp.title}>Job de Expurgo</span>
        <span style={{ ...jp.badge, background: isDone ? '#d1fae5' : isFailed ? '#fee2e2' : '#dbeafe', color: isDone ? '#065f46' : isFailed ? '#991b1b' : '#1e40af' }}>
          {isDone ? '✓ Concluído' : isCancelled ? 'Cancelado' : isFailed ? '✗ Falhou' : '⏳ Em andamento'}
        </span>
      </div>
      <div style={jp.barTrack}>
        <div style={{ ...jp.barFill, width: `${pct}%`, background: isDone ? C.good : isFailed ? C.bad : C.accent }} />
      </div>
      <div style={jp.stats}>
        <span>{pct}% concluído</span>
        <span>✓ {fmtNum(completed)} · ✗ {fmtNum(failed)} · total {fmtNum(total)}</span>
      </div>
      {!isDone && !isFailed && (
        <div style={jp.running}><span style={jp.spinner} /> Processando…</div>
      )}
      {isDone && (
        <div style={jp.doneMsg}>
          ✓ Expurgo concluído. {fmtNum(completed)} {itemLabel}{completed !== 1 ? 's' : ''} processado{completed !== 1 ? 's' : ''}.
          {failed > 0 && <span style={{ color: C.warn }}> {fmtNum(failed)} falha{failed !== 1 ? 's' : ''}.</span>}
        </div>
      )}
      {isFailed && (
        <div style={jp.failedMsg}>
          {isCancelled ? 'Job cancelado.' : `✗ Job ${job.status}.`}
          {job.lastError ? ` Erro: ${job.lastError}` : ''}
        </div>
      )}
    </div>
  );
}

// ─── SiteCheckboxList ─────────────────────────────────────────────────────────

function SiteCheckboxList({
  sites,
  selected,
  onChange,
  disabled,
}: {
  sites:    SiteRollup[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  function toggle(siteId: string) {
    onChange(
      selected.includes(siteId)
        ? selected.filter(id => id !== siteId)
        : [...selected, siteId],
    );
  }
  return (
    <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 4, opacity: disabled ? 0.5 : 1 }}>
      {sites.length === 0 && <div style={{ padding: '8px 10px', fontSize: 11, color: C.muted }}>Nenhum site disponível</div>}
      {sites.map(st => (
        <label
          key={st.siteId}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', cursor: disabled ? 'default' : 'pointer', fontSize: 12, borderBottom: `1px solid #f0f2f5` }}
        >
          <input
            type="checkbox"
            checked={selected.includes(st.siteId)}
            onChange={() => !disabled && toggle(st.siteId)}
            disabled={disabled}
          />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {st.siteName || st.siteUrl}
          </span>
          <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtNum(st.totalFiles)}</span>
        </label>
      ))}
    </div>
  );
}

// ─── StepBar (reutilizada pelas abas) ─────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  return (
    <div style={s.stepper}>
      {(['config', 'preview', 'done'] as Step[]).map((st, i) => {
        const labels   = ['1. Configurar', '2. Simular', '3. Executar'];
        const isActive = step === st;
        const isPast   = (st === 'config' && step !== 'config') || (st === 'preview' && step === 'done');
        return (
          <React.Fragment key={st}>
            <div style={{ ...s.stepItem, color: isActive ? C.accent : isPast ? C.good : C.muted, fontWeight: isActive ? 800 : 600 }}>
              {isPast ? '✓ ' : ''}{labels[i]}
            </div>
            {i < 2 && <div style={s.stepSep}>›</div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ABA: VERSÕES
// ═════════════════════════════════════════════════════════════════════════════

function VersionsTab({ scanId, sites, summary, onJobActivity }: TabSharedProps) {
  const [step,        setStep]        = useState<Step>('config');
  const [filterExt,   setFilterExt]   = useState('');
  const [filterAge,   setFilterAge]   = useState('');
  const [filterSize,  setFilterSize]  = useState('');
  const [filterSite,  setFilterSite]  = useState('');

  const [previewFiles,   setPreviewFiles]   = useState<FileItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState<string | null>(null);
  const [totalMatches,   setTotalMatches]   = useState(0);
  const [totalBytes,     setTotalBytes]     = useState(0);

  const [showModal,    setShowModal]    = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError,   setModalError]   = useState<string | null>(null);

  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } =
    usePurgeJobMonitor(onJobActivity);

  function buildRule(): VersionRetentionRule {
    return {
      scanId,
      extensions:    filterExt   ? [filterExt]          : undefined,
      olderThanDays: filterAge   ? Number(filterAge)    : undefined,
      largerThanMb:  filterSize  ? Number(filterSize)   : undefined,
      siteId:        filterSite  || undefined,
    };
  }

  function describeRule(): string {
    const parts: string[] = [];
    if (filterExt)  parts.push(`ext: ${filterExt}`);
    if (filterAge)  parts.push(`não modificado há ${filterAge} dias`);
    if (filterSize) parts.push(`> ${filterSize} MB`);
    if (filterSite) {
      const site = sites.find(s => s.siteId === filterSite);
      parts.push(`site: ${site?.siteName || filterSite.slice(0, 12)}…`);
    }
    return parts.length ? parts.join(' · ') : 'sem filtros';
  }

  const hasRule = !!(filterExt || filterAge || filterSize || filterSite);

  async function runPreview() {
    if (!scanId) return;
    setPreviewFiles([]); setTotalMatches(0); setTotalBytes(0);
    setPreviewError(null); setPreviewLoading(true); setStep('preview');
    try {
      const rule = buildRule();
      const [simulation, inventory] = await Promise.all([
        simulateVersionRetention(rule),
        getInventoryFiles(scanId, {
          extension: filterExt  || undefined,
          siteId:    filterSite || undefined,
          sort:      'size_desc',
          pageSize:  500,
        }),
      ]);
      const cutoff   = filterAge  ? daysAgo(Number(filterAge))       : null;
      const minBytes = filterSize ? Number(filterSize) * 1024 * 1024 : null;
      const sample = inventory.items.filter(f => {
        if (cutoff   && f.modifiedAt && new Date(f.modifiedAt) > cutoff) return false;
        if (minBytes && (f.totalBytes ?? 0) < minBytes) return false;
        return true;
      });
      setTotalMatches(simulation.count);
      setTotalBytes(simulation.bytes);
      setPreviewFiles(sample.slice(0, PREVIEW_LIMIT));
    } catch (err) {
      setPreviewError(apiErrMsg(err));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleConfirm() {
    setModalLoading(true); setModalError(null);
    const rule = buildRule();
    try {
      const { jobId } = await executeWithPurgeToken(
        'retention_versions',
        rule,
        (confirmToken) => executeVersionRetentionJob(rule, confirmToken),
      );
      setShowModal(false); setModalLoading(false); setStep('done');
      startJob(jobId);
    } catch (err) {
      setModalError(apiErrMsg(err)); setModalLoading(false);
    }
  }

  return (
    <>
      {showModal && (
        <ConfirmModal
          summaryLines={[
            { label: 'Arquivos afetados',  value: fmtNum(totalMatches)    },
            { label: 'Espaço a liberar',   value: fmtBytes(totalBytes)    },
            { label: 'Regras aplicadas',   value: describeRule()          },
          ]}
          warningText="Esta operação é irreversível. As versões excedentes serão removidas permanentemente do SharePoint."
          onConfirm={handleConfirm}
          onCancel={() => { setShowModal(false); setModalError(null); }}
          loading={modalLoading}
          error={modalError}
        />
      )}

      <StepBar step={step} />

      {/* Config */}
      <div style={s.configPanel}>
        <div style={s.panelHeader}><span style={s.panelTitle}>Configuração das Regras</span></div>
        <div style={s.configGrid}>
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Extensão alvo</label>
            <select value={filterExt} onChange={e => setFilterExt(e.target.value)} style={s.select}>
              <option value="">Todas as extensões</option>
              {(summary?.topExtensions ?? []).map(e => (
                <option key={e.extension} value={e.extension}>
                  {e.extension || '(sem ext)'} · {fmtNum(e.fileCount)} arqs · {fmtBytes(e.totalBytes)}
                </option>
              ))}
            </select>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Restringir a site</label>
            <select value={filterSite} onChange={e => setFilterSite(e.target.value)} style={s.select}>
              <option value="">Todos os sites</option>
              {sites.map(st => (
                <option key={st.siteId} value={st.siteId}>
                  {st.siteName || st.siteUrl} ({fmtNum(st.totalFiles)})
                </option>
              ))}
            </select>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Idade do arquivo</label>
            <select value={filterAge} onChange={e => setFilterAge(e.target.value)} style={s.select}>
              {AGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Tamanho mínimo</label>
            <select value={filterSize} onChange={e => setFilterSize(e.target.value)} style={s.select}>
              {SIZE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {hasRule && (
          <div style={s.ruleSummary}>
            <span style={s.ruleSummaryLabel}>Regra atual:</span>
            <span style={s.ruleSummaryText}>{describeRule()}</span>
          </div>
        )}
        {!hasRule && (
          <div style={s.warnBox}>
            ⚠ Nenhum filtro configurado. Sem regras, o expurgo afetaria <strong>todas</strong> as versões do scan.
          </div>
        )}
        <div style={{ padding: '0 14px 14px' }}>
          <button
            style={{ ...s.btn, ...s.btnAccent, opacity: (!scanId || !hasRule) ? 0.4 : 1 }}
            disabled={!scanId || !hasRule}
            onClick={runPreview}
          >
            🔍 Simular — ver arquivos afetados
          </button>
        </div>
      </div>

      {/* Preview */}
      {(step === 'preview' || step === 'done') && (
        <div style={s.previewPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Preview do Expurgo</span>
            {totalMatches > 0 && <span style={{ ...s.countBadge, background: C.bad }}>{fmtNum(totalMatches)} arquivo{totalMatches !== 1 ? 's' : ''}</span>}
          </div>
          {previewLoading && <div style={s.loadingMsg}><span style={s.spinner} /> Calculando impacto…</div>}
          {previewError  && <div style={s.errorMsg}>⚠ {previewError}</div>}
          {!previewLoading && totalMatches === 0 && !previewError && (
            <div style={s.emptyMsg}>Nenhum arquivo corresponde às regras. Ajuste os filtros e simule novamente.</div>
          )}
          {totalMatches > 0 && (
            <>
              <div style={s.impactBar}>
                <div style={s.impactStat}><span style={s.impactValue}>{fmtNum(totalMatches)}</span><span style={s.impactLabel}>Arquivos afetados</span></div>
                <div style={s.impactDivider} />
                <div style={s.impactStat}><span style={s.impactValue}>{fmtBytes(totalBytes)}</span><span style={s.impactLabel}>Espaço a liberar</span></div>
                <div style={s.impactDivider} />
                <div style={s.impactNote}>Amostra: {fmtNum(previewFiles.length)} de {fmtNum(totalMatches)}</div>
              </div>
              {previewFiles.length > 0 && <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead><tr>
                    <th style={s.th}>Nome</th>
                    <th style={s.th}>Site</th>
                    <th style={s.th}>Ext</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Tamanho</th>
                    <th style={s.th}>Modificado</th>
                  </tr></thead>
                  <tbody>
                    {previewFiles.map((f, i) => (
                      <tr key={f.id} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                        <td style={s.td}><div style={s.fileName}>{f.webUrl ? <a href={f.webUrl} target="_blank" rel="noreferrer" style={s.fileLink}>{f.name}</a> : f.name}</div></td>
                        <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis}>{f.siteId}</div></td>
                        <td style={s.td}><span style={s.extBadge}>{f.extension || '—'}</span></td>
                        <td style={{ ...s.td, textAlign: 'right' }}>{fmtBytes(f.totalBytes)}</td>
                        <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(f.modifiedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>}
            </>
          )}
          {totalMatches > 0 && step !== 'done' && (
            <div style={s.execBar}>
              <div style={s.execWarning}>⚠ Esta operação é <strong>irreversível</strong>.</div>
              <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => { setModalError(null); setShowModal(true); }}>
                🗑 Executar Expurgo Agora
              </button>
            </div>
          )}
        </div>
      )}

      {/* Job */}
      {step === 'done' && (
        <div style={s.jobPanel}>
          <div style={s.panelHeader}><span style={s.panelTitle}>Progresso do Expurgo</span></div>
          <div style={{ padding: 14 }}>
            {jobError   && <div style={s.errorMsg}>⚠ {jobError}</div>}
            {transport === 'polling' && <div style={s.fallbackMsg}>Atualização em modo de contingência (polling).</div>}
            {activeJob  ? <JobProgress job={activeJob} itemLabel="arquivo" /> : <div style={s.loadingMsg}><span style={s.spinner} /> Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button style={{ ...s.btn, ...s.btnAccent }} onClick={() => { setStep('config'); resetJob(); setPreviewFiles([]); }}>
                  ← Novo Expurgo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ABA: ARQUIVOS
// ═════════════════════════════════════════════════════════════════════════════

function FilesTab({ scanId, sites, onJobActivity }: TabSharedProps) {
  const [step,           setStep]          = useState<Step>('config');
  const [scopeType,      setScopeType]     = useState<'all' | 'sites'>('all');
  const [selectedSites,  setSelectedSites] = useState<string[]>([]);
  const [mode,           setMode]          = useState<'years' | 'date_range'>('years');
  const [keepYears,      setKeepYears]     = useState('5');
  const [fromDate,       setFromDate]      = useState('');
  const [toDate,         setToDate]        = useState('');

  const [simResult,     setSimResult]     = useState<SimulateFileResult | null>(null);
  const [simLoading,    setSimLoading]    = useState(false);
  const [simError,      setSimError]      = useState<string | null>(null);

  const [showModal,    setShowModal]    = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError,   setModalError]   = useState<string | null>(null);
  const [exporting,    setExporting]    = useState(false);

  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } =
    usePurgeJobMonitor(onJobActivity);

  function buildParams(): FileRetentionParams {
    const scope: ScopeParam = scopeType === 'sites'
      ? { type: 'sites', siteIds: selectedSites }
      : { type: 'all' };
    return {
      scanId,
      scope,
      mode,
      keepYears:    mode === 'years'      ? Number(keepYears) : undefined,
      fromDate:     mode === 'date_range' ? (fromDate || null) : undefined,
      toDate:       mode === 'date_range' ? (toDate   || null) : undefined,
      previewLimit: PREVIEW_LIMIT,
    };
  }

  function describeParams(): string {
    const parts: string[] = [];
    if (scopeType === 'sites') parts.push(`${selectedSites.length} site(s) selecionados`);
    if (mode === 'years')       parts.push(`arquivos com mais de ${keepYears} anos`);
    if (mode === 'date_range')  parts.push(`modificados entre ${fromDate || '?'} e ${toDate || '?'}`);
    return parts.join(' · ') || 'todos os arquivos';
  }

  const canSimulate = scanId && (scopeType === 'all' || selectedSites.length > 0) &&
    (mode === 'years' || (fromDate && toDate));

  async function runSim() {
    setSimResult(null); setSimError(null); setSimLoading(true); setStep('preview');
    try {
      const res = await simulateFileRetention(buildParams());
      setSimResult(res);
    } catch (err) {
      setSimError(apiErrMsg(err));
    } finally {
      setSimLoading(false);
    }
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
      const { jobId } = await executeWithPurgeToken(
        'retention_files',
        params,
        (confirmToken) => executeFileRetentionJob(params, confirmToken),
      );
      setShowModal(false); setModalLoading(false); setStep('done');
      startJob(jobId);
    } catch (err) {
      setModalError(apiErrMsg(err)); setModalLoading(false);
    }
  }

  const affected = simResult?.result.filesAffected ?? 0;
  const sizeHuman = simResult?.result.purgeHuman ?? '0 B';

  return (
    <>
      {showModal && (
        <ConfirmModal
          title="Confirmar Exclusão de Arquivos"
          summaryLines={[
            { label: 'Arquivos a excluir', value: fmtNum(affected)       },
            { label: 'Espaço a liberar',   value: sizeHuman              },
            { label: 'Critério',           value: describeParams()       },
          ]}
          warningText="Esta operação é irreversível. Os arquivos serão movidos para a Lixeira do SharePoint e removidos após o período de retenção do tenant."
          onConfirm={handleConfirm}
          onCancel={() => { setShowModal(false); setModalError(null); }}
          loading={modalLoading}
          error={modalError}
        />
      )}

      <StepBar step={step} />

      {/* Config */}
      <div style={s.configPanel}>
        <div style={s.panelHeader}><span style={s.panelTitle}>Critérios de Exclusão de Arquivos</span></div>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column' as const, gap: 16 }}>

          {/* Escopo */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Escopo</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['all', 'sites'] as const).map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="files-scope" value={v} checked={scopeType === v} onChange={() => { setScopeType(v); setSelectedSites([]); }} />
                  {v === 'all' ? 'Todos os sites' : 'Sites específicos'}
                </label>
              ))}
            </div>
            {scopeType === 'sites' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {selectedSites.length === 0 ? 'Nenhum site selecionado' : `${selectedSites.length} selecionado(s)`}
                </div>
                <SiteCheckboxList sites={sites} selected={selectedSites} onChange={setSelectedSites} disabled={!scanId} />
              </div>
            )}
          </div>

          {/* Modo */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Critério de idade</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {([['years', 'Último acesso há mais de N anos'], ['date_range', 'Intervalo de datas']] as const).map(([v, label]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="files-mode" value={v} checked={mode === v} onChange={() => setMode(v)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {mode === 'years' && (
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Manter arquivos dos últimos</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={keepYears} onChange={e => setKeepYears(e.target.value)} style={{ ...s.select, width: 120 }}>
                  {[1,2,3,5,7,10].map(y => <option key={y} value={y}>{y} ano{y !== 1 ? 's' : ''}</option>)}
                </select>
                <span style={{ fontSize: 12, color: C.muted }}>arquivos não acessados antes disso serão excluídos</span>
              </div>
            </div>
          )}

          {mode === 'date_range' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Data inicial (modificado após)</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={s.input} />
              </div>
              <div style={s.fieldGroup}>
                <label style={s.fieldLabel}>Data final (modificado antes)</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={s.input} />
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '0 14px 14px' }}>
          <button
            style={{ ...s.btn, ...s.btnAccent, opacity: !canSimulate ? 0.4 : 1 }}
            disabled={!canSimulate}
            onClick={runSim}
          >
            🔍 Simular — ver arquivos afetados
          </button>
        </div>
      </div>

      {/* Preview */}
      {(step === 'preview' || step === 'done') && (
        <div style={s.previewPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Preview do Expurgo de Arquivos</span>
            {affected > 0 && <span style={{ ...s.countBadge, background: C.bad }}>{fmtNum(affected)} arquivo{affected !== 1 ? 's' : ''}</span>}
          </div>
          {simLoading && <div style={s.loadingMsg}><span style={s.spinner} /> Calculando impacto…</div>}
          {simError   && <div style={s.errorMsg}>⚠ {simError}</div>}
          {!simLoading && simResult && affected === 0 && (
            <div style={s.emptyMsg}>Nenhum arquivo corresponde aos critérios. Ajuste os filtros e simule novamente.</div>
          )}
          {simResult && affected > 0 && (
            <>
              <div style={s.impactBar}>
                <div style={s.impactStat}><span style={s.impactValue}>{fmtNum(affected)}</span><span style={s.impactLabel}>Arquivos afetados</span></div>
                <div style={s.impactDivider} />
                <div style={s.impactStat}><span style={s.impactValue}>{sizeHuman}</span><span style={s.impactLabel}>Espaço a liberar</span></div>
                {simResult.result.summary && (
                  <><div style={s.impactDivider} /><div style={s.impactNote}>{simResult.result.summary}</div></>
                )}
              </div>
              {simResult.preview.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Nome</th>
                      <th style={s.th}>Site</th>
                      <th style={s.th}>Ext</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Tamanho</th>
                      <th style={s.th}>Modificado</th>
                    </tr></thead>
                    <tbody>
                      {simResult.preview.map((f, i) => (
                        <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                          <td style={s.td}><div style={s.fileName}>{f.webUrl ? <a href={f.webUrl} target="_blank" rel="noreferrer" style={s.fileLink}>{f.name}</a> : f.name || '—'}</div></td>
                          <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis}>{f.siteName || f.siteId || '—'}</div></td>
                          <td style={s.td}><span style={s.extBadge}>{f.extension || '—'}</span></td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{f.sizeHuman || fmtBytes(f.sizeBytes)}</td>
                          <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(f.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {simResult && affected > 0 && step !== 'done' && (
            <div style={s.execBar}>
              <div style={s.execWarning}>⚠ Esta operação é <strong>irreversível</strong>.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleExport} disabled={exporting}>
                  {exporting ? '⏳ Exportando…' : '📄 Exportar CSV'}
                </button>
                <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => { setModalError(null); setShowModal(true); }}>
                  🗑 Executar Expurgo Agora
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Job */}
      {step === 'done' && (
        <div style={s.jobPanel}>
          <div style={s.panelHeader}><span style={s.panelTitle}>Progresso do Expurgo de Arquivos</span></div>
          <div style={{ padding: 14 }}>
            {jobError  && <div style={s.errorMsg}>⚠ {jobError}</div>}
            {transport === 'polling' && <div style={s.fallbackMsg}>Atualização em modo de contingência (polling).</div>}
            {activeJob ? <JobProgress job={activeJob} itemLabel="arquivo" /> : <div style={s.loadingMsg}><span style={s.spinner} /> Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button style={{ ...s.btn, ...s.btnAccent }} onClick={() => { setStep('config'); resetJob(); setSimResult(null); }}>
                  ← Novo Expurgo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ABA: LIXEIRA
// ═════════════════════════════════════════════════════════════════════════════

function RecycleTab({ scanId, sites, onJobActivity }: TabSharedProps) {
  const [step,          setStep]         = useState<Step>('config');
  const [scopeType,     setScopeType]    = useState<'all' | 'sites'>('all');
  const [selectedSites, setSelectedSites]= useState<string[]>([]);

  const [simResult,   setSimResult]  = useState<SimulateRecycleBinResult | null>(null);
  const [simLoading,  setSimLoading] = useState(false);
  const [simError,    setSimError]   = useState<string | null>(null);

  const [showModal,    setShowModal]    = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError,   setModalError]  = useState<string | null>(null);
  const [exporting,    setExporting]   = useState(false);

  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } =
    usePurgeJobMonitor(onJobActivity);

  function buildParams(): RecycleBinParams {
    const scope: ScopeParam = scopeType === 'sites'
      ? { type: 'sites', siteIds: selectedSites }
      : { type: 'all' };
    return { scanId, scope, previewLimit: 5 };
  }

  const canSimulate = scanId && (scopeType === 'all' || selectedSites.length > 0);

  async function runSim() {
    setSimResult(null); setSimError(null); setSimLoading(true); setStep('preview');
    try {
      const res = await simulateRecycleBin(buildParams());
      setSimResult(res);
    } catch (err) {
      setSimError(apiErrMsg(err));
    } finally {
      setSimLoading(false);
    }
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
      const { jobId } = await executeWithPurgeToken(
        'recycle_bin',
        params,
        (confirmToken) => executeRecycleBinJob(params, confirmToken),
      );
      setShowModal(false); setModalLoading(false); setStep('done');
      startJob(jobId);
    } catch (err) {
      setModalError(apiErrMsg(err)); setModalLoading(false);
    }
  }

  const items       = simResult?.result.items       ?? 0;
  const sizeHuman   = simResult?.result.purgeHuman  ?? '0 B';
  const sitesAffected = simResult?.result.sitesAffected ?? 0;

  return (
    <>
      {showModal && (
        <ConfirmModal
          title="Confirmar Limpeza da Lixeira"
          summaryLines={[
            { label: 'Itens na lixeira',   value: fmtNum(items)          },
            { label: 'Espaço a liberar',   value: sizeHuman              },
            { label: 'Sites afetados',     value: fmtNum(sitesAffected)  },
          ]}
          warningText="Esta operação é irreversível. Os itens serão removidos permanentemente da lixeira do SharePoint."
          onConfirm={handleConfirm}
          onCancel={() => { setShowModal(false); setModalError(null); }}
          loading={modalLoading}
          error={modalError}
        />
      )}

      <StepBar step={step} />

      {/* Config */}
      <div style={s.configPanel}>
        <div style={s.panelHeader}><span style={s.panelTitle}>Escopo da Limpeza</span></div>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Escopo</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['all', 'sites'] as const).map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
                  <input type="radio" name="recycle-scope" value={v} checked={scopeType === v} onChange={() => { setScopeType(v); setSelectedSites([]); }} />
                  {v === 'all' ? 'Todos os sites' : 'Sites específicos'}
                </label>
              ))}
            </div>
            {scopeType === 'sites' && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>
                  {selectedSites.length === 0 ? 'Nenhum site selecionado' : `${selectedSites.length} selecionado(s)`}
                </div>
                <SiteCheckboxList sites={sites} selected={selectedSites} onChange={setSelectedSites} disabled={!scanId} />
              </div>
            )}
          </div>

          <div style={s.infoBox}>
            ℹ A simulação consulta a lixeira do SharePoint para os sites selecionados. O resultado mostra até 5 itens como preview — use "Exportar CSV" para ver o relatório completo.
          </div>
        </div>
        <div style={{ padding: '0 14px 14px' }}>
          <button
            style={{ ...s.btn, ...s.btnAccent, opacity: !canSimulate ? 0.4 : 1 }}
            disabled={!canSimulate}
            onClick={runSim}
          >
            🔍 Consultar Lixeira
          </button>
        </div>
      </div>

      {/* Preview */}
      {(step === 'preview' || step === 'done') && (
        <div style={s.previewPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Preview da Lixeira</span>
            {items > 0 && <span style={{ ...s.countBadge, background: C.bad }}>{fmtNum(items)} item{items !== 1 ? 'ns' : ''}</span>}
          </div>
          {simLoading && <div style={s.loadingMsg}><span style={s.spinner} /> Consultando lixeira…</div>}
          {simError   && <div style={s.errorMsg}>⚠ {simError}</div>}
          {!simLoading && simResult && items === 0 && (
            <div style={s.emptyMsg}>A lixeira está vazia para o escopo selecionado.</div>
          )}
          {simResult && items > 0 && (
            <>
              <div style={s.impactBar}>
                <div style={s.impactStat}><span style={s.impactValue}>{fmtNum(items)}</span><span style={s.impactLabel}>Itens na lixeira</span></div>
                <div style={s.impactDivider} />
                <div style={s.impactStat}><span style={s.impactValue}>{sizeHuman}</span><span style={s.impactLabel}>Espaço a liberar</span></div>
                {sitesAffected > 0 && (
                  <><div style={s.impactDivider} /><div style={s.impactStat}><span style={s.impactValue}>{fmtNum(sitesAffected)}</span><span style={s.impactLabel}>Sites afetados</span></div></>
                )}
              </div>
              {simResult.result.summary && (
                <div style={{ padding: '8px 14px', fontSize: 12, color: C.muted, borderBottom: `1px solid ${C.border}` }}>
                  {simResult.result.summary}
                </div>
              )}
              {simResult.preview.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={s.th}>Item</th>
                      <th style={s.th}>Site</th>
                      <th style={s.th}>Pasta</th>
                      <th style={s.th}>Excluído por</th>
                      <th style={s.th}>Excluído em</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Tamanho</th>
                    </tr></thead>
                    <tbody>
                      {simResult.preview.map((r, i) => (
                        <tr key={i} style={i % 2 === 0 ? s.trEven : s.trOdd}>
                          <td style={s.td}><div style={s.fileName}>{r.leafName || r.title || '—'}</div></td>
                          <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis}>{r.siteName || r.siteId || '—'}</div></td>
                          <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis}>{r.dirName || '—'}</div></td>
                          <td style={{ ...s.td, ...s.cellMuted }}>{r.deletedBy || '—'}</td>
                          <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(r.deletedAt)}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{r.sizeHuman || fmtBytes(r.sizeBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {items > simResult.preview.length && (
                    <div style={{ padding: '8px 14px', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>
                      Exibindo apenas os {simResult.preview.length} primeiros itens. Exporte o CSV para visualizar todos.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {simResult && items > 0 && step !== 'done' && (
            <div style={s.execBar}>
              <div style={s.execWarning}>⚠ Esta operação é <strong>irreversível</strong>.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleExport} disabled={exporting}>
                  {exporting ? '⏳ Exportando…' : '📄 Exportar CSV'}
                </button>
                <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => { setModalError(null); setShowModal(true); }}>
                  🗑 Limpar Lixeira Agora
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Job */}
      {step === 'done' && (
        <div style={s.jobPanel}>
          <div style={s.panelHeader}><span style={s.panelTitle}>Progresso da Limpeza</span></div>
          <div style={{ padding: 14 }}>
            {jobError  && <div style={s.errorMsg}>⚠ {jobError}</div>}
            {transport === 'polling' && <div style={s.fallbackMsg}>Atualização em modo de contingência (polling).</div>}
            {activeJob ? <JobProgress job={activeJob} itemLabel="item" /> : <div style={s.loadingMsg}><span style={s.spinner} /> Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button style={{ ...s.btn, ...s.btnAccent }} onClick={() => { setStep('config'); resetJob(); setSimResult(null); }}>
                  ← Nova Limpeza
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ABA: SITES
// ═════════════════════════════════════════════════════════════════════════════

function SitesTab({
  scanId,
  onJobActivity,
}: {
  scanId: string;
  onJobActivity: (activity: TabJobActivity) => void;
}) {
  const [search,         setSearch]         = useState('');
  const [searchPending,  setSearchPending]  = useState('');    // debounce buffer
  const [simResult,      setSimResult]      = useState<SimulateSitesResult | null>(null);
  const [simLoading,     setSimLoading]     = useState(false);
  const [simError,       setSimError]       = useState<string | null>(null);
  const [selectedIds,    setSelectedIds]    = useState<string[]>([]);

  const [step,         setStep]        = useState<Step>('config');
  const [showModal,    setShowModal]    = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError,   setModalError]  = useState<string | null>(null);

  const { status: activeJob, error: jobError, transport, start: startJob, reset: resetJob } =
    usePurgeJobMonitor(onJobActivity);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Dispara busca com debounce de 400ms
  function handleSearchInput(val: string) {
    setSearchPending(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      runSearch(val);
    }, 400);
  }

  // Busca imediata (Enter ou botão)
  function handleSearchSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearch(searchPending);
    runSearch(searchPending);
  }

  async function runSearch(q: string) {
    if (!scanId) return;
    setSimResult(null); setSimError(null); setSimLoading(true); setSelectedIds([]);
    try {
      const res = await simulateSiteDeletion(scanId, q);
      setSimResult(res);
    } catch (err) {
      setSimError(apiErrMsg(err));
    } finally {
      setSimLoading(false);
    }
  }

  function toggleSite(siteId: string) {
    setSelectedIds(prev =>
      prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId],
    );
  }

  function toggleAll() {
    const all = simResult?.preview ?? [];
    const allSelected = all.length > 0 && all.every(s => selectedIds.includes(s.siteId));
    setSelectedIds(allSelected ? [] : all.map(s => s.siteId));
  }

  // Calcula impacto dos sites selecionados
  const selectedSites: SiteTarget[] = (simResult?.preview ?? []).filter(s => selectedIds.includes(s.siteId));
  const selBytes = selectedSites.reduce((acc, s) => acc + (s.totalBytes ?? 0), 0);
  const selFiles = selectedSites.reduce((acc, s) => acc + (s.filesCount ?? 0), 0);

  async function handleConfirm() {
    if (selectedIds.length === 0) return;
    setModalLoading(true); setModalError(null);
    const params = { scanId, siteIds: selectedIds };
    try {
      const { jobId } = await executeWithPurgeToken(
        'retention_sites',
        params,
        (confirmToken) => executeSiteDeleteJob(scanId, selectedIds, confirmToken),
      );
      setShowModal(false); setModalLoading(false); setStep('done');
      startJob(jobId);
    } catch (err) {
      setModalError(apiErrMsg(err)); setModalLoading(false);
    }
  }

  const preview = simResult?.preview ?? [];
  const allSelected = preview.length > 0 && preview.every(s => selectedIds.includes(s.siteId));

  return (
    <>
      {showModal && (
        <ConfirmModal
          title="Confirmar Exclusão de Sites"
          summaryLines={[
            { label: 'Sites a excluir',  value: fmtNum(selectedSites.length) },
            { label: 'Arquivos totais',  value: fmtNum(selFiles)             },
            { label: 'Volume estimado',  value: fmtBytes(selBytes)           },
            { label: 'Sites',            value: selectedSites.slice(0, 3).map(s => s.siteName || s.siteUrl || s.siteId).join(', ') + (selectedSites.length > 3 ? ` +${selectedSites.length - 3}` : '') },
          ]}
          warningText="Esta operação moverá os sites para a Lixeira do Administrador do M365. É reversível via Central de Administração do Microsoft 365."
          onConfirm={handleConfirm}
          onCancel={() => { setShowModal(false); setModalError(null); }}
          loading={modalLoading}
          error={modalError}
        />
      )}

      <StepBar step={step} />

      {/* Config / Busca */}
      <div style={s.configPanel}>
        <div style={s.panelHeader}><span style={s.panelTitle}>Busca de Sites para Exclusão</span></div>
        <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column' as const, gap: 14 }}>

          {/* Campo de busca */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>Buscar site por nome ou URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={searchPending}
                onChange={e => handleSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
                placeholder="Ex: marketing, comunicacao, /sites/rh…"
                style={{ ...s.input, flex: 1 }}
              />
              <button style={{ ...s.btn, ...s.btnAccent }} onClick={handleSearchSubmit} disabled={simLoading || !scanId}>
                {simLoading ? '⏳' : '🔍'} Buscar
              </button>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Deixe em branco e clique Buscar para listar todos os sites do scan.
            </div>
          </div>

          {/* Erro */}
          {simError && <div style={s.errorMsg}>⚠ {simError}</div>}

          {/* Resultados */}
          {simResult && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 12, color: C.muted }}>
                  {preview.length === 0
                    ? 'Nenhum site encontrado.'
                    : `${preview.length} site${preview.length !== 1 ? 's' : ''} encontrado${preview.length !== 1 ? 's' : ''}${search ? ` para "${search}"` : ''}`}
                </span>
                {preview.length > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={{ ...s.btn, ...s.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={toggleAll}>
                      {allSelected ? 'Desmarcar tudo' : 'Selecionar tudo'}
                    </button>
                    {selectedIds.length > 0 && (
                      <button style={{ ...s.btn, ...s.btnSecondary, padding: '4px 10px', fontSize: 11 }} onClick={() => setSelectedIds([])}>
                        Limpar seleção ({selectedIds.length})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tabela de sites */}
              {preview.length > 0 && (
                <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 4 }}>
                  <table style={s.table}>
                    <thead><tr>
                      <th style={{ ...s.th, width: 36, textAlign: 'center' as const }}>
                        <input type="checkbox" checked={allSelected} onChange={toggleAll} title="Selecionar / desmarcar tudo" />
                      </th>
                      <th style={s.th}>Nome do Site</th>
                      <th style={s.th}>URL</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Volume</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Arquivos</th>
                      <th style={s.th}>Última modificação</th>
                    </tr></thead>
                    <tbody>
                      {preview.map((site, i) => {
                        const checked = selectedIds.includes(site.siteId);
                        return (
                          <tr
                            key={site.siteId}
                            style={{ ...(i % 2 === 0 ? s.trEven : s.trOdd), cursor: 'pointer', background: checked ? '#ebf4ff' : undefined }}
                            onClick={() => toggleSite(site.siteId)}
                          >
                            <td style={{ ...s.td, textAlign: 'center' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleSite(site.siteId)} onClick={e => e.stopPropagation()} />
                            </td>
                            <td style={s.td}><div style={{ ...s.fileName, maxWidth: 220, fontWeight: checked ? 700 : 400 }}>{site.siteName || '—'}</div></td>
                            <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis}>{site.siteUrl || '—'}</div></td>
                            <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>{fmtBytes(site.totalBytes)}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{fmtNum(site.filesCount)}</td>
                            <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(site.lastModified)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Painel de impacto + botão executar */}
        {selectedIds.length > 0 && step !== 'done' && (
          <div style={{ ...s.execBar, borderTop: `1px solid ${DANGER_BORDER}`, background: DANGER_BG }}>
            <div style={{ display: 'flex', gap: 24, flex: 1, flexWrap: 'wrap' as const }}>
              <div style={s.impactStat}>
                <span style={{ ...s.impactValue, fontSize: 18 }}>{fmtNum(selectedIds.length)}</span>
                <span style={s.impactLabel}>Sites selecionados</span>
              </div>
              <div style={s.impactStat}>
                <span style={{ ...s.impactValue, fontSize: 18 }}>{fmtBytes(selBytes)}</span>
                <span style={s.impactLabel}>Volume total</span>
              </div>
              <div style={s.impactStat}>
                <span style={{ ...s.impactValue, fontSize: 18 }}>{fmtNum(selFiles)}</span>
                <span style={s.impactLabel}>Arquivos</span>
              </div>
            </div>
            <button
              style={{ ...s.btn, ...s.btnDanger }}
              onClick={() => { setModalError(null); setShowModal(true); }}
            >
              🗑 Excluir {selectedIds.length} site{selectedIds.length !== 1 ? 's' : ''} selecionado{selectedIds.length !== 1 ? 's' : ''}
            </button>
          </div>
        )}
      </div>

      {/* Job */}
      {step === 'done' && (
        <div style={s.jobPanel}>
          <div style={s.panelHeader}><span style={s.panelTitle}>Progresso da Exclusão de Sites</span></div>
          <div style={{ padding: 14 }}>
            {jobError  && <div style={s.errorMsg}>⚠ {jobError}</div>}
            {transport === 'polling' && <div style={s.fallbackMsg}>Atualização em modo de contingência (polling).</div>}
            {activeJob ? <JobProgress job={activeJob} itemLabel="site" /> : <div style={s.loadingMsg}><span style={s.spinner} /> Iniciando job…</div>}
            {activeJob && TERMINAL_JOB.has(activeJob.status) && (
              <div style={{ marginTop: 16 }}>
                <button style={{ ...s.btn, ...s.btnAccent }} onClick={() => { setStep('config'); resetJob(); setSimResult(null); setSelectedIds([]); }}>
                  ← Nova Busca
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Props compartilhadas entre abas ─────────────────────────────────────────

interface TabSharedProps {
  scanId:  string;
  sites:   SiteRollup[];
  summary: InventorySummary | null;
  onJobActivity: (activity: TabJobActivity) => void;
}

// ═════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════

export default function ExpurgoPage(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabKey>('versions');
  const [scanId,    setScanId]    = useState('');
  const [sites,     setSites]     = useState<SiteRollup[]>([]);
  const [jobActivity, setJobActivity] = useState<Record<TabKey, TabJobActivity>>({
    versions: { jobId: null, status: null, active: false },
    files: { jobId: null, status: null, active: false },
    recycle: { jobId: null, status: null, active: false },
    sites: { jobId: null, status: null, active: false },
  });
  const [tabEpochs, setTabEpochs] = useState<Record<TabKey, number>>({
    versions: 0,
    files: 0,
    recycle: 0,
    sites: 0,
  });

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');

  const { data: summary } = useApi(
    () => scanId ? getInventorySummary(scanId) : Promise.resolve(null),
    [scanId],
  );

  useEffect(() => {
    setSites([]);
    setJobActivity({
      versions: { jobId: null, status: null, active: false },
      files: { jobId: null, status: null, active: false },
      recycle: { jobId: null, status: null, active: false },
      sites: { jobId: null, status: null, active: false },
    });
    if (!scanId) return;
    getInventorySites(scanId, { pageSize: 500 })
      .then(r => setSites(r.items))
      .catch(() => {});
  }, [scanId]);

  const TAB_LABELS: Record<TabKey, string> = {
    versions: '🔖 Versões',
    files:    '📄 Arquivos',
    recycle:  '🗑 Lixeira',
    sites:    '🏢 Sites',
  };

  function updateJobActivity(tab: TabKey, activity: TabJobActivity): void {
    setJobActivity((current) => ({ ...current, [tab]: activity }));
  }

  function changeTab(tab: TabKey): void {
    if (!jobActivity[tab].active) {
      setTabEpochs((current) => ({ ...current, [tab]: current[tab] + 1 }));
    }
    setActiveTab(tab);
  }

  return (
    <>
      <style>{`@keyframes ex-spin { to { transform: rotate(360deg); } }`}</style>

      <div style={s.page}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.pageTitle}>Simulação de Expurgo</div>
            <div style={s.pageSub}>Configure regras de retenção, simule o impacto e execute com confirmação dupla</div>
          </div>
          <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
        </div>

        {/* Seletor de scan (compartilhado) */}
        <div style={s.scanBar}>
          <label style={s.scanBarLabel}>Scan de origem *</label>
          {scansLoading ? (
            <span style={{ fontSize: 12, color: C.muted }}>Carregando…</span>
          ) : (
            <select value={scanId} onChange={e => setScanId(e.target.value)} style={{ ...s.select, minWidth: 320 }}>
              <option value="">— selecione um scan concluído —</option>
              {completedScans.map(sc => (
                <option key={sc.id} value={sc.id}>
                  {sc.id.slice(0, 16)}…  ·  {fmtNum(sc.totalFiles)} arqs  ·  {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          )}
          {summary && scanId && (
            <span style={{ fontSize: 11, color: C.muted }}>
              {fmtNum(summary.totalFiles)} arqs · {fmtBytes(summary.totalBytes)} · {fmtNum(summary.totalSites)} sites
            </span>
          )}
        </div>

        {/* Tab bar */}
        <div style={s.tabBar}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map(tab => (
            <button
              key={tab}
              style={{
                ...s.tabBtn,
                ...(activeTab === tab ? s.tabBtnActive : {}),
              }}
              onClick={() => changeTab(tab)}
            >
              {TAB_LABELS[tab]}
              {jobActivity[tab].active && <span style={s.tabJobBadge}>Ativo</span>}
            </button>
          ))}
        </div>

        {/* Aviso se sem scan */}
        {!scanId && (
          <div style={s.warnBox}>Selecione um scan concluído acima para habilitar as simulações.</div>
        )}

        {/* As abas permanecem montadas para preservar jobs em andamento. */}
        {scanId && (
          <>
            <div style={{ display: activeTab === 'versions' ? 'block' : 'none' }}>
              <VersionsTab
                key={`${scanId}-versions-${tabEpochs.versions}`}
                scanId={scanId}
                sites={sites}
                summary={summary}
                onJobActivity={(activity) => updateJobActivity('versions', activity)}
              />
            </div>
            <div style={{ display: activeTab === 'files' ? 'block' : 'none' }}>
              <FilesTab
                key={`${scanId}-files-${tabEpochs.files}`}
                scanId={scanId}
                sites={sites}
                summary={summary}
                onJobActivity={(activity) => updateJobActivity('files', activity)}
              />
            </div>
            <div style={{ display: activeTab === 'recycle' ? 'block' : 'none' }}>
              <RecycleTab
                key={`${scanId}-recycle-${tabEpochs.recycle}`}
                scanId={scanId}
                sites={sites}
                summary={summary}
                onJobActivity={(activity) => updateJobActivity('recycle', activity)}
              />
            </div>
            <div style={{ display: activeTab === 'sites' ? 'block' : 'none' }}>
              <SitesTab
                key={`${scanId}-sites-${tabEpochs.sites}`}
                scanId={scanId}
                onJobActivity={(activity) => updateJobActivity('sites', activity)}
              />
            </div>
          </>
        )}

      </div>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily:    "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    color:         C.text,
    display:       'flex',
    flexDirection: 'column',
    gap:           12,
  },

  header: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', flexWrap: 'wrap', gap: 8,
  },
  pageTitle:  { fontSize: 22, fontWeight: 800, lineHeight: 1.2 },
  pageSub:    { fontSize: 12, color: C.muted, marginTop: 2 },
  breadcrumb: { fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600, alignSelf: 'flex-end' },

  scanBar: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 14px',
  },
  scanBarLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0 },

  tabBar: {
    display: 'flex', gap: 0,
    background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden',
  },
  tabBtn: {
    flex: 1, padding: '10px 16px', border: 'none', background: 'transparent',
    fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer',
    borderRight: `1px solid ${C.border}`, fontFamily: 'inherit',
    transition: 'background .15s, color .15s',
  },
  tabBtnActive: {
    background: C.accent, color: '#fff',
  },
  tabJobBadge: {
    marginLeft: 7, padding: '1px 6px', borderRadius: 10,
    background: '#dbeafe', color: '#1e40af', fontSize: 9, fontWeight: 800,
  },

  stepper: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '10px 16px',
  },
  stepItem: { fontSize: 12, letterSpacing: '.02em' },
  stepSep:  { fontSize: 14, color: C.muted },

  configPanel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
    background: '#f7f9fb',
  },
  panelTitle: {
    fontSize: 12, fontWeight: 800, color: C.text,
    textTransform: 'uppercase', letterSpacing: '.06em',
  },
  configGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14, padding: '16px 14px',
  },
  fieldGroup:   { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel:   { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' },
  select: {
    padding: '7px 10px', border: `1px solid ${C.border}`,
    borderRadius: 4, fontSize: 12, color: C.text,
    background: C.panel, fontFamily: 'inherit', cursor: 'pointer',
  },
  input: {
    padding: '7px 10px', border: `1px solid ${C.border}`,
    borderRadius: 4, fontSize: 12, color: C.text,
    background: C.panel, fontFamily: 'inherit',
  },
  ruleSummary: {
    display: 'flex', alignItems: 'baseline', gap: 6,
    padding: '8px 14px', background: '#ebf4ff',
    borderTop: `1px solid ${C.border}`,
  },
  ruleSummaryLabel: { fontSize: 10, fontWeight: 700, color: C.accent, textTransform: 'uppercase', letterSpacing: '.05em', flexShrink: 0 },
  ruleSummaryText:  { fontSize: 12, color: C.text },
  warnBox: {
    margin: '0 14px 14px',
    padding: '10px 12px',
    background: '#fffbeb', border: `1px solid #fde68a`,
    borderRadius: 4, fontSize: 12, color: '#78350f',
  },
  infoBox: {
    padding: '10px 12px',
    background: '#ebf4ff', border: `1px solid #bee3f8`,
    borderRadius: 4, fontSize: 12, color: '#2c5282',
  },

  previewPanel: {
    background: C.panel, border: `1px solid ${DANGER_BORDER}`,
    borderRadius: 6, overflow: 'hidden',
  },
  impactBar: {
    display: 'flex', alignItems: 'center', gap: 0,
    background: DANGER_BG, borderBottom: `1px solid ${DANGER_BORDER}`,
    padding: '12px 16px', flexWrap: 'wrap',
  },
  impactStat:    { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 20px 0 0' },
  impactValue:   { fontSize: 22, fontWeight: 800, color: DANGER },
  impactLabel:   { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' },
  impactDivider: { width: 1, height: 40, background: DANGER_BORDER, margin: '0 20px 0 0', flexShrink: 0 },
  impactNote:    { fontSize: 11, color: C.muted, fontStyle: 'italic' },

  execBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '12px 14px', flexWrap: 'wrap',
    background: DANGER_BG, borderTop: `1px solid ${DANGER_BORDER}`,
  },
  execWarning: { fontSize: 12, color: DANGER, flex: 1 },

  jobPanel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, overflow: 'hidden',
  },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px', textAlign: 'left',
    fontWeight: 700, fontSize: 10, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '.05em',
    background: '#f7f9fb', borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap',
  },
  trEven:      { background: C.panel },
  trOdd:       { background: '#f9fafb' },
  td:          { padding: '7px 10px', verticalAlign: 'middle', borderBottom: '1px solid #edf0f4' },
  cellMuted:   { color: C.muted, fontSize: 11 },
  fileName:    { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 },
  fileLink:    { color: C.accent, textDecoration: 'none', fontWeight: 600 },
  cellEllipsis:{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 },
  extBadge: {
    display: 'inline-block', background: '#e8f0f8', color: C.accent,
    borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
  },
  countBadge: { color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 },

  loadingMsg: { display: 'flex', alignItems: 'center', gap: 8, padding: '24px 14px', color: C.muted, fontSize: 13 },
  emptyMsg:   { padding: '32px 14px', textAlign: 'center', color: C.muted, fontSize: 13 },
  errorMsg:   { padding: '14px', color: C.bad, fontSize: 13, fontWeight: 600 },
  fallbackMsg:{ padding: '6px 14px', color: C.warn, fontSize: 11, fontWeight: 600 },

  spinner: {
    display: 'inline-block', width: 12, height: 12,
    border: `2px solid ${C.border}`, borderTopColor: C.accent,
    borderRadius: '50%', animation: 'ex-spin 0.7s linear infinite', flexShrink: 0,
  },

  btn: {
    padding: '8px 18px', borderRadius: 4, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', border: '1px solid transparent',
    transition: 'opacity .15s', whiteSpace: 'nowrap',
  },
  btnAccent:    { background: C.accent, color: '#fff', borderColor: C.accent },
  btnDanger:    { background: DANGER,   color: '#fff', borderColor: DANGER   },
  btnSecondary: { background: C.panel,  color: C.text, borderColor: C.border },
};

// ─── Modal styles ─────────────────────────────────────────────────────────────

const ms: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  modal: {
    background: C.panel, borderRadius: 8, padding: '28px 32px',
    maxWidth: 480, width: '90%', display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,.35)', border: `2px solid ${DANGER_BORDER}`,
  },
  modalHeader:  { display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 800, color: DANGER },
  dangerIcon:   { fontSize: 22 },
  summary: {
    background: DANGER_BG, border: `1px solid ${DANGER_BORDER}`,
    borderRadius: 5, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  summaryRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  summaryLabel: { fontSize: 11, color: C.muted },
  summaryValue: { fontSize: 14, fontWeight: 800, color: DANGER },
  warning: {
    background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 4, padding: '10px 12px', fontSize: 12, color: '#78350f', lineHeight: 1.5,
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  inputLabel: { fontSize: 12, color: C.text },
  input: {
    padding: '8px 12px', border: `2px solid ${C.border}`, borderRadius: 4,
    fontSize: 14, fontFamily: 'monospace', letterSpacing: '.1em', fontWeight: 700, color: C.text,
    outline: 'none', transition: 'border-color .15s',
  },
  errorBox: {
    background: DANGER_BG, border: `1px solid ${DANGER_BORDER}`,
    borderRadius: 4, padding: '8px 12px', fontSize: 12, color: DANGER, fontWeight: 600,
  },
  modalFooter: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  btn:         { padding: '8px 18px', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid transparent', transition: 'opacity .15s' },
  btnCancel:   { background: C.panel, color: C.muted, borderColor: C.border },
  btnDanger:   { background: DANGER,  color: '#fff',  borderColor: DANGER   },
};

// ─── Job progress styles ──────────────────────────────────────────────────────

const jp: Record<string, React.CSSProperties> = {
  wrap:    { display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' },
  header:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:   { fontSize: 13, fontWeight: 700 },
  badge:   { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10 },
  barTrack:{ height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5, transition: 'width .5s ease' },
  stats:   { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted },
  running: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.accent },
  spinner: { display: 'inline-block', width: 12, height: 12, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'ex-spin 0.7s linear infinite', flexShrink: 0 },
  doneMsg: { fontSize: 13, color: C.good,  fontWeight: 600 },
  failedMsg:{ fontSize: 13, color: C.bad,  fontWeight: 600 },
};
