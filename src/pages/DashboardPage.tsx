/**
 * DashboardPage.tsx — Dashboard completo (Sprint 12)
 *
 * Implementa as mesmas funcionalidades do legado (public/app.js):
 *   - Seletor de scan (dropdown com todos os scans)
 *   - 6 KPI cards: Sites, Drives, Arquivos, Volume, Versões, Status
 *   - Barra de progresso de conclusão (estimativa simplificada)
 *   - Fluxo de scan: Sites → Drives → Arquivos → Final
 *   - Texto de atividade (stage atual)
 *   - Top extensões (barras horizontais com contagem e volume)
 *   - Top 10 maiores arquivos (tabela clicável)
 *   - Botões: Novo Scan, Cancelar, Atualizar, Ir para Inventário
 *   - Auto-refresh a cada 8 s para scans ativos
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listScans, createScan, getScanStatus, cancelScan } from '../api/scans.api';
import { getInventorySummary, getTopFiles } from '../api/inventory.api';
import { ApiClientError } from '../api/client';
import type { Scan, ScanStatusDetail, ScanProgress, InventorySummary, FileItem } from '../types';

// ─── Constantes ───────────────────────────────────────────────────────────────

const ACTIVE = new Set(['pending', 'running']);
const REFRESH_MS = 8_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(n: number | undefined): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`;
}

function fmtNum(n: number | undefined): string {
  return n != null ? n.toLocaleString('pt-BR') : '—';
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

/** Calcula % de conclusão a partir do progresso do scan. */
function calcPercent(p: ScanProgress | undefined, status: string): number {
  if (!p) return 0;
  const st = String(p.status || status).toUpperCase();
  if (['DONE', 'completed'].includes(st) || st === 'DONE') return 100;
  if (['FINALIZING', 'MATERIALIZING', 'ENRICHING'].includes(st)) return 92;
  if (st === 'ERROR' || st === 'failed') return 0;

  const totalSites  = p.totalSites  || 0;
  const doneSites   = p.doneSites   || 0;
  const totalDrives = p.totalDrives || 0;
  const doneDrives  = p.doneDrives  || 0;

  const siteRatio  = totalSites  > 0 ? doneSites  / totalSites  : 0;
  const driveRatio = totalDrives > 0 ? doneDrives / totalDrives : 0;

  const stage = String(p.stage || '').toUpperCase();
  if (stage === 'LISTING_SITES') return Math.round(siteRatio * 28);
  if (stage === 'SCANNING_FILES' || stage === 'SCANNING_AND_VERSIONING') {
    return Math.round(28 + driveRatio * 58);
  }
  // fallback
  return Math.round(siteRatio * 28 + driveRatio * 58);
}

type FlowTone = 'idle' | 'run' | 'done' | 'warn' | 'bad';

function flowTone(
  done: number | undefined,
  total: number | undefined,
  isActive: boolean,
  hasError: boolean,
): FlowTone {
  if (hasError) return 'bad';
  const d = done ?? 0, t = total ?? 0;
  if (t > 0 && d >= t) return 'done';
  if (isActive && (d > 0 || t > 0)) return 'run';
  if (isActive) return 'run';
  return 'idle';
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}

function KpiCard({ label, value, hint, accent = C.accent }: KpiCardProps) {
  return (
    <div style={s.kpi}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={{ ...s.kpiValue, color: accent }}>{value}</div>
      {hint && <div style={s.kpiHint}>{hint}</div>}
    </div>
  );
}

interface FlowNodeProps {
  label: string;
  value: string;
  sub: string;
  tone: FlowTone;
}

function FlowNode({ label, value, sub, tone }: FlowNodeProps) {
  const dotColor: Record<FlowTone, string> = {
    idle: '#9ca3af',
    run: C.accent,
    done: C.good,
    warn: C.warn,
    bad: C.bad,
  };
  const bg: Record<FlowTone, string> = {
    idle: '#f1f5f9',
    run: '#eff6ff',
    done: '#f0fff4',
    warn: '#fffaf0',
    bad: '#fff5f5',
  };
  return (
    <div style={{ ...s.flowNode, background: bg[tone] }}>
      <span style={{ ...s.flowDot, background: dotColor[tone] }} />
      <div>
        <div style={s.flowLabel}>{label}</div>
        <div style={{ ...s.flowValue, color: dotColor[tone] }}>{value}</div>
        <div style={s.flowSub}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function DashboardPage(): React.ReactElement {
  const [scans, setScans]           = useState<Scan[]>([]);
  const [scanId, setScanId]         = useState<string | null>(null);
  const [detail, setDetail]         = useState<ScanStatusDetail | null>(null);
  const [summary, setSummary]       = useState<InventorySummary | null>(null);
  const [topFiles, setTopFiles]     = useState<FileItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState<{ msg: string; kind: 'ok' | 'bad' } | null>(null);
  const [creating, setCreating]     = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string, kind: 'ok' | 'bad' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Carrega lista de scans ────────────────────────────────────────────────
  const loadScans = useCallback(async (): Promise<Scan[]> => {
    const data = await listScans();
    setScans(data);
    return data;
  }, []);

  // ── Carrega dados do scan selecionado ─────────────────────────────────────
  const loadScanData = useCallback(async (id: string, scanList: Scan[]) => {
    const [detailRes] = await Promise.allSettled([getScanStatus(id)]);
    if (detailRes.status === 'fulfilled') {
      setDetail(detailRes.value);
    }

    const scanObj = scanList.find(s => s.id === id);
    const isCompleted = scanObj?.status === 'completed'
      || detailRes.status === 'fulfilled' && detailRes.value.status === 'completed';

    const [sumRes, topRes] = await Promise.allSettled([
      getInventorySummary(id),
      isCompleted ? getTopFiles(id, { limit: 10 }) : Promise.resolve([]),
    ]);
    if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
    if (topRes.status === 'fulfilled') setTopFiles(topRes.value as FileItem[]);
    setLastUpdated(new Date());
  }, []);

  // ── Mount: carrega scans, seleciona o mais recente ───────────────────────
  useEffect(() => {
    setLoading(true);
    loadScans()
      .then(data => { if (data.length > 0) setScanId(data[0].id); })
      .catch(() => showToast('Erro ao carregar scans.', 'bad'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quando scan muda: (re)carrega dados ──────────────────────────────────
  useEffect(() => {
    if (!scanId) return;
    setSummary(null);
    setTopFiles([]);
    setDetail(null);
    loadScanData(scanId, scans);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // ── Auto-refresh para scans ativos ───────────────────────────────────────
  useEffect(() => {
    const activeScan = scans.find(s => s.id === scanId);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!activeScan || !ACTIVE.has(activeScan.status)) return;

    timerRef.current = setInterval(async () => {
      const fresh = await loadScans().catch(() => scans);
      await loadScanData(scanId!, fresh);
    }, REFRESH_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, scans.find(s => s.id === scanId)?.status]);

  // ── Ações ─────────────────────────────────────────────────────────────────
  const handleNewScan = async () => {
    setCreating(true);
    try {
      const scan = await createScan();
      const fresh = await loadScans();
      setScanId(scan.id);
      await loadScanData(scan.id, fresh);
      showToast('Scan iniciado com sucesso.');
    } catch (e) {
      showToast(e instanceof ApiClientError ? e.message : 'Erro ao iniciar scan.', 'bad');
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async () => {
    if (!scanId) return;
    setCancelling(true);
    try {
      await cancelScan(scanId);
      const fresh = await loadScans();
      await loadScanData(scanId, fresh);
      showToast('Scan cancelado.');
    } catch (e) {
      showToast(e instanceof ApiClientError ? e.message : 'Erro ao cancelar scan.', 'bad');
    } finally {
      setCancelling(false);
    }
  };

  const handleRefresh = async () => {
    if (!scanId) return;
    const fresh = await loadScans().catch(() => scans);
    await loadScanData(scanId, fresh);
  };

  // ── Dados derivados ───────────────────────────────────────────────────────
  const selectedScan = scans.find(s => s.id === scanId) ?? null;
  const p: ScanProgress | undefined = detail?.progress;
  const isActive = selectedScan ? ACTIVE.has(selectedScan.status) : false;
  const isCompleted = selectedScan?.status === 'completed';
  const pct = calcPercent(p, selectedScan?.status ?? '');

  const flowIsActive = isActive;
  const hasError = selectedScan?.status === 'failed';

  const files   = p?.files   ?? summary?.totalFiles  ?? selectedScan?.totalFiles;
  const bytes   = p?.bytes   ?? summary?.totalBytes  ?? selectedScan?.totalBytes;
  const sites   = p?.doneSites   ?? summary?.totalSites  ?? selectedScan?.totalSites;
  const drives  = p?.doneDrives  ?? summary?.totalDrives ?? selectedScan?.totalDrives;

  const topExt = summary?.topExtensions?.slice(0, 10) ?? [];
  const maxExt = topExt[0]?.fileCount ?? 1;

  const statusLabel: Record<string, string> = {
    pending: 'Aguardando', running: 'Em execução', completed: 'Concluído',
    failed: 'Com falha', cancelled: 'Cancelado',
  };
  const statusColor: Record<string, string> = {
    pending: C.warn, running: C.accent, completed: C.good,
    failed: C.bad, cancelled: '#6b7280',
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={s.loading}>Carregando dashboard…</div>;
  }

  return (
    <div style={s.page}>

      {/* Toast */}
      {toast && (
        <div style={{ ...s.toast, background: toast.kind === 'ok' ? '#f0fff4' : '#fff5f5', borderColor: toast.kind === 'ok' ? '#c6f6d5' : '#fed7d7', color: toast.kind === 'ok' ? C.good : C.bad }}>
          {toast.msg}
        </div>
      )}

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div style={s.topbar}>
        <div>
          <h1 style={s.title}>Dashboard</h1>
          <p style={s.subtitle}>Visão geral do consumo e inventário</p>
        </div>
        <div style={s.topActions}>
          {/* Seletor de scan */}
          <div style={s.scanSelectWrap}>
            <label style={s.scanSelectLabel}>Base do scan</label>
            <select
              style={s.scanSelect}
              value={scanId ?? ''}
              onChange={e => setScanId(e.target.value)}
            >
              {scans.length === 0 && <option value="">Nenhum scan encontrado</option>}
              {scans.map(sc => (
                <option key={sc.id} value={sc.id}>
                  {sc.id.slice(0, 8)} — {statusLabel[sc.status] ?? sc.status} — {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          </div>
          {/* Botões de ação */}
          <div style={s.btnGroup}>
            <button style={s.btnSecondary} onClick={handleRefresh} title="Atualizar dados">
              ↺ Atualizar
            </button>
            {isActive && (
              <button style={{ ...s.btnSecondary, borderColor: '#fca5a5', color: C.bad }} onClick={handleCancel} disabled={cancelling}>
                {cancelling ? 'Cancelando…' : '✕ Cancelar scan'}
              </button>
            )}
            {isCompleted && scanId && (
              <Link to={`/inventory/${scanId}`} style={s.btnAccent}>
                Ir para Inventário →
              </Link>
            )}
            <button style={s.btnAccent} onClick={handleNewScan} disabled={creating || isActive}>
              {creating ? 'Iniciando…' : '+ Novo Scan'}
            </button>
          </div>
        </div>
      </div>

      {/* Última atualização */}
      {lastUpdated && (
        <div style={s.lastUpdated}>
          <span style={{ ...s.pill, background: isActive ? '#f0fff4' : '#eff6ff', color: isActive ? C.good : C.accent }}>
            {isActive ? '● Ao vivo' : '○ Snapshot'}
          </span>
          Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
          {isActive && <span style={{ color: C.muted }}> — atualização automática a cada 8 s</span>}
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div style={s.kpis}>
        <KpiCard label="Sites" value={fmtNum(sites)}  hint={`${fmtNum(p?.totalSites ?? selectedScan?.totalSites)} total`} />
        <KpiCard label="Drives" value={fmtNum(drives)} hint={`${fmtNum(p?.totalDrives ?? selectedScan?.totalDrives)} total`} />
        <KpiCard label="Arquivos" value={fmtNum(files)} accent={C.text} />
        <KpiCard label="Volume total" value={fmtBytes(bytes)} accent={C.text} />
        {p?.versioningEnabled && (
          <KpiCard
            label="Versões"
            value={fmtNum(p.versionsDone)}
            hint={`${fmtNum(p.versionsTotal)} total • ${fmtBytes(p.versionsBytes)}`}
          />
        )}
        <div style={s.kpiStatus}>
          <div style={s.kpiLabel}>Status do scan</div>
          <div style={{ ...s.kpiValue, color: statusColor[selectedScan?.status ?? ''] ?? C.muted }}>
            {statusLabel[selectedScan?.status ?? ''] ?? '—'}
          </div>
          {selectedScan?.finishedAt && (
            <div style={s.kpiHint}>Concluído {fmtDate(selectedScan.finishedAt)}</div>
          )}
          {selectedScan?.startedAt && !selectedScan?.finishedAt && (
            <div style={s.kpiHint}>Iniciado {fmtDate(selectedScan.startedAt)}</div>
          )}
        </div>
      </div>

      {/* ── Progresso do scan (apenas se ativo) ────────────────────────────── */}
      {isActive && (
        <div style={s.card}>
          <div style={s.cardHead}>
            <div>
              <div style={s.cardTitle}>Progresso da varredura</div>
              {p?.activity && <div style={s.cardSub}>{p.activity}</div>}
            </div>
            <div style={{ ...s.pctBadge, background: pct > 80 ? '#f0fff4' : '#eff6ff' }}>
              <span style={{ color: pct > 80 ? C.good : C.accent, fontWeight: 800 }}>{pct}%</span>
            </div>
          </div>

          {/* Barra de progresso */}
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${pct}%`, background: pct > 80 ? C.good : C.accent }} />
          </div>

          {/* Fluxo: Sites → Drives → Arquivos → Final */}
          <div style={s.flow}>
            <FlowNode
              label="Sites"
              value={`${fmtNum(p?.doneSites)}/${fmtNum(p?.totalSites)}`}
              sub="Sites processados"
              tone={flowTone(p?.doneSites, p?.totalSites, flowIsActive && String(p?.stage).includes('SITE'), hasError)}
            />
            <span style={s.flowArrow}>→</span>
            <FlowNode
              label="Drives"
              value={`${fmtNum(p?.doneDrives)}/${fmtNum(p?.totalDrives)}`}
              sub="Bibliotecas lidas"
              tone={flowTone(p?.doneDrives, p?.totalDrives, flowIsActive && !String(p?.stage).includes('SITE'), hasError)}
            />
            <span style={s.flowArrow}>→</span>
            <FlowNode
              label="Arquivos"
              value={fmtNum(p?.files)}
              sub={fmtBytes(p?.bytes)}
              tone={p?.files ? 'run' : 'idle'}
            />
            {p?.versioningEnabled && (
              <>
                <span style={s.flowArrow}>→</span>
                <FlowNode
                  label="Versões"
                  value={`${fmtNum(p.versionsDone)}/${fmtNum(p.versionsTotal)}`}
                  sub={fmtBytes(p.versionsBytes)}
                  tone={p.versionsTotal ? (p.versionsDone === p.versionsTotal ? 'done' : 'run') : 'idle'}
                />
              </>
            )}
            <span style={s.flowArrow}>→</span>
            <FlowNode
              label="Final"
              value={isCompleted ? '✓' : '…'}
              sub={isCompleted ? 'Base pronta' : 'Aguardando'}
              tone={isCompleted ? 'done' : 'idle'}
            />
          </div>
        </div>
      )}

      {/* ── Linha inferior: Top Extensões + Top Arquivos ────────────────────── */}
      {(topExt.length > 0 || topFiles.length > 0) && (
        <div style={s.twoCol}>

          {/* Top extensões */}
          {topExt.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHead}>
                <div>
                  <div style={s.cardTitle}>Extensões mais frequentes</div>
                  <div style={s.cardSub}>Por quantidade de arquivos</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topExt.map(ext => {
                  const pctExt = Math.round((ext.fileCount / maxExt) * 100);
                  return (
                    <div key={ext.extension}>
                      <div style={s.extRow}>
                        <span style={s.extName}>{ext.extension || '(sem extensão)'}</span>
                        <span style={s.extCount}>{fmtNum(ext.fileCount)} arq.</span>
                        <span style={s.extBytes}>{fmtBytes(ext.totalBytes)}</span>
                      </div>
                      <div style={s.extTrack}>
                        <div style={{ ...s.extFill, width: `${pctExt}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top maiores arquivos */}
          {topFiles.length > 0 && (
            <div style={s.card}>
              <div style={s.cardHead}>
                <div>
                  <div style={s.cardTitle}>Top 10 maiores arquivos</div>
                  <div style={s.cardSub}>Clique no nome para abrir no SharePoint</div>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>#</th>
                      <th style={s.th}>Nome</th>
                      <th style={s.th}>Ext.</th>
                      <th style={{ ...s.th, textAlign: 'right' }}>Tamanho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFiles.map((f, i) => (
                      <tr key={f.id ?? i} style={s.tr}>
                        <td style={{ ...s.td, color: C.muted, width: 28 }}>{i + 1}</td>
                        <td style={{ ...s.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.webUrl
                            ? <a href={f.webUrl} target="_blank" rel="noreferrer" style={s.fileLink}>{f.name}</a>
                            : <span style={{ color: C.text }}>{f.name}</span>
                          }
                        </td>
                        <td style={{ ...s.td, color: C.muted }}>{f.extension || '—'}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBytes(f.totalBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isCompleted && scanId && (
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <Link to={`/inventory/${scanId}`} style={s.viewAll}>Ver inventário completo →</Link>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Estado vazio */}
      {scans.length === 0 && !loading && (
        <div style={s.empty}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Nenhum scan encontrado.</p>
          <p style={{ color: C.muted, marginBottom: 16 }}>Inicie a primeira varredura do tenant SharePoint.</p>
          <button style={s.btnAccent} onClick={handleNewScan} disabled={creating}>
            {creating ? 'Iniciando…' : '+ Iniciar Primeiro Scan'}
          </button>
        </div>
      )}

    </div>
  );
}

// ─── Design tokens (espelho do styles.css legado) ─────────────────────────────

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
};

const s: Record<string, React.CSSProperties> = {
  page:    { display: 'flex', flexDirection: 'column', gap: 14, fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", fontSize: 13, color: C.text },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: C.muted },

  /* Topbar */
  topbar:      { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${C.border}`, paddingBottom: 14, flexWrap: 'wrap' },
  title:       { fontSize: 17, fontWeight: 700, letterSpacing: '.01em', margin: 0 },
  subtitle:    { color: C.muted, fontSize: 11, margin: '3px 0 0', letterSpacing: '.02em' },
  topActions:  { display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' },

  /* Scan selector */
  scanSelectWrap:  { display: 'flex', flexDirection: 'column', gap: 3 },
  scanSelectLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' },
  scanSelect:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, background: '#fff', color: C.text, minWidth: 280, cursor: 'pointer' },

  /* Botões */
  btnGroup:     { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  btnSecondary: { padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 4, background: '#f7f9fb', color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit' },
  btnAccent:    { padding: '6px 12px', border: 'none', borderRadius: 4, background: C.accent, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-block', fontFamily: 'inherit' },

  /* Status */
  lastUpdated: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted },
  pill:        { padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, border: '1px solid transparent' },

  /* KPIs */
  kpis:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 },
  kpi:        { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  kpiStatus:  { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  kpiLabel:   { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 },
  kpiValue:   { fontSize: 22, fontWeight: 800, color: C.accent, lineHeight: 1.2 },
  kpiHint:    { fontSize: 10, color: C.muted, marginTop: 3 },

  /* Cards */
  card:     { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,.06)' },
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10, borderBottom: `1px solid #e8ecf1`, paddingBottom: 8 },
  cardTitle:{ fontWeight: 700, fontSize: 13, letterSpacing: '.01em' },
  cardSub:  { color: C.muted, fontSize: 11, marginTop: 3 },

  /* Progresso */
  pctBadge:     { padding: '4px 12px', borderRadius: 20, border: `1px solid ${C.border}` },
  progressTrack:{ height: 8, borderRadius: 2, background: '#e2e8f0', border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 12 },
  progressFill: { height: '100%', borderRadius: 2, transition: 'width .5s ease' },

  /* Flow */
  flow:      { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  flowArrow: { color: C.muted, fontSize: 18, userSelect: 'none' },
  flowNode:  { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 4, border: `1px solid ${C.border}`, flex: '1 1 120px', minWidth: 100 },
  flowDot:   { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  flowLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' },
  flowValue: { fontSize: 16, fontWeight: 800, lineHeight: 1.2 },
  flowSub:   { fontSize: 10, color: C.muted },

  /* Layout 2 colunas */
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },

  /* Top extensões */
  extRow:   { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 },
  extName:  { fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: C.text, minWidth: 60 },
  extCount: { fontSize: 11, color: C.muted, marginLeft: 'auto', whiteSpace: 'nowrap' },
  extBytes: { fontSize: 11, color: C.muted, whiteSpace: 'nowrap', minWidth: 70, textAlign: 'right' },
  extTrack: { height: 5, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden', marginBottom: 2 },
  extFill:  { height: '100%', borderRadius: 2, background: C.accent, transition: 'width .3s ease' },

  /* Tabela top arquivos */
  table:    { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:       { padding: '6px 8px', background: '#f7f9fb', fontWeight: 700, color: C.muted, textAlign: 'left', borderBottom: `1px solid ${C.border}`, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' },
  tr:       { borderBottom: `1px solid #f1f5f9` },
  td:       { padding: '6px 8px', color: C.text },
  fileLink: { color: C.accent, textDecoration: 'none' },
  viewAll:  { color: C.accent, textDecoration: 'none', fontSize: 12, fontWeight: 600 },

  /* Toast */
  toast:  { position: 'fixed', top: 16, right: 16, zIndex: 9999, padding: '10px 16px', borderRadius: 6, border: '1px solid', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,.12)', maxWidth: 360 },

  /* Empty state */
  empty:  { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0', textAlign: 'center' },
};
