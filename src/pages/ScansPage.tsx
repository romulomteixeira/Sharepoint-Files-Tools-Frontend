/**
 * ScansPage.tsx - Criação de scans completos ou por seleção de sites.
 * Redesign: usa o design system (tokens.css) preservando rótulos e ações.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Search } from 'lucide-react';
import { cancelScan, createScan, listScans, searchSites } from '../api/scans.api';
import type { ScanMode, SiteSearchResult } from '../api/scans.api';
import { ApiClientError } from '../api/client';
import { useApi } from '../hooks/useApi';
import { PageHead, Card, Btn, StatusPill } from '../components/ui';
import type { Scan } from '../types';

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${sizes[index]}`;
}

function scanType(scan: Scan): string {
  if (scan.request?.allSites === true) return 'Completo';
  const count = scan.request?.sites?.length;
  if (count) return `Parcial (${count} site${count === 1 ? '' : 's'})`;
  return '—';
}

function scanMode(scan: Scan): string {
  const quickMode = scan.request?.options?.quickMode;
  if (!quickMode) return 'Completo';
  if (quickMode.maxSites === 10 && quickMode.maxDrivesPerSite === 5 && quickMode.maxItemsPerDrive === 2000) {
    return 'Rápido';
  }
  if (quickMode.maxSites === 30 && quickMode.maxDrivesPerSite === 8 && quickMode.maxItemsPerDrive === 4000) {
    return 'Estimativa';
  }
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
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedIds = useMemo(() => new Set(selected.map((site) => site.id)), [selected]);
  const allResultsSelected = results.length > 0 && results.every((site) => selectedIds.has(site.id));
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const createDisabled = creating || (scope === 'selected' && selected.length === 0);
  const visibleResults = useMemo(
    () => results.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, results],
  );

  async function handleLoadSites(): Promise<void> {
    setSearching(true);
    setSearchError(null);
    try {
      const sites = await searchSites(query, siteLimit);
      setResults(sites);
      setPage(1);
    } catch (err) {
      setResults([]);
      setPage(1);
      setSearchError(err instanceof ApiClientError ? err.message : 'Erro ao buscar sites.');
    } finally {
      setSearching(false);
    }
  }

  function toggleSite(site: SiteSearchResult): void {
    setSelected((current) => current.some((item) => item.id === site.id)
      ? current.filter((item) => item.id !== site.id)
      : [...current, site]);
  }

  function toggleAll(): void {
    if (allResultsSelected) {
      const resultIds = new Set(results.map((site) => site.id));
      setSelected((current) => current.filter((site) => !resultIds.has(site.id)));
      return;
    }
    setSelected((current) => {
      const byId = new Map(current.map((site) => [site.id, site]));
      results.forEach((site) => byId.set(site.id, site));
      return Array.from(byId.values());
    });
  }

  async function handleCreateScan(): Promise<void> {
    if (scope === 'selected' && selected.length === 0) {
      setToast({ text: 'Selecione ao menos um site para usar o escopo selecionado.', kind: 'error' });
      return;
    }
    setCreating(true);
    try {
      const scan = await createScan({
        allSites: scope === 'all',
        siteIds: scope === 'selected' ? selected.map((site) => site.id) : [],
        siteSearch: scanSearch,
        maxSites: scanMaxSites,
        mode,
        enableVersioning,
      });
      setToast({ text: `Scan ${scan.id.slice(0, 8)} iniciado com sucesso.`, kind: 'success' });
      setSelected([]);
      refetch();
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : 'Erro ao iniciar scan.';
      setToast({ text, kind: 'error' });
    } finally {
      setCreating(false);
    }
  }

  async function handleCancelScan(scanId: string): Promise<void> {
    setCancellingScanId(scanId);
    try {
      await cancelScan(scanId);
      setToast({ text: `Cancelamento solicitado para o scan ${scanId.slice(0, 8)}.`, kind: 'success' });
      await refetch();
    } catch (err) {
      const text = err instanceof ApiClientError ? err.message : 'Erro ao cancelar scan.';
      setToast({ text, kind: 'error' });
    } finally {
      setCancellingScanId(null);
    }
  }

  return (
    <div className="stack">
      {toast && (
        <div
          role="status"
          className={'toast pill-' + (toast.kind === 'success' ? 'good' : 'bad')}
          style={{ background: toast.kind === 'success' ? 'var(--good-bg)' : 'var(--bad-bg)', borderColor: toast.kind === 'success' ? 'var(--good-bd)' : 'var(--bad-bd)', color: toast.kind === 'success' ? 'var(--good)' : 'var(--bad)' }}
        >
          {toast.text}
        </div>
      )}

      <PageHead title="Realizar Scans" sub="Inicie um inventário completo ou escolha sites específicos." />

      <Card title="Iniciar novo scan">
        <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--gap)' }}>
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label className="field-label" htmlFor="scan-scope">Escopo da varredura</label>
            <select id="scan-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value as 'selected' | 'all')}>
              <option value="all">Todos os sites</option>
              <option value="selected">Sites selecionados na lista</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label className="field-label" htmlFor="scan-mode">Modo</label>
            <select id="scan-mode" className="select" value={mode} onChange={(e) => setMode(e.target.value as ScanMode)}>
              <option value="full">Completo</option>
              <option value="fast">Rápido</option>
              <option value="estimate">Estimativa</option>
            </select>
          </div>
        </div>
        <div className="info-box" style={{ marginBottom: 'var(--gap-sm)' }}>
          {mode === 'full' && 'Sem limites adicionais por biblioteca ou arquivo.'}
          {mode === 'fast' && 'Amostra rápida: até 10 sites, 5 bibliotecas por site e 2.000 itens por biblioteca.'}
          {mode === 'estimate' && 'Estimativa ampliada: até 30 sites, 8 bibliotecas por site e 4.000 itens por biblioteca.'}
        </div>

        {scope === 'all' && (
          <div className="row" style={{ alignItems: 'flex-end', marginBottom: 'var(--gap-sm)' }}>
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label className="field-label" htmlFor="scan-site-search">Busca usada na varredura</label>
              <input id="scan-site-search" className="input" value={scanSearch} onChange={(e) => setScanSearch(e.target.value)} placeholder="* ou palavra-chave" />
            </div>
            <div className="field" style={{ width: 180 }}>
              <label className="field-label" htmlFor="scan-max-sites">Limite de sites</label>
              <input id="scan-max-sites" className="input" type="number" min={1} max={20000} value={scanMaxSites} onChange={(e) => setScanMaxSites(Math.max(1, Math.min(20000, Number(e.target.value) || 1)))} />
            </div>
          </div>
        )}

        <h3 className="card-title" style={{ margin: 'var(--gap-sm) 0' }}>Localizar e selecionar sites</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label className="field-label" htmlFor="site-search">Palavra-chave, nome ou URL</label>
            <input id="site-search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="* ou marketing ou https://tenant/sites/marketing" />
          </div>
          <div className="field" style={{ width: 180 }}>
            <label className="field-label" htmlFor="site-limit">Quantidade a listar</label>
            <input id="site-limit" className="input" type="number" min={1} max={999} value={siteLimit} onChange={(e) => setSiteLimit(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} />
          </div>
          <Btn icon={Search} onClick={handleLoadSites} disabled={searching}>
            {searching ? 'Carregando...' : 'Carregar sites'}
          </Btn>
        </div>
        <div className="small muted" style={{ marginTop: 5, minHeight: 20 }}>
          {results.length > 0
            ? `${results.length} site(s) carregado(s); ${selected.length} selecionado(s)`
            : 'Informe a busca e a quantidade desejada. A listagem não é carregada automaticamente.'}
        </div>
        {searchError && <div role="alert" style={{ color: 'var(--bad)', margin: '0.5rem 0' }}>{searchError}</div>}

        {results.length > 0 && (
          <>
            <div className="row" style={{ margin: '0.75rem 0' }}>
              <Btn small onClick={toggleAll}>{allResultsSelected ? 'Desmarcar tudo' : 'Selecionar tudo'}</Btn>
              <Btn small onClick={() => setSelected([])} disabled={selected.length === 0}>Limpar seleção</Btn>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-sm)' }}>
              {visibleResults.map((site) => (
                <label key={site.id} className="check-row" style={{ alignItems: 'flex-start', padding: '0.7rem', borderBottom: '1px solid var(--border-soft)' }}>
                  <input type="checkbox" checked={selectedIds.has(site.id)} onChange={() => toggleSite(site)} />
                  <span>
                    <strong>{site.displayName || site.webUrl}</strong>
                    <small className="mono" style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>{site.webUrl}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap' }}>
              <span className="small muted">Página {page} de {totalPages}</span>
              <div className="row">
                <label className="field-label" htmlFor="site-page-size">Itens/página</label>
                <select id="site-page-size" className="select btn-sm" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <Btn small onClick={() => setPage(c => Math.max(1, c - 1))} disabled={page <= 1}>Anterior</Btn>
                <Btn small onClick={() => setPage(c => Math.min(totalPages, c + 1))} disabled={page >= totalPages}>Próxima</Btn>
              </div>
            </div>
          </>
        )}

        {selected.length > 0 && (
          <div className="row" style={{ marginTop: '0.8rem' }} aria-label="Sites selecionados">
            {selected.slice(0, 5).map((site) => (
              <button key={site.id} type="button" className="pill pill-info" onClick={() => toggleSite(site)} title="Remover da seleção" style={{ cursor: 'pointer', border: 'none' }}>
                {site.displayName || site.webUrl} ×
              </button>
            ))}
            {selected.length > 5 && <span className="pill pill-mute">+{selected.length - 5} mais</span>}
          </div>
        )}

        <label className="check-row" style={{ alignItems: 'flex-start', margin: '1rem 0' }}>
          <input type="checkbox" checked={enableVersioning} onChange={(e) => setEnableVersioning(e.target.checked)} />
          <span>
            <strong>Solicitar versionamento automático</strong>
            <small style={{ display: 'block', color: 'var(--muted)', marginTop: 2 }}>A execução depende da política global configurada no backend homologado.</small>
          </span>
        </label>

        <Btn icon={Play} variant="primary" onClick={handleCreateScan} disabled={createDisabled}>
          {creating
            ? 'Iniciando...'
            : scope === 'selected'
              ? `Scan dos sites selecionados (${selected.length})`
              : 'Iniciar varredura'}
        </Btn>
      </Card>

      <Card title="Scans existentes">
        {loading && <p className="muted">Carregando scans...</p>}
        {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
        {!loading && !error && scans?.length === 0 && <p className="muted">Nenhum scan encontrado.</p>}

        {!loading && scans && scans.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>ID</th><th>Tipo</th><th>Modo</th><th>Status</th>
                  <th className="td-r">Sites</th><th className="td-r">Arquivos</th><th className="td-r">Volume</th>
                  <th>Criado em</th><th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id}>
                    <td className="td-mono" title={scan.id}>{scan.id.slice(0, 8)}…</td>
                    <td>{scanType(scan)}</td>
                    <td className="td-mute small">{scanMode(scan)}</td>
                    <td><StatusPill status={scan.status} /></td>
                    <td className="td-r">{scan.totalSites?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td className="td-r">{scan.totalFiles?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td className="td-r">{formatBytes(scan.totalBytes)}</td>
                    <td className="td-mute small">{new Date(scan.createdAt).toLocaleString('pt-BR')}</td>
                    <td>
                      {(scan.status === 'running' || scan.status === 'pending') && (
                        <div className="row">
                          <Link to="/" className="td-link small">Acompanhar</Link>
                          <button type="button" className="td-link small" onClick={() => handleCancelScan(scan.id)} disabled={cancellingScanId === scan.id} style={{ color: 'var(--bad)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {cancellingScanId === scan.id ? 'Cancelando...' : 'Cancelar'}
                          </button>
                        </div>
                      )}
                      {scan.status === 'completed' && <Link to={`/inventory/${scan.id}`} className="td-link small">Inventário</Link>}
                      {scan.status === 'failed' && <Link to="/logs" className="td-link small">Logs</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
