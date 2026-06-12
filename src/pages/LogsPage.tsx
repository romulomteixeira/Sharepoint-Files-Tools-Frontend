/**
 * LogsPage.tsx — Logs de sistema (Sprint 17)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getLogs, castRaw, type LogEntry } from '../api/logs.api';
import { ApiClientError } from '../api/client';

const LIMIT_OPTIONS = [100, 500, 1000, 2000] as const;
type LimitOption   = typeof LIMIT_OPTIONS[number];
type LevelFilter   = 'all' | 'info' | 'warn' | 'error';

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch { return String(iso); }
}

function levelPill(level: string): string {
  const l = level.toLowerCase();
  if (l === 'error') return 'pill pill-bad';
  if (l === 'warn')  return 'pill pill-warn';
  return 'pill pill-info';
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

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh) {
      timerRef.current = setInterval(() => { void fetchLogs(); }, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, fetchLogs]);

  const counts = { info: 0, warn: 0, error: 0 };
  for (const it of items) {
    const lv = it.level?.toLowerCase();
    if (lv === 'info')        counts.info++;
    else if (lv === 'warn')   counts.warn++;
    else if (lv === 'error')  counts.error++;
  }

  const filtered = items.filter(it => {
    if (levelFilter !== 'all' && it.level?.toLowerCase() !== levelFilter) return false;
    if (search) {
      const q   = search.toLowerCase();
      const hay = [it.msg, it.kind, it.source, it.scanId, it.jobId, it.action]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Logs de Sistema</h1>
          <p className="page-sub">
            Eventos de jobs, scans, versões e erros do servidor
            {lastFetch && (
              <span className="muted" style={{ marginLeft: 10, fontSize: 'var(--fs-xs)' }}>
                — atualizado às {lastFetch.toLocaleTimeString('pt-BR')}
              </span>
            )}
          </p>
        </div>
        <div className="row">
          <button
            className={`btn btn-sm${autoRefresh ? ' btn-active' : ''}`}
            onClick={() => setAutoRefresh(v => !v)}
          >
            {autoRefresh ? '⏵ Auto 30s' : '⏸ Auto off'}
          </button>
          <select className="select" value={limit} onChange={e => setLimit(Number(e.target.value) as LimitOption)}>
            {LIMIT_OPTIONS.map(n => (
              <option key={n} value={n}>{n} entradas</option>
            ))}
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => void fetchLogs()} disabled={loading}>
            {loading ? '…' : '↻ Atualizar'}
          </button>
          <button className="btn btn-sm" onClick={() => downloadCsv(filtered, `logs-${new Date().toISOString().slice(0,10)}.csv`)} disabled={filtered.length === 0}>
            ⬇ CSV
          </button>
        </div>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {(['all', 'info', 'warn', 'error'] as const).map(lv => (
          <button
            key={lv}
            className={`btn btn-sm${levelFilter === lv ? ' btn-active' : ''}`}
            onClick={() => { setLevelFilter(lv); setExpandedIdx(null); }}
          >
            {lv === 'all'
              ? `Todos (${items.length})`
              : `${lv.charAt(0).toUpperCase() + lv.slice(1)} (${counts[lv]})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          className="input"
          style={{ width: 240 }}
          placeholder="Buscar mensagem, scan, job…"
          value={search}
          onChange={e => { setSearch(e.target.value); setExpandedIdx(null); }}
        />
      </div>

      {error && <div className="alert-bad" style={{ marginBottom: 12 }}>{error}</div>}

      {loading && items.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="spinner" />
        </div>
      )}

      {(!loading || items.length > 0) && (
        <div className="card" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }} className="muted">
              {items.length === 0
                ? 'Nenhum log encontrado. Verifique se o backend está acessível.'
                : 'Nenhum log corresponde aos filtros aplicados.'}
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Timestamp</th>
                    <th style={{ width: 70  }}>Nível</th>
                    <th style={{ width: 110 }}>Fonte / Kind</th>
                    <th>Mensagem</th>
                    <th style={{ width: 130 }}>Scan / Job</th>
                    <th style={{ width: 28  }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const expanded = expandedIdx === idx;
                    const source   = String(item.kind ?? item.source ?? '—');
                    const ref      = String(item.scanId ?? item.jobId ?? '—');
                    return (
                      <React.Fragment key={idx}>
                        <tr
                          style={{ cursor: 'pointer', background: expanded ? 'var(--panel-2)' : undefined }}
                          onClick={() => setExpandedIdx(expanded ? null : idx)}
                        >
                          <td><span className="mono small">{fmtTs(item.t)}</span></td>
                          <td><span className={levelPill(item.level ?? 'info')}>{item.level ?? 'info'}</span></td>
                          <td><span className="muted small" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{source}</span></td>
                          <td style={{ maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.msg}
                          </td>
                          <td><span className="mono small muted">{ref}</span></td>
                          <td style={{ textAlign: 'center' }} className="muted small">{expanded ? '▲' : '▼'}</td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={6} style={{ padding: '10px 16px', background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' }}>
                              <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', color: 'var(--text)', overflowX: 'auto', maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                                {JSON.stringify(item, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="tbl-foot">
              Exibindo{' '}
              <strong>{filtered.length.toLocaleString('pt-BR')}</strong> de{' '}
              <strong>{items.length.toLocaleString('pt-BR')}</strong> entradas
              {loading && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>atualizando…</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
