import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Plus, X, ArrowRight } from 'lucide-react';
import { listScans, createScan, getScanStatus, cancelScan } from '../api/scans.api';
import { getInventorySummary, getTopFiles, getInventorySites } from '../api/inventory.api';
import { ApiClientError } from '../api/client';
import type { Scan, ScanStatusDetail, ScanProgress, InventorySummary, FileItem, SiteRollup } from '../types';

const ACTIVE = new Set(['pending', 'running']);
const REFRESH_MS = 8_000;

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

function calcPercent(p: ScanProgress | undefined, status: string): number {
  if (!p) return 0;
  const st = String(p.status || status).toUpperCase();
  if (['DONE', 'completed'].includes(st)) return 100;
  if (['FINALIZING', 'MATERIALIZING', 'ENRICHING'].includes(st)) return 92;
  if (st === 'ERROR' || st === 'failed') return 0;
  const totalSites = p.totalSites || 0;
  const doneSites = p.doneSites || 0;
  const totalDrives = p.totalDrives || 0;
  const doneDrives = p.doneDrives || 0;
  const siteRatio = totalSites > 0 ? doneSites / totalSites : 0;
  const driveRatio = totalDrives > 0 ? doneDrives / totalDrives : 0;
  const stage = String(p.stage || '').toUpperCase();
  if (stage === 'LISTING_SITES') return Math.round(siteRatio * 28);
  if (stage === 'SCANNING_FILES' || stage === 'SCANNING_AND_VERSIONING')
    return Math.round(28 + driveRatio * 58);
  return Math.round(siteRatio * 28 + driveRatio * 58);
}

type FlowTone = 'idle' | 'run' | 'done' | 'warn' | 'bad';

function flowTone(done: number | undefined, total: number | undefined, isActive: boolean, hasError: boolean): FlowTone {
  if (hasError) return 'bad';
  const d = done ?? 0, t = total ?? 0;
  if (t > 0 && d >= t) return 'done';
  if (isActive && (d > 0 || t > 0)) return 'run';
  if (isActive) return 'run';
  return 'idle';
}

function FlowNode({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: FlowTone }) {
  const dotStyle: React.CSSProperties = {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
    background: tone === 'bad' ? 'var(--bad)' : tone === 'done' ? 'var(--good)' : tone === 'run' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : 'var(--faint)',
  };
  return (
    <div className="flow-node">
      <span style={dotStyle} />
      <div>
        <div className="flow-label">{label}</div>
        <div className="flow-value" style={{ color: dotStyle.background as string }}>{value}</div>
        <div className="flow-sub">{sub}</div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando', running: 'Em execução', completed: 'Concluído',
  failed: 'Com falha', cancelled: 'Cancelado',
};

export default function DashboardPage(): React.ReactElement {
  const [scans, setScans]             = useState<Scan[]>([]);
  const [scanId, setScanId]           = useState<string | null>(null);
  const [detail, setDetail]           = useState<ScanStatusDetail | null>(null);
  const [summary, setSummary]         = useState<InventorySummary | null>(null);
  const [topFiles, setTopFiles]       = useState<FileItem[]>([]);
  const [topSites, setTopSites]       = useState<SiteRollup[]>([]);
  const [topVersioned, setTopVersioned] = useState<FileItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{ msg: string; kind: 'ok' | 'bad' } | null>(null);
  const [creating, setCreating]       = useState(false);
  const [cancelling, setCancelling]   = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string, kind: 'ok' | 'bad' = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadScans = useCallback(async (): Promise<Scan[]> => {
    const data = await listScans();
    setScans(data);
    return data;
  }, []);

  const loadScanData = useCallback(async (id: string, scanList: Scan[]) => {
    const [detailRes] = await Promise.allSettled([getScanStatus(id)]);
    if (detailRes.status === 'fulfilled') setDetail(detailRes.value);

    const scanObj = scanList.find(s => s.id === id);
    const isCompleted = scanObj?.status === 'completed'
      || (detailRes.status === 'fulfilled' && detailRes.value.status === 'completed');

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

  useEffect(() => {
    setLoading(true);
    loadScans()
      .then(data => { if (data.length > 0) setScanId(data[0].id); })
      .catch(() => showToast('Erro ao carregar scans.', 'bad'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!scanId) return;
    setSummary(null); setTopFiles([]); setTopSites([]); setTopVersioned([]); setDetail(null);
    loadScanData(scanId, scans);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

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
    } finally { setCreating(false); }
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
    } finally { setCancelling(false); }
  };

  const handleRefresh = async () => {
    if (!scanId) return;
    const fresh = await loadScans().catch(() => scans);
    await loadScanData(scanId, fresh);
  };

  const selectedScan = scans.find(s => s.id === scanId) ?? null;
  const p: ScanProgress | undefined = detail?.progress;
  const isActive    = selectedScan ? ACTIVE.has(selectedScan.status) : false;
  const isCompleted = selectedScan?.status === 'completed';
  const pct         = calcPercent(p, selectedScan?.status ?? '');
  const hasError    = selectedScan?.status === 'failed';

  const files  = p?.files    ?? summary?.totalFiles  ?? selectedScan?.totalFiles;
  const bytes  = p?.bytes    ?? summary?.totalBytes  ?? selectedScan?.totalBytes;
  const sites  = p?.doneSites  ?? summary?.totalSites  ?? selectedScan?.totalSites;
  const drives = p?.doneDrives ?? summary?.totalDrives ?? selectedScan?.totalDrives;

  const topExt         = summary?.topExtensions?.slice(0, 10) ?? [];
  const maxExt         = topExt[0]?.fileCount ?? 1;
  const topExtByBytes  = [...(summary?.topExtensions ?? [])].sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0)).slice(0, 10);
  const maxExtBytes    = topExtByBytes[0]?.totalBytes ?? 1;

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--muted)' }}>Carregando dashboard…</div>;

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.kind === 'ok' ? 'pill-good' : 'pill-bad'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Visão geral do consumo e inventário</p>
        </div>
        <div className="head-actions">
          <div className="field" style={{ minWidth: 260 }}>
            <label className="field-label">Base do scan</label>
            <select
              className="select"
              value={scanId ?? ''}
              onChange={e => setScanId(e.target.value)}
            >
              {scans.length === 0 && <option value="">Nenhum scan encontrado</option>}
              {scans.map(sc => (
                <option key={sc.id} value={sc.id}>
                  {sc.id.slice(0, 8)} — {STATUS_LABEL[sc.status] ?? sc.status} — {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-sm" onClick={handleRefresh} title="Atualizar dados">
            <RefreshCw size={13} /> Atualizar
          </button>
          {isActive && (
            <button className="btn btn-sm btn-danger" onClick={handleCancel} disabled={cancelling}>
              <X size={13} /> {cancelling ? 'Cancelando…' : 'Cancelar scan'}
            </button>
          )}
          {isCompleted && scanId && (
            <Link to={`/inventory/${scanId}`} className="btn btn-sm">
              <ArrowRight size={13} /> Inventário
            </Link>
          )}
          <button className="btn btn-sm btn-primary" onClick={handleNewScan} disabled={creating || isActive}>
            <Plus size={13} /> {creating ? 'Iniciando…' : 'Novo Scan'}
          </button>
        </div>
      </div>

      {/* Status bar */}
      {lastUpdated && (
        <div className="row small muted">
          <span className={`pill ${isActive ? 'pill-good' : 'pill-info'}`}>
            <span className="dot" />
            {isActive ? 'Ao vivo' : 'Snapshot'}
          </span>
          Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
          {isActive && <span className="faint"> — atualização automática a cada 8 s</span>}
        </div>
      )}

      {/* ── KPI Grid ─────────────────────────────────────────────────────── */}
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label">Sites</span></div>
          <div className="kpi-value">{fmtNum(sites)}</div>
          <div className="kpi-hint">{fmtNum(p?.totalSites ?? selectedScan?.totalSites)} total</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label">Drives</span></div>
          <div className="kpi-value">{fmtNum(drives)}</div>
          <div className="kpi-hint">{fmtNum(p?.totalDrives ?? selectedScan?.totalDrives)} total</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label">Arquivos</span></div>
          <div className="kpi-value">{fmtNum(files)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label">Volume total</span></div>
          <div className="kpi-value">{fmtBytes(bytes)}</div>
        </div>
        {p?.versioningEnabled && (
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-label">Versões</span></div>
            <div className="kpi-value">{fmtNum(p.versionsDone)}</div>
            <div className="kpi-hint">{fmtNum(p.versionsTotal)} total · {fmtBytes(p.versionsBytes)}</div>
          </div>
        )}
        <div className="kpi">
          <div className="kpi-top"><span className="kpi-label">Status do scan</span></div>
          <div className="kpi-value" style={{
            color: selectedScan?.status === 'completed' ? 'var(--good)'
              : selectedScan?.status === 'running' ? 'var(--accent)'
              : selectedScan?.status === 'failed' ? 'var(--bad)'
              : selectedScan?.status === 'pending' ? 'var(--warn)'
              : 'var(--faint)',
          }}>
            {STATUS_LABEL[selectedScan?.status ?? ''] ?? '—'}
          </div>
          {selectedScan?.finishedAt && <div className="kpi-hint">Concluído {fmtDate(selectedScan.finishedAt)}</div>}
          {selectedScan?.startedAt && !selectedScan?.finishedAt && <div className="kpi-hint">Iniciado {fmtDate(selectedScan.startedAt)}</div>}
        </div>
      </div>

      {/* ── Progresso (scan ativo) ─────────────────────────────────────── */}
      {isActive && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Progresso da varredura</div>
              {p?.activity && <div className="card-sub">{p.activity}</div>}
            </div>
            <span className={`pill ${pct > 80 ? 'pill-good' : 'pill-info'}`}>{pct}%</span>
          </div>
          <div className="track" style={{ marginBottom: 'var(--gap-sm)' }}>
            <div className="fill" style={{ width: `${pct}%`, background: pct > 80 ? 'var(--good)' : 'var(--accent)' }} />
          </div>
          <div className="flow">
            <FlowNode label="Sites" value={`${fmtNum(p?.doneSites)}/${fmtNum(p?.totalSites)}`} sub="Sites processados" tone={flowTone(p?.doneSites, p?.totalSites, isActive && String(p?.stage).includes('SITE'), hasError)} />
            <div className="flow-arrow"><ArrowRight size={14} /></div>
            <FlowNode label="Drives" value={`${fmtNum(p?.doneDrives)}/${fmtNum(p?.totalDrives)}`} sub="Bibliotecas lidas" tone={flowTone(p?.doneDrives, p?.totalDrives, isActive && !String(p?.stage).includes('SITE'), hasError)} />
            <div className="flow-arrow"><ArrowRight size={14} /></div>
            <FlowNode label="Arquivos" value={fmtNum(p?.files)} sub={fmtBytes(p?.bytes)} tone={p?.files ? 'run' : 'idle'} />
            {p?.versioningEnabled && (
              <>
                <div className="flow-arrow"><ArrowRight size={14} /></div>
                <FlowNode label="Versões" value={`${fmtNum(p.versionsDone)}/${fmtNum(p.versionsTotal)}`} sub={fmtBytes(p.versionsBytes)} tone={p.versionsTotal ? (p.versionsDone === p.versionsTotal ? 'done' : 'run') : 'idle'} />
              </>
            )}
            <div className="flow-arrow"><ArrowRight size={14} /></div>
            <FlowNode label="Final" value={isCompleted ? '✓' : '…'} sub={isCompleted ? 'Base pronta' : 'Aguardando'} tone={isCompleted ? 'done' : 'idle'} />
          </div>
        </div>
      )}

      {/* ── Top Extensões + Top Arquivos ─────────────────────────────────── */}
      {(topExt.length > 0 || topFiles.length > 0) && (
        <div className="two-col">
          {topExt.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Extensões mais frequentes</div>
                  <div className="card-sub">Por quantidade de arquivos</div>
                </div>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {topExt.map(ext => (
                  <div key={ext.extension}>
                    <div className="row" style={{ marginBottom: 3 }}>
                      <span className="mono small" style={{ minWidth: 60, color: 'var(--text)' }}>{ext.extension || '(sem extensão)'}</span>
                      <span className="spacer" />
                      <span className="small muted">{fmtNum(ext.fileCount)} arq.</span>
                      <span className="small muted" style={{ minWidth: 72, textAlign: 'right' }}>{fmtBytes(ext.totalBytes)}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round((ext.fileCount / maxExt) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topFiles.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Top 10 maiores arquivos</div>
                  <div className="card-sub">Clique no nome para abrir no SharePoint</div>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nome</th>
                      <th>Ext.</th>
                      <th className="td-r">Tamanho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topFiles.map((f, i) => (
                      <tr key={f.id ?? i}>
                        <td className="td-mute" style={{ width: 28 }}>{i + 1}</td>
                        <td className="td-ellipsis">
                          {f.webUrl
                            ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link">{f.name}</a>
                            : f.name}
                        </td>
                        <td className="td-mute td-mono">{f.extension || '—'}</td>
                        <td className="td-r">{fmtBytes(f.totalBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isCompleted && scanId && (
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <Link to={`/inventory/${scanId}`} className="td-link small">Ver inventário completo →</Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Top 20 sites por utilização ───────────────────────────────────── */}
      {topSites.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Top 20 sites por utilização</div>
              <div className="card-sub">Volume total de arquivos (scan selecionado)</div>
            </div>
          </div>
          <div className="stack" style={{ gap: 7 }}>
            {topSites.map((site, i) => {
              const maxB = topSites[0]?.totalBytes ?? 1;
              const pct = Math.round(((site.totalBytes ?? 0) / maxB) * 100);
              return (
                <div key={site.siteId}>
                  <div className="row" style={{ marginBottom: 2 }}>
                    <span className="small muted" style={{ width: 18, textAlign: 'right' }}>{i + 1}</span>
                    <span className="small" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={site.siteUrl}>{site.siteName || site.siteUrl || site.siteId}</span>
                    <span className="small muted">{fmtNum(site.totalFiles)} arq.</span>
                    <span className="small muted" style={{ minWidth: 72, textAlign: 'right' }}>{fmtBytes(site.totalBytes)}</span>
                  </div>
                  <div className="bar-track" style={{ marginLeft: 24 }}>
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top extensões por espaço + Top versionados ────────────────────── */}
      {(topExtByBytes.length > 0 || topVersioned.length > 0) && (
        <div className="two-col">
          {topExtByBytes.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Top 10 extensões por espaço usado</div>
                  <div className="card-sub">Volume total (arquivos + versões)</div>
                </div>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {topExtByBytes.map(ext => (
                  <div key={ext.extension}>
                    <div className="row" style={{ marginBottom: 3 }}>
                      <span className="mono small" style={{ minWidth: 60 }}>{ext.extension || '(sem extensão)'}</span>
                      <span className="spacer" />
                      <span className="small muted">{fmtNum(ext.fileCount)} arq.</span>
                      <span className="small muted" style={{ minWidth: 72, textAlign: 'right' }}>{fmtBytes(ext.totalBytes)}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.round(((ext.totalBytes ?? 0) / maxExtBytes) * 100)}%`, background: 'var(--good)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topVersioned.length > 0 && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-title">Top 20 arquivos com mais versões</div>
                  <div className="card-sub">Últimos 30 dias (scan selecionado)</div>
                </div>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Nome</th>
                      <th>Ext.</th>
                      <th className="td-r">Versões</th>
                      <th className="td-r">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topVersioned.map((f, i) => (
                      <tr key={f.id ?? i}>
                        <td className="td-mute" style={{ width: 24 }}>{i + 1}</td>
                        <td className="td-ellipsis">
                          {f.webUrl
                            ? <a href={f.webUrl} target="_blank" rel="noreferrer" className="td-link">{f.name}</a>
                            : f.name}
                        </td>
                        <td className="td-mute td-mono">{f.extension || '—'}</td>
                        <td className="td-r">{fmtNum(f.versionCount)}</td>
                        <td className="td-r">{fmtBytes(f.totalBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado vazio */}
      {scans.length === 0 && !loading && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 0', textAlign: 'center' }}>
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Nenhum scan encontrado.</p>
          <p className="muted small" style={{ marginBottom: 16 }}>Inicie a primeira varredura do tenant SharePoint.</p>
          <button className="btn btn-primary" onClick={handleNewScan} disabled={creating}>
            <Plus size={14} /> {creating ? 'Iniciando…' : 'Iniciar Primeiro Scan'}
          </button>
        </div>
      )}
    </>
  );
}
