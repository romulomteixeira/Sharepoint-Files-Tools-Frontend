/**
 * VersionedByPeriodPage.tsx — Arquivos versionados por período (Sprint 15)
 *
 * Tenta usar o endpoint /api/inventory/:scanId/versioned-by-period.
 * Se o endpoint não existir (404), exibe fallback com dados de versões
 * agregados por scan (usando getInventorySummary de todos os scans concluídos).
 *
 * Funcionalidades:
 *   - Seletor de scan + agrupamento (dia / semana / mês)
 *   - KPIs: total versões, bytes de versões, arquivos com versão
 *   - Chart de barras horizontais: versões por período
 *   - Tabela: período | versões | bytes | arquivos
 *   - Fallback: quando o endpoint não existe, mostra visão por scan
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import { getInventorySummary, getVersionedByPeriod } from '../api/inventory.api';
import type { VersionPeriodUnit, VersionPeriodBucket, VersionedPeriodData } from '../types';
import { ApiClientError } from '../api/client';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:     '#eef1f5',
  panel:  '#ffffff',
  border: '#c8ced8',
  accent: '#2b6cb0',
  text:   '#1a202c',
  muted:  '#4a5568',
  good:   '#276749',
  warn:   '#c05621',
  bad:    '#c53030',
} as const;

// ─── Constantes ───────────────────────────────────────────────────────────────

const UNIT_OPTIONS: { value: VersionPeriodUnit; label: string }[] = [
  { value: 'day',   label: 'Por dia'   },
  { value: 'week',  label: 'Por semana' },
  { value: 'month', label: 'Por mês'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBytes(b: number | undefined): string {
  if (b == null || b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), units.length - 1);
  return `${(b / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtNum(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR');
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Converte data ISO para label de período */
function toPeriodLabel(iso: string, unit: VersionPeriodUnit): string {
  const d = new Date(iso);
  if (unit === 'month') return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  if (unit === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return `sem. ${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }
  return fmtDateShort(iso);
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={s.kpiCard}>
      <div style={{ ...s.kpiValue, color: accent ? C.accent : C.text }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
    </div>
  );
}

function HorizBar({ value, max, label, sub }: {
  value: number; max: number; label: string; sub?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={s.barRow}>
      <div style={s.barLabel}>
        <span style={s.barLabelText}>{label}</span>
        {sub && <span style={s.barLabelSub}>{sub}</span>}
      </div>
      <div style={s.barTrackWrap}>
        <div style={s.barTrack}>
          <div style={{ ...s.barFill, width: `${pct}%` }} />
        </div>
        <span style={s.barValue}>{fmtNum(value)}</span>
      </div>
    </div>
  );
}

// ─── FallbackView — dados de versões por scan ─────────────────────────────────

function FallbackView({ selectedScanId, unit }: { selectedScanId: string; unit: VersionPeriodUnit }) {
  const { data: scans } = useApi(listScans, []);

  // Carrega sumário de todos os scans concluídos para montar a visão de versões por scan
  const [summaries, setSummaries] = useState<
    { scanId: string; createdAt: string; totalVersions?: number; totalBytes?: number }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (scansList: typeof scans) => {
    if (!scansList) return;
    const completed = scansList.filter(sc => sc.status === 'completed');
    setLoading(true);
    type SummaryEntry = { scanId: string; createdAt: string; totalVersions?: number; totalBytes?: number };
    const results = await Promise.allSettled(
      completed.map(sc =>
        getInventorySummary(sc.id).then((s): SummaryEntry => ({
          scanId:        sc.id,
          createdAt:     sc.createdAt,
          totalVersions: s.totalVersions,
          totalBytes:    s.totalBytes,
        })),
      ),
    );
    setSummaries(
      results
        .filter((r): r is PromiseFulfilledResult<SummaryEntry> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter(s => s.totalVersions != null && s.totalVersions > 0)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    );
    setLoading(false);
  }, []);

  useEffect(() => { load(scans); }, [scans, load]);

  // Agrupa por período
  const grouped = React.useMemo(() => {
    const map = new Map<string, { period: string; versions: number; bytes: number; count: number }>();
    summaries.forEach(s => {
      const key = toPeriodLabel(s.createdAt, unit);
      const prev = map.get(key) ?? { period: key, versions: 0, bytes: 0, count: 0 };
      map.set(key, {
        period:   key,
        versions: prev.versions + (s.totalVersions ?? 0),
        bytes:    prev.bytes    + (s.totalBytes    ?? 0),
        count:    prev.count    + 1,
      });
    });
    return Array.from(map.values());
  }, [summaries, unit]);

  const maxVersions = Math.max(...grouped.map(g => g.versions), 1);
  const totalVersions = summaries.reduce((a, s) => a + (s.totalVersions ?? 0), 0);

  const selectedSummary = summaries.find(s => s.scanId === selectedScanId);

  if (loading) return <div style={{ padding: '24px 14px', color: C.muted, fontSize: 13 }}>Carregando sumários…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Aviso de fallback */}
      <div style={s.fallbackBanner}>
        ℹ O endpoint de versionamento por período não está disponível neste servidor.
        Exibindo versões consolidadas por scan agrupadas por {unit === 'day' ? 'dia' : unit === 'week' ? 'semana' : 'mês'}.
      </div>

      {/* KPIs do scan selecionado */}
      {selectedSummary && (
        <div style={s.kpiStrip}>
          <KpiCard label="Versões (scan)" value={fmtNum(selectedSummary.totalVersions)} accent />
          <KpiCard label="Volume total"   value={fmtBytes(selectedSummary.totalBytes)} />
          <KpiCard label="Total geral"    value={fmtNum(totalVersions)} />
        </div>
      )}

      {/* Gráfico de barras por período */}
      {grouped.length > 0 && (
        <div style={s.barsPanel}>
          <div style={s.tablePanelHeader}>
            <span style={s.panelTitle}>Versões por {unit === 'day' ? 'dia' : unit === 'week' ? 'semana' : 'mês'}</span>
            <span style={s.countBadge}>{grouped.length} períodos</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {grouped.map(g => (
              <HorizBar
                key={g.period}
                label={g.period}
                sub={`${g.count} scan${g.count !== 1 ? 's' : ''}`}
                value={g.versions}
                max={maxVersions}
              />
            ))}
          </div>
        </div>
      )}

      {grouped.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: C.muted, fontSize: 13 }}>
          Nenhum scan com dados de versionamento encontrado.
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function VersionedByPeriodPage(): React.ReactElement {
  const [selectedScanId, setSelectedScanId] = useState('');
  const [unit, setUnit] = useState<VersionPeriodUnit>('week');

  // Estado do endpoint real
  const [periodData, setPeriodData]    = useState<VersionedPeriodData | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [useFallback, setUseFallback]  = useState(false);

  const { data: scans, loading: scansLoading } = useApi(listScans, []);
  const completedScans = (scans ?? []).filter(sc => sc.status === 'completed');

  // Tenta chamar o endpoint real; se falhar com 404/NOT_FOUND, ativa fallback
  useEffect(() => {
    if (!selectedScanId) return;
    let cancelled = false;

    setPeriodData(null);
    setPeriodLoading(true);
    setUseFallback(false);

    getVersionedByPeriod(selectedScanId, { unit })
      .then(data => {
        if (!cancelled) { setPeriodData(data); setPeriodLoading(false); }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const isNotFound =
          err instanceof ApiClientError && (err.status === 404 || err.code === 'NOT_FOUND');
        setUseFallback(isNotFound);
        setPeriodLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedScanId, unit]);

  // Derivados do endpoint real
  const buckets: VersionPeriodBucket[] = periodData?.buckets ?? [];
  const maxVersions = Math.max(...buckets.map(b => b.versionCount), 1);

  return (
    <div style={s.page}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div>
          <div style={s.pageTitle}>Versionados por Período</div>
          <div style={s.pageSub}>Arquivos versionados agrupados por dia, semana ou mês</div>
        </div>
        <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
      </div>

      {/* ── Controles ─────────────────────────────────────────────────────── */}
      <div style={s.controls}>
        {/* Scan */}
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>Scan</label>
          {scansLoading ? (
            <div style={{ fontSize: 12, color: C.muted }}>Carregando…</div>
          ) : (
            <select
              value={selectedScanId}
              onChange={e => setSelectedScanId(e.target.value)}
              style={s.select}
            >
              <option value="">— selecione um scan —</option>
              {completedScans.map(sc => (
                <option key={sc.id} value={sc.id}>
                  {sc.id.slice(0, 16)}… · {new Date(sc.createdAt).toLocaleDateString('pt-BR')}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Agrupamento */}
        <div style={s.ctrlGroup}>
          <label style={s.ctrlLabel}>Agrupamento</label>
          <div style={s.btnGroup}>
            {UNIT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                style={{
                  ...s.toggleBtn,
                  background:  unit === opt.value ? C.accent : C.panel,
                  color:       unit === opt.value ? '#fff'    : C.text,
                  borderColor: unit === opt.value ? C.accent  : C.border,
                }}
                onClick={() => setUnit(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conteúdo ──────────────────────────────────────────────────────── */}

      {!selectedScanId && (
        <div style={s.emptyPanel}>
          <div style={s.emptyTitle}>Selecione um scan para visualizar os dados de versionamento</div>
        </div>
      )}

      {selectedScanId && periodLoading && (
        <div style={s.loadingMsg}>Carregando dados de versionamento…</div>
      )}

      {/* ── Fallback: endpoint não disponível */}
      {selectedScanId && !periodLoading && useFallback && (
        <FallbackView selectedScanId={selectedScanId} unit={unit} />
      )}

      {/* ── Endpoint real: dados do período */}
      {selectedScanId && !periodLoading && !useFallback && periodData && (
        <>
          {/* KPIs */}
          <div style={s.kpiStrip}>
            <KpiCard label="Total versões"       value={fmtNum(periodData.totalVersions)} accent />
            <KpiCard label="Volume das versões"  value={fmtBytes(periodData.totalVersionBytes)} />
            <KpiCard label="Períodos com dados"  value={fmtNum(buckets.length)} />
            <KpiCard label="Agrupamento"         value={unit === 'day' ? 'Diário' : unit === 'week' ? 'Semanal' : 'Mensal'} />
          </div>

          {/* Chart de barras por período */}
          {buckets.length > 0 && (
            <div style={s.barsPanel}>
              <div style={s.tablePanelHeader}>
                <span style={s.panelTitle}>Versões por período</span>
                <span style={s.countBadge}>{buckets.length}</span>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buckets.map(b => (
                  <HorizBar
                    key={b.period}
                    label={b.period}
                    sub={`${fmtNum(b.fileCount)} arqs · ${fmtBytes(b.versionBytes)}`}
                    value={b.versionCount}
                    max={maxVersions}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tabela detalhada */}
          {buckets.length > 0 && (
            <div style={s.tablePanel}>
              <div style={s.tablePanelHeader}>
                <span style={s.panelTitle}>Detalhe por período</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Período</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Versões</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Bytes versões</th>
                      <th style={{ ...s.th, textAlign: 'right' as const }}>Arquivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.map((b, idx) => (
                      <tr key={b.period} style={idx % 2 === 0 ? s.trEven : s.trOdd}>
                        <td style={s.td}>{b.period}</td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const, fontWeight: 700 }}>
                          {fmtNum(b.versionCount)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>
                          {fmtBytes(b.versionBytes)}
                        </td>
                        <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>
                          {fmtNum(b.fileCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {buckets.length === 0 && (
            <div style={{ ...s.emptyPanel, padding: '32px' }}>
              <div style={s.emptyTitle}>Nenhum arquivo versionado encontrado neste scan</div>
              <div style={s.emptySub}>O versionamento pode não ter sido habilitado durante este scan.</div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    color:      C.text,
    display:    'flex',
    flexDirection: 'column',
    gap:        12,
  },

  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    flexWrap:       'wrap',
    gap:            8,
  },
  pageTitle: { fontSize: 22, fontWeight: 800, lineHeight: 1.2 },
  pageSub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  breadcrumb: { fontSize: 12, color: C.muted, textDecoration: 'none', fontWeight: 600, alignSelf: 'flex-end' },

  // Controls
  controls: {
    display:      'flex',
    gap:          14,
    flexWrap:     'wrap',
    alignItems:   'flex-end',
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    padding:      '12px 14px',
  },
  ctrlGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  ctrlLabel: { fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em' },
  select: {
    padding: '6px 10px', border: `1px solid ${C.border}`,
    borderRadius: 4, fontSize: 12, color: C.text,
    background: C.panel, fontFamily: 'inherit', cursor: 'pointer', minWidth: 240,
  },
  btnGroup: { display: 'flex', gap: 4 },
  toggleBtn: {
    padding: '5px 12px', border: '1px solid',
    borderRadius: 4, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background .12s, color .12s',
  },

  // KPIs
  kpiStrip: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap:                 10,
  },
  kpiCard: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  kpiValue: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  kpiLabel: { fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' },

  // Bars panel
  barsPanel: {
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    overflow:     'hidden',
  },

  // Bar chart row
  barRow: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 28 },
  barLabel: { display: 'flex', flexDirection: 'column', width: 100, flexShrink: 0 },
  barLabelText: { fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  barLabelSub:  { fontSize: 9, color: C.muted },
  barTrackWrap: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  barTrack: { flex: 1, height: 12, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: '100%', background: C.accent, borderRadius: 3, transition: 'width .3s ease' },
  barValue: { fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', minWidth: 50, textAlign: 'right' as const },

  // Fallback banner
  fallbackBanner: {
    background:   '#fffbeb',
    border:       `1px solid #fde68a`,
    borderRadius: 5,
    padding:      '10px 14px',
    fontSize:     12,
    color:        '#78350f',
  },

  // Table
  tablePanel: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' },
  tablePanelHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
    background: '#f7f9fb',
  },
  panelTitle: { fontSize: 12, fontWeight: 800, color: C.text, textTransform: 'uppercase', letterSpacing: '.06em' },
  countBadge: { background: C.accent, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10 },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px', textAlign: 'left', fontWeight: 700,
    fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em',
    background: '#f7f9fb', borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap',
  },
  trEven: { background: C.panel },
  trOdd:  { background: '#f9fafb' },
  td:     { padding: '7px 10px', verticalAlign: 'middle', borderBottom: '1px solid #edf0f4' },

  // States
  loadingMsg: { fontSize: 13, color: C.muted, padding: '20px 0' },
  emptyPanel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '40px 20px', textAlign: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: C.muted },
};
