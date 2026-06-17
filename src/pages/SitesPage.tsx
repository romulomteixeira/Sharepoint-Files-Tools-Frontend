import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLatestInventorySiteFiles,
  getLatestInventorySites,
  type LatestInventorySite,
  type LatestSiteFile,
  type LatestSiteDrilldown,
  type LatestSitesPageSize,
} from '../api/inventory.api';

const PAGE_SIZES: LatestSitesPageSize[] = [10, 30, 50, 100];
const DRILLDOWN_LIMIT = 10;
const DRILL_PAGE_SIZES = [50, 100, 200] as const;
type DrillPageSize = typeof DRILL_PAGE_SIZES[number];

type DrillSort =
  | 'size_desc' | 'size_asc'
  | 'versions_desc' | 'versions_asc'
  | 'total_desc' | 'total_asc';

interface DrillState {
  data:        LatestSiteDrilldown;
  page:        number;
  pageSize:    DrillPageSize;
  search:      string;
  sort:        DrillSort;
}

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

/** Extrai todos os arquivos de um drilldown (todas as bibliotecas). */
function allFilesFrom(data: LatestSiteDrilldown): LatestSiteFile[] {
  return data.libraries.flatMap(lib => lib.files);
}

/** Filtra e ordena arquivos client-side. */
function applyDrillFilter(
  files: LatestSiteFile[],
  search: string,
  sort: DrillSort,
): LatestSiteFile[] {
  let result = files;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    result = result.filter(f => f.name.toLowerCase().includes(q) || (f.fullPath || '').toLowerCase().includes(q));
  }
  result = [...result].sort((a, b) => {
    switch (sort) {
      case 'size_desc':     return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      case 'size_asc':      return (a.sizeBytes || 0) - (b.sizeBytes || 0);
      case 'versions_desc': return (b.versionCount || 0) - (a.versionCount || 0);
      case 'versions_asc':  return (a.versionCount || 0) - (b.versionCount || 0);
      case 'total_desc':    return (b.totalBytes || 0) - (a.totalBytes || 0);
      case 'total_asc':     return (a.totalBytes || 0) - (b.totalBytes || 0);
      default:              return 0;
    }
  });
  return result;
}

/** Gera contagem de arquivos e bytes por extensão. */
function extensionStats(files: LatestSiteFile[]): Array<{ ext: string; count: number; bytes: number }> {
  const map = new Map<string, { count: number; bytes: number }>();
  for (const f of files) {
    const ext = f.extension || '(sem ext)';
    const cur = map.get(ext) ?? { count: 0, bytes: 0 };
    map.set(ext, { count: cur.count + 1, bytes: cur.bytes + (f.sizeBytes || 0) });
  }
  return Array.from(map.entries())
    .map(([ext, v]) => ({ ext, ...v }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Exporta arquivos filtrados como CSV. */
function exportDrillCsv(site: LatestInventorySite, files: LatestSiteFile[]): void {
  const header = 'Site,Biblioteca,Arquivo,Caminho,Extensão,Tamanho (bytes),Versões,Esp. versões (bytes),Total (bytes),Criado em,Modificado em,Criado por,Modificado por,URL\n';
  const rows = files.map(f => [
    `"${(site.siteName || site.siteId).replace(/"/g, '""')}"`,
    `"${(f.driveName || f.driveId || '').replace(/"/g, '""')}"`,
    `"${(f.name || '').replace(/"/g, '""')}"`,
    `"${(f.fullPath || '').replace(/"/g, '""')}"`,
    f.extension || '',
    f.sizeBytes || 0,
    f.versionCount || 0,
    f.versionsBytes || 0,
    f.totalBytes || 0,
    f.created ? new Date(f.created).toLocaleDateString('pt-BR') : '',
    f.modified ? new Date(f.modified).toLocaleDateString('pt-BR') : '',
    `"${(f.createdBy || '').replace(/"/g, '""')}"`,
    `"${(f.modifiedBy || '').replace(/"/g, '""')}"`,
    `"${(f.webUrl || '').replace(/"/g, '""')}"`,
  ].join(',')).join('\n');
  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sites_drilldown_${(site.siteName || site.siteId).replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Exporta arquivos filtrados como JSONL. */
function exportDrillJsonl(site: LatestInventorySite, files: LatestSiteFile[]): void {
  const lines = files.map(f => JSON.stringify({ ...f, siteName: site.siteName, siteUrl: site.siteUrl })).join('\n');
  const blob = new Blob([lines + '\n'], { type: 'application/jsonl;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sites_drilldown_${(site.siteName || site.siteId).replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.jsonl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Gráfico de barras por extensão ──────────────────────────────────────────

function ExtensionChart({ files }: { files: LatestSiteFile[] }) {
  const stats = useMemo(() => extensionStats(files).slice(0, 15), [files]);
  if (!stats.length) return null;
  const maxBytes = stats[0]?.bytes || 1;
  return (
    <div style={chartStyles.wrap}>
      <div style={chartStyles.title}>Extensões — espaço utilizado</div>
      <div style={chartStyles.rows}>
        {stats.map(({ ext, count, bytes }) => (
          <div key={ext} style={chartStyles.row}>
            <div style={chartStyles.label} title={ext}>{ext}</div>
            <div style={chartStyles.barArea}>
              <div
                style={{ ...chartStyles.bar, width: `${Math.round((bytes / maxBytes) * 100)}%` }}
                title={`${formatBytes(bytes)} · ${count} arquivo(s)`}
              />
            </div>
            <div style={chartStyles.meta}>{formatBytes(bytes)}</div>
            <div style={chartStyles.count}>{count} arq.</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const chartStyles: Record<string, React.CSSProperties> = {
  wrap:    { background: 'var(--panel-2)', border: '1px solid var(--border-soft)', borderRadius: 'var(--r-md)', padding: 'var(--pad-card)', marginBottom: 'var(--gap-sm)' },
  title:   { fontWeight: 700, fontSize: 'calc(var(--fs-base) + 1px)', marginBottom: 10, color: 'var(--text)' },
  rows:    { display: 'flex', flexDirection: 'column', gap: 6 },
  row:     { display: 'grid', gridTemplateColumns: '90px 1fr 90px 70px', gap: 8, alignItems: 'center' },
  label:   { fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  barArea: { background: 'var(--track)', borderRadius: 'var(--r-pill)', height: 14, overflow: 'hidden' },
  bar:     { background: 'var(--accent)', height: '100%', borderRadius: 'var(--r-pill)', transition: 'width .3s ease', minWidth: 4 },
  meta:    { textAlign: 'right', fontSize: 'var(--fs-xs)', color: 'var(--muted)' },
  count:   { textAlign: 'right', fontSize: 'var(--fs-xs)', color: 'var(--faint)' },
};

// ─── Painel de drill-down de um site ─────────────────────────────────────────

function DrilldownPanel({
  site,
  drillState,
  isLoading,
  drillError,
  onChangePage,
  onChangePageSize,
  onChangeSearch,
  onChangeSort,
  onExportCsv,
  onExportJsonl,
}: {
  site:            LatestInventorySite;
  drillState:      DrillState | null;
  isLoading:       boolean;
  drillError:      string | null;
  onChangePage:    (p: number) => void;
  onChangePageSize:(ps: DrillPageSize) => void;
  onChangeSearch:  (q: string) => void;
  onChangeSort:    (s: DrillSort) => void;
  onExportCsv:     () => void;
  onExportJsonl:   () => void;
}) {
  if (!drillState && !drillError && !isLoading) return null;

  const allFiles = drillState ? allFilesFrom(drillState.data) : [];
  // Busca, ordenação e paginação são aplicadas client-side sobre todos os arquivos do site.
  const filtered = drillState ? applyDrillFilter(allFiles, drillState.search, drillState.sort) : [];
  const ps       = drillState?.pageSize ?? 50;
  const pg       = drillState?.page ?? 1;
  const totalPg  = Math.max(1, Math.ceil(filtered.length / ps));
  const visible  = filtered.slice((pg - 1) * ps, pg * ps);

  return (
    <section style={styles.panel}>
      <div style={styles.detailHeader}>
        <div>
          <h2 style={styles.detailTitle}>{site.siteName || site.siteId}</h2>
          {drillState && (
            <div style={styles.muted}>
              Scan {drillState.data.site.scanId} · {formatDate(drillState.data.site.scannedAt)} · {drillState.data.totalFiles.toLocaleString('pt-BR')} arquivo(s) no servidor
            </div>
          )}
        </div>
        {drillState && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={styles.secondaryButton} onClick={onExportCsv}>↓ CSV</button>
            <button type="button" style={styles.secondaryButton} onClick={onExportJsonl}>↓ JSONL</button>
          </div>
        )}
      </div>

      {isLoading && <div style={styles.empty}>Carregando bibliotecas e arquivos…</div>}
      {drillError && <div role="alert" style={styles.error}>{drillError}</div>}

      {drillState && (
        <>
          {/* Bibliotecas incluídas */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {drillState.data.libraries.map(lib => (
              <h3 key={lib.driveId} className="pill pill-info" style={{ margin: 0, fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
                {lib.driveName}
              </h3>
            ))}
          </div>

          {/* Gráfico de extensões */}
          <ExtensionChart files={allFiles} />

          {/* Controles de filtro */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <label style={styles.label}>
              Buscar arquivo
              <input
                aria-label="Buscar arquivo no drill-down"
                value={drillState.search}
                onChange={e => onChangeSearch(e.target.value)}
                placeholder="Nome ou caminho…"
                style={{ ...styles.input, minWidth: 220 }}
              />
            </label>
            <label style={styles.label}>
              Ordenar por
              <select
                aria-label="Ordenação"
                value={drillState.sort}
                onChange={e => onChangeSort(e.target.value as DrillSort)}
                style={styles.select}
              >
                <option value="size_desc">Tamanho ↓</option>
                <option value="size_asc">Tamanho ↑</option>
                <option value="versions_desc">Versões ↓</option>
                <option value="versions_asc">Versões ↑</option>
                <option value="total_desc">Total ↓</option>
                <option value="total_asc">Total ↑</option>
              </select>
            </label>
            <label style={styles.label}>
              Exibir
              <select
                aria-label="Itens por página"
                value={ps}
                onChange={e => onChangePageSize(Number(e.target.value) as DrillPageSize)}
                style={styles.select}
              >
                {DRILL_PAGE_SIZES.map(n => <option key={n} value={n}>{n} por página</option>)}
              </select>
            </label>
            <span style={{ ...styles.muted, alignSelf: 'center', marginBottom: 2 }}>
              {filtered.length.toLocaleString('pt-BR')} arquivo(s) filtrado(s)
            </span>
          </div>

          {/* Tabela de arquivos */}
          {visible.length === 0 ? (
            <div style={styles.empty}>Nenhum arquivo encontrado com os filtros atuais.</div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Arquivo</th>
                    <th style={styles.th}>Caminho</th>
                    <th style={styles.th}>Ext.</th>
                    <th style={styles.thRight}>Tamanho</th>
                    <th style={styles.thRight}>Versões</th>
                    <th style={styles.thRight}>Esp. versões</th>
                    <th style={styles.thRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(file => (
                    <tr key={`${file.driveId}:${file.itemId}`}>
                      <td style={styles.td}>
                        {file.webUrl
                          ? <a href={file.webUrl} target="_blank" rel="noreferrer" style={styles.link}>{file.name}</a>
                          : file.name}
                      </td>
                      <td style={{ ...styles.td, fontSize: 11, color: '#718096' }}>
                        {file.fullPath || '—'}
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 11 }}>{file.extension || '—'}</td>
                      <td style={styles.tdRight}>{formatBytes(file.sizeBytes)}</td>
                      <td style={styles.tdRight}>{(file.versionCount || 0).toLocaleString('pt-BR')}</td>
                      <td style={styles.tdRight}>{formatBytes(file.versionsBytes)}</td>
                      <td style={styles.tdRight}>{formatBytes(file.totalBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação do drill-down */}
          <footer style={styles.pagination}>
            <span style={styles.muted}>
              Página {pg} de {totalPg} · {filtered.length.toLocaleString('pt-BR')} arquivo(s)
            </span>
            <div style={styles.paginationButtons}>
              <button type="button" disabled={pg <= 1} onClick={() => onChangePage(pg - 1)} style={styles.pageButton}>Anterior</button>
              <button type="button" disabled={pg >= totalPg} onClick={() => onChangePage(pg + 1)} style={styles.pageButton}>Próxima</button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

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
  const [drillStates, setDrillStates] = useState<Record<string, DrillState>>({});
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

  async function loadDrilldown(siteId: string): Promise<void> {
    setDrillLoading(current => new Set(current).add(siteId));
    setDrillErrors(current => {
      const next = { ...current };
      delete next[siteId];
      return next;
    });
    try {
      // O backend pagina os arquivos do site; como o drill-down é limitado a poucos
      // sites, buscamos todas as páginas e agregamos para permitir busca, ordenação
      // e paginação client-side sobre o conjunto completo.
      const FETCH_SIZE = 100;
      const MAX_PAGES = 50;
      const byDrive = new Map<string, LatestSiteDrilldown['libraries'][number]>();
      const ingest = (libs: LatestSiteDrilldown['libraries']): void => {
        for (const lib of libs) {
          const existing = byDrive.get(lib.driveId);
          if (existing) existing.files.push(...lib.files);
          else byDrive.set(lib.driveId, { ...lib, files: [...lib.files] });
        }
      };

      const first = await getLatestInventorySiteFiles(siteId, { page: 1, pageSize: FETCH_SIZE });
      ingest(first.libraries);
      const totalPages = Math.min(first.totalPages || 1, MAX_PAGES);
      for (let page = 2; page <= totalPages; page++) {
        const next = await getLatestInventorySiteFiles(siteId, { page, pageSize: FETCH_SIZE });
        ingest(next.libraries);
      }

      const data: LatestSiteDrilldown = {
        ...first,
        page: 1,
        pageSize: FETCH_SIZE,
        libraries: Array.from(byDrive.values()),
      };
      setDrillStates(current => {
        const prev = current[siteId];
        return {
          ...current,
          [siteId]: {
            data,
            page:     1,
            pageSize: prev?.pageSize ?? 50,
            search:   prev?.search ?? '',
            sort:     prev?.sort   ?? 'size_desc',
          },
        };
      });
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

  function updateDrillState(siteId: string, patch: Partial<Omit<DrillState, 'data'>>): void {
    setDrillStates(current => {
      const prev = current[siteId];
      if (!prev) return current;
      return { ...current, [siteId]: { ...prev, ...patch, page: patch.page ?? 1 } };
    });
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

      {/* Drill-downs */}
      {Array.from(selected.values()).map(site => {
        const ds       = drillStates[site.siteId] ?? null;
        const err      = drillErrors[site.siteId] ?? null;
        const isLoad   = drillLoading.has(site.siteId);
        if (!ds && !err && !isLoad) return null;

        const allFiles = ds ? allFilesFrom(ds.data) : [];
        const filtered = ds ? applyDrillFilter(allFiles, ds.search, ds.sort) : [];

        return (
          <DrilldownPanel
            key={site.siteId}
            site={site}
            drillState={ds}
            isLoading={isLoad}
            drillError={err}
            onChangePage={p => updateDrillState(site.siteId, { page: p })}
            onChangePageSize={ps => updateDrillState(site.siteId, { pageSize: ps })}
            onChangeSearch={q => updateDrillState(site.siteId, { search: q, page: 1 })}
            onChangeSort={sort => updateDrillState(site.siteId, { sort, page: 1 })}
            onExportCsv={() => exportDrillCsv(site, filtered)}
            onExportJsonl={() => exportDrillJsonl(site, filtered)}
          />
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--gap)', color: 'var(--text)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  title: { margin: 0, fontSize: 'var(--title-size)', fontWeight: 750, letterSpacing: '-.01em' },
  subtitle: { margin: '3px 0 0', color: 'var(--muted)', fontSize: 'var(--fs-sm)' },
  panel: { background: 'var(--panel)', border: 'var(--card-border)', borderRadius: 'var(--r-md)', padding: 'var(--pad-card)', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 'var(--gap-sm)' },
  filters: { display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' },
  growLabel: { display: 'grid', gap: 4, flex: '1 1 420px', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' },
  label: { display: 'grid', gap: 4, minWidth: 150, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' },
  input: { height: 'var(--ctl-h)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 10px', background: 'var(--panel)', color: 'var(--text)', fontSize: 'var(--fs-base)' },
  select: { height: 'var(--ctl-h)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 10px', background: 'var(--panel)', color: 'var(--text)', fontSize: 'var(--fs-base)', cursor: 'pointer' },
  primaryButton: { height: 'var(--ctl-h)', border: 0, borderRadius: 'var(--r-sm)', padding: '0 16px', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 'var(--fs-base)' },
  secondaryButton: { height: 'var(--ctl-h)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '0 14px', background: 'var(--panel-2)', color: 'var(--text)', fontWeight: 650, cursor: 'pointer', fontSize: 'var(--fs-base)' },
  disabled: { opacity: 0.5, cursor: 'not-allowed' },
  selectionBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 12, background: 'var(--panel-2)', borderRadius: 'var(--r-sm)', fontSize: 'var(--fs-sm)' },
  warning: { padding: 10, background: 'var(--warn-bg)', border: '1px solid var(--warn-bd)', borderRadius: 'var(--r-sm)', color: 'var(--warn)', fontSize: 'var(--fs-sm)' },
  error: { padding: 10, background: 'var(--bad-bg)', border: '1px solid var(--bad-bd)', borderRadius: 'var(--r-sm)', color: 'var(--bad)', fontSize: 'var(--fs-sm)' },
  empty: { padding: 24, textAlign: 'center', color: 'var(--muted)' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-base)' },
  th: { textAlign: 'left', padding: '7px 10px', background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  thCheck: { width: 36, padding: 9, background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' },
  thRight: { textAlign: 'right', padding: '7px 10px', background: 'var(--panel-2)', color: 'var(--muted)', fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' },
  td: { padding: '9px 10px', borderBottom: '1px solid var(--border-soft)', verticalAlign: 'top' },
  tdCheck: { padding: 9, borderBottom: '1px solid var(--border-soft)', verticalAlign: 'top' },
  tdRight: { padding: '9px 10px', borderBottom: '1px solid var(--border-soft)', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  oddRow: { background: 'color-mix(in srgb, var(--accent) 3%, transparent)' },
  siteName: { fontWeight: 700, marginBottom: 3 },
  link: { color: 'var(--accent)', textDecoration: 'none' },
  muted: { color: 'var(--muted)', fontSize: 'var(--fs-sm)' },
  code: { fontSize: 'var(--fs-xs)', overflowWrap: 'anywhere', fontFamily: "'Cascadia Code', Consolas, monospace" },
  pagination: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 4, color: 'var(--muted)', fontSize: 'var(--fs-sm)' },
  paginationButtons: { display: 'flex', alignItems: 'center', gap: 10 },
  pageButton: { height: 'calc(var(--ctl-h) - 4px)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--panel)', color: 'var(--text)', padding: '0 10px', cursor: 'pointer' },
  detailHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 },
  detailTitle: { margin: 0, fontSize: 'calc(var(--fs-base) + 5px)', fontWeight: 700 },
};
