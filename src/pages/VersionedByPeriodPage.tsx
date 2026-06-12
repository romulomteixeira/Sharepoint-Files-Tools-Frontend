import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getTopVersioned } from '../api/analytics.api';
import type { AnalyticsDateField, AnalyticsWindow, TopVersionedItem } from '../api/analytics.api';
import { listScans } from '../api/scans.api';
import { useApi } from '../hooks/useApi';
import { Download } from 'lucide-react';

const WINDOWS: Array<{ value: AnalyticsWindow; label: string }> = [
  { value: 'day',   label: 'Dia' },
  { value: 'week',  label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year',  label: 'Ano' },
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
  const [scanId,    setScanId]    = useState('');
  const [windowKey, setWindowKey] = useState<AnalyticsWindow>('month');
  const [field,     setField]     = useState<AnalyticsDateField>('modified');
  const [limit,     setLimit]     = useState<(typeof LIMITS)[number]>(100);
  const [search,    setSearch]    = useState('');

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
      item.siteName, item.siteUrl, item.siteId,
      item.driveName, item.fullPath, item.name,
      item.createdBy, item.modifiedBy,
    ].some(value => String(value || '').toLocaleLowerCase('pt-BR').includes(query)));
  }, [data, search]);

  const incompleteTimeline = Boolean(data && (!data.timelineAvailable || data.missingTimelineFiles > 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Versionados por Período</h1>
          <p className="page-sub">Arquivos mais versionados no recorte temporal do scan.</p>
        </div>
        <Link to="/" className="td-link" style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>Dashboard</Link>
      </div>

      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
          <div className="field" style={{ minWidth: 200 }}>
            <label className="field-label">Scan concluído</label>
            <select className="select" aria-label="Scan concluído" value={scanId} disabled={scansLoading}
              onChange={e => setScanId(e.target.value)}>
              <option value="">Selecione um scan</option>
              {completedScans.map(scan => (
                <option key={scan.id} value={scan.id}>{scan.id} · {new Date(scan.createdAt).toLocaleDateString('pt-BR')}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 120 }}>
            <label className="field-label">Período</label>
            <select className="select" aria-label="Período" value={windowKey} onChange={e => setWindowKey(e.target.value as AnalyticsWindow)}>
              {WINDOWS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 190 }}>
            <label className="field-label">Data de referência</label>
            <select className="select" aria-label="Data de referência" value={field} onChange={e => setField(e.target.value as AnalyticsDateField)}>
              <option value="modified">LastModified das versões</option>
              <option value="created">File Created</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: 110 }}>
            <label className="field-label">Quantidade</label>
            <select className="select" aria-label="Quantidade" value={limit} onChange={e => setLimit(Number(e.target.value) as (typeof LIMITS)[number])}>
              {LIMITS.map(v => <option key={v} value={v}>Top {v}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label className="field-label">Filtrar resultado</label>
            <input className="input" aria-label="Filtrar" value={search} placeholder="Site, caminho, pessoa ou arquivo" onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-sm" disabled={!filtered.length} onClick={() => exportCsv(filtered, field)}>
            <Download size={13} /> CSV
          </button>
        </div>
        {data && (
          <p className="small muted" style={{ marginTop: 8 }}>
            Recorte do scan: <strong>{fmtDate(data.startIso)}</strong> até <strong>{fmtDate(data.endIso)}</strong>.
            {' '}{field === 'modified'
              ? 'As métricas representam somente versões modificadas nesse período.'
              : 'Os arquivos foram criados nesse período e estão ordenados pelo histórico conhecido no scan.'}
          </p>
        )}
      </div>

      {incompleteTimeline && (
        <div role="alert" className="alert-warn">
          Timeline de versões incompleta: {data?.filesWithTimeline ?? 0} de {data?.totalVersionedFiles ?? 0} arquivos
          versionados possuem eventos detalhados. {data?.missingTimelineFiles ?? 0} arquivo(s) podem ficar fora do recorte
          por LastModified.
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Top versionados</div>
            <div className="small muted">Quantidade de versões, espaço ocupado e total no período.</div>
          </div>
          <span className="pill pill-info">{filtered.length} arquivos</span>
        </div>

        {!scanId && <p className="small muted" style={{ padding: 28, textAlign: 'center' }}>Selecione um scan concluído para consultar o período.</p>}
        {scanId && loading && <p className="small muted" style={{ padding: 28, textAlign: 'center' }}>Carregando arquivos versionados...</p>}
        {error && <p role="alert" className="small" style={{ padding: 16, color: 'var(--bad)', fontWeight: 600 }}>{error}</p>}
        {scanId && !loading && !error && filtered.length === 0 && (
          <p className="small muted" style={{ padding: 28, textAlign: 'center' }}>Nenhum arquivo versionado encontrado para os filtros atuais.</p>
        )}

        {filtered.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Site</th>
                  <th>Biblioteca / caminho</th>
                  <th>Arquivo</th>
                  <th>{field === 'created' ? 'Criado em' : 'Última modificação'}</th>
                  <th>Colaborador</th>
                  <th className="td-r">Tamanho</th>
                  <th className="td-r">Versões</th>
                  <th className="td-r">Esp. versões</th>
                  <th className="td-r">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, index) => (
                  <tr key={`${item.driveId}:${item.itemId}`}>
                    <td className="td-mute">{index + 1}</td>
                    <td>{item.siteName || item.siteId}</td>
                    <td>
                      {item.driveName || item.driveId}
                      <small className="small muted" style={{ display: 'block', marginTop: 3, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.fullPath || '—'}</small>
                    </td>
                    <td>{item.webUrl ? <a href={item.webUrl} target="_blank" rel="noreferrer" className="td-link">{item.name}</a> : item.name}</td>
                    <td className="small muted">{fmtDate(field === 'created' ? item.created : item.modified)}</td>
                    <td className="small">{(field === 'created' ? item.createdBy : item.modifiedBy) || '—'}</td>
                    <td className="td-r">{fmtBytes(item.sizeBytes)}</td>
                    <td className="td-r">{(item.versionCount ?? 0).toLocaleString('pt-BR')}</td>
                    <td className="td-r">{fmtBytes(item.versionsBytes ?? 0)}</td>
                    <td className="td-r"><strong>{fmtBytes(item.totalBytes)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
