/**
 * OnerationMonitorPage.tsx — Monitor de Oneração (Sprint 15)
 *
 * Mostra a evolução do consumo de armazenamento ao longo do tempo,
 * calculando deltas entre scans consecutivos.
 *
 * Fonte de dados: listScans() + getInventorySummary() por scan selecionado.
 * Não requer endpoint dedicado — usa os dados já existentes.
 *
 * Funcionalidades:
 *   - Filtro de período: 7d / 30d / 90d / todos
 *   - Chart SVG de evolução de bytes (área + linha)
 *   - Chart SVG de evolução de arquivos
 *   - Tabela de comparação entre scans com Δ bytes e Δ arquivos
 *   - Indicadores de crescimento (positivo / negativo)
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { listScans } from '../api/scans.api';
import type { GrowthPoint } from '../types';

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

type PeriodFilter = '7d' | '30d' | '90d' | 'all';

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: '7d',  label: 'Últimos 7 dias'  },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todos os scans'  },
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
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function periodCutoff(period: PeriodFilter): Date {
  const now = new Date();
  if (period === '7d')  return new Date(now.getTime() - 7  * 86_400_000);
  if (period === '30d') return new Date(now.getTime() - 30 * 86_400_000);
  if (period === '90d') return new Date(now.getTime() - 90 * 86_400_000);
  return new Date(0);
}

function deltaSign(v: number | undefined): string {
  if (v == null || v === 0) return '—';
  return v > 0 ? `+${fmtNum(v)}` : fmtNum(v);
}

// ─── SVG Chart ────────────────────────────────────────────────────────────────

interface ChartPoint { label: string; value: number }

function AreaLineChart({
  data,
  color,
  formatY,
  title,
}: {
  data: ChartPoint[];
  color: string;
  formatY: (v: number) => string;
  title: string;
}) {
  const W = 540; const H = 140;
  const PAD = { t: 14, r: 16, b: 36, l: 66 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  if (data.length < 2) {
    return (
      <div style={s.chartWrap}>
        <div style={s.chartTitle}>{title}</div>
        <div style={s.chartEmpty}>
          São necessários ≥ 2 scans no período para exibir a tendência.
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => d.value), 1);

  const px = (i: number) => PAD.l + (i / (data.length - 1)) * cW;
  const py = (v: number) => PAD.t + cH - (v / maxVal) * cH;

  const pts = data.map((d, i) => ({ ...d, x: px(i), y: py(d.value) }));

  const linePath  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath  = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + cH).toFixed(1)} L${PAD.l.toFixed(1)},${(PAD.t + cH).toFixed(1)} Z`;

  // Y-axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map(t => ({
    y: PAD.t + cH - t * cH,
    label: formatY(t * maxVal),
  }));

  return (
    <div style={s.chartWrap}>
      <div style={s.chartTitle}>{title}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible', display: 'block' }}
        aria-label={title}
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD.l} y1={t.y} x2={PAD.l + cW} y2={t.y}
            stroke={C.border} strokeWidth="1" strokeDasharray="3 3" />
        ))}

        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD.l - 6} y={t.y + 3.5}
            textAnchor="end" fontSize="9" fill={C.muted} fontFamily="Segoe UI, sans-serif">
            {t.label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={color} fillOpacity="0.12" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />

        {/* Points */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="#fff" strokeWidth="1.5" />
            {/* Tooltip value above point */}
            <text x={p.x} y={p.y - 8} textAnchor="middle"
              fontSize="8" fill={color} fontWeight="700" fontFamily="Segoe UI, sans-serif">
              {formatY(p.value)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {pts.map((p, i) => (
          <text key={i} x={p.x} y={H - 4}
            textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="Segoe UI, sans-serif">
            {p.label}
          </text>
        ))}

        {/* Axis line */}
        <line x1={PAD.l} y1={PAD.t + cH} x2={PAD.l + cW} y2={PAD.t + cH}
          stroke={C.border} strokeWidth="1" />
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + cH}
          stroke={C.border} strokeWidth="1" />
      </svg>
    </div>
  );
}

// ─── DeltaBar ─────────────────────────────────────────────────────────────────

function DeltaBar({ value, max }: { value: number; max: number }) {
  if (max === 0) return null;
  const pct = Math.min(Math.abs(value) / max * 100, 100);
  const color = value > 0 ? C.bad : value < 0 ? C.good : C.muted;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 60, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' as const }}>
        {deltaSign(value)}
      </span>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function OnerationMonitorPage(): React.ReactElement {
  const [period, setPeriod] = useState<PeriodFilter>('all');

  const { data: scans, loading, error } = useApi(listScans, []);

  // ── Constrói os pontos de crescimento a partir dos scans concluídos
  const growthPoints: GrowthPoint[] = useMemo(() => {
    if (!scans) return [];

    const cutoff = periodCutoff(period);
    const filtered = scans
      .filter(sc =>
        sc.status === 'completed' &&
        sc.totalFiles != null && sc.totalFiles > 0 &&
        new Date(sc.createdAt) >= cutoff,
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return filtered.map((sc, i): GrowthPoint => {
      const prev = filtered[i - 1];
      return {
        scanId:     sc.id,
        date:       sc.createdAt,
        totalFiles: sc.totalFiles ?? 0,
        totalBytes: sc.totalBytes ?? 0,
        deltaFiles: prev != null ? (sc.totalFiles ?? 0) - (prev.totalFiles ?? 0) : undefined,
        deltaBytes: prev != null ? (sc.totalBytes ?? 0) - (prev.totalBytes ?? 0) : undefined,
      };
    });
  }, [scans, period]);

  // ── Dados para os charts
  const bytesChartData: ChartPoint[] = growthPoints.map(p => ({
    label: fmtDateShort(p.date),
    value: p.totalBytes,
  }));

  const filesChartData: ChartPoint[] = growthPoints.map(p => ({
    label: fmtDateShort(p.date),
    value: p.totalFiles,
  }));

  // ── Deltas máximos para barras proporcionais
  const maxDeltaBytes = Math.max(...growthPoints.map(p => Math.abs(p.deltaBytes ?? 0)), 1);
  const maxDeltaFiles = Math.max(...growthPoints.map(p => Math.abs(p.deltaFiles ?? 0)), 1);

  // ── KPIs de crescimento total no período
  const firstPoint = growthPoints[0];
  const lastPoint  = growthPoints[growthPoints.length - 1];
  const totalDeltaBytes = lastPoint && firstPoint
    ? lastPoint.totalBytes - firstPoint.totalBytes
    : null;
  const totalDeltaFiles = lastPoint && firstPoint
    ? lastPoint.totalFiles - firstPoint.totalFiles
    : null;

  return (
    <div style={s.page}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div>
          <div style={s.pageTitle}>Monitor de Oneração</div>
          <div style={s.pageSub}>Evolução do consumo de armazenamento entre scans</div>
        </div>
        <Link to="/" style={s.breadcrumb}>← Dashboard</Link>
      </div>

      {/* ── Filtro de período ─────────────────────────────────────────────── */}
      <div style={s.periodBar}>
        <span style={s.periodLabel}>Período:</span>
        {PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            style={{
              ...s.periodBtn,
              background:  period === opt.value ? C.accent : C.panel,
              color:       period === opt.value ? '#fff'    : C.text,
              borderColor: period === opt.value ? C.accent  : C.border,
            }}
            onClick={() => setPeriod(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Estado de carregamento ────────────────────────────────────────── */}
      {loading && <div style={s.loadingMsg}>Carregando scans…</div>}
      {error   && <div style={s.errorMsg}>⚠ {error}</div>}

      {!loading && growthPoints.length === 0 && (
        <div style={s.emptyPanel}>
          <div style={s.emptyTitle}>Sem dados para o período selecionado</div>
          <div style={s.emptySub}>
            São necessários scans concluídos no período para exibir a tendência.{' '}
            <Link to="/scans" style={{ color: C.accent }}>Iniciar um scan →</Link>
          </div>
        </div>
      )}

      {growthPoints.length > 0 && (
        <>
          {/* ── KPI cards ──────────────────────────────────────────────────── */}
          <div style={s.kpiStrip}>
            <KpiCard
              label="Scans no período"
              value={String(growthPoints.length)}
            />
            <KpiCard
              label="Volume atual"
              value={fmtBytes(lastPoint?.totalBytes)}
            />
            <KpiCard
              label="Arquivos atuais"
              value={fmtNum(lastPoint?.totalFiles)}
            />
            {totalDeltaBytes != null && growthPoints.length > 1 && (
              <KpiCard
                label="Δ Volume (período)"
                value={(totalDeltaBytes >= 0 ? '+' : '') + fmtBytes(totalDeltaBytes)}
                color={totalDeltaBytes > 0 ? C.bad : C.good}
              />
            )}
            {totalDeltaFiles != null && growthPoints.length > 1 && (
              <KpiCard
                label="Δ Arquivos (período)"
                value={(totalDeltaFiles >= 0 ? '+' : '') + fmtNum(totalDeltaFiles)}
                color={totalDeltaFiles > 0 ? C.bad : C.good}
              />
            )}
          </div>

          {/* ── Charts ─────────────────────────────────────────────────────── */}
          <div style={s.chartsRow}>
            <div style={s.chartPanel}>
              <AreaLineChart
                data={bytesChartData}
                color={C.accent}
                formatY={fmtBytes}
                title="Volume total por scan (bytes)"
              />
            </div>
            <div style={s.chartPanel}>
              <AreaLineChart
                data={filesChartData}
                color={C.warn}
                formatY={v => fmtNum(Math.round(v))}
                title="Total de arquivos por scan"
              />
            </div>
          </div>

          {/* ── Tabela de comparação ──────────────────────────────────────── */}
          <div style={s.tablePanel}>
            <div style={s.tablePanelHeader}>
              <span style={s.panelTitle}>Comparação entre scans</span>
              <span style={s.countBadge}>{growthPoints.length}</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Scan</th>
                    <th style={s.th}>Data</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Arquivos</th>
                    <th style={{ ...s.th, textAlign: 'right' as const }}>Volume</th>
                    <th style={{ ...s.th, width: 140 }}>Δ Arquivos</th>
                    <th style={{ ...s.th, width: 140 }}>Δ Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {[...growthPoints].reverse().map((pt, idx) => (
                    <tr key={pt.scanId} style={idx % 2 === 0 ? s.trEven : s.trOdd}>
                      <td style={s.td}>
                        <span style={s.mono}>{pt.scanId.slice(0, 14)}…</span>
                      </td>
                      <td style={{ ...s.td, ...s.cellMuted }}>{fmtDateFull(pt.date)}</td>
                      <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>
                        {fmtNum(pt.totalFiles)}
                      </td>
                      <td style={{ ...s.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' as const }}>
                        {fmtBytes(pt.totalBytes)}
                      </td>
                      <td style={s.td}>
                        {pt.deltaFiles != null
                          ? <DeltaBar value={pt.deltaFiles} max={maxDeltaFiles} />
                          : <span style={{ color: C.muted, fontSize: 11 }}>— (baseline)</span>}
                      </td>
                      <td style={s.td}>
                        {pt.deltaBytes != null
                          ? <DeltaBar value={pt.deltaBytes} max={maxDeltaBytes} />
                          : <span style={{ color: C.muted, fontSize: 11 }}>— (baseline)</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={s.legendRow}>
              <span style={{ color: C.bad,  fontWeight: 700, fontSize: 11 }}>■</span>
              <span style={{ fontSize: 11, color: C.muted }}>Crescimento (oneração)</span>
              <span style={{ color: C.good, fontWeight: 700, fontSize: 11, marginLeft: 12 }}>■</span>
              <span style={{ fontSize: 11, color: C.muted }}>Redução</span>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={s.kpiCard}>
      <div style={{ ...s.kpiValue, color: color ?? C.text }}>{value}</div>
      <div style={s.kpiLabel}>{label}</div>
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

  // Period filter
  periodBar: {
    display:      'flex',
    alignItems:   'center',
    gap:          6,
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    padding:      '10px 14px',
    flexWrap:     'wrap',
  },
  periodLabel: { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 },
  periodBtn: {
    padding:      '5px 14px',
    border:       '1px solid',
    borderRadius: 4,
    fontSize:     12,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'inherit',
    transition:   'background .12s, color .12s',
  },

  // KPIs
  kpiStrip: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap:                 10,
  },
  kpiCard: {
    background:    C.panel,
    border:        `1px solid ${C.border}`,
    borderRadius:  6,
    padding:       '12px 16px',
    display:       'flex',
    flexDirection: 'column',
    gap:           2,
  },
  kpiValue: { fontSize: 20, fontWeight: 800, lineHeight: 1.1 },
  kpiLabel: { fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' },

  // Charts
  chartsRow: {
    display:             'grid',
    gridTemplateColumns: '1fr 1fr',
    gap:                 12,
  },
  chartPanel: {
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    padding:      '14px 16px',
  },
  chartWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  chartTitle: { fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em' },
  chartEmpty: { fontSize: 12, color: C.muted, textAlign: 'center', padding: '20px 0' },

  // Table
  tablePanel: {
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    overflow:     'hidden',
  },
  tablePanelHeader: {
    display:      'flex',
    alignItems:   'center',
    gap:          8,
    padding:      '10px 14px',
    borderBottom: `1px solid ${C.border}`,
    background:   '#f7f9fb',
  },
  panelTitle: { fontSize: 12, fontWeight: 800, color: C.text, textTransform: 'uppercase', letterSpacing: '.06em' },
  countBadge: {
    background: C.accent, color: '#fff',
    fontSize: 10, fontWeight: 700,
    padding: '2px 7px', borderRadius: 10,
  },
  legendRow: {
    display:    'flex',
    alignItems: 'center',
    gap:        4,
    padding:    '10px 14px',
    borderTop:  `1px solid ${C.border}`,
    background: '#f7f9fb',
  },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px', textAlign: 'left',
    fontWeight: 700, fontSize: 10, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '.05em',
    background: '#f7f9fb', borderBottom: `2px solid ${C.border}`,
    whiteSpace: 'nowrap',
  },
  trEven: { background: C.panel },
  trOdd:  { background: '#f9fafb' },
  td:     { padding: '7px 10px', verticalAlign: 'middle', borderBottom: '1px solid #edf0f4' },
  cellMuted: { color: C.muted, fontSize: 11 },
  mono:      { fontFamily: 'monospace', fontSize: 11 },

  loadingMsg: { fontSize: 13, color: C.muted, padding: '20px 0' },
  errorMsg:   { fontSize: 13, color: C.bad,   fontWeight: 600 },

  emptyPanel: {
    background:   C.panel,
    border:       `1px solid ${C.border}`,
    borderRadius: 6,
    padding:      '40px 20px',
    textAlign:    'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  emptySub:   { fontSize: 13, color: C.muted },
};
