import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLatestInventorySiteFiles,
  getLatestInventorySites,
  type LatestInventorySite,
  type LatestSiteDrilldown,
  type LatestSitesPageSize,
} from '../api/inventory.api';

const PAGE_SIZES: LatestSitesPageSize[] = [10, 30, 50, 100];
const DRILLDOWN_LIMIT = 10;

function formatBytes(value: number | undefined): string {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${units[index]}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
}

export default function SitesPage(): React.ReactElement {
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<LatestSitesPageSize>(50);
  const [items, setItems] = useState<LatestInventorySite[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, LatestInventorySite>>(new Map());
  const [drilldowns, setDrilldowns] = useState<Record<string, LatestSiteDrilldown>>({});
  const [drillErrors, setDrillErrors] = useState<Record<string, string>>({});
  const [drillLoading, setDrillLoading] = useState<Set<string>>(new Set());

  const loadSites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLatestInventorySites({
        search: appliedQuery || undefined,
        page,
        pageSize,
      });
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar sites inventariados.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, pageSize]);

  useEffect(() => { void loadSites(); }, [loadSites]);

  const selectedCount = selected.size;
  const drillDisabled = selectedCount < 1 || selectedCount > DRILLDOWN_LIMIT;
  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);

  function applySearch(event: React.FormEvent): void {
    event.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  function toggleSite(site: LatestInventorySite): void {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(site.siteId)) next.delete(site.siteId);
      else next.set(site.siteId, site);
      return next;
    });
  }

  function togglePage(): void {
    const allSelected = items.length > 0 && items.every(site => selected.has(site.siteId));
    setSelected((current) => {
      const next = new Map(current);
      for (const site of items) {
        if (allSelected) next.delete(site.siteId);
        else next.set(site.siteId, site);
      }
      return next;
    });
  }

  async function loadDrilldown(siteId: string, targetPage = 1): Promise<void> {
    setDrillLoading(current => new Set(current).add(siteId));
    setDrillErrors(current => {
      const next = { ...current };
      delete next[siteId];
      return next;
    });
    try {
      const data = await getLatestInventorySiteFiles(siteId, {
        page: targetPage,
        pageSize: 50,
      });
      setDrilldowns(current => ({ ...current, [siteId]: data }));
    } catch (err) {
      setDrillErrors(current => ({
        ...current,
        [siteId]: err instanceof Error ? err.message : 'Erro ao detalhar o site.',
      }));
    } finally {
      setDrillLoading((current) => {
        const next = new Set(current);
        next.delete(siteId);
        return next;
      });
    }
  }

  async function loadSelectedDrilldowns(): Promise<void> {
    if (drillDisabled) return;
    await Promise.all(Array.from(selected.keys()).map(siteId => loadDrilldown(siteId)));
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Sites</h1>
          <p style={styles.subtitle}>
            Último inventário concluído de cada site, independentemente do scan de origem.
          </p>
        </div>
        <button type="button" style={styles.secondaryButton} onClick={() => void loadSites()}>
          Atualizar
        </button>
      </header>

      <section style={styles.panel}>
        <form style={styles.filters} onSubmit={applySearch}>
          <label style={styles.growLabel}>
            Nome, URL ou ID do site
            <input
              aria-label="Nome, URL ou ID do site"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Ex.: financeiro ou https://tenant/sites/financeiro"
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            Sites por página
            <select
              aria-label="Sites por página"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value) as LatestSitesPageSize);
                setPage(1);
              }}
              style={styles.select}
            >
              {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <button type="submit" style={styles.primaryButton}>Buscar</button>
        </form>

        <div style={styles.selectionBar}>
          <div>
            <strong>{selectedCount}</strong> site(s) selecionado(s).
            {' '}Selecione de 1 a 10 para carregar bibliotecas e arquivos.
          </div>
          <button
            type="button"
            disabled={drillDisabled}
            style={{ ...styles.primaryButton, ...(drillDisabled ? styles.disabled : {}) }}
            onClick={() => void loadSelectedDrilldowns()}
          >
            Abrir drill-down
          </button>
        </div>
        {selectedCount > DRILLDOWN_LIMIT && (
          <div role="alert" style={styles.warning}>
            Drill-down desabilitado: reduza a seleção para no máximo 10 sites.
          </div>
        )}

        {error && <div role="alert" style={styles.error}>{error}</div>}
        {loading ? (
          <div style={styles.empty}>Carregando sites inventariados…</div>
        ) : items.length === 0 ? (
          <div style={styles.empty}>Nenhum site inventariado encontrado.</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thCheck}>
                    <input
                      aria-label="Selecionar sites da página"
                      type="checkbox"
                      checked={items.every(site => selectedIds.has(site.siteId))}
                      onChange={togglePage}
                    />
                  </th>
                  <th style={styles.th}>Site</th>
                  <th style={styles.th}>Última varredura</th>
                  <th style={styles.th}>Scan de origem</th>
                  <th style={styles.thRight}>Arquivos</th>
                  <th style={styles.thRight}>Tamanho atual</th>
                  <th style={styles.thRight}>Versões</th>
                  <th style={styles.thRight}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((site, index) => (
                  <tr key={site.siteId} style={index % 2 ? styles.oddRow : undefined}>
                    <td style={styles.tdCheck}>
                      <input
                        aria-label={`Selecionar ${site.siteName || site.siteUrl || site.siteId}`}
                        type="checkbox"
                        checked={selectedIds.has(site.siteId)}
                        onChange={() => toggleSite(site)}
                      />
                    </td>
                    <td style={styles.td}>
                      <div style={styles.siteName}>{site.siteName || site.siteId}</div>
                      {site.siteUrl
                        ? <a href={site.siteUrl} target="_blank" rel="noreferrer" style={styles.link}>{site.siteUrl}</a>
                        : <span style={styles.muted}>{site.siteId}</span>}
                    </td>
                    <td style={styles.td}>{formatDate(site.scannedAt)}</td>
                    <td style={styles.td}><code style={styles.code}>{site.scanId}</code></td>
                    <td style={styles.tdRight}>{site.filesCount.toLocaleString('pt-BR')}</td>
                    <td style={styles.tdRight}>{formatBytes(site.bytesTotal)}</td>
                    <td style={styles.tdRight}>{formatBytes(site.versionsBytesTotal)}</td>
                    <td style={styles.tdRight}>{formatBytes(site.totalBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer style={styles.pagination}>
          <span>{total.toLocaleString('pt-BR')} site(s)</span>
          <div style={styles.paginationButtons}>
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} style={styles.pageButton}>
              Anterior
            </button>
            <span>Página {page} de {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={styles.pageButton}>
              Próxima
            </button>
          </div>
        </footer>
      </section>

      {Array.from(selected.values()).map(site => {
        const detail = drilldowns[site.siteId];
        const detailError = drillErrors[site.siteId];
        const isLoading = drillLoading.has(site.siteId);
        if (!detail && !detailError && !isLoading) return null;
        return (
          <section key={site.siteId} style={styles.panel}>
            <div style={styles.detailHeader}>
              <div>
                <h2 style={styles.detailTitle}>{site.siteName || site.siteId}</h2>
                {detail && (
                  <div style={styles.muted}>
                    Scan {detail.site.scanId} · {formatDate(detail.site.scannedAt)} · {detail.totalFiles.toLocaleString('pt-BR')} arquivo(s)
                  </div>
                )}
              </div>
              {detail && (
                <div style={styles.paginationButtons}>
                  <button
                    type="button"
                    disabled={detail.page <= 1 || isLoading}
                    style={styles.pageButton}
                    onClick={() => void loadDrilldown(site.siteId, detail.page - 1)}
                  >
                    Anterior
                  </button>
                  <span>{detail.page}/{detail.totalPages}</span>
                  <button
                    type="button"
                    disabled={detail.page >= detail.totalPages || isLoading}
                    style={styles.pageButton}
                    onClick={() => void loadDrilldown(site.siteId, detail.page + 1)}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </div>
            {isLoading && <div style={styles.empty}>Carregando bibliotecas e arquivos…</div>}
            {detailError && <div role="alert" style={styles.error}>{detailError}</div>}
            {detail?.libraries.map(library => (
              <div key={library.driveId || library.driveName} style={styles.library}>
                <h3 style={styles.libraryTitle}>{library.driveName || library.driveId || 'Biblioteca sem nome'}</h3>
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Arquivo</th>
                        <th style={styles.th}>Caminho</th>
                        <th style={styles.thRight}>Tamanho</th>
                        <th style={styles.thRight}>Versões</th>
                        <th style={styles.thRight}>Espaço das versões</th>
                        <th style={styles.thRight}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {library.files.map(file => (
                        <tr key={`${file.driveId}:${file.itemId}`}>
                          <td style={styles.td}>
                            {file.webUrl
                              ? <a href={file.webUrl} target="_blank" rel="noreferrer" style={styles.link}>{file.name}</a>
                              : file.name}
                          </td>
                          <td style={styles.td}>{file.fullPath || '—'}</td>
                          <td style={styles.tdRight}>{formatBytes(file.sizeBytes)}</td>
                          <td style={styles.tdRight}>{file.versionCount.toLocaleString('pt-BR')}</td>
                          <td style={styles.tdRight}>{formatBytes(file.versionsBytes)}</td>
                          <td style={styles.tdRight}>{formatBytes(file.totalBytes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { padding: 28, color: '#1a202c' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20 },
  title: { margin: 0, fontSize: 28 },
  subtitle: { margin: '6px 0 0', color: '#5f6c83' },
  panel: { background: '#fff', border: '1px solid #c8ced8', borderRadius: 8, padding: 18, marginBottom: 18 },
  filters: { display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' },
  growLabel: { display: 'grid', gap: 6, flex: '1 1 420px', fontSize: 12, fontWeight: 700 },
  label: { display: 'grid', gap: 6, minWidth: 150, fontSize: 12, fontWeight: 700 },
  input: { minHeight: 38, border: '1px solid #aeb8c7', borderRadius: 6, padding: '0 10px' },
  select: { minHeight: 40, border: '1px solid #aeb8c7', borderRadius: 6, padding: '0 10px', background: '#fff' },
  primaryButton: { minHeight: 40, border: 0, borderRadius: 6, padding: '0 16px', background: '#2b6cb0', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  secondaryButton: { minHeight: 38, border: '1px solid #2b6cb0', borderRadius: 6, padding: '0 14px', background: '#fff', color: '#2b6cb0', fontWeight: 700, cursor: 'pointer' },
  disabled: { opacity: 0.5, cursor: 'not-allowed' },
  selectionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '16px 0 10px', padding: 12, background: '#f7fafc', borderRadius: 6 },
  warning: { padding: 10, marginBottom: 12, background: '#fffbeb', border: '1px solid #d69e2e', borderRadius: 6, color: '#975a16' },
  error: { padding: 10, margin: '12px 0', background: '#fff5f5', border: '1px solid #c53030', borderRadius: 6, color: '#9b2c2c' },
  empty: { padding: 24, textAlign: 'center', color: '#5f6c83' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '9px 10px', background: '#f1f5f9', borderBottom: '1px solid #c8ced8', whiteSpace: 'nowrap' },
  thCheck: { width: 36, padding: 9, background: '#f1f5f9', borderBottom: '1px solid #c8ced8' },
  thRight: { textAlign: 'right', padding: '9px 10px', background: '#f1f5f9', borderBottom: '1px solid #c8ced8', whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' },
  tdCheck: { padding: 9, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' },
  tdRight: { padding: '9px 10px', borderBottom: '1px solid #e2e8f0', textAlign: 'right', whiteSpace: 'nowrap' },
  oddRow: { background: '#fafcff' },
  siteName: { fontWeight: 700, marginBottom: 3 },
  link: { color: '#2b6cb0', textDecoration: 'none' },
  muted: { color: '#5f6c83', fontSize: 12 },
  code: { fontSize: 11, overflowWrap: 'anywhere' },
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, color: '#5f6c83' },
  paginationButtons: { display: 'flex', alignItems: 'center', gap: 10 },
  pageButton: { minHeight: 32, border: '1px solid #aeb8c7', borderRadius: 5, background: '#fff', padding: '0 10px', cursor: 'pointer' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 },
  detailTitle: { margin: 0, fontSize: 19 },
  library: { marginTop: 16 },
  libraryTitle: { margin: '0 0 8px', fontSize: 15, color: '#2d3748' },
};
