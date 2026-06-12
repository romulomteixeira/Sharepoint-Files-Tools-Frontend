import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Download } from 'lucide-react';
import {
  getLatestInventorySiteFiles, getLatestInventorySites,
  type LatestInventorySite, type LatestSiteFile,
  type LatestSiteDrilldown, type LatestSitesPageSize,
} from '../api/inventory.api';

const PAGE_SIZES: LatestSitesPageSize[] = [10, 30, 50, 100];
const DRILLDOWN_LIMIT = 10;
const DRILL_PAGE_SIZES = [50, 100, 200] as const;
type DrillPageSize = typeof DRILL_PAGE_SIZES[number];
type DrillSort = 'size_desc' | 'size_asc' | 'versions_desc' | 'versions_asc' | 'total_desc' | 'total_asc';

interface DrillState { data: LatestSiteDrilldown; page: number; pageSize: DrillPageSize; search: string; sort: DrillSort; }

function fmtBytes(v: number | undefined): string {
  const b = Number(v || 0);
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / (1024 ** i)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${u[i]}`;
}

function fmtDate(v: string | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

function allFilesFrom(data: LatestSiteDrilldown): LatestSiteFile[] {
  return data.libraries.flatMap(lib => lib.files);
}

function applyDrillFilter(files: LatestSiteFile[], search: string, sort: DrillSort): LatestSiteFile[] {
  let r = files;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    r = r.filter(f => f.name.toLowerCase().includes(q) || (f.fullPath || '').toLowerCase().includes(q));
  }
  return [...r].sort((a, b) => {
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
}

function extStats(files: LatestSiteFile[]) {
  const m = new Map<string, { count: number; bytes: number }>();
  for (const f of files) {
    const ext = f.extension || '(sem ext)';
    const cur = m.get(ext) ?? { count: 0, bytes: 0 };
    m.set(ext, { count: cur.count + 1, bytes: cur.bytes + (f.sizeBytes || 0) });
  }
  return Array.from(m.entries()).map(([ext, v]) => ({ ext, ...v })).sort((a, b) => b.bytes - a.bytes);
}

function exportDrillCsv(site: LatestInventorySite, files: LatestSiteFile[]) {
  const header = 'Site,Biblioteca,Arquivo,Caminho,Extensão,Tamanho (bytes),Versões,Esp. versões (bytes),Total (bytes),Criado em,Modificado em,URL\n';
  const rows = files.map(f => [
    `"${(site.siteName || site.siteId).replace(/"/g, '""')}"`,
    `"${(f.driveName || f.driveId || '').replace(/"/g, '""')}"`,
    `"${(f.name || '').replace(/"/g, '""')}"`,
    `"${(f.fullPath || '').replace(/"/g, '""')}"`,
    f.extension || '', f.sizeBytes || 0, f.versionCount || 0, f.versionsBytes || 0, f.totalBytes || 0,
    f.created ? new Date(f.created).toLocaleDateString('pt-BR') : '',
    f.modified ? new Date(f.modified).toLocaleDateString('pt-BR') : '',
    `"${(f.webUrl || '').replace(/"/g, '""')}"`,
  ].join(',')).join('\n');
  const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sites_drilldown_${(site.siteName || site.siteId).replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportDrillJsonl(site: LatestInventorySite, files: LatestSiteFile[]) {
  const lines = files.map(f => JSON.stringify({ ...f, siteName: site.siteName, siteUrl: site.siteUrl })).join('\n');
  const blob = new Blob([lines + '\n'], { type: 'application/jsonl;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sites_drilldown_${(site.siteName || site.siteId).replace(/[^a-z0-9]/gi, '_').slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.jsonl`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── ExtensionChart ─────────────────────────────────────────────────────────────

function ExtensionChart({ files }: { files: LatestSiteFile[] }) {
  const stats = useMemo(() => extStats(files).slice(0, 15), [files]);
  if (!stats.length) return null;
  const maxBytes = stats[0]?.bytes || 1;
  return (
    <div className="card" style={{ marginBottom: 'var(--gap-sm)' }}>
      <div className="card-title" style={{ marginBottom: 10 }}>Extensões — espaço utilizado</div>
      <div className="stack" style={{ gap: 6 }}>
        {stats.map(({ ext, count, bytes }) => (
          <div key={ext} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 70px', gap: 8, alignItems: 'center' }}>
            <span className="mono small" style={{ color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ext}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.round((bytes / maxBytes) * 100)}%` }} />
            </div>
            <span className="small muted" style={{ textAlign: 'right' }}>{fmtBytes(bytes)}</span>
            <span className="small muted" style={{ textAlign: 'right' }}>{count} arq.</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DrilldownPanel ─────────────────────────────────────────────────────────────

function DrilldownPanel({ site, drillState, isLoading, drillError, onChangePage, onChangePageSize, onChangeSearch, onChangeSort, onExportCsv, onExportJsonl }: {
  site: LatestInventorySite; drillState: DrillState | null; isLoading: boolean; drillError: string | null;
  onChangePage: (p: number) => void; onChangePageSize: (ps: DrillPageSize) => void;
  onChangeSearch: (q: string) => void; onChangeSort: (s: DrillSort) => void;
  onExportCsv: () => void; onExportJsonl: () => void;
}) {
  if (!drillState && !drillError && !isLoading) return null;

  const allFiles = drillState ? allFilesFrom(drillState.data) : [];
  const filtered = drillState ? applyDrillFilter(allFiles, drillState.search, drillState.sort) : [];
  const ps = drillState?.pageSize ?? 50;
  const pg = drillState?.page ?? 1;
  const totalPg = Math.max(1, Math.ceil(filtered.length / ps));
  const visible = filtered.slice((pg - 1) * ps, pg * ps);

  return (
    <div className="card stack">
      <div className="page-head">
        <div>
          <h2 className="page-title" style={{ fontSize: 'var(--title-size)' }}>{site.siteName || site.siteId}</h2>
          {drillState && (
            <div className="small muted">
              Scan {drillState.data.site.scanId} · {fmtDate(drillState.data.site.scannedAt)} · {drillState.data.totalFiles.toLocaleString('pt-BR')} arquivo(s)
            </div>
          )}
        </div>
        {drillState && (
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={onExportCsv}><Download size={13} /> CSV</button>
            <button type="button" className="btn btn-sm" onClick={onExportJsonl}><Download size={13} /> JSONL</button>
          </div>
        )}
      </div>

      {isLoading && <div className="small muted">Carregando bibliotecas e arquivos…</div>}
      {drillError && <div className="pill-bad" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{drillError}</div>}

      {drillState && (
        <>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {drillState.data.libraries.map(lib => (
              <span key={lib.driveId} className="pill pill-info">{lib.driveName}</span>
            ))}
          </div>

          <ExtensionChart files={allFiles} />

          <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 220px' }}>
              <label className="field-label">Buscar arquivo</label>
              <input className="input" aria-label="Buscar arquivo" value={drillState.search} onChange={e => onChangeSearch(e.target.value)} placeholder="Nome ou caminho…" />
            </div>
            <div className="field" style={{ flex: '0 0 180px' }}>
              <label className="field-label">Ordenar por</label>
              <select className="select" value={drillState.sort} onChange={e => onChangeSort(e.target.value as DrillSort)}>
                <option value="size_desc">Tamanho ↓</option>
                <option value="size_asc">Tamanho ↑</option>
                <option value="versions_desc">Versões ↓</option>
                <option value="versions_asc">Versões ↑</option>
                <option value="total_desc">Total ↓</option>
                <option value="total_asc">Total ↑</option>
              </select>
            </div>
            <div className="field" style={{ flex: '0 0 160px' }}>
              <label className="field-label">Exibir</label>
              <select className="select" value={ps} onChange={e => onChangePageSize(Number(e.target.value) as DrillPageSize)}>
                {DRILL_PAGE_SIZES.map(n => <option key={n} value={n}>{n} por página</option>)}
              </select>
            </div>
            <span className="small muted">{filtered.length.toLocaleString('pt-BR')} arquivo(s) filtrado(s)</span>
          </div>

          {visible.length === 0 ? (
            <div className="small muted">Nenhum arquivo encontrado.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Caminho</th>
                    <th>Ext.</th>
                    <th className="td-r">Tamanho</th>
                    <th className="td-r">Versões</th>
                    <th className="td-r">Esp. versões</th>
                    <th className="td-r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(file => (
                    <tr key={`${file.driveId}:${file.itemId}`}>
                      <td className="td-ellipsis">
                        {file.webUrl
                          ? <a href={file.webUrl} target="_blank" rel="noreferrer" className="td-link">{file.name}</a>
                          : file.name}
                      </td>
                      <td className="td-mute small" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.fullPath || '—'}</td>
                      <td className="td-mono td-mute">{file.extension || '—'}</td>
                      <td className="td-r">{fmtBytes(file.sizeBytes)}</td>
                      <td className="td-r">{(file.versionCount || 0).toLocaleString('pt-BR')}</td>
                      <td className="td-r">{fmtBytes(file.versionsBytes)}</td>
                      <td className="td-r">{fmtBytes(file.totalBytes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="row">
            <span className="small muted">Página {pg} de {totalPg} · {filtered.length.toLocaleString('pt-BR')} arquivo(s)</span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" disabled={pg <= 1} onClick={() => onChangePage(pg - 1)}>Anterior</button>
            <button type="button" className="btn btn-sm" disabled={pg >= totalPg} onClick={() => onChangePage(pg + 1)}>Próxima</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────

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
    setLoading(true); setError(null);
    try {
      const r = await getLatestInventorySites({ search: appliedQuery || undefined, page, pageSize });
      setItems(r.items); setTotal(r.total); setTotalPages(r.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar sites.');
    } finally { setLoading(false); }
  }, [appliedQuery, page, pageSize]);

  useEffect(() => { void loadSites(); }, [loadSites]);

  const selectedIds = useMemo(() => new Set(selected.keys()), [selected]);
  const selectedCount = selected.size;
  const drillDisabled = selectedCount < 1 || selectedCount > DRILLDOWN_LIMIT;

  function applySearch(e: React.FormEvent) {
    e.preventDefault(); setPage(1); setAppliedQuery(query.trim());
  }

  function toggleSite(site: LatestInventorySite) {
    setSelected(cur => {
      const next = new Map(cur);
      if (next.has(site.siteId)) next.delete(site.siteId); else next.set(site.siteId, site);
      return next;
    });
  }

  function togglePage() {
    const allSel = items.length > 0 && items.every(s => selected.has(s.siteId));
    setSelected(cur => {
      const next = new Map(cur);
      for (const s of items) { if (allSel) next.delete(s.siteId); else next.set(s.siteId, s); }
      return next;
    });
  }

  async function loadDrilldown(siteId: string, targetPage = 1, pageSize: DrillPageSize = 50) {
    setDrillLoading(c => new Set(c).add(siteId));
    setDrillErrors(c => { const n = { ...c }; delete n[siteId]; return n; });
    try {
      const data = await getLatestInventorySiteFiles(siteId, { page: targetPage, pageSize: 50 });
      setDrillStates(c => {
        const prev = c[siteId];
        return { ...c, [siteId]: { data, page: targetPage, pageSize: prev?.pageSize ?? pageSize, search: prev?.search ?? '', sort: prev?.sort ?? 'size_desc' } };
      });
    } catch (err) {
      setDrillErrors(c => ({ ...c, [siteId]: err instanceof Error ? err.message : 'Erro ao detalhar o site.' }));
    } finally {
      setDrillLoading(c => { const n = new Set(c); n.delete(siteId); return n; });
    }
  }

  async function loadSelectedDrilldowns() {
    if (drillDisabled) return;
    await Promise.all(Array.from(selected.keys()).map(id => loadDrilldown(id)));
  }

  function updateDrillState(siteId: string, patch: Partial<Omit<DrillState, 'data'>>) {
    setDrillStates(c => {
      const prev = c[siteId];
      if (!prev) return c;
      return { ...c, [siteId]: { ...prev, ...patch, page: patch.page ?? 1 } };
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Sites</h1>
          <p className="page-sub">Último inventário disponível por site — clique para detalhar.</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => void loadSites()}>Atualizar</button>
      </div>

      <div className="card">
        <form className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={applySearch}>
          <div className="field" style={{ flex: '1 1 420px' }}>
            <label className="field-label">Nome, URL ou ID do site</label>
            <input className="input" aria-label="Nome, URL ou ID do site" value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: financeiro ou https://tenant/sites/financeiro" />
          </div>
          <div className="field" style={{ flex: '0 0 160px' }}>
            <label className="field-label">Sites por página</label>
            <select className="select" value={pageSize} onChange={e => { setPageSize(Number(e.target.value) as LatestSitesPageSize); setPage(1); }}>
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-primary"><Search size={14} /> Buscar</button>
        </form>

        <div className="row" style={{ margin: 'var(--gap) 0 var(--gap-sm)', padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 'var(--r-sm)', flexWrap: 'wrap' }}>
          <span className="small"><strong>{selectedCount}</strong> site(s) selecionado(s). Selecione 1–10 para abrir drill-down.</span>
          <span className="spacer" />
          <button type="button" className="btn btn-sm btn-primary" disabled={drillDisabled} onClick={() => void loadSelectedDrilldowns()}>
            Abrir drill-down
          </button>
        </div>

        {selectedCount > DRILLDOWN_LIMIT && (
          <div className="pill-warn" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', marginBottom: 'var(--gap-sm)' }}>
            Drill-down desabilitado: reduza a seleção para no máximo 10 sites.
          </div>
        )}

        {error && <div className="pill-bad" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)', marginBottom: 'var(--gap-sm)' }}>{error}</div>}

        {loading ? (
          <div className="small muted">Carregando sites inventariados…</div>
        ) : items.length === 0 ? (
          <div className="small muted">Nenhum site inventariado encontrado.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input aria-label="Selecionar todos" type="checkbox" checked={items.every(s => selectedIds.has(s.siteId))} onChange={togglePage} style={{ accentColor: 'var(--accent)' }} />
                  </th>
                  <th>Site</th>
                  <th>Última varredura</th>
                  <th>Scan de origem</th>
                  <th className="td-r">Arquivos</th>
                  <th className="td-r">Tamanho</th>
                  <th className="td-r">Versões</th>
                  <th className="td-r">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map(site => (
                  <tr key={site.siteId} style={{ background: selectedIds.has(site.siteId) ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : undefined }}>
                    <td style={{ padding: 9 }}>
                      <input aria-label={`Selecionar ${site.siteName || site.siteUrl || site.siteId}`} type="checkbox" checked={selectedIds.has(site.siteId)} onChange={() => toggleSite(site)} style={{ accentColor: 'var(--accent)' }} />
                    </td>
                    <td>
                      <div style={{ fontWeight: selectedIds.has(site.siteId) ? 700 : 600, color: selectedIds.has(site.siteId) ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{site.siteName || site.siteId}</div>
                      {site.siteUrl && <a href={site.siteUrl} target="_blank" rel="noreferrer" className="td-link small">{site.siteUrl}</a>}
                    </td>
                    <td className="td-mute small">{fmtDate(site.scannedAt)}</td>
                    <td className="td-mono small">{site.scanId}</td>
                    <td className="td-r">{site.filesCount.toLocaleString('pt-BR')}</td>
                    <td className="td-r">{fmtBytes(site.bytesTotal)}</td>
                    <td className="td-r">{fmtBytes(site.versionsBytesTotal)}</td>
                    <td className="td-r">{fmtBytes(site.totalBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row" style={{ marginTop: 14 }}>
          <span className="small muted">{total.toLocaleString('pt-BR')} site(s)</span>
          <span className="spacer" />
          <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
          <span className="small muted">Página {page} de {totalPages}</span>
          <button type="button" className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Próxima</button>
        </div>
      </div>

      {/* Drill-downs */}
      {Array.from(selected.values()).map(site => {
        const ds = drillStates[site.siteId] ?? null;
        const err = drillErrors[site.siteId] ?? null;
        const isLoad = drillLoading.has(site.siteId);
        if (!ds && !err && !isLoad) return null;
        const allFiles = ds ? allFilesFrom(ds.data) : [];
        const filtered = ds ? applyDrillFilter(allFiles, ds.search, ds.sort) : [];
        return (
          <DrilldownPanel key={site.siteId} site={site} drillState={ds} isLoading={isLoad} drillError={err}
            onChangePage={p => updateDrillState(site.siteId, { page: p })}
            onChangePageSize={ps => updateDrillState(site.siteId, { pageSize: ps })}
            onChangeSearch={q => updateDrillState(site.siteId, { search: q, page: 1 })}
            onChangeSort={sort => updateDrillState(site.siteId, { sort, page: 1 })}
            onExportCsv={() => exportDrillCsv(site, filtered)}
            onExportJsonl={() => exportDrillJsonl(site, filtered)}
          />
        );
      })}
    </>
  );
}
