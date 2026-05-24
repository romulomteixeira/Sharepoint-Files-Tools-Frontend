/**
 * AuditPage.tsx — Trilha de auditoria (Sprint 17)
 *
 * Rota: /audit
 * Endpoint: GET /api/audit?limit=N&scanId=&evt=&user=
 *
 * Funcionalidades:
 *   - Tabela de ações administrativas: scans, expurgos, exports, versões
 *   - Filtros server-side: usuário, evento/ação, scanId
 *   - Exportação CSV (client-side)
 *   - Detalhes de ação com badge colorido por tipo
 */

import React, { useCallback, useEffect, useState } from 'react';
import { getAuditLogs, castRaw, type AuditEntry } from '../api/logs.api';
import { ApiClientError } from '../api/client';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#eef1f5', panel: '#ffffff', border: '#c8ced8',
  accent: '#2b6cb0', text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

// ─── Helpers de cor ───────────────────────────────────────────────────────────

function actionStyle(action: string): { bg: string; color: string; border: string } {
  const a = String(action ?? '').toLowerCase();
  if (a.includes('delete') || a.includes('purge') || a.includes('expurg')) {
    return { bg: '#fff5f5', color: '#991b1b', border: '#fca5a5' };
  }
  if (a.includes('cancel') || a.includes('stop')) {
    return { bg: '#fffaf0', color: '#c05621', border: '#fbd38d' };
  }
  if (a.includes('create') || a.includes('start') || a.includes('bootstrap')) {
    return { bg: '#ebfff5', color: '#276749', border: '#9ae6b4' };
  }
  if (a.includes('export') || a.includes('download')) {
    return { bg: '#f0fff4', color: '#276749', border: '#68d391' };
  }
  return { bg: '#ebf8ff', color: '#2b6cb0', border: '#90cdf4' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return String(iso); }
}

function downloadCsv(items: AuditEntry[], filename: string): void {
  const header = 'Timestamp,Ação,Nível,Usuário,Email,Destino,Mensagem\n';
  const rows   = items.map(i =>
    [
      fmtTs(i.t),
      i.action,
      i.level,
      i.actorDisplayName || i.actorUsername || i.operatorName || '',
      i.operatorEmail || i.actorUsername || '',
      i.targetLabel || '',
      i.msg,
    ]
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

export default function AuditPage(): React.ReactElement {
  const [items,       setItems]       = useState<AuditEntry[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [limit,       setLimit]       = useState(500);
  const [filterUser,   setFilterUser]   = useState('');
  const [filterEvt,    setFilterEvt]    = useState('');
  const [filterScanId, setFilterScanId] = useState('');
  // local search on loaded data
  const [localSearch, setLocalSearch] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { limit: number; scanId?: string; evt?: string; user?: string } = { limit };
      if (filterScanId.trim()) params.scanId = filterScanId.trim();
      if (filterEvt.trim())    params.evt    = filterEvt.trim();
      if (filterUser.trim())   params.user   = filterUser.trim();
      const res = await getAuditLogs(params);
      setItems(castRaw<AuditEntry>(res));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Erro ao carregar auditoria.');
    } finally {
      setLoading(false);
    }
  }, [limit, filterUser, filterEvt, filterScanId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void fetchAudit(); }, []);

  // ── Busca local ───────────────────────────────────────────────────────────
  const displayed = localSearch
    ? items.filter(it => {
        const q   = localSearch.toLowerCase();
        const hay = [it.msg, it.action, it.actorUsername, it.actorDisplayName,
                     it.operatorName, it.operatorEmail, it.targetLabel, it.scanId, it.jobId]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
    : items;

  // ── Ações únicas para sugestão rápida ─────────────────────────────────────
  const uniqueActions = [...new Set(items.map(i => i.action).filter(Boolean))].slice(0, 20);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <style>{`@keyframes at-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Trilha de Auditoria</h1>
          <p style={s.sub}>
            Ações administrativas: criação de scans, expurgos, exports e configurações
          </p>
        </div>
        <div style={s.headerRight}>
          <button
            style={s.btnSm}
            onClick={() => downloadCsv(displayed, `auditoria-${new Date().toISOString().slice(0,10)}.csv`)}
            disabled={displayed.length === 0}
          >
            ⬇ CSV
          </button>
        </div>
      </div>

      {/* ── Filtros server-side ────────────────────────────────────────────── */}
      <div style={s.filterPanel}>
        <div style={s.filterRow}>
          <div style={s.filterGroup}>
            <label style={s.label}>Usuário</label>
            <input
              style={s.input}
              placeholder="Nome ou e-mail…"
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void fetchAudit()}
            />
          </div>
          <div style={s.filterGroup}>
            <label style={s.label}>Evento / Ação</label>
            <input
              style={s.input}
              placeholder="ex: purge_confirm, scan_cancel…"
              value={filterEvt}
              onChange={e => setFilterEvt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void fetchAudit()}
              list="audit-evts"
            />
            {uniqueActions.length > 0 && (
              <datalist id="audit-evts">
                {uniqueActions.map(a => <option key={a} value={a} />)}
              </datalist>
            )}
          </div>
          <div style={s.filterGroup}>
            <label style={s.label}>Scan ID</label>
            <input
              style={s.input}
              placeholder="ID do scan…"
              value={filterScanId}
              onChange={e => setFilterScanId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void fetchAudit()}
            />
          </div>
          <div style={s.filterGroup}>
            <label style={s.label}>Limite</label>
            <select style={s.select} value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {[100, 500, 1000, 5000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ ...s.filterGroup, justifyContent: 'flex-end', marginTop: 18 }}>
            <button style={s.btnPrimary} onClick={() => void fetchAudit()} disabled={loading}>
              {loading ? '…' : '↻ Buscar'}
            </button>
          </div>
        </div>

        {/* Busca local */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap' }}>Filtrar resultado:</span>
          <input
            style={{ ...s.input, flex: 1, maxWidth: 340 }}
            placeholder="Buscar em todos os campos…"
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />
          {items.length > 0 && (
            <span style={{ fontSize: 12, color: C.muted }}>
              {displayed.length.toLocaleString('pt-BR')} / {items.length.toLocaleString('pt-BR')} registros
            </span>
          )}
        </div>
      </div>

      {/* ── Erro ───────────────────────────────────────────────────────────── */}
      {error && <div style={s.errorBox}>{error}</div>}

      {/* ── Loading ────────────────────────────────────────────────────────── */}
      {loading && items.length === 0 && (
        <div style={s.spinWrap}>
          <div style={{ ...s.spinner, animation: 'at-spin .7s linear infinite' }} />
        </div>
      )}

      {/* ── Tabela ─────────────────────────────────────────────────────────── */}
      {(!loading || items.length > 0) && (
        <div style={s.panel}>
          {displayed.length === 0 ? (
            <div style={s.empty}>
              {items.length === 0
                ? 'Nenhum registro de auditoria encontrado. Tente ajustar os filtros ou verificar o backend.'
                : 'Nenhum registro corresponde à busca local.'}
            </div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={{ ...s.th, width: 160 }}>Timestamp</th>
                  <th style={{ ...s.th, width: 200 }}>Ação</th>
                  <th style={{ ...s.th, width: 180 }}>Usuário</th>
                  <th style={{ ...s.th, width: 150 }}>Destino</th>
                  <th style={s.th}>Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((item, idx) => {
                  const as_    = actionStyle(item.action);
                  const user   = item.actorDisplayName || item.actorUsername || item.operatorName || '—';
                  const email  = item.operatorEmail || (item.actorUsername && item.actorUsername !== user ? item.actorUsername : '');
                  const target = item.targetLabel || item.scanId || item.jobId || '—';
                  return (
                    <tr key={idx} style={s.tr}>
                      <td style={s.td}>
                        <span style={s.mono}>{fmtTs(item.t)}</span>
                      </td>
                      <td style={s.td}>
                        <span style={{
                          ...s.badge,
                          background: as_.bg,
                          color: as_.color,
                          border: `1px solid ${as_.border}`,
                          maxWidth: 180,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-block',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'bottom',
                        }}>
                          {item.action || '—'}
                        </span>
                      </td>
                      <td style={s.td}>
                        <div style={{ fontSize: 13, color: C.text }}>{user}</div>
                        {email && <div style={{ fontSize: 11, color: C.muted }}>{email}</div>}
                      </td>
                      <td style={s.td}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted }}>
                          {String(target).length > 22
                            ? `…${String(target).slice(-20)}`
                            : target}
                        </span>
                      </td>
                      <td style={{
                        ...s.td,
                        maxWidth: 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: C.muted,
                        fontSize: 13,
                      }}>
                        {item.msg}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {displayed.length > 0 && (
            <div style={s.tableFooter}>
              <span>
                {displayed.length.toLocaleString('pt-BR')} registro
                {displayed.length !== 1 ? 's' : ''} exibido
                {displayed.length !== items.length && ` (de ${items.length.toLocaleString('pt-BR')} carregados)`}
              </span>
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
  headerRight: { display: 'flex', gap: 8, alignItems: 'center' },

  filterPanel: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '12px 16px',
    marginBottom: 14,
  },
  filterRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 140,
    flex: '1 1 140px',
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
  },
  input: {
    padding: '5px 9px',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
    width: '100%',
    boxSizing: 'border-box',
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
    padding: '6px 16px',
    background: C.accent,
    color: '#fff',
    border: `1px solid ${C.accent}`,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
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
    padding: '8px 12px',
    color: C.text,
    verticalAlign: 'middle',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 3,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.02em',
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: C.text,
  },
  tableFooter: {
    padding: '8px 14px',
    fontSize: 12,
    color: C.muted,
    borderTop: `1px solid ${C.border}`,
    background: '#fafbfc',
    display: 'flex',
    alignItems: 'center',
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
