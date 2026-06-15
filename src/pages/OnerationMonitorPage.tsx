import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTopCost } from '../api/analytics.api';
import type { AnalyticsDateField, AnalyticsWindow, TopCostItem } from '../api/analytics.api';
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

function exportCsv(items: TopCostItem[], field: AnalyticsDateField): void {
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
  anchor.download = `monitor-oneracao-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function OnerationMonitorPage(): React.ReactElement {
  const [scanId, setScanId] = useState('');
  const [windowKey, setWindowKey] = useState<AnalyticsWindow>('month');
  const [field, setField] = useState<AnalyticsDateField>('modified');
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(100);
  const [search, setSearch] = useState('');

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(scan => scan.status === 'completed');
  const { data, loading, error } = useApi(
    () => scanId ? getTopCost(scanId, { window: windowKey, field, limit }) : Promise.resolve(null),
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

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Monitor de Oneração</h1>
          <p style={styles.subtitle}>Arquivos que mais consumiram espaço no período selecionado.</p>
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
              <option value="modified">LastModified</option>
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
            Recorte do scan: <strong>{fmtDate(data.startIso)}</strong> até <strong>{fmtDate(data.endIso)}</strong>
          </div>
        )}
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Top arquivos no período</h2>
            <p style={styles.subtitle}>
              Ranking por tamanho total: arquivo atual + espaço conhecido das versões.
            </p>
          </div>
          <span style={styles.badge}>{filtered.length} arquivos</span>
        </div>

        {!scanId && <p style={styles.state}>Selecione um scan concluído para consultar o período.</p>}
        {scanId && loading && <p style={styles.state}>Carregando análise...</p>}
        {error && <p role="alert" style={styles.error}>{error}</p>}
        {scanId && !loading && !error && filtered.length === 0 && (
          <p style={styles.state}>Nenhum arquivo encontrado para os filtros atuais.</p>
        )}

        {filtered.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl" style={styles.table}>
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
  page: { display: 'grid', gap: 'var(--gap)', color: 'var(--text)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'start' },
  title: { margin: 0, fontSize: 'var(--title-size)', fontWeight: 750, letterSpacing: '-.01em' },
  subtitle: { margin: '4px 0 0', color: 'var(--muted)', fontSize: 'var(--fs-sm)' },
  link: { color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' },
  panel: { background: 'var(--panel)', border: 'var(--card-border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', padding: 14 },
  field: { display: 'grid', gap: 5, minWidth: 150, fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--muted)' },
  range: { padding: '0 14px 12px', color: 'var(--muted)', fontSize: 'var(--fs-xs)' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' },
  panelTitle: { margin: 0, fontSize: 'calc(var(--fs-base) + 2px)' },
  badge: { padding: '3px 8px', borderRadius: 'var(--r-pill)', background: 'var(--accent)', color: '#fff', fontSize: 'var(--fs-xs)', fontWeight: 700 },
  state: { padding: 28, textAlign: 'center', color: 'var(--muted)' },
  error: { padding: 16, color: 'var(--bad)', fontWeight: 700 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' },
  path: { display: 'block', marginTop: 3, color: 'var(--faint)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' },
};
