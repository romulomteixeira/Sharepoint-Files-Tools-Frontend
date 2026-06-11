import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTopVersioned } from '../api/analytics.api';
import type { AnalyticsDateField, AnalyticsWindow, TopVersionedItem } from '../api/analytics.api';
import { listScans } from '../api/scans.api';
import { useApi } from '../hooks/useApi';

const WINDOWS: Array<{ value: AnalyticsWindow; label: string }> = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
];
const LIMITS = [80, 100, 200, 300] as const;

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

function exportCsv(items: TopVersionedItem[], field: AnalyticsDateField): void {
  const rows = items.map(item => ({
    site: item.siteName || item.siteId,
    biblioteca: item.driveName || item.driveId,
    caminho: item.fullPath || '',
    arquivo: item.name,
    data: field === 'created' ? item.created : item.modified,
    colaborador: field === 'created' ? item.createdBy : item.modifiedBy,
    tamanho_bytes: item.sizeBytes,
    versoes: item.versionCount ?? 0,
    espaco_versoes_bytes: item.versionsBytes ?? 0,
    total_bytes: item.totalBytes,
  }));
  const csv = [
    Object.keys(rows[0] ?? {}).map(csvCell).join(','),
    ...rows.map(row => Object.values(row).map(csvCell).join(',')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `versionados-periodo-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function VersionedByPeriodPage(): React.ReactElement {
  const [scanId, setScanId] = useState('');
  const [windowKey, setWindowKey] = useState<AnalyticsWindow>('month');
  const [field, setField] = useState<AnalyticsDateField>('modified');
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(100);
  const [search, setSearch] = useState('');

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(scan => scan.status === 'completed');
  const { data, loading, error } = useApi(
    () => scanId ? getTopVersioned(scanId, { window: windowKey, field, limit }) : Promise.resolve(null),
    [scanId, windowKey, field, limit],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    if (!query) return data?.items ?? [];
    return (data?.items ?? []).filter(item => [
      item.siteName,
      item.siteUrl,
      item.siteId,
      item.driveName,
      item.fullPath,
      item.name,
      item.createdBy,
      item.modifiedBy,
    ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(query)));
  }, [data, search]);

  const incompleteTimeline = Boolean(data && (
    !data.timelineAvailable || data.missingTimelineFiles > 0
  ));

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Versionados por Período</h1>
          <p style={styles.subtitle}>Arquivos mais versionados no recorte temporal do scan.</p>
        </div>
        <Link to="/" style={styles.link}>Dashboard</Link>
      </header>

      <section style={styles.panel}>
        <div style={styles.controls}>
          <label style={styles.field}>
            <span>Scan concluído</span>
            <select
              aria-label="Scan concluído"
              value={scanId}
              disabled={scansLoading}
              onChange={event => setScanId(event.target.value)}
            >
              <option value="">Selecione um scan</option>
              {completedScans.map(scan => (
                <option key={scan.id} value={scan.id}>
                  {scan.id} · {new Date(scan.createdAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.field}>
            <span>Período</span>
            <select aria-label="Período" value={windowKey} onChange={event => setWindowKey(event.target.value as AnalyticsWindow)}>
              {WINDOWS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label style={styles.field}>
            <span>Data de referência</span>
            <select aria-label="Data de referência" value={field} onChange={event => setField(event.target.value as AnalyticsDateField)}>
              <option value="modified">LastModified das versões</option>
              <option value="created">File Created</option>
            </select>
          </label>

          <label style={styles.field}>
            <span>Quantidade</span>
            <select
              aria-label="Quantidade"
              value={limit}
              onChange={event => setLimit(Number(event.target.value) as (typeof LIMITS)[number])}
            >
              {LIMITS.map(value => <option key={value} value={value}>Top {value}</option>)}
            </select>
          </label>

          <label style={{ ...styles.field, flex: 1 }}>
            <span>Filtrar resultado</span>
            <input
              aria-label="Filtrar por site, caminho, pessoa ou arquivo"
              value={search}
              placeholder="Site, caminho, pessoa ou arquivo"
              onChange={event => setSearch(event.target.value)}
            />
          </label>

          <button disabled={!filtered.length} onClick={() => exportCsv(filtered, field)}>Exportar CSV</button>
        </div>

        {data && (
          <div style={styles.range}>
            Recorte do scan: <strong>{fmtDate(data.startIso)}</strong> até <strong>{fmtDate(data.endIso)}</strong>.
            {' '}{field === 'modified'
              ? 'As métricas representam somente versões modificadas nesse período.'
              : 'Os arquivos foram criados nesse período e estão ordenados pelo histórico conhecido no scan.'}
          </div>
        )}
      </section>

      {incompleteTimeline && (
        <div role="alert" style={styles.warning}>
          Timeline de versões incompleta: {data?.filesWithTimeline ?? 0} de {data?.totalVersionedFiles ?? 0} arquivos
          versionados possuem eventos detalhados. {data?.missingTimelineFiles ?? 0} arquivo(s) podem ficar fora do recorte
          por LastModified.
        </div>
      )}

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Top versionados</h2>
            <p style={styles.subtitle}>Quantidade de versões, espaço ocupado e total no período.</p>
          </div>
          <span style={styles.badge}>{filtered.length} arquivos</span>
        </div>

        {!scanId && <p style={styles.state}>Selecione um scan concluído para consultar o período.</p>}
        {scanId && loading && <p style={styles.state}>Carregando arquivos versionados...</p>}
        {error && <p role="alert" style={styles.error}>{error}</p>}
        {scanId && !loading && !error && filtered.length === 0 && (
          <p style={styles.state}>Nenhum arquivo versionado encontrado para os filtros atuais.</p>
        )}

        {filtered.length > 0 && (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Site</th>
                  <th>Biblioteca / caminho</th>
                  <th>Arquivo</th>
                  <th>{field === 'created' ? 'Criado em' : 'Última modificação'}</th>
                  <th>Colaborador</th>
                  <th>Tamanho</th>
                  <th>Versões</th>
                  <th>Espaço versões</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr key={`${item.driveId}:${item.itemId}`}>
                    <td>{index + 1}</td>
                    <td>{item.siteName || item.siteId}</td>
                    <td>{item.driveName || item.driveId}<small style={styles.path}>{item.fullPath || '—'}</small></td>
                    <td>{item.webUrl ? <a href={item.webUrl} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</td>
                    <td>{fmtDate(field === 'created' ? item.created : item.modified)}</td>
                    <td>{(field === 'created' ? item.createdBy : item.modifiedBy) || '—'}</td>
                    <td>{fmtBytes(item.sizeBytes)}</td>
                    <td>{(item.versionCount ?? 0).toLocaleString('pt-BR')}</td>
                    <td>{fmtBytes(item.versionsBytes ?? 0)}</td>
                    <td><strong>{fmtBytes(item.totalBytes)}</strong></td>
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
  page: { display: 'grid', gap: 14, color: '#172033' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start' },
  title: { margin: 0, fontSize: 24 },
  subtitle: { margin: '4px 0 0', color: '#5b6475', fontSize: 12 },
  link: { color: '#2563a8', fontWeight: 700, textDecoration: 'none' },
  panel: { background: '#fff', border: '1px solid #cbd2dc', borderRadius: 8, overflow: 'hidden' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', padding: 14 },
  field: { display: 'grid', gap: 5, minWidth: 150, fontSize: 11, fontWeight: 700, color: '#4c5668' },
  range: { padding: '0 14px 12px', color: '#5b6475', fontSize: 11 },
  warning: { padding: '10px 14px', background: '#fffbeb', border: '1px solid #f5c451', borderRadius: 7, color: '#754d00', fontSize: 12 },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#f7f9fb', borderBottom: '1px solid #cbd2dc' },
  panelTitle: { margin: 0, fontSize: 15 },
  badge: { padding: '3px 8px', borderRadius: 12, background: '#2563a8', color: '#fff', fontSize: 11, fontWeight: 700 },
  state: { padding: 28, textAlign: 'center', color: '#5b6475' },
  error: { padding: 16, color: '#b42318', fontWeight: 700 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  path: { display: 'block', marginTop: 3, color: '#687386', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' },
};
