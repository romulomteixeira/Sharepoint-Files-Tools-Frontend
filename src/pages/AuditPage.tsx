/**
 * AuditPage.tsx — Trilha de auditoria (Sprint 17)
 */

import React, { useCallback, useEffect, useState } from 'react';
import { getAuditLogs, castRaw, type AuditEntry } from '../api/logs.api';
import { ApiClientError } from '../api/client';

function actionPill(action: string): string {
  const a = String(action ?? '').toLowerCase();
  if (a.includes('delete') || a.includes('purge') || a.includes('expurg')) return 'pill pill-bad';
  if (a.includes('cancel') || a.includes('stop')) return 'pill pill-warn';
  if (a.includes('create') || a.includes('start') || a.includes('bootstrap')) return 'pill pill-good';
  if (a.includes('export') || a.includes('download')) return 'pill pill-good';
  return 'pill pill-info';
}

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

export default function AuditPage(): React.ReactElement {
  const [items,       setItems]       = useState<AuditEntry[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [limit,       setLimit]       = useState(500);
  const [filterUser,   setFilterUser]   = useState('');
  const [filterEvt,    setFilterEvt]    = useState('');
  const [filterScanId, setFilterScanId] = useState('');
  const [localSearch,  setLocalSearch]  = useState('');

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

  const displayed = localSearch
    ? items.filter(it => {
        const q   = localSearch.toLowerCase();
        const hay = [it.msg, it.action, it.actorUsername, it.actorDisplayName,
                     it.operatorName, it.operatorEmail, it.targetLabel, it.scanId, it.jobId]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      })
    : items;

  const uniqueActions = [...new Set(items.map(i => i.action).filter(Boolean))].slice(0, 20);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Trilha de Auditoria</h1>
          <p className="page-sub">Ações administrativas: criação de scans, expurgos, exports e configurações</p>
        </div>
        <button
          className="btn btn-sm"
          onClick={() => downloadCsv(displayed, `auditoria-${new Date().toISOString().slice(0,10)}.csv`)}
          disabled={displayed.length === 0}
        >
          ⬇ CSV
        </button>
      </div>

      {/* Filtros server-side */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          <div className="field" style={{ minWidth: 140, flex: '1 1 140px' }}>
            <label className="field-label">Usuário</label>
            <input className="input" placeholder="Nome ou e-mail…" value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void fetchAudit()} />
          </div>
          <div className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>
            <label className="field-label">Evento / Ação</label>
            <input className="input" placeholder="ex: purge_confirm…" value={filterEvt}
              onChange={e => setFilterEvt(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void fetchAudit()}
              list="audit-evts" />
            {uniqueActions.length > 0 && (
              <datalist id="audit-evts">
                {uniqueActions.map(a => <option key={a} value={a} />)}
              </datalist>
            )}
          </div>
          <div className="field" style={{ minWidth: 140, flex: '1 1 140px' }}>
            <label className="field-label">Scan ID</label>
            <input className="input" placeholder="ID do scan…" value={filterScanId}
              onChange={e => setFilterScanId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void fetchAudit()} />
          </div>
          <div className="field" style={{ minWidth: 100 }}>
            <label className="field-label">Limite</label>
            <select className="select" value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {[100, 500, 1000, 5000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 18 }}>
            <button className="btn btn-primary btn-sm" onClick={() => void fetchAudit()} disabled={loading}>
              {loading ? '…' : '↻ Buscar'}
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 8, gap: 8, alignItems: 'center' }}>
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}>Filtrar resultado:</span>
          <input className="input" style={{ flex: 1, maxWidth: 340 }}
            placeholder="Buscar em todos os campos…" value={localSearch}
            onChange={e => setLocalSearch(e.target.value)} />
          {items.length > 0 && (
            <span className="small muted">
              {displayed.length.toLocaleString('pt-BR')} / {items.length.toLocaleString('pt-BR')} registros
            </span>
          )}
        </div>
      </div>

      {error && <div className="alert-bad" style={{ marginBottom: 12 }}>{error}</div>}

      {loading && items.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="spinner" />
        </div>
      )}

      {(!loading || items.length > 0) && (
        <div className="card" style={{ padding: 0 }}>
          {displayed.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }} className="muted">
              {items.length === 0
                ? 'Nenhum registro de auditoria encontrado. Tente ajustar os filtros ou verificar o backend.'
                : 'Nenhum registro corresponde à busca local.'}
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Timestamp</th>
                    <th style={{ width: 200 }}>Ação</th>
                    <th style={{ width: 180 }}>Usuário</th>
                    <th style={{ width: 150 }}>Destino</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((item, idx) => {
                    const user   = item.actorDisplayName || item.actorUsername || item.operatorName || '—';
                    const email  = item.operatorEmail || (item.actorUsername && item.actorUsername !== user ? item.actorUsername : '');
                    const target = item.targetLabel || item.scanId || item.jobId || '—';
                    return (
                      <tr key={idx}>
                        <td><span className="mono small">{fmtTs(item.t)}</span></td>
                        <td>
                          <span className={actionPill(item.action)} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                            {item.action || '—'}
                          </span>
                        </td>
                        <td>
                          <div className="small">{user}</div>
                          {email && <div className="small muted">{email}</div>}
                        </td>
                        <td>
                          <span className="mono small muted">
                            {String(target).length > 22 ? `…${String(target).slice(-20)}` : target}
                          </span>
                        </td>
                        <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="muted small">
                          {item.msg}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {displayed.length > 0 && (
            <div className="tbl-foot">
              <span>
                {displayed.length.toLocaleString('pt-BR')} registro
                {displayed.length !== 1 ? 's' : ''} exibido
                {displayed.length !== items.length && ` (de ${items.length.toLocaleString('pt-BR')} carregados)`}
              </span>
              {loading && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>atualizando…</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
