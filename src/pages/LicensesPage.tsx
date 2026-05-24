/**
 * LicensesPage.tsx — Licenças & Espaço do tenant SharePoint (Sprint 19)
 *
 * GET /api/sharepoint/licenses → LicenseCapacityReport
 *
 * Secções:
 *   1. Gauge SVG circular de uso (%)
 *   2. 4 KPI cards: Quota Total, Utilizado, Disponível, % Uso
 *   3. Alert quando uso ≥ 80%
 *   4. Projecção de crescimento (baseada em listScans)
 *   5. Tabela de SKUs de licenças detectados
 *   6. Bloco de divergência (tenant vs estimativa)
 *   7. Estado de erro com hint de permissões Graph
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  getLicenseCapacity,
  type LicenseCapacityReport,
  type SkuEntry,
} from '../api/licenses.api';
import { listScans } from '../api/scans.api';
import type { Scan } from '../types';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: '#eef1f5', panel: '#fff', border: '#c8ced8',
  accent: '#2b6cb0', text: '#1a202c', muted: '#4a5568',
  good: '#276749', warn: '#c05621', bad: '#c53030',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function usagePct(usedTb: number, totalTb: number): number {
  if (totalTb <= 0) return 0;
  return Math.min(100, (usedTb / totalTb) * 100);
}

function gaugeColor(pct: number): string {
  if (pct >= 90) return C.bad;
  if (pct >= 75) return C.warn;
  return C.good;
}

function sourceLabel(src: string): string {
  const map: Record<string, string> = {
    tenantReport:        'Relatório de tenant',
    tenantDetailReport:  'Relatório detalhado',
    latestScanInventory: 'Último inventário',
    tenantAllocated:     'Alocado pelo tenant',
    licenseEstimated:    'Estimado por licenças',
  };
  return map[src] ?? src ?? '—';
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`;
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.round(bytes)} B`;
}

/** Crescimento médio em bytes/dia entre o primeiro e o último scan concluído. */
function calcGrowthRate(scans: Scan[]): number | null {
  const done = scans
    .filter(sc => sc.status === 'completed' && sc.totalBytes != null)
    .map(sc => ({
      bytes: sc.totalBytes as number,
      ts: new Date(sc.finishedAt ?? sc.createdAt).getTime(),
    }))
    .sort((a, b) => a.ts - b.ts);

  if (done.length < 2) return null;
  const first = done[0];
  const last  = done[done.length - 1];
  const days  = (last.ts - first.ts) / 86_400_000;
  if (days < 1) return null;
  return (last.bytes - first.bytes) / days;
}

// ─── Sub-componente: Gauge SVG ────────────────────────────────────────────────

function Gauge({ usedTb, totalTb }: { usedTb: number; totalTb: number }): React.ReactElement {
  const pct   = usagePct(usedTb, totalTb);
  const color = gaugeColor(pct);
  const r     = 70;
  const cx = 90;
  const cy = 90;
  const circ  = 2 * Math.PI * r;
  const arc   = (pct / 100) * circ;

  return (
    <svg width={180} height={180} viewBox="0 0 180 180" aria-label={`Uso: ${pct.toFixed(1)}%`}>
      {/* trilha */}
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke={C.border} strokeWidth={14} />
      {/* arco de uso */}
      <circle cx={cx} cy={cy} r={r}
        fill="none" stroke={color} strokeWidth={14}
        strokeDasharray={`${arc} ${circ}`}
        strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }}
      />
      {/* percentagem central */}
      <text x={cx} y={cy - 8} textAnchor="middle"
        fontSize={26} fontWeight={800} fill={color}
        fontFamily="'Segoe UI', sans-serif">
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle"
        fontSize={11} fill={C.muted} fontFamily="'Segoe UI', sans-serif">
        utilizado
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle"
        fontSize={10} fill={C.muted} fontFamily="'Segoe UI', sans-serif">
        de {totalTb.toFixed(2)} TB
      </text>
    </svg>
  );
}

// ─── Sub-componente: KPI Card ─────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}): React.ReactElement {
  return (
    <div style={ls.kpiCard}>
      <div style={ls.kpiLabel}>{label}</div>
      <div style={{ ...ls.kpiValue, color: color ?? C.text }}>{value}</div>
      {sub && <div style={ls.kpiSub}>{sub}</div>}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function LicensesPage(): React.ReactElement {
  const [report,  setReport]  = useState<LicenseCapacityReport | null>(null);
  const [scans,   setScans]   = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lic, sc] = await Promise.all([
        getLicenseCapacity(),
        listScans().catch(() => [] as Scan[]),
      ]);
      setReport(lic);
      setScans(sc ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de licenças.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={ls.wrap}>
        <style>{`@keyframes lc-spin{to{transform:rotate(360deg)}}`}</style>
        <div style={ls.pageHeader}>
          <h1 style={ls.h1}>Licenças &amp; Espaço</h1>
        </div>
        <div style={ls.centered}>
          <div style={ls.spinner} />
          <p style={ls.loadText}>A consultar Graph API…</p>
        </div>
      </div>
    );
  }

  // ── Erro de rede ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={ls.wrap}>
        <div style={ls.pageHeader}>
          <h1 style={ls.h1}>Licenças &amp; Espaço</h1>
          <button style={ls.refreshBtn} onClick={() => void fetchData()}>↺ Recarregar</button>
        </div>
        <div style={{ ...ls.alertBox, background: '#fff5f5', borderColor: C.bad }}>
          <div style={{ ...ls.alertTitle, color: C.bad }}>⚠ Erro ao carregar</div>
          <div style={ls.alertMsg}>{error}</div>
        </div>
      </div>
    );
  }

  // ── Permissões Graph insuficientes (ok: false) ────────────────────────────
  if (report && !report.ok) {
    return (
      <div style={ls.wrap}>
        <div style={ls.pageHeader}>
          <h1 style={ls.h1}>Licenças &amp; Espaço</h1>
          <button style={ls.refreshBtn} onClick={() => void fetchData()}>↺ Recarregar</button>
        </div>
        <div style={{ ...ls.alertBox, background: '#fffbeb', borderColor: C.warn }}>
          <div style={{ ...ls.alertTitle, color: C.warn }}>⚠ Permissões insuficientes</div>
          <div style={ls.alertMsg}>{report.error ?? 'Sem dados de licenças disponíveis.'}</div>
          {report.hint && (
            <pre style={ls.hintPre}>{report.hint}</pre>
          )}
        </div>
      </div>
    );
  }

  const cap = report?.capacityNow;
  const lic = report?.licenses;
  const div = report?.divergence;
  const skus: SkuEntry[] = lic?.skus ?? [];
  const pct = cap ? usagePct(cap.usedTb, cap.totalTb) : 0;
  const growthBytesDay = calcGrowthRate(scans);
  const daysUntilFull = (cap && growthBytesDay && growthBytesDay > 0)
    ? Math.round(cap.availableBytes / growthBytesDay)
    : null;
  const completedScans = scans.filter(sc => sc.status === 'completed').length;

  return (
    <div style={ls.wrap}>
      <style>{`@keyframes lc-spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div style={ls.pageHeader}>
        <div>
          <h1 style={ls.h1}>Licenças &amp; Espaço</h1>
          <p style={ls.pageSub}>Capacidade alocada, consumo actual e projecção de crescimento</p>
        </div>
        <button style={ls.refreshBtn} onClick={() => void fetchData()}>↺ Recarregar</button>
      </div>

      {/* ── Alert de uso elevado ─────────────────────────────────────────── */}
      {pct >= 80 && (
        <div style={{
          ...ls.alertBox,
          background: pct >= 90 ? '#fff5f5' : '#fffbeb',
          borderColor: pct >= 90 ? C.bad : C.warn,
          marginBottom: 20,
        }}>
          <div style={{ ...ls.alertTitle, color: pct >= 90 ? C.bad : C.warn }}>
            {pct >= 90 ? '🔴 Armazenamento crítico' : '🟡 Armazenamento elevado'}
          </div>
          <div style={ls.alertMsg}>
            Utilização em <strong>{pct.toFixed(1)}%</strong> da quota disponível.
            {daysUntilFull != null && daysUntilFull < 90
              ? ` Com o ritmo actual, o espaço esgota em aproximadamente ${daysUntilFull} dias.`
              : null}
          </div>
        </div>
      )}

      {/* ── Gauge + KPIs ─────────────────────────────────────────────────── */}
      {cap && (
        <div style={ls.gaugeRow}>

          {/* Gauge SVG */}
          <div style={ls.gaugePanel}>
            <Gauge usedTb={cap.usedTb} totalTb={cap.totalTb} />
            <div style={ls.sourceStack}>
              <span style={ls.sourceBadge}>Uso: {sourceLabel(cap.usedSource)}</span>
              <span style={ls.sourceBadge}>Total: {sourceLabel(cap.totalSource)}</span>
            </div>
          </div>

          {/* KPI grid 2×2 */}
          <div style={ls.kpiGrid}>
            <KpiCard
              label="Quota Total"
              value={cap.totalHuman}
              sub={`${cap.totalTb.toFixed(2)} TB`}
            />
            <KpiCard
              label="Utilizado"
              value={cap.usedHuman}
              sub={`${cap.usedTb.toFixed(2)} TB`}
              color={gaugeColor(pct)}
            />
            <KpiCard
              label="Disponível"
              value={cap.availableHuman}
              sub={`${cap.availableTb.toFixed(2)} TB`}
              color={C.good}
            />
            <KpiCard
              label="% de Uso"
              value={`${pct.toFixed(1)}%`}
              sub={`de ${cap.totalTb.toFixed(2)} TB`}
              color={gaugeColor(pct)}
            />
          </div>
        </div>
      )}

      {/* ── Projecção de crescimento ─────────────────────────────────────── */}
      <div style={ls.panel}>
        <div style={ls.panelTitleBar}>Projecção de Crescimento</div>
        {completedScans < 2 ? (
          <p style={ls.emptyNote}>
            São necessários pelo menos 2 scans concluídos para calcular a taxa de crescimento
            ({completedScans} encontrado{completedScans !== 1 ? 's' : ''}).
          </p>
        ) : growthBytesDay == null || growthBytesDay <= 0 ? (
          <p style={ls.emptyNote}>
            Não foi possível calcular o crescimento — os scans disponíveis não mostram
            variação positiva de bytes.
          </p>
        ) : (
          <div style={ls.projGrid}>
            <div style={ls.projCard}>
              <div style={ls.projLabel}>Crescimento / dia</div>
              <div style={ls.projValue}>{fmtBytes(growthBytesDay)}</div>
            </div>
            <div style={ls.projCard}>
              <div style={ls.projLabel}>Crescimento / mês</div>
              <div style={ls.projValue}>{fmtBytes(growthBytesDay * 30)}</div>
            </div>
            <div style={ls.projCard}>
              <div style={ls.projLabel}>Crescimento / ano</div>
              <div style={ls.projValue}>{fmtBytes(growthBytesDay * 365)}</div>
            </div>
            <div style={ls.projCard}>
              <div style={ls.projLabel}>Estimativa de esgotamento</div>
              <div style={{
                ...ls.projValue,
                color: daysUntilFull == null
                  ? C.good
                  : daysUntilFull < 30
                    ? C.bad
                    : daysUntilFull < 90
                      ? C.warn
                      : C.good,
              }}>
                {daysUntilFull == null
                  ? '—'
                  : daysUntilFull > 365 * 10
                    ? '> 10 anos'
                    : daysUntilFull < 1
                      ? 'Imediato'
                      : `${daysUntilFull} dias`}
              </div>
            </div>
            <div style={ls.projCard}>
              <div style={ls.projLabel}>Scans analisados</div>
              <div style={ls.projValue}>{completedScans}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Licenças SKU ─────────────────────────────────────────────────── */}
      <div style={ls.panel}>
        <div style={{ ...ls.panelTitleBar, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>Licenças Detectadas</span>
          {lic?.note && (
            <span style={ls.noteBadge}>{lic.note}</span>
          )}
          {lic?.skuCountScanned != null && (
            <span style={ls.mutedBadge}>{lic.skuCountScanned} SKUs analisados</span>
          )}
        </div>

        {/* Totais de capacidade */}
        {lic?.totals && (
          <div style={ls.totalsRow}>
            <span style={ls.totalChip}>
              Base (1024): <strong>{lic.totals.baseCapacityGb.toLocaleString('pt-PT')} GB</strong>
            </span>
            <span style={ls.totalChip}>
              Licenças: <strong>{lic.totals.licensesCapacityGb.toLocaleString('pt-PT')} GB</strong>
            </span>
            <span style={{ ...ls.totalChip, background: '#ebf4ff', borderColor: '#bee3f8', color: C.accent }}>
              Total estimado: <strong>{lic.totals.totalCapacityGb.toLocaleString('pt-PT')} GB</strong>
            </span>
          </div>
        )}

        {skus.length > 0 ? (
          <div style={ls.tableWrap}>
            <table style={ls.table}>
              <thead>
                <tr>
                  <th style={ls.th}>SKU</th>
                  <th style={ls.thR}>Activos</th>
                  <th style={ls.thR}>Suspensos</th>
                  <th style={ls.thR}>Aviso</th>
                  <th style={ls.thR}>Contribuição (GB)</th>
                  <th style={ls.th}>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku, i) => (
                  <tr key={sku.skuId ?? i} style={i % 2 === 0 ? ls.trEven : ls.trOdd}>
                    <td style={ls.td}>
                      <div style={ls.skuName}>{sku.skuPopularName}</div>
                      <div style={ls.skuPart}>{sku.skuPartNumber}</div>
                    </td>
                    <td style={ls.tdR}>{sku.consumedUnits.toLocaleString('pt-PT')}</td>
                    <td style={ls.tdR}>{sku.prepaidSuspended.toLocaleString('pt-PT')}</td>
                    <td style={ls.tdR}>{sku.prepaidWarning.toLocaleString('pt-PT')}</td>
                    <td style={{
                      ...ls.tdR, fontWeight: 700,
                      color: sku.capacityContributionGb > 0 ? C.accent : C.muted,
                    }}>
                      {sku.capacityContributionGb.toLocaleString('pt-PT', { maximumFractionDigits: 0 })}
                    </td>
                    <td style={ls.td}>
                      <span style={sku.matchedBy === 'storageAddon' ? ls.badgeAddon : ls.badgePlan}>
                        {sku.matchedBy === 'storageAddon' ? 'Add-on' : 'Service Plan'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={ls.emptyNote}>
            Nenhuma licença com contribuição de armazenamento detectada.
          </p>
        )}
      </div>

      {/* ── Divergência tenant vs estimativa ─────────────────────────────── */}
      {div && (
        <div style={ls.panel}>
          <div style={ls.panelTitleBar}>Divergência de Capacidade</div>
          <p style={ls.divNote}>
            Diferença entre a quota alocada pelo tenant (Graph) e a estimativa calculada
            a partir das licenças detectadas.
          </p>
          <div style={ls.divGrid}>
            <div style={ls.divCard}>
              <div style={ls.divLabel}>Tenant (Graph)</div>
              <div style={ls.divValue}>{div.tenantAllocatedHuman}</div>
            </div>
            <div style={ls.divCard}>
              <div style={ls.divLabel}>Estimado (Licenças)</div>
              <div style={ls.divValue}>{div.estimatedHuman}</div>
            </div>
            <div style={ls.divCard}>
              <div style={ls.divLabel}>Diferença</div>
              <div style={{
                ...ls.divValue,
                color: div.diffBytes < 0 ? C.bad : C.good,
              }}>
                {div.diffBytes > 0 ? '+' : ''}{div.diffHuman}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const ls: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1100, margin: '0 auto' },

  pageHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 20,
  },
  h1:      { fontSize: 22, fontWeight: 800, color: C.text, margin: 0 },
  pageSub: { fontSize: 13, color: C.muted, margin: '4px 0 0' },

  refreshBtn: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 4, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
    color: C.accent, fontWeight: 600, fontFamily: 'inherit',
  },

  centered: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', padding: '60px 0',
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: `3px solid ${C.border}`, borderTopColor: C.accent,
    animation: 'lc-spin .8s linear infinite',
  },
  loadText: { color: C.muted, fontSize: 13, marginTop: 12 },

  alertBox: {
    border: '1px solid', borderRadius: 6, padding: '14px 18px',
  },
  alertTitle: { fontWeight: 700, fontSize: 14, marginBottom: 4 },
  alertMsg:   { fontSize: 13, color: C.text },
  hintPre: {
    marginTop: 10, background: '#f7fafc', border: `1px solid ${C.border}`,
    borderRadius: 4, padding: '10px 14px', fontSize: 12,
    color: C.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },

  /* Gauge row */
  gaugeRow: {
    display: 'flex', gap: 24, alignItems: 'flex-start',
    marginBottom: 20, flexWrap: 'wrap',
  },
  gaugePanel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '20px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    minWidth: 220,
  },
  sourceStack:  { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' },
  sourceBadge: {
    fontSize: 10, color: C.muted, background: '#f7fafc',
    border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 8px',
    textAlign: 'center',
  },

  /* KPI grid */
  kpiGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
    flex: 1, minWidth: 300,
  },
  kpiCard: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '16px 20px',
  },
  kpiLabel: {
    fontSize: 11, color: C.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.06em',
  },
  kpiValue: { fontSize: 26, fontWeight: 800, margin: '6px 0 2px', lineHeight: 1 },
  kpiSub:   { fontSize: 12, color: C.muted },

  /* Generic panel */
  panel: {
    background: C.panel, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '18px 20px', marginBottom: 20,
  },
  panelTitleBar: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 },

  /* Badges */
  noteBadge: {
    fontSize: 11, fontWeight: 600, padding: '2px 8px',
    background: '#fffbeb', border: `1px solid ${C.warn}`,
    borderRadius: 4, color: C.warn,
  },
  mutedBadge: {
    fontSize: 11, fontWeight: 600, padding: '2px 8px',
    background: '#f7fafc', border: `1px solid ${C.border}`,
    borderRadius: 4, color: C.muted,
  },

  /* License totals row */
  totalsRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 },
  totalChip: {
    fontSize: 12, padding: '4px 10px', borderRadius: 4,
    background: '#f7fafc', border: `1px solid ${C.border}`, color: C.text,
  },

  /* SKU table */
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '8px 12px', background: '#f7fafc',
    borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.muted,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em',
  },
  thR: {
    textAlign: 'right', padding: '8px 12px', background: '#f7fafc',
    borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.muted,
    fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em',
  },
  td:    { padding: '9px 12px', borderBottom: `1px solid ${C.border}`, color: C.text, verticalAlign: 'top' },
  tdR:   { padding: '9px 12px', borderBottom: `1px solid ${C.border}`, color: C.text, textAlign: 'right' },
  trEven: { background: C.panel },
  trOdd:  { background: '#f9fbfd' },
  skuName: { fontWeight: 600, fontSize: 13 },
  skuPart: { fontSize: 11, color: C.muted, marginTop: 2, fontFamily: 'monospace' },
  badgePlan: {
    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
    background: '#ebf4ff', border: '1px solid #bee3f8', color: C.accent,
  },
  badgeAddon: {
    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
    background: '#f0fff4', border: '1px solid #9ae6b4', color: C.good,
  },

  /* Growth projection */
  projGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 12,
  },
  projCard: {
    background: '#f7fafc', border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '12px 16px',
  },
  projLabel: {
    fontSize: 11, color: C.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6,
  },
  projValue: { fontSize: 20, fontWeight: 800, color: C.text },

  /* Divergence */
  divNote: { fontSize: 13, color: C.muted, margin: '0 0 14px' },
  divGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  divCard: {
    background: '#f7fafc', border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '12px 16px',
  },
  divLabel: {
    fontSize: 11, color: C.muted, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4,
  },
  divValue: { fontSize: 18, fontWeight: 800, color: C.text },

  emptyNote: { color: C.muted, fontSize: 13, fontStyle: 'italic', margin: 0 },
};
