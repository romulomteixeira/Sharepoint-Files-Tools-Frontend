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
import { RefreshCw, X, ArrowRight, Plus, Globe, Database, BarChart3, TrendingUp, CalendarClock } from 'lucide-react';
import { listScans, createScan, getScanStatus, cancelScan } from '../api/scans.api';
import { getInventorySummary, getTopFiles, getInventorySites } from '../api/inventory.api';
import { ApiClientError } from '../api/client';
import { PageHead, Kpi, Card, Btn, Field } from '../components/ui';
import type { Scan, ScanStatusDetail, ScanProgress, InventorySummary, FileItem, SiteRollup } from '../types';

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
  if (st === 'DONE' || st === 'COMPLETED') return 100;
  if (['FINALIZING', 'MATERIALIZING', 'ENRICHING'].includes(st)) return 92;
  if (st === 'ERROR' || st === 'FAILED') return 0;

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

const TONE_COLOR: Record<FlowTone, string> = {
  idle: 'var(--faint)',
  run:  'var(--accent)',
  done: 'var(--good)',
  warn: 'var(--warn)',
  bad:  'var(--bad)',
};

interface FlowNodeProps {
  label: string;
  value: string;
  sub: string;
  tone: FlowTone;
}

function FlowNode({ label, value, sub, tone }: FlowNodeProps) {
  return (
    <div className="flow-node">
      <span className="dot" style={{ background: TONE_COLOR[tone] }} />
      <div>
        <div className="flow-label">{label}</div>
        <div className="flow-value" style={{ color: TONE_COLOR[tone] }}>{value}</div>
        <div className="flow-sub">{sub}</div>
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
  const [topFiles, setTopFiles]         = useState<FileItem[]>([]);
  const [topSites, setTopSites]         = useState<SiteRollup[]>([]);
  const [topVersioned, setTopVersioned] = useState<FileItem[]>([]);
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

    const [sumRes, topRes, sitesRes, versionedRes] = await Promise.allSettled([
      getInventorySummary(id),
      isCompleted ? getTopFiles(id, { limit: 10 }) : Promise.resolve([]),
      isCompleted ? getInventorySites(id, { pageSize: 20, sort: 'bytes_desc' }) : Promise.resolve(null),
      isCompleted ? getTopFiles(id, { limit: 20, metric: 'versions' }) : Promise.resolve([]),
    ]);
    if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
    if (topRes.status === 'fulfilled') setTopFiles(topRes.value as FileItem[]);
    if (sitesRes.status === 'fulfilled' && sitesRes.value) setTopSites(sitesRes.value.items ?? []);
    if (versionedRes.status === 'fulfilled') setTopVersioned(versionedRes.value as FileItem[]);
    setLastUpdated(new Date());
  }, []);

  // ── Mount: carrega scans e seleciona o scan a monitorar ──────────────────
  // Prioriza um scan EM EXECUÇÃO (para acompanhar a evolução ao vivo); senão um
  // ativo (na fila) e, por fim, o mais recente. Evita exibir um scan "aguardando"
  // recém-criado enquanto outro está rodando.
  useEffect(() => {
    setLoading(true);
    loadScans()
      .then(data => {
        if (data.length === 0) return;
        const pick = data.find(s => s.status === 'running')
          ?? data.find(s => ACTIVE.has(s.status))
          ?? data[0];
        setScanId(pick.id);
      })
      .catch(() => showToast('Erro ao carregar scans.', 'bad'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Quando scan muda: (re)carrega dados ──────────────────────────────────
  useEffect(() => {
    if (!scanId) return;
    setSummary(null);
    setTopFiles([]);
    setTopSites([]);
    setTopVersioned([]);
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
  const topExtByBytes = [...(summary?.topExtensions ?? [])].sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0)).slice(0, 10);
  const maxExtBytes   = topExtByBytes[0]?.totalBytes ?? 1;

  const statusLabel: Record<string, string> = {
    pending: 'Aguardando', running: 'Em execução', completed: 'Concluído',
    failed: 'Com falha', cancelled: 'Cancelado',
  };
  const statusColor: Record<string, string> = {
    pending: 'var(--warn)', running: 'var(--accent)', completed: 'var(--good)',
    failed: 'var(--bad)', cancelled: 'var(--muted)',
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', height: '50vh', color: 'var(--muted)' }}>Carregando dashboard…</div>;
  }

  return (
    <div className="stack">

      {/* Toast */}
      {toast && (
        <div
          className={'toast pill-' + (toast.kind === 'ok' ? 'good' : 'bad')}
          style={{ background: toast.kind === 'ok' ? 'var(--good-bg)' : 'var(--bad-bg)', borderColor: toast.kind === 'ok' ? 'var(--good-bd)' : 'var(--bad-bd)', color: toast.kind === 'ok' ? 'var(--good)' : 'var(--bad)' }}
        >
          {toast.msg}
        </div>
      )}

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <PageHead title="Dashboard" sub="Visão geral do consumo e inventário">
        <Field label="Base do scan">
          <select
            className="select"
            style={{ minWidth: 280 }}
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
        </Field>
        <Btn icon={RefreshCw} onClick={handleRefresh} title="Atualizar dados">Atualizar</Btn>
        {isActive && (
          <Btn icon={X} variant="danger" onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelando…' : 'Cancelar scan'}
          </Btn>
        )}
        {isCompleted && scanId && (
          <Link to={`/inventory/${scanId}`} className="btn btn-primary"><ArrowRight size={14} />Ir para Inventário</Link>
        )}
        <Btn icon={Plus} variant="primary" onClick={handleNewScan} disabled={creating || isActive}>
          {creating ? 'Iniciando…' : 'Novo Scan'}
        </Btn>
      </PageHead>

      {/* Última atualização */}
      {lastUpdated && (
        <div className="row small muted">
          <span className={'pill ' + (isActive ? 'pill-good' : 'pill-info')}>
            <span className="dot" />{isActive ? 'Ao vivo' : 'Snapshot'}
          </span>
          <span>Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}</span>
          {isActive && <span className="faint">— atualização automática a cada 8 s</span>}
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="kpi-grid">
        <Kpi label="Sites" value={fmtNum(sites)} hint={`${fmtNum(p?.totalSites ?? selectedScan?.totalSites)} total`} icon={Globe} />
        <Kpi label="Drives" value={fmtNum(drives)} hint={`${fmtNum(p?.totalDrives ?? selectedScan?.totalDrives)} total`} icon={Database} />
        <Kpi label="Arquivos" value={fmtNum(files)} icon={BarChart3} color="var(--text)" />
        <Kpi label="Volume total" value={fmtBytes(bytes)} icon={TrendingUp} color="var(--text)" />
        {p?.versioningEnabled && (
          <Kpi
            label="Versões"
            value={fmtNum(p.versionsDone)}
            hint={`${fmtNum(p.versionsTotal)} total • ${fmtBytes(p.versionsBytes)}`}
            icon={CalendarClock}
          />
        )}
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-label">Status do scan</div></div>
          <div className="kpi-value" style={{ color: statusColor[selectedScan?.status ?? ''] ?? 'var(--muted)' }}>
            {statusLabel[selectedScan?.status ?? ''] ?? '—'}
          </div>
          {selectedScan?.finishedAt && <div className="kpi-hint">Concluído {fmtDate(selectedScan.finishedAt)}</div>}
          {selectedScan?.startedAt && !selectedScan?.finishedAt && <div className="kpi-hint">Iniciado {fmtDate(selectedScan.startedAt)}</div>}
        </div>
      </div>

      {/* ── Progresso do scan (apenas se ativo) ────────────────────────────── */}
      {isActive && (
        <Card
          title="Progresso da varredura"
          sub={p?.activity}
          right={<span className="pill pill-info" style={{ fontSize: 'var(--fs-base)' }}>{pct}%</span>}
        >
          <div className="track" style={{ marginBottom: 'var(--gap-sm)' }}>
            <div className="fill" style={{ width: `${pct}%`, background: pct > 80 ? 'var(--good)' : 'var(--accent)' }} />
          </div>
          <div className="flow">
            <FlowNode
              label="Sites"
              value={`${fmtNum(p?.doneSites)}/${fmtNum(p?.totalSites)}`}
              sub="Sites processados"
              tone={flowTone(p?.doneSites, p?.totalSites, flowIsActive && String(p?.stage).includes('SITE'), hasError)}
            />
            <span className="flow-arrow"><ArrowRight size={14} /></span>
            <FlowNode
              label="Drives"
              value={`${fmtNum(p?.doneDrives)}/${fmtNum(p?.totalDrives)}`}
              sub="Bibliotecas lidas"
              tone={flowTone(p?.doneDrives, p?.totalDrives, flowIsActive && !String(p?.stage).includes('SITE'), hasError)}
            />
            <span className="flow-arrow"><ArrowRight size={14} /></span>
            <FlowNode label="Arquivos" value={fmtNum(p?.files)} sub={fmtBytes(p?.bytes)} tone={p?.files ? 'run' : 'idle'} />
            {p?.versioningEnabled && (
              <>
                <span className="flow-arrow"><ArrowRight size={14} /></span>
                <FlowNode
                  label="Versões"
                  value={`${fmtNum(p.versionsDone)}/${fmtNum(p.versionsTotal)}`}
                  sub={fmtBytes(p.versionsBytes)}
                  tone={p.versionsTotal ? (p.versionsDone === p.versionsTotal ? 'done' : 'run') : 'idle'}
                />
              </>
            )}
            <span className="flow-arrow"><ArrowRight size={14} /></span>
            <FlowNode label="Final" value={isCompleted ? '✓' : '…'} sub={isCompleted ? 'Base pronta' : 'Aguardando'} tone={isCompleted ? 'done' : 'idle'} />
          </div>
        </Card>
      )}

      {/* ── Linha inferior: Top Extensões + Top Arquivos ────────────────────── */}
      {(topExt.length > 0 || topFiles.length > 0) && (
        <div className="two-col">

          {topExt.length > 0 && (
            <Card title="Extensões mais frequentes" sub="Por quantidade de arquivos">
              <div className="stack" style={{ gap: 8 }}>
                {topExt.map(ext => {
                  const pctExt = Math.round((ext.fileCount / maxExt) * 100);
                  return (
                    <div key={ext.extension}>
                      <div className="row" style={{ marginBottom: 3, gap: 6 }}>
                        <span className="mono" style={{ fontWeight: 700, minWidth: 60 }}>{ext.extension || '(sem extensão)'}</span>
                        <span className="spacer" />
                        <span className="small muted">{fmtNum(ext.fileCount)} arq.</span>
                        <span className="small faint" style={{ minWidth: 70, textAlign: 'right' }}>{fmtBytes(ext.totalBytes)}</span>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${pctExt}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {topFiles.length > 0 && (
            <Card title="Top 10 maiores arquivos" sub="Clique no nome para abrir no SharePoint">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>#</th><th>Nome</th><th>Ext.</th><th className="td-r">Tamanho</th></tr>
                  </thead>
                  <tbody>
                    {topFiles.map((f, i) => (
                      <tr key={f.id ?? i}>
                        <td className="td-mute" style={{ width: 28 }}>{i + 1}</td>
                        <td className="td-ellipsis" style={{ maxWidth: 240 }}>
                          {f.webUrl
                            ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link">{f.name}</a>
                            : f.name}
                        </td>
                        <td className="td-mute">{f.extension || '—'}</td>
                        <td className="td-r">{fmtBytes(f.totalBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isCompleted && scanId && (
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <Link to={`/inventory/${scanId}`} className="td-link small" style={{ fontWeight: 650 }}>Ver inventário completo →</Link>
                </div>
              )}
            </Card>
          )}

        </div>
      )}

      {/* ── Gráficos adicionais ─────────────────────────────────────────────── */}

      {topSites.length > 0 && (
        <Card title="Top 20 sites por utilização" sub="Volume total de arquivos (scan selecionado)">
          <div className="stack" style={{ gap: 7 }}>
            {topSites.map((site, i) => {
              const maxBytes = topSites[0]?.totalBytes ?? 1;
              const pct = Math.round(((site.totalBytes ?? 0) / maxBytes) * 100);
              return (
                <div key={site.siteId}>
                  <div className="row" style={{ gap: 6, marginBottom: 2 }}>
                    <span className="faint" style={{ width: 18, textAlign: 'right' }}>{i + 1}</span>
                    <span style={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={site.siteUrl}>{site.siteName || site.siteUrl || site.siteId}</span>
                    <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtNum(site.totalFiles)} arq.</span>
                    <span className="small muted" style={{ whiteSpace: 'nowrap', minWidth: 72, textAlign: 'right' }}>{fmtBytes(site.totalBytes)}</span>
                  </div>
                  <div className="bar-track" style={{ marginLeft: 24 }}><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {(topExtByBytes.length > 0 || topVersioned.length > 0) && (
        <div className="two-col">

          {topExtByBytes.length > 0 && (
            <Card title="Top 10 extensões por espaço usado" sub="Volume total (arquivos + versões)">
              <div className="stack" style={{ gap: 8 }}>
                {topExtByBytes.map(ext => {
                  const pctExt = Math.round(((ext.totalBytes ?? 0) / maxExtBytes) * 100);
                  return (
                    <div key={ext.extension}>
                      <div className="row" style={{ marginBottom: 3, gap: 6 }}>
                        <span className="mono" style={{ fontWeight: 700, minWidth: 60 }}>{ext.extension || '(sem extensão)'}</span>
                        <span className="spacer" />
                        <span className="small muted">{fmtNum(ext.fileCount)} arq.</span>
                        <span className="small faint" style={{ minWidth: 70, textAlign: 'right' }}>{fmtBytes(ext.totalBytes)}</span>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${pctExt}%`, background: 'var(--good)' }} /></div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {topVersioned.length > 0 && (
            <Card title="Top 20 arquivos com mais versões" sub="Últimos 30 dias (scan selecionado)">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>#</th><th>Nome</th><th>Ext.</th><th className="td-r">Versões</th><th className="td-r">Total</th></tr>
                  </thead>
                  <tbody>
                    {topVersioned.map((f, i) => (
                      <tr key={f.id ?? i}>
                        <td className="td-mute" style={{ width: 24 }}>{i + 1}</td>
                        <td className="td-ellipsis" style={{ maxWidth: 200 }}>
                          {f.webUrl
                            ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link">{f.name}</a>
                            : f.name}
                        </td>
                        <td className="td-mute">{f.extension || '—'}</td>
                        <td className="td-r">{fmtNum(f.versionCount)}</td>
                        <td className="td-r">{fmtBytes(f.totalBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

        </div>
      )}

      {/* Estado vazio */}
      {scans.length === 0 && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0', textAlign: 'center' }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Nenhum scan encontrado.</p>
          <p className="muted" style={{ marginBottom: 16 }}>Inicie a primeira varredura do tenant SharePoint.</p>
          <Btn icon={Plus} variant="primary" onClick={handleNewScan} disabled={creating}>
            {creating ? 'Iniciando…' : 'Iniciar Primeiro Scan'}
          </Btn>
        </div>
      )}

    </div>
  );
}
