/**
 * ScansPage.tsx — Tela "Sites" (paridade com legacy):
 *   • Card "Listar sites" do tenant via Graph
 *   • Card "Iniciar varredura": escopo (todos/selecionados), search, limite,
 *     concorrência, delta $top + botão iniciar
 *   • Histórico de scans com Cancelar + Excluir
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans, createScan, deleteScan, cancelScan } from '../api/scans.api';
import { ApiClientError, get } from '../api/client';
import type { Scan } from '../types';

const C = {
  panel: '#ffffff', border: '#c8ced8', accent: '#2b6cb0',
  text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function statusBadge(status: Scan['status']): React.ReactElement {
  const colors: Record<string, string> = {
    completed: '#d1fae5', running: '#dbeafe', pending: '#fef3c7', failed: '#fee2e2', cancelled: '#f3f4f6',
  };
  const text: Record<string, string> = {
    completed: '#065f46', running: '#1e40af', pending: '#92400e', failed: '#991b1b', cancelled: '#374151',
  };
  return (
    <span style={{
      background: colors[status] ?? '#f3f4f6', color: text[status] ?? '#374151',
      padding: '0.2rem 0.6rem', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
    }}>{status}</span>
  );
}

interface SiteRow { id: string; displayName: string; webUrl: string }

export default function ScansPage(): React.ReactElement {
  const { data: scans, loading, error, refetch } = useApi(listScans, []);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Form de varredura
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [siteSearch, setSiteSearch] = useState('*');
  const [maxSites, setMaxSites] = useState('0'); // 0 = ilimitado
  const [quickMode, setQuickMode] = useState<'' | 'fast' | 'estimate'>('');
  const [concurrency, setConcurrency] = useState('2');
  const [deltaTop, setDeltaTop] = useState('999');

  // Listar sites
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedSites, setSelectedSites] = useState<Set<string>>(new Set());
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [sitesSearchQ, setSitesSearchQ] = useState('*');
  const [sitesTop, setSitesTop] = useState('50');

  async function handleLoadSites() {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const resp = await get<{ items?: SiteRow[]; sites?: SiteRow[] }>(`/api/sites`, { search: sitesSearchQ, max: Number(sitesTop) || 50 });
      setSites(resp.items ?? resp.sites ?? []);
    } catch (err) {
      setSitesError(err instanceof ApiClientError ? err.message : 'Erro ao listar sites');
    } finally {
      setSitesLoading(false);
    }
  }

  function toggleSite(id: string) {
    setSelectedSites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAllSites() { setSelectedSites(new Set(sites.map(s => s.id))); }
  function clearSites() { setSelectedSites(new Set()); }

  async function handleCreateScan() {
    setCreating(true);
    setCreateError(null);
    try {
      const params: Record<string, unknown> = {};
      if (scope === 'all') {
        params.allSites = true;
        params.siteSearch = siteSearch.trim() || '*';
        const n = Number(maxSites);
        if (n > 0) params.maxSites = n;
        // n=0 → ilimitado (backend default agora)
      } else {
        params.siteIds = Array.from(selectedSites);
        if ((params.siteIds as string[]).length === 0) {
          throw new Error('Selecione ao menos 1 site, ou troque para "Todos os sites".');
        }
      }
      if (quickMode) params.quickMode = quickMode;
      const conc = Number(concurrency);
      if (conc > 0) params.concurrency = conc;
      const dt = Number(deltaTop);
      if (dt > 0) params.deltaTop = dt;

      await createScan(params);
      refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao iniciar scan.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(scan: Scan) {
    const ok = window.confirm(
      `Excluir o scan ${scan.id.slice(0, 8)}…?\n\nIRREVERSÍVEL — arquivos, rollups e logs serão removidos.`,
    );
    if (!ok) return;
    setDeletingId(scan.id);
    try { await deleteScan(scan.id); refetch(); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Erro ao excluir.'); }
    finally { setDeletingId(null); }
  }

  async function handleCancel(scan: Scan) {
    const ok = window.confirm(`Cancelar o scan ${scan.id.slice(0, 8)}…? Workers param em ~5 s.`);
    if (!ok) return;
    setCancellingId(scan.id);
    try { await cancelScan(scan.id); refetch(); }
    catch (e) { window.alert(e instanceof Error ? e.message : 'Erro ao cancelar.'); }
    finally { setCancellingId(null); }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.pageTitle}>Sites &amp; Varredura</div>
          <div style={s.pageSub}>Liste sites do tenant e dispare varreduras de inventário</div>
        </div>
      </div>

      <div style={s.twoCol}>
        {/* Card Listar Sites */}
        <div style={s.card}>
          <div style={s.cardHead}>
            <div style={s.cardTitle}>Listar sites</div>
            <div style={s.cardSub}>Carrega via Graph <span style={s.mono}>/sites?search=</span>. Para varrer tudo, use escopo "Todos os sites".</div>
          </div>
          <div style={s.formRow}>
            <input value={sitesSearchQ} onChange={e => setSitesSearchQ(e.target.value)} placeholder="search" style={{ ...s.input, flex: 1, minWidth: 160 }} />
            <input type="number" min={1} max={999} value={sitesTop} onChange={e => setSitesTop(e.target.value)} style={{ ...s.input, width: 80 }} />
            <button onClick={handleLoadSites} disabled={sitesLoading} style={s.btnSecondary}>
              {sitesLoading ? 'Carregando…' : 'Carregar'}
            </button>
          </div>
          {sitesError && <div style={s.errorBox}>⚠ {sitesError}</div>}
          {sites.length > 0 && (
            <>
              <div style={s.sitesActions}>
                <span style={{ fontSize: 11, color: C.muted }}>
                  Listados: <strong>{sites.length}</strong> · Selecionados: <strong>{selectedSites.size}</strong>
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={selectAllSites} style={s.btnSmall}>Selecionar tudo</button>
                  <button onClick={clearSites} style={s.btnSmall}>Limpar</button>
                </div>
              </div>
              <div style={s.sitesTableWrap}>
                <table style={s.tbl}>
                  <thead><tr><th style={{ ...s.th, width: 30 }}></th><th style={s.th}>Site</th><th style={s.th}>URL</th></tr></thead>
                  <tbody>
                    {sites.map(site => (
                      <tr key={site.id} style={s.trSite}>
                        <td style={s.td}><input type="checkbox" checked={selectedSites.has(site.id)} onChange={() => toggleSite(site.id)} /></td>
                        <td style={s.td}>{site.displayName}</td>
                        <td style={{ ...s.td, ...s.cellMuted }}><div style={s.cellEllipsis} title={site.webUrl}>{site.webUrl}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Card Iniciar Varredura */}
        <div style={s.card}>
          <div style={s.cardHead}>
            <div style={s.cardTitle}>Iniciar varredura</div>
            <div style={s.cardSub}>Inventário de bibliotecas e arquivos (retry 429/503 automático)</div>
          </div>
          <div style={s.formGrid}>
            <label style={s.label}>Escopo</label>
            <div style={s.formInline}>
              <select value={scope} onChange={e => setScope(e.target.value as 'all' | 'selected')} style={s.input}>
                <option value="all">Todos os sites (search=*)</option>
                <option value="selected">Sites selecionados</option>
              </select>
              <span style={{ fontSize: 11, color: C.muted }}>Quick mode:</span>
              <select value={quickMode} onChange={e => setQuickMode(e.target.value as ''|'fast'|'estimate')} style={s.input}>
                <option value="">Completo</option>
                <option value="fast">Rápido</option>
                <option value="estimate">Estimativa</option>
              </select>
            </div>
            {scope === 'all' && (
              <>
                <label style={s.label}>Search &amp; limite</label>
                <div style={s.formInline}>
                  <input value={siteSearch} onChange={e => setSiteSearch(e.target.value)} placeholder="*" style={{ ...s.input, maxWidth: 200 }} />
                  <input type="number" min={0} max={50000} value={maxSites} onChange={e => setMaxSites(e.target.value)} style={{ ...s.input, width: 110 }} title="0 = ilimitado (varre tudo)" />
                  <span style={{ fontSize: 10, color: C.muted }}>(0 = ilimitado)</span>
                </div>
              </>
            )}
            {scope === 'selected' && (
              <>
                <label style={s.label}>Sites selecionados</label>
                <div style={{ fontSize: 12, color: C.muted }}><strong>{selectedSites.size}</strong> site(s) na tabela à esquerda.</div>
              </>
            )}
            <label style={s.label}>Parâmetros</label>
            <div style={s.formInline}>
              <span style={{ fontSize: 11, color: C.muted }}>Concorrência</span>
              <input type="number" min={1} max={10} value={concurrency} onChange={e => setConcurrency(e.target.value)} style={{ ...s.input, width: 80 }} />
              <span style={{ fontSize: 11, color: C.muted }}>Delta $top</span>
              <input type="number" min={50} max={999} value={deltaTop} onChange={e => setDeltaTop(e.target.value)} style={{ ...s.input, width: 90 }} />
            </div>
            <div style={s.formInline}>
              <button onClick={handleCreateScan} disabled={creating} style={s.btnPrimary}>
                {creating ? 'Iniciando…' : '▶ Iniciar varredura'}
              </button>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>
                💡 <strong>Versões</strong> coletadas automaticamente ao final.
              </span>
            </div>
          </div>
          {createError && <div style={s.errorBox}>⚠ {createError}</div>}
        </div>
      </div>

      {/* Histórico */}
      <div style={s.card}>
        <div style={s.cardHead}>
          <div style={s.cardTitle}>Histórico de scans</div>
          <div style={s.cardSub}>{scans?.length ?? 0} scan(s) no registro</div>
        </div>
        {loading && <p style={{ fontSize: 12, color: C.muted, padding: 8 }}>Carregando scans…</p>}
        {error && <div style={s.errorBox}>{error}</div>}
        {!loading && !error && scans && scans.length === 0 && (
          <p style={{ fontSize: 12, color: C.muted, padding: 16 }}>Nenhum scan registrado.</p>
        )}
        {!loading && scans && scans.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.tbl}>
              <thead>
                <tr>
                  <th style={s.th}>ID</th><th style={s.th}>Status</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Sites</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Arquivos</th>
                  <th style={{ ...s.th, textAlign: 'right' as const }}>Volume</th>
                  <th style={s.th}>Criado em</th><th style={s.th}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {scans.map(scan => {
                  const active = scan.status === 'running' || scan.status === 'pending';
                  return (
                    <tr key={scan.id}>
                      <td style={s.td}><span style={s.mono} title={scan.id}>{scan.id.slice(0, 12)}…</span></td>
                      <td style={s.td}>{statusBadge(scan.status)}</td>
                      <td style={{ ...s.td, ...s.right }}>{scan.totalSites?.toLocaleString('pt-BR') ?? '—'}</td>
                      <td style={{ ...s.td, ...s.right }}>{scan.totalFiles?.toLocaleString('pt-BR') ?? '—'}</td>
                      <td style={{ ...s.td, ...s.right }}>{formatBytes(scan.totalBytes)}</td>
                      <td style={s.td}>{new Date(scan.createdAt).toLocaleString('pt-BR')}</td>
                      <td style={s.td}>
                        <div style={s.rowActions}>
                          {active && <Link to={`/jobs/${scan.id}`} style={s.link}>Progresso</Link>}
                          {scan.status === 'completed' && <Link to={`/inventory/${scan.id}`} style={s.link}>Inventário</Link>}
                          {active && (
                            <button onClick={() => handleCancel(scan)} disabled={cancellingId === scan.id} style={s.btnWarn}>
                              {cancellingId === scan.id ? 'Cancelando…' : 'Cancelar'}
                            </button>
                          )}
                          <button onClick={() => handleDelete(scan)} disabled={deletingId === scan.id} style={s.btnDanger}>
                            {deletingId === scan.id ? 'Excluindo…' : 'Excluir'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", display: 'flex', flexDirection: 'column', gap: 12 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.2 },
  pageSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  card: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: '14px 16px' },
  cardHead: { marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #e8ecf1' },
  cardTitle: { fontWeight: 700, fontSize: 14 },
  cardSub: { fontSize: 11, color: C.muted, marginTop: 3 },
  formRow: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const },
  formGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  formInline: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const },
  label: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '.06em', marginTop: 6 },
  input: { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, color: C.text, background: C.panel, fontFamily: 'inherit' },
  btnPrimary: { padding: '8px 18px', background: C.accent, color: '#fff', border: `1px solid ${C.accent}`, borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  btnSecondary: { padding: '6px 14px', background: '#f7f9fb', color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  btnSmall: { padding: '3px 10px', background: '#f7f9fb', color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  btnWarn: { padding: '3px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  btnDanger: { padding: '3px 10px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 3, fontSize: 11, fontWeight: 600, cursor: 'pointer' },
  errorBox: { color: C.bad, background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 4, padding: '8px 10px', fontSize: 12, marginTop: 8 },
  sitesActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  sitesTableWrap: { maxHeight: 260, overflowY: 'auto' as const, border: `1px solid ${C.border}`, borderRadius: 4 },
  trSite: { borderBottom: '1px solid #f1f5f9' },
  tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '7px 10px', textAlign: 'left' as const, fontWeight: 700, fontSize: 10, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '.05em', background: '#f7f9fb', borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap' as const },
  td: { padding: '7px 10px', verticalAlign: 'middle' as const, borderBottom: '1px solid #edf0f4' },
  right: { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const },
  cellMuted: { color: C.muted, fontSize: 11 },
  cellEllipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 220 },
  mono: { fontFamily: 'monospace', fontSize: 11 },
  link: { color: C.accent, textDecoration: 'none', fontWeight: 500, fontSize: 12 },
  rowActions: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' as const },
};
