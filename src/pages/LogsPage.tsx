/**
 * LogsPage.tsx — Logs de sistema (Sprint 17)
 *
 * Rota: /logs
 * Endpoint: GET /api/logs?limit=N
 *
 * Funcionalidades:
 *   - Tabela de eventos com timestamp, nível, fonte/kind e mensagem
 *   - Filtro por nível (info / warn / error)
 *   - Busca textual (msg + kind + scanId + jobId)
 *   - Auto-refresh a cada 30 s (toggle)
 *   - Clique na linha expande detalhes em JSON
 *   - Exportação CSV dos itens visíveis
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLogs, castRaw, type LogEntry } from '../api/logs.api';
import { ApiClientError } from '../api/client';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#eef1f5', panel: '#ffffff', border: '#c8ced8',
  accent: '#2b6cb0', text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

// ─── Constantes ───────────────────────────────────────────────────────────────

const LIMIT_OPTIONS = [100, 500, 1000, 2000] as const;
type LimitOption   = typeof LIMIT_OPTIONS[number];
type LevelFilter   = 'all' | 'info' | 'warn' | 'error';

const LEVEL_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  info:  { bg: '#ebf8ff', color: '#2b6cb0', border: '#90cdf4' },
  warn:  { bg: '#fffaf0', color: '#c05621', border: '#fbd38d' },
  error: { bg: '#fff5f5', color: '#c53030', border: '#fca5a5' },
};
const LEVEL_DEFAULT = LEVEL_STYLE.info;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return String(iso); }
}

function levelStyle(level: string) {
  return LEVEL_STYLE[level.toLowerCase()] ?? LEVEL_DEFAULT;
}

function downloadCsv(items: LogEntry[], filename: string): void {
  const header = 'Timestamp,Nível,Fonte,Mensagem,ScanId,JobId\n';
  const rows = items.map(i =>
    [fmtTs(i.t), i.level, i.kind ?? i.source ?? '', i.msg, i.scanId ?? '', i.jobId ?? '']
      .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function LogsPage(): React.ReactElement {
  const [items,       setItems]       = useState<LogEntry[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [limit,       setLimit]       = useState<LimitOption>(500);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all');
  const [search,      setSearch]      = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastFetch,   setLastFetch]   = useState<Date | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLogs({ limit });
      setItems(castRaw<LogEntry>(res));
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  // ── Auto-refresh ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(() => { void fetchLogs(); }, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs]);

  // ── Contagens por nível ───────────────────────────────────────────────────
  const counts = { info: 0, warn: 0, error: 0 };
  for (const it of items) {
    const lv = it.level?.toLowerCase();
    if (lv === 'info')  counts.info++;
    else if (lv === 'warn')  counts.warn++;
    else if (lv === 'error') counts.error++;
  }

  // ── Filtragem ─────────────────────────────────────────────────────────────
  const filtered = items.filter(it => {
    if (levelFilter !== 'all' && it.level?.toLowerCase() !== levelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [it.msg, it.kind, it.source, it.scanId, it.jobId, it.action]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{`@keyframes lg-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Logs de Sistema</h1>
          <p style={s.sub}>
            Eventos de jobs, scans, versões e erros do servidor
            {lastFetch && (
              <span style={{ marginLeft: 10, fontSize: 11, color: C.muted }}>
                — atualizado às {lastFetch.toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
        <div style={s.headerRight}>
          <button
            style={{ ...s.btnSm, ...(autoRefresh ? s.btnSm__active : {}) }}
            onClick={() => setAutoRefresh(v => !v)}
          >
            {autoRefresh ? '⏵ Auto 30s' : '⏸ Auto off'}
          </button>
          <select
            style={s.select}
            value={limit}
            onChange={e => setLimit(Number(e.target.value) as LimitOption)}
          >
            {LIMIT_OPTIONS.map(n => (
              <option key={n} value={n}>{n} entradas</option>
            ))}
          </select>
          <button style={s.btnPrimary} onClick={() => void fetchLogs()} disabled={loading}>
            {loading ? '…' : '↻ Atualizar'}
          </button>
          <button style={s.btnSm} onClick={() => downloadCsv(filtered, `logs-${new Date().toISOString().slice(0,10)}.csv`)} disabled={filtered.length === 0}>
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* ── Filtros de nível ───────────────────────────────────────────────── */}
      <div style={s.filterRow}>
        {(['all', 'info', 'warn', 'error'] as const).map(lv => (
          <button
            key={lv}
            style={levelFilter === lv ? { ...s.tab, ...s.tabActive } : s.tab}
            onClick={() => { setLevelFilter(lv); setExpandedIdx(null); }}
          >
            {lv === 'all'
              ? `Todos (${items.length})`
              : `${lv.charAt(0).toUpperCase() + lv.slice(1)} (${counts[lv]})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          style={s.searchInput}
          placeholder="Buscar mensagem, scan, job…"
          value={search}
          onChange={e => { setSearch(e.target.value); setExpandedIdx(null); }}
        />
      </div>

      {/* ── Erro ───────────────────────────────────────────────────────────── */}
      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Loading inicial ─────────────────────────────────────────────────── */}
      {loading && items.length === 0 && (
        <div style={s.spinWrap}>
          <div style={s.spinner} />
        </div>
      )}

      {/* ── Tabela ─────────────────────────────────────────────────────────── */}
      {(!loading || items.length > 0) && (
        <div style={s.panel}>
          {filtered.length === 0 ? (
            <div style={s.empty}>
              {items.length === 0
                ? 'Nenhum log encontrado. Verifique se o backend está acessível.'
                : 'Nenhum log corresponde aos filtros aplicados.'}
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 160 }}>Timestamp</th>
                  <th style={{ ...s.th, width: 70  }}>Nível</th>
                  <th style={{ ...s.th, width: 110 }}>Fonte / Kind</th>
                  <th style={s.th}>Mensagem</th>
                  <th style={{ ...s.th, width: 130 }}>Scan / Job</th>
                  <th style={{ ...s.th, width: 28  }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const ls       = levelStyle(item.level ?? 'info');
                  const expanded = expandedIdx === idx;
                  const source   = String(item.kind ?? item.source ?? '—');
                  const ref      = String(item.scanId ?? item.jobId ?? '—');
                  return (
                    <React.Fragment key={idx}>
                      <tr
                        style={{
                          ...s.tr,
                          cursor: 'pointer',
                          background: expanded ? '#f0f4f8' : undefined,
                        }}
                        onClick={() => setExpandedIdx(expanded ? null : idx)}
                      >
                        <td style={s.td}>
                          <span style={s.mono}>{fmtTs(item.t)}</span>
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.badge, background: ls.bg, color: ls.color, border: `1px solid ${ls.border}` }}>
                            {item.level ?? 'info'}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={s.chip}>{source}</span>
                        </td>
                        <td style={{ ...s.td, maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.msg}
                        </td>
                        <td style={s.td}>
                          <span style={{ ...s.chip, fontFamily: 'monospace', fontSize: 11 }}>{ref}</span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'center', color: C.muted, fontSize: 12 }}>
                          {expanded ? '▲' : '▼'}
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td colSpan={6} style={{ padding: '10px 16px', background: '#f7fafc', borderBottom: `1px solid ${C.border}` }}>
                            <pre style={s.pre}>{JSON.stringify(item, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          {filtered.length > 0 && (
            <div style={s.tableFooter}>
              Exibindo{' '}
              <strong>{filtered.length.toLocaleString('pt-BR')}</strong> de{' '}
              <strong>{items.length.toLocaleString('pt-BR')}</strong> entradas
              {loading && <span style={{ marginLeft: 8, color: C.accent }}>atualizando…</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { padding: '0 0 32px' },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 10,
  },
  h1:  { margin: 0, fontSize: 22, fontWeight: 800, color: C.text },
  sub: { margin: '2px 0 0', fontSize: 13, color: C.muted },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },

  filterRow: {
    display: 'flex',
    gap: 4,
    marginBottom: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  tab: {
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 4,
    border: `1px solid ${C.border}`,
    background: '#fff',
    color: C.muted,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  tabActive: {
    background: C.accent,
    color: '#fff',
    borderColor: C.accent,
  },
  searchInput: {
    padding: '5px 10px',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'inherit',
    width: 240,
    outline: 'none',
    background: '#fff',
  },
  select: {
    padding: '5px 8px',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    background: '#fff',
  },
  btnPrimary: {
    padding: '5px 14px',
    background: C.accent,
    color: '#fff',
    border: `1px solid ${C.accent}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSm: {
    padding: '5px 10px',
    background: '#fff',
    color: C.text,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnSm__active: {
    background: C.accent,
    color: '#fff',
    borderColor: C.accent,
  },

  panel: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    borderBottom: `1px solid ${C.border}`,
    background: '#f7f9fc',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: `1px solid #eef1f5`,
  },
  td: {
    padding: '7px 12px',
    color: C.text,
    verticalAlign: 'middle',
  },
  badge: {
    display: 'inline-block',
    padding: '1px 7px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  },
  chip: {
    color: C.muted,
    fontSize: 12,
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'inline-block',
    whiteSpace: 'nowrap',
    verticalAlign: 'bottom',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: C.text,
  },
  pre: {
    margin: 0,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#2d3748',
    overflowX: 'auto',
    maxHeight: 220,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    lineHeight: 1.5,
  },
  tableFooter: {
    padding: '8px 14px',
    fontSize: 12,
    color: C.muted,
    borderTop: `1px solid ${C.border}`,
    background: '#fafbfc',
  },
  empty: {
    padding: '40px 20px',
    textAlign: 'center',
    color: C.muted,
    fontSize: 14,
  },
  spinWrap: {
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 0',
  },
  spinner: {
    width: 28,
    height: 28,
    border: `3px solid ${C.border}`,
    borderTopColor: C.accent,
    borderRadius: '50%',
    animation: 'lg-spin .7s linear infinite',
  },
  errorBox: {
    background: '#fff5f5',
    border: '1px solid #fca5a5',
    borderRadius: 4,
    padding: '10px 14px',
    color: '#c53030',
    fontSize: 13,
    marginBottom: 12,
  },
};
