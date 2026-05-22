/**
 * JobStatusPage.tsx — Progresso em tempo real de um job via SSE (Sprint 10)
 */

import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useJobStream } from '../hooks/useJobStream';

function ProgressBar({ value, total }: { value: number; total: number }): React.ReactElement {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={styles.progressTrack}>
      <div style={{ ...styles.progressFill, width: `${pct}%` }} />
      <span style={styles.progressLabel}>{pct}%</span>
    </div>
  );
}

export default function JobStatusPage(): React.ReactElement {
  const { jobId } = useParams<{ jobId: string }>();
  const { status, error, done } = useJobStream(jobId ?? null);

  if (!jobId) {
    return <div style={styles.center}><p>ID do job não informado.</p></div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.breadcrumb}>
        <Link to="/scans" style={styles.breadcrumbLink}>← Scans</Link>
      </div>
      <h1 style={styles.title}>Progresso do Job</h1>
      <p style={styles.id}>ID: <span style={styles.monospace}>{jobId}</span></p>

      {!status && !error && (
        <p style={styles.waiting}>Conectando ao servidor...</p>
      )}

      {error && (
        <p style={styles.error}>{error}</p>
      )}

      {status && (
        <div style={styles.card}>
          <div style={styles.statusRow}>
            <span style={styles.label}>Tipo:</span>
            <span>{status.type}</span>
          </div>
          <div style={styles.statusRow}>
            <span style={styles.label}>Status:</span>
            <span style={colorByStatus(status.status)}>{status.status}</span>
          </div>

          {status.startedAt && (
            <div style={styles.statusRow}>
              <span style={styles.label}>Iniciado em:</span>
              <span>{new Date(status.startedAt).toLocaleString('pt-BR')}</span>
            </div>
          )}

          {status.finishedAt && (
            <div style={styles.statusRow}>
              <span style={styles.label}>Concluído em:</span>
              <span>{new Date(status.finishedAt).toLocaleString('pt-BR')}</span>
            </div>
          )}

          {status.lastError && (
            <div style={{ ...styles.statusRow, flexDirection: 'column', gap: '0.25rem' }}>
              <span style={styles.label}>Último erro:</span>
              <span style={styles.errorText}>{status.lastError}</span>
            </div>
          )}

          <div style={styles.progressSection}>
            <div style={styles.statusRow}>
              <span style={styles.label}>Tarefas concluídas:</span>
              <span>{status.progress.completed.toLocaleString('pt-BR')} / {status.progress.total.toLocaleString('pt-BR')}</span>
            </div>
            <ProgressBar value={status.progress.completed} total={status.progress.total} />
            <div style={styles.statsRow}>
              <span style={styles.statChip}>Pendentes: {status.progress.pending}</span>
              <span style={styles.statChip}>Em execução: {status.progress.running}</span>
              <span style={{ ...styles.statChip, ...styles.chipFailed }}>Com falha: {status.progress.failed}</span>
            </div>
          </div>
        </div>
      )}

      {done && status?.status === 'completed' && (
        <div style={styles.successBanner}>
          ✓ Job concluído com sucesso!{' '}
          {status.type.startsWith('scan') && (
            <Link to={`/inventory/${jobId}`} style={styles.bannerLink}>Ver Inventário →</Link>
          )}
        </div>
      )}
    </div>
  );
}

function colorByStatus(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    completed: '#065f46',
    running:   '#1e40af',
    pending:   '#92400e',
    failed:    '#991b1b',
    cancelled: '#374151',
  };
  return { color: colors[status] ?? '#374151', fontWeight: 600 };
}

const styles: Record<string, React.CSSProperties> = {
  page:           { maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' },
  breadcrumb:     { marginBottom: '1rem' },
  breadcrumbLink: { color: '#6b7280', textDecoration: 'none', fontSize: '0.9rem' },
  title:          { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' },
  id:             { color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.9rem' },
  monospace:      { fontFamily: 'monospace' },
  center:         { display: 'flex', justifyContent: 'center', padding: '4rem 1rem' },
  waiting:        { color: '#6b7280', fontStyle: 'italic' },
  error:          { color: '#ef4444' },
  card:           { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  statusRow:      { display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.95rem' },
  label:          { fontWeight: 600, color: '#374151', minWidth: 160 },
  errorText:      { color: '#ef4444', fontSize: '0.9rem', fontFamily: 'monospace' },
  progressSection:{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  progressTrack:  { position: 'relative', height: 20, background: '#e5e7eb', borderRadius: 10, overflow: 'hidden' },
  progressFill:   { position: 'absolute', top: 0, left: 0, height: '100%', background: '#3b82f6', borderRadius: 10, transition: 'width 0.3s ease' },
  progressLabel:  { position: 'absolute', top: 0, left: 0, right: 0, lineHeight: '20px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#1e40af' },
  statsRow:       { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  statChip:       { padding: '0.2rem 0.6rem', background: '#f3f4f6', borderRadius: 12, fontSize: '0.8rem', color: '#374151' },
  chipFailed:     { background: '#fee2e2', color: '#991b1b' },
  successBanner:  { marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 8, color: '#065f46', fontWeight: 600 },
  bannerLink:     { color: '#065f46', textDecoration: 'underline', marginLeft: '0.5rem' },
};
