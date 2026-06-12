/**
 * LicensesPage.tsx — Licenças & Espaço do tenant SharePoint (Sprint 19)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  getLicenseCapacity,
  type LicenseCapacityReport,
  type SkuEntry,
} from '../api/licenses.api';
import { listScans } from '../api/scans.api';
import type { Scan } from '../types';

function usagePct(usedTb: number, totalTb: number): number {
  if (totalTb <= 0) return 0;
  return Math.min(100, (usedTb / totalTb) * 100);
}

function gaugeColor(pct: number): string {
  if (pct >= 90) return 'var(--bad)';
  if (pct >= 75) return 'var(--warn)';
  return 'var(--good)';
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

function calcGrowthRate(scans: Scan[]): number | null {
  const done = scans
    .filter(sc => sc.status === 'completed' && sc.totalBytes != null)
    .map(sc => ({ bytes: sc.totalBytes as number, ts: new Date(sc.finishedAt ?? sc.createdAt).getTime() }))
    .sort((a, b) => a.ts - b.ts);
  if (done.length < 2) return null;
  const first = done[0];
  const last  = done[done.length - 1];
  const days  = (last.ts - first.ts) / 86_400_000;
  if (days < 1) return null;
  return (last.bytes - first.bytes) / days;
}

function Gauge({ usedTb, totalTb }: { usedTb: number; totalTb: number }): React.ReactElement {
  const pct  = usagePct(usedTb, totalTb);
  const color = gaugeColor(pct);
  const r    = 70;
  const cx   = 90;
  const cy   = 90;
  const circ = 2 * Math.PI * r;
  const arc  = (pct / 100) * circ;
  return (
    <svg width={180} height={180} viewBox="0 0 180 180" aria-label={`Uso: ${pct.toFixed(1)}%`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={14} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={14}
        strokeDasharray={`${arc} ${circ}`} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px` }} />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={26} fontWeight={800} fill={color} fontFamily="inherit">
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={11} fill="var(--faint)" fontFamily="inherit">utilizado</text>
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize={10} fill="var(--faint)" fontFamily="inherit">de {totalTb.toFixed(2)} TB</text>
    </svg>
  );
}

export default function LicensesPage(): React.ReactElement {
  const [report,  setReport]  = useState<LicenseCapacityReport | null>(null);
  const [scans,   setScans]   = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [lic, sc] = await Promise.all([getLicenseCapacity(), listScans().catch(() => [] as Scan[])]);
      setReport(lic); setScans(sc ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados de licenças.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Licenças &amp; Espaço</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 12 }}>
          <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
          <p className="muted small">A consultar Graph API…</p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Licenças &amp; Espaço</h1>
          <button className="btn btn-sm" onClick={() => void fetchData()}>↺ Recarregar</button>
        </div>
        <div className="alert-bad">⚠ Erro ao carregar: {error}</div>
      </>
    );
  }

  if (report && !report.ok) {
    return (
      <>
        <div className="page-head">
          <h1 className="page-title">Licenças &amp; Espaço</h1>
          <button className="btn btn-sm" onClick={() => void fetchData()}>↺ Recarregar</button>
        </div>
        <div className="alert-warn">
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Permissões insuficientes</div>
          <div>{report.error ?? 'Sem dados de licenças disponíveis.'}</div>
          {report.hint && <pre style={{ marginTop: 10, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{report.hint}</pre>}
        </div>
      </>
    );
  }

  const cap = report?.capacityNow;
  const lic = report?.licenses;
  const div = report?.divergence;
  const skus: SkuEntry[] = lic?.skus ?? [];
  const pct = cap ? usagePct(cap.usedTb, cap.totalTb) : 0;
  const growthBytesDay = calcGrowthRate(scans);
  const daysUntilFull = (cap && growthBytesDay && growthBytesDay > 0)
    ? Math.round(cap.availableBytes / growthBytesDay) : null;
  const completedScans = scans.filter(sc => sc.status === 'completed').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Licenças &amp; Espaço</h1>
          <p className="page-sub">Capacidade alocada, consumo actual e projecção de crescimento</p>
        </div>
        <button className="btn btn-sm" onClick={() => void fetchData()}>↺ Recarregar</button>
      </div>

      {pct >= 80 && (
        <div className={pct >= 90 ? 'alert-bad' : 'alert-warn'} style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {pct >= 90 ? '🔴 Armazenamento crítico' : '🟡 Armazenamento elevado'}
          </div>
          <div>
            Utilização em <strong>{pct.toFixed(1)}%</strong> da quota disponível.
            {daysUntilFull != null && daysUntilFull < 90
              ? ` Com o ritmo actual, o espaço esgota em aproximadamente ${daysUntilFull} dias.`
              : null}
          </div>
        </div>
      )}

      {cap && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 220 }}>
            <Gauge usedTb={cap.usedTb} totalTb={cap.totalTb} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <span className="small muted" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px', textAlign: 'center' }}>Uso: {sourceLabel(cap.usedSource)}</span>
              <span className="small muted" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '2px 8px', textAlign: 'center' }}>Total: {sourceLabel(cap.totalSource)}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, flex: 1, minWidth: 300 }}>
            {[
              { label: 'Quota Total',  value: cap.totalHuman,     sub: `${cap.totalTb.toFixed(2)} TB` },
              { label: 'Utilizado',    value: cap.usedHuman,      sub: `${cap.usedTb.toFixed(2)} TB`,      color: gaugeColor(pct) },
              { label: 'Disponível',   value: cap.availableHuman, sub: `${cap.availableTb.toFixed(2)} TB`, color: 'var(--good)' },
              { label: '% de Uso',     value: `${pct.toFixed(1)}%`, sub: `de ${cap.totalTb.toFixed(2)} TB`, color: gaugeColor(pct) },
            ].map(kpi => (
              <div key={kpi.label} className="card kpi">
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value" style={{ color: kpi.color }}>{kpi.value}</div>
                {kpi.sub && <div className="kpi-sub">{kpi.sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projecção */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 14 }}>Projecção de Crescimento</div>
        {completedScans < 2 ? (
          <p className="muted small">São necessários pelo menos 2 scans concluídos para calcular a taxa de crescimento ({completedScans} encontrado{completedScans !== 1 ? 's' : ''}).</p>
        ) : growthBytesDay == null || growthBytesDay <= 0 ? (
          <p className="muted small">Não foi possível calcular o crescimento — os scans disponíveis não mostram variação positiva de bytes.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {[
              { label: 'Crescimento / dia',   value: fmtBytes(growthBytesDay) },
              { label: 'Crescimento / mês',   value: fmtBytes(growthBytesDay * 30) },
              { label: 'Crescimento / ano',   value: fmtBytes(growthBytesDay * 365) },
              {
                label: 'Estimativa de esgotamento',
                value: daysUntilFull == null ? '—' : daysUntilFull > 365 * 10 ? '> 10 anos' : daysUntilFull < 1 ? 'Imediato' : `${daysUntilFull} dias`,
                color: daysUntilFull == null ? 'var(--good)' : daysUntilFull < 30 ? 'var(--bad)' : daysUntilFull < 90 ? 'var(--warn)' : 'var(--good)',
              },
              { label: 'Scans analisados', value: String(completedScans) },
            ].map(item => (
              <div key={item.label} className="kpi">
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-value" style={{ fontSize: 20, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Licenças SKU */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
          <div className="card-title">Licenças Detectadas</div>
          {lic?.note && <span className="pill pill-warn">{lic.note}</span>}
          {lic?.skuCountScanned != null && <span className="pill">{lic.skuCountScanned} SKUs analisados</span>}
        </div>

        {lic?.totals && (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <span className="pill">Base contratual: <strong>{lic.totals.baseCapacityGb.toLocaleString('pt-PT')} GB</strong></span>
            <span className="pill">Licenças: <strong>{lic.totals.licensesCapacityGb.toLocaleString('pt-PT')} GB</strong></span>
            <span className="pill pill-info">Total estimado: <strong>{lic.totals.totalCapacityGb.toLocaleString('pt-PT')} GB</strong></span>
          </div>
        )}

        {skus.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>String ID</th>
                  <th className="td-r">Activos</th>
                  <th className="td-r">Suspensos</th>
                  <th className="td-r">Aviso</th>
                  <th className="td-r">Contribuição (GB)</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku, i) => (
                  <tr key={sku.skuId ?? i}>
                    <td><div style={{ fontWeight: 600 }}>{sku.skuPopularName}</div></td>
                    <td><span className="mono small muted">{sku.skuPartNumber}</span></td>
                    <td className="td-r">{sku.consumedUnits.toLocaleString('pt-PT')}</td>
                    <td className="td-r">{sku.prepaidSuspended.toLocaleString('pt-PT')}</td>
                    <td className="td-r">{sku.prepaidWarning.toLocaleString('pt-PT')}</td>
                    <td className="td-r" style={{ fontWeight: 700, color: sku.capacityContributionGb > 0 ? 'var(--accent)' : 'var(--faint)' }}>
                      {sku.capacityContributionGb.toLocaleString('pt-PT', { maximumFractionDigits: 0 })}
                    </td>
                    <td>
                      <span className={sku.matchedBy === 'storageAddon' ? 'pill pill-good' : 'pill pill-info'}>
                        {sku.matchedBy === 'storageAddon' ? 'Add-on' : 'Service Plan'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted small">Nenhuma licença com contribuição de armazenamento detectada.</p>
        )}
      </div>

      {/* Divergência */}
      {div && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>Divergência de Capacidade</div>
          <p className="muted small" style={{ margin: '0 0 14px' }}>
            Diferença entre a quota alocada pelo tenant (Graph) e a estimativa calculada a partir das licenças detectadas.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Tenant (Graph)',      value: div.tenantAllocatedHuman },
              { label: 'Estimado (Licenças)', value: div.estimatedHuman },
              { label: 'Diferença',           value: `${div.diffBytes > 0 ? '+' : ''}${div.diffHuman}`, color: div.diffBytes < 0 ? 'var(--bad)' : 'var(--good)' },
            ].map(item => (
              <div key={item.label} className="kpi">
                <div className="kpi-label">{item.label}</div>
                <div className="kpi-value" style={{ fontSize: 18, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
