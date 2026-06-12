import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useJobStream } from '../hooks/useJobStream';

function statusPillClass(status: string): string {
  return status === 'completed' ? 'pill-good'
    : status === 'running'   ? 'pill-info'
    : status === 'pending'   ? 'pill-warn'
    : status === 'failed'    ? 'pill-bad'
    : 'pill-mute';
}

export default function JobStatusPage(): React.ReactElement {
  const { jobId } = useParams<{ jobId: string }>();
  const { status, error, done } = useJobStream(jobId ?? null);

  if (!jobId) {
    return <div className="muted">ID do job não informado.</div>;
  }

  const p = status?.progress;
  const pct = p && p.total > 0 ? Math.min(100, Math.round((p.completed / p.total) * 100)) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/scans" className="small muted" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <ArrowLeft size={13} /> Scans
          </Link>
          <h1 className="page-title">Progresso do Job</h1>
          <p className="page-sub">ID: <span className="mono">{jobId}</span></p>
        </div>
      </div>

      {!status && !error && (
        <div className="small muted" style={{ fontStyle: 'italic' }}>Conectando ao servidor…</div>
      )}

      {error && (
        <div className="pill-bad" style={{ padding: '8px 12px', borderRadius: 'var(--r-sm)' }}>{error}</div>
      )}

      {status && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="row" style={{ marginBottom: 'var(--gap-sm)' }}>
            <span className="small muted" style={{ minWidth: 120 }}>Tipo:</span>
            <span>{status.type}</span>
          </div>
          <div className="row" style={{ marginBottom: 'var(--gap-sm)' }}>
            <span className="small muted" style={{ minWidth: 120 }}>Status:</span>
            <span className={`pill ${statusPillClass(status.status)}`}>
              <span className="dot" />
              {status.status}
            </span>
          </div>
          {status.startedAt && (
            <div className="row" style={{ marginBottom: 'var(--gap-sm)' }}>
              <span className="small muted" style={{ minWidth: 120 }}>Iniciado em:</span>
              <span>{new Date(status.startedAt).toLocaleString('pt-BR')}</span>
            </div>
          )}
          {status.finishedAt && (
            <div className="row" style={{ marginBottom: 'var(--gap-sm)' }}>
              <span className="small muted" style={{ minWidth: 120 }}>Concluído em:</span>
              <span>{new Date(status.finishedAt).toLocaleString('pt-BR')}</span>
            </div>
          )}
          {status.lastError && (
            <div style={{ marginBottom: 'var(--gap-sm)', color: 'var(--bad)' }} className="small mono">{status.lastError}</div>
          )}

          <div style={{ marginTop: 'var(--gap)' }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="small muted">Tarefas concluídas:</span>
              <span className="small">{p?.completed.toLocaleString('pt-BR')} / {p?.total.toLocaleString('pt-BR')}</span>
              <span className="spacer" />
              <span className={`pill ${pct === 100 ? 'pill-good' : 'pill-info'}`}>{pct}%</span>
            </div>
            <div className="track">
              <div className="fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <span className="pill pill-mute">Pendentes: {p?.pending ?? 0}</span>
              <span className="pill pill-info">Em execução: {p?.running ?? 0}</span>
              <span className="pill pill-bad">Com falha: {p?.failed ?? 0}</span>
            </div>
          </div>
        </div>
      )}

      {done && status?.status === 'completed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--good-bg)', border: '1px solid var(--good-bd)', borderRadius: 'var(--r-md)', color: 'var(--good)', fontWeight: 600, maxWidth: 720 }}>
          <CheckCircle size={16} />
          Job concluído com sucesso!
          {status.type.startsWith('scan') && status.scanId && (
            <Link to={`/inventory/${status.scanId}`} style={{ color: 'var(--good)', textDecoration: 'underline', marginLeft: 4 }}>
              Ver Inventário →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
