/**
 * DashboardPage.tsx — Tela principal com resumo do último scan (Sprint 10)
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { getInventorySummary } from '../api/inventory.api';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function DashboardPage(): React.ReactElement {
  const { data: scans, loading: scansLoading, error: scansError } = useApi(listScans, []);

  const latestScanId = scans && scans.length > 0 ? scans[0].id : null;

  const { data: summary, loading: summaryLoading } = useApi(
    () => latestScanId ? getInventorySummary(latestScanId) : Promise.resolve(null),
    [latestScanId],
  );

  if (scansLoading) {
    return <div style={styles.center}><p>Carregando dashboard...</p></div>;
  }

  if (scansError) {
    return (
      <div style={styles.center}>
        <p style={styles.error}>Erro ao carregar scans: {scansError}</p>
      </div>
    );
  }

  if (!scans || scans.length === 0) {
    return (
      <div style={styles.center}>
        <h2>Bem-vindo ao SharePoint Monitor</h2>
        <p>Nenhum scan encontrado.</p>
        <Link to="/scans" style={styles.button}>Iniciar Scan</Link>
      </div>
    );
  }

  const latest = scans[0];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Dashboard</h1>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Último Scan</h2>
        <p><strong>ID:</strong> {latest.id}</p>
        <p><strong>Status:</strong> <span style={statusStyle(latest.status)}>{latest.status}</span></p>
        <p><strong>Criado em:</strong> {new Date(latest.createdAt).toLocaleString('pt-BR')}</p>
        {latest.finishedAt && (
          <p><strong>Concluído em:</strong> {new Date(latest.finishedAt).toLocaleString('pt-BR')}</p>
        )}
      </div>

      {summaryLoading && <p>Carregando resumo do inventário...</p>}
      {summary && (
        <div style={styles.grid}>
          <div style={styles.stat}>
            <span style={styles.statValue}>{summary.totalSites.toLocaleString('pt-BR')}</span>
            <span style={styles.statLabel}>Sites</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{summary.totalDrives.toLocaleString('pt-BR')}</span>
            <span style={styles.statLabel}>Drives</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{summary.totalFiles.toLocaleString('pt-BR')}</span>
            <span style={styles.statLabel}>Arquivos</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{formatBytes(summary.totalBytes)}</span>
            <span style={styles.statLabel}>Volume Total</span>
          </div>
        </div>
      )}

      <div style={styles.actions}>
        <Link to="/scans" style={styles.button}>Ver Scans</Link>
        {latestScanId && (
          <Link to={`/inventory/${latestScanId}`} style={{ ...styles.button, ...styles.buttonSecondary }}>
            Ver Inventário
          </Link>
        )}
      </div>
    </div>
  );
}

function statusStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    completed: '#22c55e',
    running: '#3b82f6',
    pending: '#f59e0b',
    failed: '#ef4444',
    cancelled: '#6b7280',
  };
  return { color: colors[status] ?? '#374151', fontWeight: 600 };
}

const styles: Record<string, React.CSSProperties> = {
  page:          { maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' },
  title:         { fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' },
  center:        { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4rem 1rem' },
  error:         { color: '#ef4444' },
  card:          { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem' },
  cardTitle:     { fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  stat:          { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' },
  statValue:     { fontSize: '1.5rem', fontWeight: 700, color: '#111827' },
  statLabel:     { fontSize: '0.85rem', color: '#6b7280' },
  actions:       { display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  button:        { display: 'inline-block', padding: '0.6rem 1.25rem', background: '#3b82f6', color: '#fff', borderRadius: 6, textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' },
  buttonSecondary: { background: '#6b7280' },
};
