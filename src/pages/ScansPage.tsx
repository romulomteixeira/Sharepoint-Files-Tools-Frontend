import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Play, X } from 'lucide-react';
import { cancelScan, createScan, listScans, searchSites } from '../api/scans.api';
import type { ScanMode, SiteSearchResult } from '../api/scans.api';
import { ApiClientError } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { Scan } from '../types';

function fmtBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${sizes[index]}`;
}

const STATUS_LABELS: Record<Scan['status'], string> = {
  pending: 'Na fila', running: 'Em execução', completed: 'Concluído',
  failed: 'Erro', cancelled: 'Cancelado',
};

function StatusPill({ status }: { status: Scan['status'] }) {
  const cls = status === 'completed' ? 'pill-good' : status === 'running' ? 'pill-info'
    : status === 'pending' ? 'pill-warn' : status === 'failed' ? 'pill-bad' : 'pill-mute';
  return <span className={`pill ${cls}`}><span className="dot" />{STATUS_LABELS[status]}</span>;
}

function scanType(scan: Scan): string {
  if (scan.request?.allSites) return 'Completo';
  const count = scan.request?.sites?.length;
  if (count) return `Parcial (${count} site${count === 1 ? '' : 's'})`;
  return '—';
}

function scanMode(scan: Scan): string {
  const q = scan.request?.options?.quickMode;
  if (!q) return 'Completo';
  if (q.maxSites === 10) return 'Rápido';
  if (q.maxSites === 30) return 'Estimativa';
  return 'Personalizado';
}

export default function ScansPage(): React.ReactElement {
  const { data: scans, loading, error, refetch } = useApi(listScans, []);
  const [query, setQuery] = useState('*');
  const [siteLimit, setSiteLimit] = useState(50);
  const [results, setResults] = useState<SiteSearchResult[]>([]);
  const [selected, setSelected] = useState<SiteSearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [scope, setScope] = useState<'selected' | 'all'>('all');
  const [mode, setMode] = useState<ScanMode>('full');
  const [scanSearch, setScanSearch] = useState('*');
  const [scanMaxSites, setScanMaxSites] = useState(5000);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [enableVersioning, setEnableVersioning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [cancellingScanId, setCancellingScanId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const selectedIds = useMemo(() => new Set(selected.map(s => s.id)), [selected]);
  const allResultsSelected = results.length > 0 && results.every(s => selectedIds.has(s.id));
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const createDisabled = creating || (scope === 'selected' && selected.length === 0);
  const visibleResults = useMemo(() => results.slice((page - 1) * pageSize, page * pageSize), [page, pageSize, results]);

  async function handleLoadSites() {
    setSearching(true); setSearchError(null);
    try {
      const sites = await searchSites(query, siteLimit);
      setResults(sites); setPage(1);
    } catch (err) {
      setResults([]); setPage(1);
      setSearchError(err instanceof ApiClientError ? err.message : 'Erro ao buscar sites.');
    } finally { setSearching(false); }
  }

  function toggleSite(site: SiteSearchResult) {
    setSelected(cur => cur.some(i => i.id === site.id) ? cur.filter(i => i.id !== site.id) : [...cur, site]);
  }

  function toggleAll() {
    if (allResultsSelected) {
      const rids = new Set(results.map(s => s.id));
      setSelected(cur => cur.filter(s => !rids.has(s.id)));
      return;
    }
    setSelected(cur => {
      const m = new Map(cur.map(s => [s.id, s]));
      results.forEach(s => m.set(s.id, s));
      return Array.from(m.values());
    });
  }

  async function handleCreateScan() {
    if (scope === 'selected' && selected.length === 0) { setToast({ text: 'Selecione ao menos um site.', kind: 'error' }); return; }
    setCreating(true);
    try {
      const scan = await createScan({ allSites: scope === 'all', siteIds: scope === 'selected' ? selected.map(s => s.id) : [], siteSearch: scanSearch, maxSites: scanMaxSites, mode, enableVersioning });
      setToast({ text: `Scan ${scan.id.slice(0, 8)} iniciado.`, kind: 'success' });
      setSelected([]);
      refetch();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : 'Erro ao iniciar scan.', kind: 'error' });
    } finally { setCreating(false); }
  }

  async function handleCancelScan(scanId: string) {
    setCancellingScanId(scanId);
    try {
      await cancelScan(scanId);
      setToast({ text: `Cancelamento solicitado para ${scanId.slice(0, 8)}.`, kind: 'success' });
      await refetch();
    } catch (err) {
      setToast({ text: err instanceof ApiClientError ? err.message : 'Erro ao cancelar.', kind: 'error' });
    } finally { setCancellingScanId(null); }
  }

  return (
    <>
      {toast && (
        <div className={`toast ${toast.kind === 'success' ? 'pill-good' : 'pill-bad'}`}>{toast.text}</div>
      )}

      <div className="page-head">
        <div>
          <h1 className="page-title">Realizar Scans</h1>
          <p className="page-sub">Inicie um inventário completo ou escolha sites específicos.</p>
        </div>
      </div>

      {/* ── Painel novo scan ──────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Iniciar novo scan</div>
          </div>
        </div>

        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--gap)' }}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label className="field-label" htmlFor="scan-scope">Escopo da varredura</label>
            <select id="scan-scope" className="select" value={scope} onChange={e => setScope(e.target.value as 'selected' | 'all')}>
              <option value="all">Tenant completo (todos os sites)</option>
              <option value="selected">Sites selecionados</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label className="field-label" htmlFor="scan-mode">Modo</label>
            <select id="scan-mode" className="select" value={mode} onChange={e => setMode(e.target.value as ScanMode)}>
              <option value="full">Completo (sem limites)</option>
              <option value="fast">Rápido (amostra)</option>
              <option value="estimate">Estimativa ampliada</option>
            </select>
          </div>
        </div>

        <div className="info-box" style={{ marginTop: 'var(--gap-sm)' }}>
          {mode === 'full'     && 'Sem limites adicionais por biblioteca ou arquivo.'}
          {mode === 'fast'     && 'Amostra rápida: até 10 sites, 5 bibliotecas por site e 2.000 itens por biblioteca.'}
          {mode === 'estimate' && 'Estimativa ampliada: até 30 sites, 8 bibliotecas por site e 4.000 itens por biblioteca.'}
        </div>

        {scope === 'all' && (
          <div className="row" style={{ marginTop: 'var(--gap)', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label className="field-label" htmlFor="scan-site-search">Busca usada na varredura</label>
              <input id="scan-site-search" className="input" value={scanSearch} onChange={e => setScanSearch(e.target.value)} placeholder="* ou palavra-chave" />
            </div>
            <div className="field" style={{ flex: '0 0 180px' }}>
              <label className="field-label" htmlFor="scan-max-sites">Limite de sites</label>
              <input id="scan-max-sites" className="input" type="number" min={1} max={20000} value={scanMaxSites} onChange={e => setScanMaxSites(Math.max(1, Math.min(20000, Number(e.target.value) || 1)))} />
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border-soft)', margin: 'var(--gap) 0 var(--gap-sm)', paddingTop: 'var(--gap)' }}>
          <div className="card-title" style={{ marginBottom: 'var(--gap-sm)' }}>Localizar e selecionar sites</div>
          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 260px' }}>
              <label className="field-label" htmlFor="site-search">Palavra-chave, nome ou URL</label>
              <input id="site-search" className="input" value={query} onChange={e => setQuery(e.target.value)} placeholder="* ou marketing ou https://…" />
            </div>
            <div className="field" style={{ flex: '0 0 160px' }}>
              <label className="field-label" htmlFor="site-limit">Quantidade a listar</label>
              <input id="site-limit" className="input" type="number" min={1} max={999} value={siteLimit} onChange={e => setSiteLimit(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
            </div>
            <button type="button" className="btn" onClick={handleLoadSites} disabled={searching}>
              <Search size={14} /> {searching ? 'Carregando…' : 'Buscar'}
            </button>
          </div>
        </div>

        {searchError && <div className="pill-bad" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', marginBottom: 'var(--gap-sm)' }}>{searchError}</div>}

        <div className="small muted" style={{ marginBottom: 'var(--gap-sm)' }}>
          {results.length > 0 ? `${results.length} site(s) carregado(s); ${selected.length} selecionado(s)` : 'Informe a busca acima para carregar sites.'}
        </div>

        {results.length > 0 && (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <button type="button" className="btn btn-sm" onClick={toggleAll}>{allResultsSelected ? 'Desmarcar tudo' : 'Selecionar tudo'}</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected([])} disabled={selected.length === 0}>Limpar seleção</button>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-sm)', marginBottom: 'var(--gap-sm)' }}>
              {visibleResults.map(site => (
                <label key={site.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selectedIds.has(site.id)} onChange={() => toggleSite(site)} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
                  <span>
                    <strong className="small">{site.displayName || site.webUrl}</strong>
                    <span className="small muted" style={{ display: 'block', marginTop: 1 }}>{site.webUrl}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="row" style={{ marginBottom: 'var(--gap-sm)' }}>
              <span className="small muted">Página {page} de {totalPages}</span>
              <span className="spacer" />
              <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <label className="field-label" style={{ margin: 0 }}>Itens/pág.</label>
                <select className="select" style={{ width: 80 }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button type="button" className="btn btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</button>
              <button type="button" className="btn btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Próxima</button>
            </div>
          </>
        )}

        {selected.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', marginBottom: 'var(--gap-sm)' }}>
            {selected.slice(0, 5).map(site => (
              <button key={site.id} type="button" className="pill pill-info" onClick={() => toggleSite(site)} style={{ cursor: 'pointer' }}>
                {site.displayName || site.webUrl} <X size={10} />
              </button>
            ))}
            {selected.length > 5 && <span className="pill pill-mute">+{selected.length - 5} mais</span>}
          </div>
        )}

        <label className="check-row" style={{ marginBottom: 'var(--gap)' }}>
          <input type="checkbox" checked={enableVersioning} onChange={e => setEnableVersioning(e.target.checked)} />
          <span>
            <strong>Solicitar versionamento automático</strong>
            <span className="small muted" style={{ display: 'block', marginTop: 2 }}>A execução depende da política global configurada no backend.</span>
          </span>
        </label>

        <button type="button" className="btn btn-primary" onClick={handleCreateScan} disabled={createDisabled}>
          <Play size={14} /> {creating ? 'Iniciando…' : scope === 'selected' ? `Varrer ${selected.length} site(s) selecionado(s)` : 'Iniciar varredura'}
        </button>
      </div>

      {/* ── Scans existentes ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Scans existentes</div>
        </div>
        {loading && <div className="small muted">Carregando scans…</div>}
        {error && <div className="pill-bad" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>}
        {!loading && !error && scans?.length === 0 && <div className="small muted">Nenhum scan encontrado.</div>}

        {!loading && scans && scans.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Modo</th>
                  <th>Status</th>
                  <th className="td-r">Sites</th>
                  <th className="td-r">Arquivos</th>
                  <th className="td-r">Volume</th>
                  <th>Criado em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {scans.map(scan => (
                  <tr key={scan.id}>
                    <td className="td-mono">{scan.id.slice(0, 8)}…</td>
                    <td>{scanType(scan)}</td>
                    <td>{scanMode(scan)}</td>
                    <td><StatusPill status={scan.status} /></td>
                    <td className="td-r">{scan.totalSites?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td className="td-r">{scan.totalFiles?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td className="td-r">{fmtBytes(scan.totalBytes)}</td>
                    <td className="td-mute">{new Date(scan.createdAt).toLocaleString('pt-BR')}</td>
                    <td>
                      <div className="row">
                        {(scan.status === 'running' || scan.status === 'pending') && (
                          <>
                            <Link to="/" className="td-link small">Acompanhar</Link>
                            <button type="button" className="btn btn-sm btn-ghost" style={{ color: 'var(--bad)' }} onClick={() => handleCancelScan(scan.id)} disabled={cancellingScanId === scan.id}>
                              {cancellingScanId === scan.id ? 'Cancelando…' : 'Cancelar'}
                            </button>
                          </>
                        )}
                        {scan.status === 'completed' && <Link to={`/inventory/${scan.id}`} className="td-link small">Inventário</Link>}
                        {scan.status === 'failed' && <Link to="/logs" className="td-link small">Logs</Link>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
