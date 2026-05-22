/**
 * InventoryPage.tsx — Inventário de arquivos de um scan com paginação (Sprint 10)
 */

import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { getInventorySummary, getInventoryFiles } from '../api/inventory.api';
import type { FileItem } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function InventoryPage(): React.ReactElement {
  const { scanId } = useParams<{ scanId: string }>();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);

  const { data: summary, loading: summaryLoading } = useApi(
    () => scanId ? getInventorySummary(scanId) : Promise.resolve(null),
    [scanId],
  );

  const { data: page, loading: filesLoading } = useApi(
    () => scanId
      ? getInventoryFiles(scanId, { cursor, pageSize: 100 })
      : Promise.resolve(null),
    [scanId, cursor],
  );

  // Acumula arquivos quando cursor avança
  React.useEffect(() => {
    if (page?.items) {
      if (!cursor) {
        setAllFiles(page.items);
      } else {
        setAllFiles((prev) => [...prev, ...page.items]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  if (!scanId) {
    return <div style={styles.center}><p>ID do scan não informado.</p></div>;
  }

  return (
    <div style={styles.page}>
      <div style={styles.breadcrumb}>
        <Link to="/scans" style={styles.breadcrumbLink}>← Scans</Link>
      </div>

      <h1 style={styles.title}>Inventário</h1>
      <p style={styles.id}>Scan: <span style={styles.monospace}>{scanId}</span></p>

      {summaryLoading && <p>Carregando resumo...</p>}
      {summary && (
        <div style={styles.summaryGrid}>
          <div style={styles.stat}><span style={styles.statValue}>{summary.totalSites.toLocaleString('pt-BR')}</span><span style={styles.statLabel}>Sites</span></div>
          <div style={styles.stat}><span style={styles.statValue}>{summary.totalDrives.toLocaleString('pt-BR')}</span><span style={styles.statLabel}>Drives</span></div>
          <div style={styles.stat}><span style={styles.statValue}>{summary.totalFiles.toLocaleString('pt-BR')}</span><span style={styles.statLabel}>Arquivos</span></div>
          <div style={styles.stat}><span style={styles.statValue}>{formatBytes(summary.totalBytes)}</span><span style={styles.statLabel}>Total</span></div>
        </div>
      )}

      <div style={styles.tableSection}>
        <h2 style={styles.subtitle}>Arquivos</h2>
        {allFiles.length === 0 && !filesLoading && <p style={styles.empty}>Nenhum arquivo encontrado.</p>}
        {allFiles.length > 0 && (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Nome</th>
                  <th style={styles.th}>Extensão</th>
                  <th style={styles.th}>Tamanho</th>
                  <th style={styles.th}>Modificado</th>
                </tr>
              </thead>
              <tbody>
                {allFiles.map((f) => (
                  <tr key={f.id} style={styles.tr}>
                    <td style={styles.td}>
                      {f.webUrl ? (
                        <a href={f.webUrl} target="_blank" rel="noreferrer" style={styles.link}>{f.name}</a>
                      ) : (
                        <span>{f.name}</span>
                      )}
                    </td>
                    <td style={styles.td}>{f.extension || '—'}</td>
                    <td style={styles.td}>{formatBytes(f.totalBytes)}</td>
                    <td style={styles.td}>{f.modifiedAt ? new Date(f.modifiedAt).toLocaleDateString('pt-BR') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page?.pageInfo.hasNextPage && (
          <div style={styles.loadMore}>
            <button
              onClick={() => setCursor(page.pageInfo.nextCursor ?? undefined)}
              disabled={filesLoading}
              style={styles.button}
            >
              {filesLoading ? 'Carregando...' : 'Carregar mais'}
            </button>
          </div>
        )}
        {filesLoading && allFiles.length > 0 && <p style={styles.loadingMore}>Carregando...</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { maxWidth: 1100, margin: '0 auto', padding: '2rem 1rem' },
  breadcrumb:   { marginBottom: '1rem' },
  breadcrumbLink:{ color: '#6b7280', textDecoration: 'none', fontSize: '0.9rem' },
  title:        { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' },
  subtitle:     { fontSize: '1.2rem', fontWeight: 600, margin: '1.5rem 0 1rem' },
  id:           { color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.9rem' },
  monospace:    { fontFamily: 'monospace' },
  center:       { display: 'flex', justifyContent: 'center', padding: '4rem 1rem' },
  empty:        { color: '#6b7280', padding: '2rem 0' },
  summaryGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' },
  stat:         { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' },
  statValue:    { fontSize: '1.5rem', fontWeight: 700, color: '#111827' },
  statLabel:    { fontSize: '0.85rem', color: '#6b7280' },
  tableSection: {},
  tableWrapper: { overflowX: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th:           { padding: '0.75rem 1rem', background: '#f9fafb', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '2px solid #e5e7eb' },
  tr:           { borderBottom: '1px solid #f3f4f6' },
  td:           { padding: '0.65rem 1rem', color: '#374151' },
  link:         { color: '#3b82f6', textDecoration: 'none' },
  loadMore:     { display: 'flex', justifyContent: 'center', padding: '1.5rem 0' },
  button:       { padding: '0.6rem 1.5rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 },
  loadingMore:  { color: '#6b7280', textAlign: 'center', padding: '1rem 0' },
};
