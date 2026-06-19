/**
 * scans.api.ts — Endpoints de scans e status de jobs de scan (Sprint 10)
 */

import { get, post } from './client';
import type { Scan, ScanStatusDetail, ScanFilters, ScanFilterCategory } from '../types';

export interface CreateScanParams {
  tenantId?: string;
  label?: string;
  siteIds?: string[];
  allSites?: boolean;
  siteSearch?: string;
  maxSites?: number;
  mode?: ScanMode;
  enableVersioning?: boolean;
  filters?: ScanFilters;
}

export type ScanFilterPresetName = 'recommended' | 'minimal' | 'aggressive' | 'none';

export interface ScanFilterCatalog {
  categories: ScanFilterCategory[];
  filterKeys: (keyof ScanFilters)[];
  presets: Record<ScanFilterPresetName, ScanFilters>;
  defaultPreset: ScanFilterPresetName;
  recommended: ScanFilters;
}

/** Preset Recomendado embutido — fallback caso a API de categorias falhe. */
export const RECOMMENDED_FILTERS: ScanFilters = {
  excludeOneDrive: true,
  excludeSystem: true,
  excludeArchived: true,
  excludeNoDrives: true,
  excludeChannelPrivate: false,
  excludeChannelShared: false,
  excludeEmbedded: false,
  excludeSubsites: false,
};

export type ScanMode = 'full' | 'fast' | 'estimate';

export interface ScanQuickMode {
  maxSites: number;
  maxDrivesPerSite: number;
  maxItemsPerDrive: number;
}

export interface SiteSearchResult {
  id: string;
  displayName: string;
  webUrl: string;
}

interface LegacyScan {
  id?: string;
  scanId?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  totalSites?: number;
  totalDrives?: number;
  totalFiles?: number;
  totalBytes?: number;
  sitesAttempted?: number;
  files?: number;
  bytes?: number;
  error?: string;
  lastError?: string;
  request?: Scan['request'];
}

interface LegacyListResponse {
  items: LegacyScan[];
}

interface CreateScanResponse {
  id?: string;
  scanId?: string;
  status?: string;
  createdAt?: string;
}

const QUICK_MODES: Record<Exclude<ScanMode, 'full'>, ScanQuickMode> = {
  fast: { maxSites: 10, maxDrivesPerSite: 5, maxItemsPerDrive: 2000 },
  estimate: { maxSites: 30, maxDrivesPerSite: 8, maxItemsPerDrive: 4000 },
};

function normalizeStatus(status?: string): Scan['status'] {
  switch (String(status || '').toUpperCase()) {
    case 'QUEUED':
    case 'PENDING':
      return 'pending';
    case 'RUNNING':
    case 'FINALIZING':
    case 'MATERIALIZING':
    case 'ENRICHING':
      return 'running';
    case 'DONE':
    case 'COMPLETED':
      return 'completed';
    case 'ERROR':
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

function normalizeScan(scan: LegacyScan): Scan {
  const id = scan.id ?? scan.scanId ?? '';
  return {
    id,
    status: normalizeStatus(scan.status),
    createdAt: scan.createdAt ?? new Date(0).toISOString(),
    startedAt: scan.startedAt,
    finishedAt: scan.finishedAt,
    totalSites: scan.totalSites ?? scan.sitesAttempted,
    totalDrives: scan.totalDrives,
    totalFiles: scan.totalFiles ?? scan.files,
    totalBytes: scan.totalBytes ?? scan.bytes,
    lastError: scan.lastError ?? scan.error,
    request: scan.request,
  };
}

/** Inicia um novo scan e retorna o objeto de scan criado. */
export async function createScan(params?: CreateScanParams): Promise<Scan> {
  const siteIds = params?.siteIds?.filter(Boolean) ?? [];
  const allSites = params?.allSites ?? siteIds.length === 0;
  const mode = params?.mode ?? 'full';
  const quickMode = mode === 'full' ? null : QUICK_MODES[mode];
  const payload = {
    allSites,
    ...(allSites
      ? {
          siteSearch: params?.siteSearch?.trim() || '*',
          maxSites: Math.max(1, Math.min(20000, params?.maxSites ?? 5000)),
        }
      : { sites: siteIds }),
    // filtros só são enviados quando informados; ausência → backend usa preset Recomendado
    ...(params?.filters ? { filters: params.filters } : {}),
    options: {
      enableVersioning: params?.enableVersioning ?? false,
      quickMode,
    },
  };
  const response = await post<CreateScanResponse>('/api/scans', payload);
  return normalizeScan({
    ...response,
    status: response.status ?? 'QUEUED',
    createdAt: response.createdAt ?? new Date().toISOString(),
    request: {
      allSites: payload.allSites,
      sites: siteIds,
      ...('siteSearch' in payload ? { siteSearch: payload.siteSearch, maxSites: payload.maxSites } : {}),
      ...('filters' in payload ? { filters: payload.filters } : {}),
      options: payload.options,
    },
  });
}

/** Lista scans anteriores (mais recentes primeiro). */
export async function listScans(): Promise<Scan[]> {
  const response = await get<LegacyListResponse | LegacyScan[]>('/api/scans/list');
  const items = Array.isArray(response) ? response : response.items;
  return items.map(normalizeScan).filter((scan) => scan.id);
}

/** Retorna o status atual de um scan com progresso detalhado (polling). */
export async function getScanStatus(scanId: string): Promise<ScanStatusDetail> {
  return get<ScanStatusDetail>(`/api/scans/${scanId}/status`);
}

/** Cancela um scan em execução. */
export async function cancelScan(scanId: string): Promise<void> {
  return post<void>(`/api/scans/${scanId}/cancel`);
}

/** Retorna o catálogo de categorias de filtro e presets para a tela de scan. */
export async function getScanFilterCatalog(): Promise<ScanFilterCatalog> {
  return get<ScanFilterCatalog>('/api/scan-filter-categories');
}

/** Busca sites disponíveis por nome ou URL para seleção em operações e scans. */
export async function searchSites(search: string, top = 50): Promise<SiteSearchResult[]> {
  const response = await get<{ items: SiteSearchResult[] } | SiteSearchResult[]>(
    '/api/sites',
    { search: search.trim() || '*', top },
  );
  return Array.isArray(response) ? response : response.items;
}
