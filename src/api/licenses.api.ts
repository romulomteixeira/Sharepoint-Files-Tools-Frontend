/**
 * licenses.api.ts — Endpoints de licenças e capacidade do tenant (Sprint 19)
 *
 * GET /api/sharepoint/licenses  → LicenseCapacityReport (raw JSON, sem envelope)
 *
 * O endpoint pode falhar se a app não tiver Reports.Read.All + Admin Consent.
 * Nesse caso retorna { ok: false, error, hint } com HTTP 200.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface SkuEntry {
  skuPartNumber:          string;
  skuPopularName:         string;
  skuId:                  string;
  matchedBy:              'servicePlan' | 'storageAddon';
  consumedUnits:          number;
  prepaidEnabled:         number;
  prepaidSuspended:       number;
  prepaidWarning:         number;
  prepaidTotal?:          number;
  unitsForCapacityCalc:   number;
  capacityContributionGb: number;
}

export interface LicenseTotals {
  baseCapacityGb:     number;
  licensesCapacityGb: number;
  totalCapacityGb:    number;
}

export interface LicenseInfo {
  ok:              boolean;
  note?:           string;
  skuCountScanned?: number;
  totals?:         LicenseTotals;
  skus?:           SkuEntry[];
}

export interface CapacityNow {
  totalBytes:     number;
  totalHuman:     string;
  totalTb:        number;
  usedBytes:      number;
  usedHuman:      string;
  usedTb:         number;
  usedSource:     string;   // 'tenantReport' | 'tenantDetailReport' | 'latestScanInventory' | 'none'
  availableBytes:  number;
  availableHuman:  string;
  availableTb:     number;
  totalSource:     string;  // 'tenantAllocated' | 'licenseEstimated'
}

export interface Divergence {
  tenantAllocatedBytes: number;
  tenantAllocatedHuman: string;
  estimatedBytes:       number;
  estimatedHuman:       string;
  diffBytes:            number;
  diffHuman:            string;
}

export interface LicenseCapacityReport {
  ok:           boolean;
  error?:       string;
  hint?:        string;
  licenses?:    LicenseInfo;
  storage?:     Record<string, unknown>;
  capacityNow?: CapacityNow;
  divergence?:  Divergence;
  cached?:      boolean;       // servido do cache (Worker-Dash)
  fetchedAt?:   string;        // data/hora da última atualização do cache
}

// ─── Fetch interno ────────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

async function lfetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? `HTTP ${res.status}`);
  }
  return json as T;
}

// ─── Funções ──────────────────────────────────────────────────────────────────

/**
 * Carrega capacidade do tenant: quota total, consumo, licenças e divergência.
 * Pode retornar { ok: false, error, hint } se as permissões Graph não estiverem
 * configuradas (Reports.Read.All + Admin Consent).
 */
export async function getLicenseCapacity(): Promise<LicenseCapacityReport> {
  return lfetch<LicenseCapacityReport>('/api/sharepoint/licenses');
}

/**
 * Dispara a atualização do relatório de licenças via Graph (Worker-Dash) e
 * retorna o relatório recém-calculado. Pode demorar (chamada ao Graph).
 */
export async function refreshLicenseCapacity(): Promise<LicenseCapacityReport> {
  const res = await fetch(`${BASE_URL}/api/sharepoint/licenses/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; report?: LicenseCapacityReport; fetchedAt?: string; error?: string };
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  const report = json.report ?? (json as unknown as LicenseCapacityReport);
  return { ...report, fetchedAt: json.fetchedAt ?? report.fetchedAt, cached: false };
}
