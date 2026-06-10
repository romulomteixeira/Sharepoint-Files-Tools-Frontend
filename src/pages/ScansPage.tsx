/**
 * ScansPage.tsx - Criação de scans completos ou por seleção de sites.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createScan, listScans, searchSites } from '../api/scans.api';
import type { SiteSearchResult } from '../api/scans.api';
import { ApiClientError } from '../api/client';
import { useApi } from '../hooks/useApi';
import type { Scan } from '../types';

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${sizes[index]}`;
}

const statusLabels: Record<Scan['status'], string> = {
  pending: 'Na fila',
  running: 'Em execução',
  completed: 'Concluído',
  failed: 'Erro',
  cancelled: 'Cancelado',
};

function StatusBadge({ status }: { status: Scan['status'] }): React.ReactElement {
  const colors: Record<Scan['status'], React.CSSProperties> = {
    completed: { background: '#d1fae5', color: '#065f46' },
    running: { background: '#dbeafe', color: '#1e40af' },
    pending: { background: '#fef3c7', color: '#92400e' },
    failed: { background: '#fee2e2', color: '#991b1b' },
    cancelled: { background: '#f3f4f6', color: '#374151' },
  };
  return <span style={{ ...styles.badge, ...colors[status] }}>{statusLabels[status]}</span>;
}

function scanType(scan: Scan): string {
  if (scan.request?.allSites === true) return 'Completo';
  const count = scan.request?.sites?.length;
  if (count) return `Parcial (${count} site${count === 1 ? '' : 's'})`;
  return '—';
}

export default function ScansPage(): React.ReactElement {
  const { data: scans, loading, error, refetch } = useApi(listScans, []);
  const [query, setQuery] = useState('*');
  const [siteLimit, setSiteLimit] = useState(50);
  const [results, setResults] = useState<SiteSearchResult[]>([]);
  const [selected, setSelected] = useState<SiteSearchResult[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [enableVersioning, setEnableVersioning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedIds = useMemo(() => new Set(selected.map((site) => site.id)), [selected]);
  const allResultsSelected = results.length > 0 && results.every((site) => selectedIds.has(site.id));
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
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
    setCreating(true);
    try {
      const scan = await createScan({
        siteIds: selected.map((site) => site.id),
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

  return (
    <div style={styles.page}>
      {toast && (
        <div role="status" style={{ ...styles.toast, ...(toast.kind === 'success' ? styles.toastSuccess : styles.toastError) }}>
          {toast.text}
        </div>
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Scans</h1>
          <p style={styles.subtitle}>Inicie um inventário completo ou escolha sites específicos.</p>
        </div>
      </div>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Iniciar novo scan</h2>
        <div style={styles.searchGrid}>
          <div>
            <label htmlFor="site-search" style={styles.label}>Palavra-chave, nome ou URL</label>
            <input
              id="site-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="* ou marketing ou https://tenant/sites/marketing"
              style={styles.input}
            />
          </div>
          <div>
            <label htmlFor="site-limit" style={styles.label}>Quantidade a listar</label>
            <input
              id="site-limit"
              type="number"
              min={1}
              max={999}
              value={siteLimit}
              onChange={(event) => setSiteLimit(Math.max(1, Math.min(999, Number(event.target.value) || 1)))}
              style={styles.input}
            />
          </div>
          <button type="button" onClick={handleLoadSites} disabled={searching} style={styles.loadButton}>
            {searching ? 'Carregando...' : 'Carregar sites'}
          </button>
        </div>
        <div style={styles.helper}>
          {results.length > 0
            ? `${results.length} site(s) carregado(s); ${selected.length} selecionado(s)`
            : 'Informe a busca e a quantidade desejada. A listagem não é carregada automaticamente.'}
        </div>
        {searchError && <div role="alert" style={styles.error}>{searchError}</div>}

        {results.length > 0 && (
          <>
            <div style={styles.selectionActions}>
              <button type="button" onClick={toggleAll} style={styles.secondaryButton}>
                {allResultsSelected ? 'Desmarcar tudo' : 'Selecionar tudo'}
              </button>
              <button type="button" onClick={() => setSelected([])} disabled={selected.length === 0} style={styles.secondaryButton}>
                Limpar seleção
              </button>
            </div>
            <div style={styles.siteList}>
              {visibleResults.map((site) => (
                <label key={site.id} style={styles.siteRow}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(site.id)}
                    onChange={() => toggleSite(site)}
                  />
                  <span>
                    <strong>{site.displayName || site.webUrl}</strong>
                    <small style={styles.siteUrl}>{site.webUrl}</small>
                  </span>
                </label>
              ))}
            </div>
            <div style={styles.pager}>
              <span style={styles.helper}>Página {page} de {totalPages}</span>
              <div style={styles.pagerActions}>
                <label htmlFor="site-page-size" style={styles.pagerLabel}>Itens/página</label>
                <select
                  id="site-page-size"
                  value={pageSize}
                  onChange={event => {
                    setPageSize(Number(event.target.value));
                    setPage(1);
                  }}
                  style={styles.pageSelect}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <button type="button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1} style={styles.secondaryButton}>
                  Anterior
                </button>
                <button type="button" onClick={() => setPage(current => Math.min(totalPages, current + 1))} disabled={page >= totalPages} style={styles.secondaryButton}>
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}

        {selected.length > 0 && (
          <div style={styles.chips} aria-label="Sites selecionados">
            {selected.slice(0, 5).map((site) => (
              <button key={site.id} type="button" onClick={() => toggleSite(site)} style={styles.chip} title="Remover da seleção">
                {site.displayName || site.webUrl} ×
              </button>
            ))}
            {selected.length > 5 && <span style={styles.moreChip}>+{selected.length - 5} mais</span>}
          </div>
        )}

        <label style={styles.toggleRow}>
          <input
            type="checkbox"
            checked={enableVersioning}
            onChange={(event) => setEnableVersioning(event.target.checked)}
          />
          <span>
            <strong>Solicitar versionamento automático</strong>
            <small style={styles.toggleHelp}>A execução depende da política global configurada no backend homologado.</small>
          </span>
        </label>

        <button type="button" onClick={handleCreateScan} disabled={creating} style={styles.primaryButton}>
          {creating
            ? 'Iniciando...'
            : selected.length > 0
              ? `Scan dos sites selecionados (${selected.length})`
              : 'Scan completo do tenant'}
        </button>
      </section>

      <section>
        <h2 style={styles.listTitle}>Scans existentes</h2>
        {loading && <p>Carregando scans...</p>}
        {error && <p style={styles.error}>{error}</p>}
        {!loading && !error && scans?.length === 0 && <p style={styles.empty}>Nenhum scan encontrado.</p>}

        {!loading && scans && scans.length > 0 && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>Tipo</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Sites</th>
                  <th style={styles.th}>Arquivos</th>
                  <th style={styles.th}>Volume</th>
                  <th style={styles.th}>Criado em</th>
                  <th style={styles.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id} style={styles.tr}>
                    <td style={styles.td}><span style={styles.monospace} title={scan.id}>{scan.id.slice(0, 8)}…</span></td>
                    <td style={styles.td}>{scanType(scan)}</td>
                    <td style={styles.td}><StatusBadge status={scan.status} /></td>
                    <td style={styles.td}>{scan.totalSites?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td style={styles.td}>{scan.totalFiles?.toLocaleString('pt-BR') ?? '—'}</td>
                    <td style={styles.td}>{formatBytes(scan.totalBytes)}</td>
                    <td style={styles.td}>{new Date(scan.createdAt).toLocaleString('pt-BR')}</td>
                    <td style={styles.td}>
                      {(scan.status === 'running' || scan.status === 'pending') && <Link to="/" style={styles.link}>Acompanhar</Link>}
                      {scan.status === 'completed' && <Link to={`/inventory/${scan.id}`} style={styles.link}>Inventário</Link>}
                      {scan.status === 'failed' && <Link to="/logs" style={styles.link}>Logs</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '2rem 1rem' },
  header: { display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' },
  title: { fontSize: '1.75rem', fontWeight: 700, margin: 0 },
  subtitle: { color: '#6b7280', margin: '0.35rem 0 0' },
  panel: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '1.25rem', marginBottom: '2rem', background: '#fff' },
  panelTitle: { fontSize: '1.1rem', margin: '0 0 1rem' },
  label: { display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 },
  input: { width: '100%', boxSizing: 'border-box', padding: '0.7rem 0.8rem', border: '1px solid #d1d5db', borderRadius: 6 },
  searchGrid: { display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) 180px auto', gap: 12, alignItems: 'end' },
  loadButton: { padding: '0.72rem 1rem', background: '#fff', color: '#2563eb', border: '1px solid #2563eb', borderRadius: 6, cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' },
  helper: { minHeight: 20, color: '#6b7280', fontSize: '0.8rem', marginTop: 5 },
  selectionActions: { display: 'flex', gap: 8, margin: '0.75rem 0' },
  secondaryButton: { padding: '0.45rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' },
  siteList: { maxHeight: 260, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6 },
  siteRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.7rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' },
  siteUrl: { display: 'block', color: '#6b7280', fontSize: '0.75rem', marginTop: 2 },
  pager: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  pagerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  pagerLabel: { color: '#6b7280', fontSize: '0.8rem' },
  pageSelect: { padding: '0.4rem 0.55rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.8rem' },
  chip: { border: 0, borderRadius: 999, padding: '0.35rem 0.65rem', background: '#dbeafe', color: '#1e40af', cursor: 'pointer' },
  moreChip: { borderRadius: 999, padding: '0.35rem 0.65rem', background: '#f3f4f6', color: '#374151' },
  toggleRow: { display: 'flex', alignItems: 'flex-start', gap: 10, margin: '1rem 0', cursor: 'pointer' },
  toggleHelp: { display: 'block', color: '#6b7280', fontSize: '0.75rem', marginTop: 2 },
  primaryButton: { padding: '0.7rem 1.15rem', background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  listTitle: { fontSize: '1.15rem', marginBottom: '0.75rem' },
  error: { color: '#b91c1c', margin: '0.5rem 0' },
  empty: { color: '#6b7280', padding: '1rem 0' },
  tableWrapper: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' },
  th: { padding: '0.75rem', background: '#f9fafb', textAlign: 'left', color: '#374151', borderBottom: '2px solid #e5e7eb' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { padding: '0.75rem', color: '#374151' },
  monospace: { fontFamily: 'monospace', fontSize: '0.82rem' },
  link: { color: '#2563eb', textDecoration: 'none', fontWeight: 600 },
  badge: { display: 'inline-block', padding: '0.2rem 0.6rem', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600 },
  toast: { position: 'fixed', top: 16, right: 16, zIndex: 9999, padding: '0.75rem 1rem', borderRadius: 6, border: '1px solid', fontWeight: 600 },
  toastSuccess: { background: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' },
  toastError: { background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' },
};
