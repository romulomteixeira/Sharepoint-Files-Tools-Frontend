/**
 * ScansPage.tsx — Lista de scans e botão para iniciar novo scan (Sprint 10)
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans, createScan } from '../api/scans.api';
import { ApiClientError } from '../api/client';
import type { Scan } from '../types';

function formatBytes(bytes: number | undefined): string {
  if (!bytes) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function statusBadge(status: Scan['status']): React.ReactElement {
  const colors: Record<string, string> = {
    completed: '#d1fae5',
    running:   '#dbeafe',
    pending:   '#fef3c7',
    failed:    '#fee2e2',
    cancelled: '#f3f4f6',
  };
  const textColors: Record<string, string> = {
    completed: '#065f46',
    running:   '#1e40af',
    pending:   '#92400e',
    failed:    '#991b1b',
    cancelled: '#374151',
  };
  return (
    <span style={{ background: colors[status] ?? '#f3f4f6', color: textColors[status] ?? '#374151', padding: '0.2rem 0.6rem', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600 }}>
      {status}
    </span>
  );
}

export default function ScansPage(): React.ReactElement {
  const { data: scans, loading, error, refetch } = useApi(listScans, []);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateScan() {
    setCreating(true);
    setCreateError(null);
    try {
      await createScan();
      refetch();
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Erro ao iniciar scan.';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>Scans</h1>
        <button onClick={handleCreateScan} disabled={creating} style={styles.button}>
          {creating ? 'Iniciando...' : '+ Novo Scan'}
        </button>
      </div>

      {createError && <p style={styles.error}>{createError}</p>}

      {loading && <p>Carregando scans...</p>}
      {error && <p style={styles.error}>{error}</p>}

      {!loading && !error && scans && scans.length === 0 && (
        <p style={styles.empty}>Nenhum scan encontrado. Inicie um novo scan acima.</p>
      )}

      {!loading && scans && scans.length > 0 && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Sites</th>
                <th style={styles.th}>Arquivos</th>
                <th style={styles.th}>Volume</th>
                <th style={styles.th}>Criado em</th>
                <th style={styles.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((scan) => (
                <tr key={scan.id} style={styles.tr}>
                  <td style={styles.td}>
                    <span style={styles.monospace} title={scan.id}>{scan.id.slice(0, 8)}…</span>
                  </td>
                  <td style={styles.td}>{statusBadge(scan.status)}</td>
                  <td style={styles.td}>{scan.totalSites?.toLocaleString('pt-BR') ?? '—'}</td>
                  <td style={styles.td}>{scan.totalFiles?.toLocaleString('pt-BR') ?? '—'}</td>
                  <td style={styles.td}>{formatBytes(scan.totalBytes)}</td>
                  <td style={styles.td}>{new Date(scan.createdAt).toLocaleString('pt-BR')}</td>
                  <td style={styles.td}>
                    {scan.status === 'running' && (
                      <Link to={`/jobs/${scan.id}`} style={styles.link}>Progresso</Link>
                    )}
                    {scan.status === 'completed' && (
                      <Link to={`/inventory/${scan.id}`} style={styles.link}>Inventário</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { maxWidth: 1100, margin: '0 auto', padding: '2rem 1rem' },
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  title:        { fontSize: '1.75rem', fontWeight: 700 },
  button:       { padding: '0.6rem 1.25rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' },
  error:        { color: '#ef4444', marginBottom: '1rem' },
  empty:        { color: '#6b7280', padding: '2rem 0' },
  tableWrapper: { overflowX: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th:           { padding: '0.75rem 1rem', background: '#f9fafb', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb' },
  tr:           { borderBottom: '1px solid #f3f4f6' },
  td:           { padding: '0.75rem 1rem', color: '#374151' },
  monospace:    { fontFamily: 'monospace', fontSize: '0.85rem' },
  link:         { color: '#3b82f6', textDecoration: 'none', fontWeight: 500 },
};
