import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLatestTopFiles, getTopFiles } from '../api/inventory.api';
import type { TopFilesMetric } from '../api/inventory.api';
import { listScans } from '../api/scans.api';
import { useApi } from '../hooks/useApi';
import type { FileItem } from '../types';

const LIMITS = [50, 100, 500] as const;
type ViewKey = TopFilesMetric | 'latest';

const VIEWS: Array<{ key: ViewKey; label: string; description: string }> = [
  { key: 'size', label: 'Maiores arquivos', description: 'Tamanho atual do arquivo' },
  { key: 'total', label: 'Arquivos + versões', description: 'Arquivo atual somado ao histórico de versões' },
  { key: 'versions', label: 'Mais versionados', description: 'Quantidade de versões conhecidas' },
  { key: 'latest', label: 'Consolidado', description: 'Último registro concluído de cada arquivo' },
];

function fmtBytes(value = 0): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function fmtDate(value?: string | null): string {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportRows(rows: FileItem[], format: 'csv' | 'jsonl', view: ViewKey): void {
  const normalized = rows.map(file => ({
    arquivo: file.name,
    site: file.siteName || file.siteId,
    biblioteca: file.driveName || file.driveId,
    caminho: file.fullPath || '',
    extensao: file.extension || '',
    tamanho_bytes: file.sizeBytes ?? 0,
    versoes: file.versionCount ?? 0,
    espaco_versoes_bytes: file.versionsBytes ?? 0,
    total_bytes: file.totalBytes ?? 0,
    modificado_em: file.modified || file.modifiedAt || '',
    scan_origem: file.originScanId || file.scanId || '',
    data_origem: file.originScannedAt || '',
  }));
  const content = format === 'jsonl'
    ? normalized.map(row => JSON.stringify(row)).join('\n')
    : [
        Object.keys(normalized[0] ?? {}).map(csvCell).join(','),
        ...normalized.map(row => Object.values(row).map(csvCell).join(',')),
      ].join('\n');
  const blob = new Blob([content], {
    type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/jsonl;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `top-arquivos-${view}-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function TopFilesPage(): React.ReactElement {
  const [selectedScanId, setSelectedScanId] = useState('');
  const [activeView, setActiveView] = useState<ViewKey>('size');
  const [latestMetric, setLatestMetric] = useState<TopFilesMetric>('total');
  const [limits, setLimits] = useState<Record<ViewKey, number>>({
    size: 100,
    total: 100,
    versions: 100,
    latest: 100,
  });
  const [extension, setExtension] = useState('');
  const limit = limits[activeView];
  const metric: TopFilesMetric = activeView === 'latest' ? latestMetric : activeView;

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(scan => scan.status === 'completed');

  const { data: files, loading, error } = useApi(
    () => activeView === 'latest'
      ? getLatestTopFiles({ metric, limit })
      : selectedScanId
        ? getTopFiles(selectedScanId, { metric, limit })
        : Promise.resolve(null),
    [activeView, selectedScanId, metric, limit],
  );

  const extensions = useMemo(
    () => Array.from(new Set((files ?? []).map(file => file.extension || ''))).sort(),
    [files],
  );
  const displayed = useMemo(
    () => extension ? (files ?? []).filter(file => (file.extension || '') === extension) : (files ?? []),
    [extension, files],
  );
  const currentView = VIEWS.find(view => view.key === activeView)!;
  const needsScan = activeView !== 'latest';

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Top Arquivos</h1>
          <p style={styles.subtitle}>Visões por scan e consolidada, com métricas e limites independentes.</p>
        </div>
        <Link to="/" style={styles.link}>Dashboard</Link>
      </header>

      <section style={styles.panel}>
        <div role="tablist" aria-label="Visões de top arquivos" style={styles.tabs}>
          {VIEWS.map(view => (
            <button
              key={view.key}
              role="tab"
              aria-selected={activeView === view.key}
              style={{ ...styles.tab, ...(activeView === view.key ? styles.activeTab : {}) }}
              onClick={() => { setActiveView(view.key); setExtension(''); }}
            >
              <strong>{view.label}</strong>
              <span style={styles.tabDescription}>{view.description}</span>
            </button>
          ))}
        </div>

        <div style={styles.controls}>
          {needsScan && (
            <label style={styles.field}>
              <span>Scan concluído</span>
              <select
                aria-label="Scan concluído"
                value={selectedScanId}
                disabled={scansLoading}
                onChange={event => { setSelectedScanId(event.target.value); setExtension(''); }}
              >
                <option value="">Selecione um scan</option>
                {completedScans.map(scan => (
                  <option key={scan.id} value={scan.id}>
                    {scan.id} · {new Date(scan.createdAt).toLocaleDateString('pt-BR')}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={styles.field}>
            <span>Limite desta visão</span>
            <select
              aria-label="Limite desta visão"
              value={limit}
              onChange={event => setLimits(current => ({
                ...current,
                [activeView]: Number(event.target.value),
              }))}
            >
              {LIMITS.map(value => <option key={value} value={value}>Top {value}</option>)}
            </select>
          </label>

          {activeView === 'latest' && (
            <label style={styles.field}>
              <span>Ranking consolidado</span>
              <select
                aria-label="Ranking consolidado"
                value={latestMetric}
                onChange={event => setLatestMetric(event.target.value as TopFilesMetric)}
              >
                <option value="size">Tamanho do arquivo</option>
                <option value="total">Arquivo + versões</option>
                <option value="versions">Quantidade de versões</option>
              </select>
            </label>
          )}

          <label style={styles.field}>
            <span>Extensão</span>
            <select
              aria-label="Filtrar por extensão"
              value={extension}
              disabled={!extensions.length}
              onChange={event => setExtension(event.target.value)}
            >
              <option value="">Todas ({files?.length ?? 0})</option>
              {extensions.map(value => <option key={value} value={value}>{value || 'Sem extensão'}</option>)}
            </select>
          </label>

          <div style={styles.exportGroup}>
            <span>Exportar resultado filtrado</span>
            <div>
              <button disabled={!displayed.length} onClick={() => exportRows(displayed, 'csv', activeView)}>CSV</button>
              <button disabled={!displayed.length} onClick={() => exportRows(displayed, 'jsonl', activeView)}>JSONL</button>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>{currentView.label}</h2>
            <span style={styles.subtitle}>{currentView.description}</span>
          </div>
          <span style={styles.badge}>{displayed.length} arquivos</span>
        </div>

        {needsScan && !selectedScanId && <p style={styles.state}>Selecione um scan concluído.</p>}
        {(!needsScan || selectedScanId) && loading && <p style={styles.state}>Carregando arquivos...</p>}
        {error && <p role="alert" style={styles.error}>{error}</p>}
        {(!needsScan || selectedScanId) && !loading && !error && displayed.length === 0 && (
          <p style={styles.state}>Nenhum arquivo encontrado para os filtros atuais.</p>
        )}

        {displayed.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Arquivo</th>
                  <th>Site / biblioteca</th>
                  <th>Tamanho</th>
                  <th>Versões</th>
                  <th>Espaço versões</th>
                  <th>Total</th>
                  <th>Modificado</th>
                  {activeView === 'latest' && <th>Origem</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map((file, index) => (
                  <tr key={`${file.driveId}:${file.itemId}:${index}`}>
                    <td>{index + 1}</td>
                    <td>
                      {file.webUrl
                        ? <a href={file.webUrl} target="_blank" rel="noreferrer">{file.name}</a>
                        : file.name}
                      <small style={styles.path}>{file.fullPath || file.extension || '—'}</small>
                    </td>
                    <td>{file.siteName || file.siteId}<small style={styles.path}>{file.driveName || file.driveId}</small></td>
                    <td>{fmtBytes(file.sizeBytes)}</td>
                    <td>{(file.versionCount ?? 0).toLocaleString('pt-BR')}</td>
                    <td>{fmtBytes(file.versionsBytes)}</td>
                    <td><strong>{fmtBytes(file.totalBytes)}</strong></td>
                    <td>{fmtDate(file.modified || file.modifiedAt)}</td>
                    {activeView === 'latest' && (
                      <td>
                        <code>{file.originScanId || file.scanId || '—'}</code>
                        <small style={styles.path}>{fmtDate(file.originScannedAt)}</small>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'grid', gap: 16, color: '#172033' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start' },
  title: { margin: 0, fontSize: 24 },
  subtitle: { margin: '4px 0 0', color: '#5b6475', fontSize: 13 },
  link: { color: '#2563a8', fontWeight: 700, textDecoration: 'none' },
  panel: { background: '#fff', border: '1px solid #cbd2dc', borderRadius: 8, overflow: 'hidden' },
  tabs: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', borderBottom: '1px solid #cbd2dc' },
  tab: { display: 'grid', gap: 3, padding: 12, border: 0, borderRight: '1px solid #dfe4eb', background: '#f7f9fb', cursor: 'pointer', textAlign: 'left' },
  activeTab: { background: '#e8f1fb', color: '#174f87', boxShadow: 'inset 0 -3px #2563a8' },
  tabDescription: { color: '#5b6475', fontSize: 11 },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', padding: 14 },
  field: { display: 'grid', gap: 5, minWidth: 190, fontSize: 11, fontWeight: 700, color: '#4c5668' },
  exportGroup: { display: 'grid', gap: 5, marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: '#4c5668' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f7f9fb', borderBottom: '1px solid #cbd2dc' },
  panelTitle: { margin: 0, fontSize: 15 },
  badge: { padding: '3px 8px', borderRadius: 12, background: '#2563a8', color: '#fff', fontSize: 11, fontWeight: 700 },
  state: { padding: 28, textAlign: 'center', color: '#5b6475' },
  error: { padding: 16, color: '#b42318', fontWeight: 700 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  path: { display: 'block', marginTop: 3, color: '#687386', fontSize: 10, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' },
};
