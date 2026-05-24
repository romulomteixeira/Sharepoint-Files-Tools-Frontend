/**
 * ExpurgoPage.tsx — Simulação e execução de expurgo (Sprint 16)
 *
 * Fluxo em 3 etapas:
 *   1. CONFIGURAR — scan + regras de retenção (extensão, idade, tamanho, site)
 *   2. SIMULAR    — preview dos arquivos que seriam expurgados (getInventoryFiles)
 *   3. CONFIRMAR  — modal com aviso, input "CONFIRMAR", token duplo e job assíncrono
 *
 * Segurança:
 *   - Modo simulação sempre disponível; execução requer confirmação dupla
 *   - requestPurgeToken + executePurgeJob com mesmo payload (backend valida hash)
 *   - Visual claramente diferenciado entre simulação (azul) e execução (vermelho)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { getInventorySummary, getInventorySites } from '../api/inventory.api';
import { getInventoryFiles } from '../api/inventory.api';
import { requestPurgeToken, executePurgeJob, getPurgeJobStatus } from '../api/purge.api';
import type { FileItem, SiteRollup, JobStatusDetail } from '../types';
import type { PurgeRule } from '../api/purge.api';
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

const DANGER = '#991b1b';
const DANGER_BG = '#fff5f5';
const DANGER_BORDER = '#fca5a5';

// ─── Constantes ───────────────────────────────────────────────────────────────

type Step = 'config' | 'preview' | 'done';

const JOB_POLL_MS  = 3_000;
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
  { value: '1',    label: 'Maior que 1 MB'   },
  { value: '10',   label: 'Maior que 10 MB'  },
  { value: '100',  label: 'Maior que 100 MB' },
  { value: '500',  label: 'Maior que 500 MB' },
  { value: '1024', label: 'Maior que 1 GB'   },
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

function buildRule(
  scanId: string,
  ext: string,
  olderDays: string,
  largerMb: string,
  siteId: string,
): PurgeRule {
  return {
    scanId,
    extensions:    ext       ? [ext]             : undefined,
    olderThanDays: olderDays ? Number(olderDays) : undefined,
    largerThanMb:  largerMb  ? Number(largerMb)  : undefined,
    siteId:        siteId    || undefined,
  };
}

function describeRule(rule: PurgeRule): string {
  const parts: string[] = [];
  if (rule.extensions?.length) parts.push(`ext: ${rule.extensions.join(', ')}`);
  if (rule.olderThanDays)       parts.push(`não modificado há ${rule.olderThanDays} dias`);
  if (rule.largerThanMb)        parts.push(`> ${rule.largerThanMb} MB`);
  if (rule.siteId)              parts.push(`site: ${rule.siteId.slice(0, 12)}…`);
  return parts.length ? parts.join(' · ') : 'sem filtros específicos';
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  previewCount,
  previewBytes,
  ruleDescription,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  previewCount: number;
  previewBytes: number;
  ruleDescription: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [input, setInput] = useState('');
  const KEYWORD = 'CONFIRMAR';

  return (
    <div style={ms.overlay}>
      <div style={ms.modal}>

        {/* Título de perigo */}
        <div style={ms.modalHeader}>
          <span style={ms.dangerIcon}>⚠</span>
          <span>Confirmar Expurgo Permanente</span>
        </div>

        {/* Resumo */}
        <div style={ms.summary}>
          <div style={ms.summaryRow}>
            <span style={ms.summaryLabel}>Arquivos a remover</span>
            <span style={ms.summaryValue}>{fmtNum(previewCount)}</span>
          </div>
          <div style={ms.summaryRow}>
            <span style={ms.summaryLabel}>Espaço a liberar</span>
            <span style={ms.summaryValue}>{fmtBytes(previewBytes)}</span>
          </div>
          <div style={ms.summaryRow}>
            <span style={ms.summaryLabel}>Regras aplicadas</span>
            <span style={{ ...ms.summaryValue, fontSize: 11 }}>{ruleDescription}</span>
          </div>
        </div>

        {/* Aviso */}
        <div style={ms.warning}>
          <strong>Esta operação é irreversível.</strong> Os arquivos serão movidos para a Lixeira do SharePoint
          e permanentemente removidos após o período de retenção configurado no tenant.
          Verifique o preview antes de prosseguir.
        </div>

        {/* Input de confirmação */}
        <div style={ms.inputGroup}>
          <label style={ms.inputLabel}>
            Digite <strong>{KEYWORD}</strong> para habilitar o botão de execução:
          </label>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder={KEYWORD}
            style={{
              ...ms.input,
              borderColor: input === KEYWORD ? C.good : C.border,
            }}
            autoFocus
          />
        </div>

        {error && <div style={ms.errorBox}>⚠ {error}</div>}

        {/* Botões */}
        <div style={ms.modalFooter}>
          <button style={{ ...ms.btn, ...ms.btnCancel }} onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button
            style={{
              ...ms.btn,
              ...ms.btnDanger,
              opacity: (input !== KEYWORD || loading) ? 0.4 : 1,
            }}
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

function JobProgress({ job }: { job: JobStatusDetail }) {
  const total     = job.progress.total     || 0;
  const completed = job.progress.completed || 0;
  const failed    = job.progress.failed    || 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const isDone     = job.status === 'completed';
  const isFailed   = job.status === 'failed' || job.status === 'cancelled';
  const isRunning  = job.status === 'running' || job.status === 'pending';

  return (
    <div style={jp.wrap}>
      <div style={jp.header}>
        <span style={jp.title}>Job de Expurgo</span>
        <span style={{
          ...jp.badge,
          background: isDone ? '#d1fae5' : isFailed ? '#fee2e2' : '#dbeafe',
          color:      isDone ? '#065f46' : isFailed ? '#991b1b' : '#1e40af',
        }}>
          {isDone ? '✓ Concluído' : isFailed ? '✗ Falhou' : '⏳ Em andamento'}
        </span>
      </div>

      {/* Barra de progresso */}
      <div style={jp.barTrack}>
        <div style={{
          ...jp.barFill,
          width: `${pct}%`,
          background: isDone ? C.good : isFailed ? C.bad : C.accent,
        }} />
      </div>
      <div style={jp.stats}>
        <span>{pct}% concluído</span>
        <span>✓ {fmtNum(completed)} · ✗ {fmtNum(failed)} · total {fmtNum(total)}</span>
      </div>

      {isRunning && (
        <div style={jp.running}>
          <span style={jp.spinner} /> Processando arquivos…
        </div>
      )}

      {isDone && (
        <div style={jp.doneMsg}>
          ✓ Expurgo concluído. {fmtNum(completed)} arquivo{completed !== 1 ? 's' : ''} removido{completed !== 1 ? 's' : ''}.
          {failed > 0 && <span style={{ color: C.warn }}> {fmtNum(failed)} falha{failed !== 1 ? 's' : ''}.</span>}
        </div>
      )}

      {isFailed && (
        <div style={jp.failedMsg}>
          ✗ Job {job.status}.{job.lastError ? ` Erro: ${job.lastError}` : ''}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ExpurgoPage(): React.ReactElement {
  // ── Step atual
  const [step, setStep] = useState<Step>('config');

  // ── Config
  const [scanId,     setScanId]     = useState('');
  const [filterExt,  setFilterExt]  = useState('');
  const [filterAge,  setFilterAge]  = useState('');
  const [filterSize, setFilterSize] = useState('');
  const [filterSite, setFilterSite] = useState('');

  // ── Preview
  const [previewFiles,   setPreviewFiles]   = useState<FileItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState<string | null>(null);
  const [totalMatches,   setTotalMatches]   = useState(0);  // após filtro client-side

  // ── Sites para dropdown
  const [sites, setSites] = useState<SiteRollup[]>([]);

  // ── Modal de confirmação
  const [showModal,    setShowModal]    = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError,   setModalError]   = useState<string | null>(null);

  // ── Job em andamento
  const [activeJob,    setActiveJob]    = useState<JobStatusDetail | null>(null);
  const [jobError,     setJobError]     = useState<string | null>(null);
  const jobPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dados gerais
  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');

  const { data: summary } = useApi(
    () => scanId ? getInventorySummary(scanId) : Promise.resolve(null),
    [scanId],
  );

  // ── Carrega sites ao mudar scan
  useEffect(() => {
    setSites([]);
    setFilterSite('');
    if (!scanId) return;
    getInventorySites(scanId, { pageSize: 500 })
      .then(r => setSites(r.items))
      .catch(() => {});
  }, [scanId]);

  // ── Cleanup polling
  useEffect(() => {
    return () => { if (jobPollRef.current) clearInterval(jobPollRef.current); };
  }, []);

  // ── Simular: carrega arquivos e aplica filtros client-side
  async function runPreview() {
    if (!scanId) return;
    setPreviewFiles([]);
    setPreviewError(null);
    setPreviewLoading(true);
    setStep('preview');

    try {
      const resp = await getInventoryFiles(scanId, {
        extension: filterExt   || undefined,
        siteId:    filterSite  || undefined,
        sort:      'size_desc',
        pageSize:  500,   // pega amostra maior para filtrar client-side
      });

      // Aplica filtros de idade e tamanho client-side
      const cutoffDate = filterAge  ? daysAgo(Number(filterAge)) : null;
      const minBytes   = filterSize ? Number(filterSize) * 1024 * 1024 : null;

      const filtered = resp.items.filter(f => {
        if (cutoffDate && f.modifiedAt) {
          if (new Date(f.modifiedAt) > cutoffDate) return false;
        }
        if (minBytes && (f.totalBytes ?? 0) < minBytes) return false;
        return true;
      });

      setTotalMatches(filtered.length);
      setPreviewFiles(filtered.slice(0, PREVIEW_LIMIT));
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Erro ao carregar preview');
    } finally {
      setPreviewLoading(false);
    }
  }

  // ── Abrir modal de confirmação
  function openConfirmModal() {
    setModalError(null);
    setShowModal(true);
  }

  // ── Executar expurgo (chamado pelo modal após input "CONFIRMAR")
  async function handleConfirm() {
    setModalLoading(true);
    setModalError(null);

    const rule = buildRule(scanId, filterExt, filterAge, filterSize, filterSite);

    try {
      // Passo 1: solicitar token de confirmação
      const { confirmToken } = await requestPurgeToken(rule);

      // Passo 2: executar o job com o token
      const { jobId } = await executePurgeJob(rule, confirmToken);

      setShowModal(false);
      setModalLoading(false);
      setStep('done');
      startJobPolling(jobId);

    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Erro ao iniciar expurgo';
      setModalError(msg);
      setModalLoading(false);
    }
  }

  // ── Polling do job de expurgo
  function startJobPolling(jobId: string) {
    if (jobPollRef.current) clearInterval(jobPollRef.current);

    // Busca status inicial imediatamente
    getPurgeJobStatus(jobId)
      .then(j => setActiveJob(j))
      .catch(() => {});

    jobPollRef.current = setInterval(async () => {
      try {
        const job = await getPurgeJobStatus(jobId);
        setActiveJob(job);
        if (TERMINAL_JOB.has(job.status)) {
          clearInterval(jobPollRef.current!);
          jobPollRef.current = null;
        }
      } catch (err) {
        clearInterval(jobPollRef.current!);
        jobPollRef.current = null;
        setJobError(err instanceof Error ? err.message : 'Erro ao monitorar job');
      }
    }, JOB_POLL_MS);
  }

  // ── Derivados
  const rule = buildRule(scanId, filterExt, filterAge, filterSize, filterSite);
  const ruleDesc = describeRule(rule);
  const hasRule = !!(filterExt || filterAge || filterSize || filterSite);

  const previewBytes = useMemo(
    () => previewFiles.reduce((acc, f) => acc + (f.totalBytes ?? 0), 0),
    [previewFiles],
  );

  return (
    <>
      <style>{`@keyframes ex-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Modal de confirmação ──────────────────────────────────────────── */}
      {showModal && (
        <ConfirmModal
          previewCount={totalMatches}
          previewBytes={previewBytes}
          ruleDescription={ruleDesc}
          onConfirm={handleConfirm}
          onCancel={() => { setShowModal(false); setModalError(null); }}
          loading={modalLoading}
          error={modalError}
        />
      )}

      <div style={s.page}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={s.header}>
          <div>
            <div style={s.pageTitle}>Simulação de Expurgo</div>
            <div style={s.pageSub}>Configure regras de retenção, simule o impacto e execute com confirmação dupla</div>
          </div>
          <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
        </div>

        {/* ── Stepper ─────────────────────────────────────────────────────── */}
        <div style={s.stepper}>
          {(['config', 'preview', 'done'] as Step[]).map((st, i) => {
            const labels = ['1. Configurar', '2. Simular', '3. Executar'];
            const isActive = step === st;
            const isPast   = (
              (st === 'config'  && (step === 'preview' || step === 'done')) ||
              (st === 'preview' && step === 'done')
            );
            return (
              <React.Fragment key={st}>
                <div style={{
                  ...s.stepItem,
                  color:      isActive ? C.accent : isPast ? C.good : C.muted,
                  fontWeight: isActive ? 800 : 600,
                }}>
                  {isPast ? '✓ ' : ''}{labels[i]}
                </div>
                {i < 2 && <div style={s.stepSep}>›</div>}
              </React.Fragment>
            );
          })}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  STEP 1 — CONFIGURAR                                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        <div style={s.configPanel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Configuração das Regras</span>
          </div>

          <div style={s.configGrid}>

            {/* Scan */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Scan de origem *</label>
              {scansLoading ? (
                <div style={s.loadingText}>Carregando…</div>
              ) : (
                <select
                  value={scanId}
                  onChange={e => setScanId(e.target.value)}
                  style={s.select}
                >
                  <option value="">— selecione um scan concluído —</option>
                  {completedScans.map(sc => (
                    <option key={sc.id} value={sc.id}>
                      {sc.id.slice(0, 16)}…  ·  {fmtNum(sc.totalFiles)} arqs  ·  {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                    </option>
                  ))}
                </select>
              )}
              {summary && scanId && (
                <div style={s.scanMini}>
                  {fmtNum(summary.totalFiles)} arqs · {fmtBytes(summary.totalBytes)} · {fmtNum(summary.totalSites)} sites
                </div>
              )}
            </div>

            {/* Extensão */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Extensão alvo</label>
              <select
                value={filterExt}
                onChange={e => setFilterExt(e.target.value)}
                disabled={!scanId}
                style={{ ...s.select, opacity: !scanId ? 0.5 : 1 }}
              >
                <option value="">Todas as extensões</option>
                {(summary?.topExtensions ?? []).map(e => (
                  <option key={e.extension} value={e.extension}>
                    {e.extension || '(sem ext)'}  ·  {fmtNum(e.fileCount)} arqs  ·  {fmtBytes(e.totalBytes)}
                  </option>
                ))}
              </select>
            </div>

            {/* Site */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Restringir a site</label>
              <select
                value={filterSite}
                onChange={e => setFilterSite(e.target.value)}
                disabled={!scanId}
                style={{ ...s.select, opacity: !scanId ? 0.5 : 1 }}
              >
                <option value="">Todos os sites</option>
                {sites.map(st => (
                  <option key={st.siteId} value={st.siteId}>
                    {st.siteName || st.siteUrl}  ({fmtNum(st.totalFiles)})
                  </option>
                ))}
              </select>
            </div>

            {/* Idade */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Idade do arquivo</label>
              <select
                value={filterAge}
                onChange={e => setFilterAge(e.target.value)}
                style={s.select}
              >
                {AGE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Tamanho */}
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>Tamanho mínimo</label>
              <select
                value={filterSize}
                onChange={e => setFilterSize(e.target.value)}
                style={s.select}
              >
                {SIZE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

          </div>

          {/* Resumo das regras */}
          {hasRule && scanId && (
            <div style={s.ruleSummary}>
              <span style={s.ruleSummaryLabel}>Regra atual:</span>
              <span style={s.ruleSummaryText}>{ruleDesc}</span>
            </div>
          )}

          {/* Aviso se sem filtros */}
          {!hasRule && scanId && (
            <div style={s.warnBox}>
              ⚠ Nenhuma regra configurada. Sem filtros, o expurgo afetaria <strong>todos</strong> os arquivos do scan.
              Configure ao menos uma regra antes de simular.
            </div>
          )}

          {/* Botão simular */}
          <button
            style={{
              ...s.btn, ...s.btnAccent,
              opacity: (!scanId || !hasRule) ? 0.4 : 1,
              marginTop: 4,
            }}
            disabled={!scanId || !hasRule}
            onClick={runPreview}
          >
            🔍 Simular — ver arquivos afetados
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  STEP 2 — PREVIEW                                                 */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {(step === 'preview' || step === 'done') && (
          <div style={s.previewPanel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Preview do Expurgo</span>
              {totalMatches > 0 && (
                <span style={{ ...s.countBadge, background: C.bad }}>
                  {fmtNum(totalMatches)} arquivo{totalMatches !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {previewLoading && (
              <div style={s.loadingMsg}><span style={s.spinner} /> Calculando impacto…</div>
            )}

            {previewError && <div style={s.errorMsg}>⚠ {previewError}</div>}

            {!previewLoading && previewFiles.length === 0 && !previewError && (
              <div style={s.emptyMsg}>
                Nenhum arquivo corresponde às regras configuradas. Ajuste os filtros e simule novamente.
              </div>
            )}

            {previewFiles.length > 0 && (
              <>
                {/* Sumário de impacto */}
                <div style={s.impactBar}>
                  <div style={s.impactStat}>
                    <span style={s.impactValue}>{fmtNum(totalMatches)}</span>
                    <span style={s.impactLabel}>Arquivos afetados</span>
                  </div>
                  <div style={s.impactDivider} />
                  <div style={s.impactStat}>
                    <span style={s.impactValue}>{fmtBytes(previewBytes)}</span>
                    <span style={s.impactLabel}>Espaço a liberar</span>
                  </div>
                  {totalMatches > PREVIEW_LIMIT && (
                    <>
                      <div style={s.impactDivider} />
                      <div style={s.impactNote}>
                        Mostrando {PREVIEW_LIMIT} de {fmtNum(totalMatches)} arquivos
                      </div>
                    </>
                  )}
                </div>

                {/* Tabela de preview */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Nome</th>
                        <th style={s.th}>Site</th>
                        <th style={s.th}>Ext</th>
                        <th style={{ ...s.th, textAlign: 'right' as const }}>Tamanho</th>
                        <th style={s.th}>Modificado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewFiles.map((f, idx) => (
                        <tr key={f.id} style={idx % 2 === 0 ? s.trEven : s.trOdd}>
                          <td style={s.td}>
                            <div style={s.fileName}>
                              {f.webUrl
                                ? <a href={f.webUrl} target="_blank" rel="noreferrer" style={s.fileLink} title={f.name}>{f.name}</a>
                                : <span title={f.name}>{f.name}</span>}
                            </div>
                          </td>
                          <td style={{ ...s.td, ...s.cellMuted }}>
                            <div style={s.cellEllipsis}>{f.siteId}</div>
                          </td>
                          <td style={s.td}>
                            <span style={s.extBadge}>{f.extension || '—'}</span>
                          </td>
                          <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>
                            {fmtBytes(f.totalBytes)}
                          </td>
                          <td style={{ ...s.td, ...s.cellMuted }}>{fmtDate(f.modifiedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Botão executar */}
            {previewFiles.length > 0 && step !== 'done' && (
              <div style={s.execBar}>
                <div style={s.execWarning}>
                  ⚠ Esta operação é <strong>irreversível</strong>. Os arquivos serão removidos permanentemente.
                </div>
                <button
                  style={{ ...s.btn, ...s.btnDanger }}
                  onClick={openConfirmModal}
                >
                  🗑 Executar Expurgo Agora
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/*  STEP 3 — JOB EM ANDAMENTO / CONCLUÍDO                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {step === 'done' && (
          <div style={s.jobPanel}>
            <div style={s.panelHeader}>
              <span style={s.panelTitle}>Progresso do Expurgo</span>
            </div>
            <div style={{ padding: '14px' }}>
              {jobError && <div style={s.errorMsg}>⚠ {jobError}</div>}
              {activeJob
                ? <JobProgress job={activeJob} />
                : <div style={s.loadingMsg}><span style={s.spinner} /> Iniciando job…</div>}

              {activeJob && TERMINAL_JOB.has(activeJob.status) && (
                <div style={{ marginTop: 16 }}>
                  <button
                    style={{ ...s.btn, ...s.btnAccent }}
                    onClick={() => { setStep('config'); setActiveJob(null); setPreviewFiles([]); }}
                  >
                    ← Novo Expurgo
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start', flexWrap: 'wrap', gap: 8,
  },
  pageTitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.2 },
  pageSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  breadcrumb: { fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600, alignSelf: 'flex-end' },

  stepper: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '10px 16px',
  },
  stepItem: { fontSize: 12, letterSpacing: '.02em' },
  stepSep:  { fontSize: 14, color: C.muted },

  // Config panel
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
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 14, padding: '16px 14px',
  },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' },
  select: {
    padding: '7px 10px', border: `1px solid ${C.border}`,
    borderRadius: 4, fontSize: 12, color: C.text,
    background: C.panel, fontFamily: 'inherit', cursor: 'pointer',
  },
  scanMini: {
    fontSize: 10, color: C.muted, marginTop: 2,
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

  // Preview panel
  previewPanel: {
    background: C.panel, border: `1px solid ${DANGER_BORDER}`,
    borderRadius: 6, overflow: 'hidden',
  },
  impactBar: {
    display: 'flex', alignItems: 'center', gap: 0,
    background: DANGER_BG, borderBottom: `1px solid ${DANGER_BORDER}`,
    padding: '12px 16px',
  },
  impactStat: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 20px 0 0' },
  impactValue: { fontSize: 22, fontWeight: 800, color: DANGER },
  impactLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' },
  impactDivider: { width: 1, height: 40, background: DANGER_BORDER, margin: '0 20px 0 0', flexShrink: 0 },
  impactNote: { fontSize: 11, color: C.muted, fontStyle: 'italic' },

  execBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, padding: '12px 14px', flexWrap: 'wrap',
    background: DANGER_BG, borderTop: `1px solid ${DANGER_BORDER}`,
  },
  execWarning: { fontSize: 12, color: DANGER, flex: 1 },

  // Job panel
  jobPanel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, overflow: 'hidden',
  },

  // Table
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px', textAlign: 'left',
    fontWeight: 700, fontSize: 10, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '.05em',
    background: '#f7f9fb', borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap',
  },
  trEven: { background: C.panel },
  trOdd:  { background: '#f9fafb' },
  td:     { padding: '7px 10px', verticalAlign: 'middle', borderBottom: '1px solid #edf0f4' },
  cellMuted: { color: C.muted, fontSize: 11 },
  fileName:  { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 },
  fileLink:  { color: C.accent, textDecoration: 'none', fontWeight: 600 },
  cellEllipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 },
  extBadge: {
    display: 'inline-block', background: '#e8f0f8', color: C.accent,
    borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
  },
  countBadge: {
    color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
  },

  loadingMsg: { display: 'flex', alignItems: 'center', gap: 8, padding: '24px 14px', color: C.muted, fontSize: 13 },
  loadingText: { fontSize: 12, color: C.muted },
  emptyMsg:   { padding: '32px 14px', textAlign: 'center', color: C.muted, fontSize: 13 },
  errorMsg:   { padding: '14px', color: C.bad, fontSize: 13, fontWeight: 600 },

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
  btnAccent: { background: C.accent, color: '#fff', borderColor: C.accent },
  btnDanger: { background: DANGER,   color: '#fff', borderColor: DANGER   },

  mono: { fontFamily: 'monospace', fontSize: 11 },
};

// ─── Modal styles ─────────────────────────────────────────────────────────────

const ms: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  modal: {
    background: C.panel, borderRadius: 8,
    padding: '28px 32px',
    maxWidth: 480, width: '90%',
    display: 'flex', flexDirection: 'column', gap: 16,
    boxShadow: '0 20px 60px rgba(0,0,0,.35)',
    border: `2px solid ${DANGER_BORDER}`,
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    fontSize: 18, fontWeight: 800, color: DANGER,
  },
  dangerIcon: { fontSize: 22 },

  summary: {
    background: DANGER_BG, border: `1px solid ${DANGER_BORDER}`,
    borderRadius: 5, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  summaryRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  summaryLabel: { fontSize: 11, color: C.muted },
  summaryValue: { fontSize: 14, fontWeight: 800, color: DANGER },

  warning: {
    background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 4, padding: '10px 12px',
    fontSize: 12, color: '#78350f', lineHeight: 1.5,
  },

  inputGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  inputLabel: { fontSize: 12, color: C.text },
  input: {
    padding: '8px 12px', border: `2px solid ${C.border}`,
    borderRadius: 4, fontSize: 14, fontFamily: 'monospace',
    letterSpacing: '.1em', fontWeight: 700, color: C.text,
    outline: 'none', transition: 'border-color .15s',
  },

  errorBox: {
    background: DANGER_BG, border: `1px solid ${DANGER_BORDER}`,
    borderRadius: 4, padding: '8px 12px',
    fontSize: 12, color: DANGER, fontWeight: 600,
  },

  modalFooter: {
    display: 'flex', gap: 10, justifyContent: 'flex-end',
  },
  btn: {
    padding: '8px 18px', borderRadius: 4, fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit', border: '1px solid transparent', transition: 'opacity .15s',
  },
  btnCancel: { background: C.panel, color: C.muted, borderColor: C.border },
  btnDanger: { background: DANGER,   color: '#fff', borderColor: DANGER   },
};

// ─── Job progress styles ──────────────────────────────────────────────────────

const jp: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '4px 0',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title:  { fontSize: 13, fontWeight: 700 },
  badge:  { fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10 },

  barTrack: { height: 10, background: '#e2e8f0', borderRadius: 5, overflow: 'hidden' },
  barFill:  { height: '100%', borderRadius: 5, transition: 'width .5s ease' },

  stats: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted },

  running: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, color: C.accent,
  },
  spinner: {
    display: 'inline-block', width: 12, height: 12,
    border: `2px solid ${C.border}`, borderTopColor: C.accent,
    borderRadius: '50%', animation: 'ex-spin 0.7s linear infinite', flexShrink: 0,
  },
  doneMsg:   { fontSize: 13, color: C.good,  fontWeight: 600 },
  failedMsg: { fontSize: 13, color: C.bad,   fontWeight: 600 },
};
