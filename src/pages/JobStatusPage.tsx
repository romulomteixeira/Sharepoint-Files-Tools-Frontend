/**
 * JobStatusPage.tsx — Progresso em tempo real de um job via SSE (Sprint 10)
 * Redesign: usa o design system (tokens.css) e os componentes base.
 */

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useJobStream } from '../hooks/useJobStream';
import { PageHead, Card, StatusPill } from '../components/ui';

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--good)',
  running:   'var(--accent)',
  pending:   'var(--warn)',
  failed:    'var(--bad)',
  cancelled: 'var(--muted)',
};

function fmtDate(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
}

export default function JobStatusPage(): React.ReactElement {
  const { jobId } = useParams<{ jobId: string }>();
  const { status, error, done } = useJobStream(jobId ?? null);

  if (!jobId) {
    return <div style={{ display: 'grid', placeItems: 'center', padding: '4rem 1rem' }}><p>ID do job não informado.</p></div>;
  }

  const pct = status && status.progress.total > 0
    ? Math.min(100, Math.round((status.progress.completed / status.progress.total) * 100))
    : 0;

  return (
    <div className="stack" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <div className="row">
        <Link to="/scans" className="td-link small" style={{ color: 'var(--muted)' }}>← Scans</Link>
      </div>

      <PageHead title="Progresso do Job" sub={<span>ID: <span className="mono">{jobId}</span></span>} />

      {!status && !error && <p className="muted small">Conectando ao servidor…</p>}
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}

      {status && (
        <Card>
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small muted" style={{ fontWeight: 700 }}>Tipo</span>
              <span className="mono small">{status.type}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="small muted" style={{ fontWeight: 700 }}>Status</span>
              <span style={{ color: STATUS_COLOR[status.status] ?? 'var(--muted)', fontWeight: 600 }}>
                <StatusPill status={status.status} />
              </span>
            </div>
            {status.startedAt && (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted" style={{ fontWeight: 700 }}>Iniciado em</span>
                <span className="small">{fmtDate(status.startedAt)}</span>
              </div>
            )}
            {status.finishedAt && (
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted" style={{ fontWeight: 700 }}>Concluído em</span>
                <span className="small">{fmtDate(status.finishedAt)}</span>
              </div>
            )}
            {status.lastError && (
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span className="small muted" style={{ fontWeight: 700 }}>Último erro</span>
                <span className="mono small" style={{ color: 'var(--bad)', textAlign: 'right' }}>{status.lastError}</span>
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="small muted" style={{ fontWeight: 700 }}>Tarefas concluídas</span>
                <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {status.progress.completed.toLocaleString('pt-BR')} / {status.progress.total.toLocaleString('pt-BR')} · <strong style={{ color: 'var(--accent)' }}>{pct}%</strong>
                </span>
              </div>
              <div className="track" style={{ height: 12 }}>
                <div className="fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <span className="pill pill-warn"><span className="dot" />Pendentes: {status.progress.pending}</span>
                <span className="pill pill-info"><span className="dot" />Em execução: {status.progress.running}</span>
                <span className="pill pill-bad"><span className="dot" />Com falha: {status.progress.failed}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {done && status?.status === 'completed' && (
        <div className="card" style={{ background: 'var(--good-bg)', borderColor: 'var(--good-bd)' }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ color: 'var(--good)', display: 'grid' }}><Check size={16} /></span>
            <span className="small" style={{ color: 'var(--good)', fontWeight: 650 }}>
              Job concluído com sucesso!{' '}
              {status.type.startsWith('scan') && status.scanId && (
                <Link to={`/inventory/${status.scanId}`} className="td-link" style={{ color: 'var(--good)', textDecoration: 'underline' }}>
                  Ver Inventário →
                </Link>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
