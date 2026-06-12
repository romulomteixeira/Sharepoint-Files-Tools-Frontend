import React, { useMemo, useState } from 'react';
import { getLatestTopFiles, getTopFiles } from '../api/inventory.api';
import type { TopFilesMetric } from '../api/inventory.api';
import { listScans } from '../api/scans.api';
import { useApi } from '../hooks/useApi';
import type { FileItem } from '../types';
import { Download } from 'lucide-react';

const LIMITS = [50, 100, 500] as const;
type ViewKey = TopFilesMetric | 'latest';

const VIEWS: Array<{ key: ViewKey; label: string; description: string }> = [
  { key: 'size',    label: 'Maiores arquivos',  description: 'Tamanho atual do arquivo' },
  { key: 'total',   label: 'Arquivos + versões', description: 'Arquivo atual somado ao histórico de versões' },
  { key: 'versions',label: 'Mais versionados',   description: 'Quantidade de versões conhecidas' },
  { key: 'latest',  label: 'Consolidado',        description: 'Último registro concluído de cada arquivo' },
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
  const [limits, setLimits] = useState<Record<ViewKey, number>>({ size: 100, total: 100, versions: 100, latest: 100 });
  const [extension, setExtension] = useState('');
  const limit = limits[activeView];
  const metric: TopFilesMetric = activeView === 'latest' ? latestMetric : activeView;
  const needsScan = activeView !== 'latest';

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

  const extensions = useMemo(() => Array.from(new Set((files ?? []).map(file => file.extension || ''))).sort(), [files]);
  const displayed = useMemo(() => extension ? (files ?? []).filter(file => (file.extension || '') === extension) : (files ?? []), [extension, files]);
  const currentView = VIEWS.find(view => view.key === activeView)!;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Top Arquivos</h1>
          <p className="page-sub">Visões por scan e consolidada, com métricas e limites independentes.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {VIEWS.map(view => (
            <button key={view.key} type="button"
              style={{
                display: 'grid', gap: 3, padding: 12, border: 0, cursor: 'pointer', textAlign: 'left',
                borderRight: '1px solid var(--border)',
                background: activeView === view.key ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel-2)',
                color: activeView === view.key ? 'var(--accent)' : 'var(--text)',
                boxShadow: activeView === view.key ? 'inset 0 -3px var(--accent)' : 'none',
                fontFamily: 'inherit',
              }}
              onClick={() => { setActiveView(view.key); setExtension(''); }}
            >
              <strong style={{ fontSize: 'var(--fs-sm)' }}>{view.label}</strong>
              <span className="small muted">{view.description}</span>
            </button>
          ))}
        </div>

        {/* Controles */}
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end', padding: 14, gap: 12 }}>
          {needsScan && (
            <div className="field" style={{ minWidth: 190 }}>
              <label className="field-label">Scan concluído</label>
              <select className="select" aria-label="Scan concluído" value={selectedScanId} disabled={scansLoading}
                onChange={e => { setSelectedScanId(e.target.value); setExtension(''); }}>
                <option value="">Selecione um scan</option>
                {completedScans.map(scan => (
                  <option key={scan.id} value={scan.id}>{scan.id} · {new Date(scan.createdAt).toLocaleDateString('pt-BR')}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field" style={{ minWidth: 160 }}>
            <label className="field-label">Limite desta visão</label>
            <select className="select" aria-label="Limite desta visão" value={limit}
              onChange={e => setLimits(cur => ({ ...cur, [activeView]: Number(e.target.value) }))}>
              {LIMITS.map(v => <option key={v} value={v}>Top {v}</option>)}
            </select>
          </div>

          {activeView === 'latest' && (
            <div className="field" style={{ minWidth: 190 }}>
              <label className="field-label">Ranking consolidado</label>
              <select className="select" aria-label="Ranking consolidado" value={latestMetric}
                onChange={e => setLatestMetric(e.target.value as TopFilesMetric)}>
                <option value="size">Tamanho do arquivo</option>
                <option value="total">Arquivo + versões</option>
                <option value="versions">Quantidade de versões</option>
              </select>
            </div>
          )}

          <div className="field" style={{ minWidth: 160 }}>
            <label className="field-label">Extensão</label>
            <select className="select" aria-label="Filtrar por extensão" value={extension} disabled={!extensions.length}
              onChange={e => setExtension(e.target.value)}>
              <option value="">Todas ({files?.length ?? 0})</option>
              {extensions.map(v => <option key={v} value={v}>{v || 'Sem extensão'}</option>)}
            </select>
          </div>

          <div className="field" style={{ marginLeft: 'auto' }}>
            <label className="field-label">Exportar resultado</label>
            <div className="row">
              <button type="button" className="btn btn-sm" disabled={!displayed.length} onClick={() => exportRows(displayed, 'csv', activeView)}>
                <Download size={13} /> CSV
              </button>
              <button type="button" className="btn btn-sm" disabled={!displayed.length} onClick={() => exportRows(displayed, 'jsonl', activeView)}>
                <Download size={13} /> JSONL
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-head">
          <div>
            <div className="card-title">{currentView.label}</div>
            <div className="small muted">{currentView.description}</div>
          </div>
          <span className="pill pill-info">{displayed.length} arquivos</span>
        </div>

        {needsScan && !selectedScanId && <p className="small muted" style={{ padding: 28, textAlign: 'center' }}>Selecione um scan concluído.</p>}
        {(!needsScan || selectedScanId) && loading && <p className="small muted" style={{ padding: 28, textAlign: 'center' }}>Carregando arquivos…</p>}
        {error && <p role="alert" className="small" style={{ padding: 16, color: 'var(--bad)', fontWeight: 600 }}>{error}</p>}
        {(!needsScan || selectedScanId) && !loading && !error && displayed.length === 0 && (
          <p className="small muted" style={{ padding: 28, textAlign: 'center' }}>Nenhum arquivo encontrado para os filtros atuais.</p>
        )}

        {displayed.length > 0 && (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Arquivo</th>
                  <th>Site / biblioteca</th>
                  <th className="td-r">Tamanho</th>
                  <th className="td-r">Versões</th>
                  <th className="td-r">Esp. versões</th>
                  <th className="td-r">Total</th>
                  <th>Modificado</th>
                  {activeView === 'latest' && <th>Origem</th>}
                </tr>
              </thead>
              <tbody>
                {displayed.map((file, index) => (
                  <tr key={`${file.driveId}:${file.itemId}:${index}`}>
                    <td className="td-mute">{index + 1}</td>
                    <td>
                      {file.webUrl ? <a href={file.webUrl} target="_blank" rel="noreferrer" className="td-link">{file.name}</a> : file.name}
                      <small className="small muted" style={{ display: 'block', marginTop: 3, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.fullPath || file.extension || '—'}
                      </small>
                    </td>
                    <td>
                      {file.siteName || file.siteId}
                      <small className="small muted" style={{ display: 'block', marginTop: 3 }}>{file.driveName || file.driveId}</small>
                    </td>
                    <td className="td-r">{fmtBytes(file.sizeBytes)}</td>
                    <td className="td-r">{(file.versionCount ?? 0).toLocaleString('pt-BR')}</td>
                    <td className="td-r">{fmtBytes(file.versionsBytes)}</td>
                    <td className="td-r"><strong>{fmtBytes(file.totalBytes)}</strong></td>
                    <td className="td-mute small">{fmtDate(file.modified || file.modifiedAt)}</td>
                    {activeView === 'latest' && (
                      <td>
                        <code className="mono small">{file.originScanId || file.scanId || '—'}</code>
                        <small className="small muted" style={{ display: 'block', marginTop: 3 }}>{fmtDate(file.originScannedAt)}</small>
                      </td>
                    )}
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
