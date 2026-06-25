/**
 * inventory.api.ts — Endpoints de inventário e dashboards (Sprint 10)
 *
 * Usa rollups PostgreSQL quando USE_ROLLUP_DASHBOARDS=true no backend.
 * Usa cursor keyset quando USE_CURSOR_PAGINATION=true.
 */

import { get } from './client';
import type {
  InventorySummary,
  SiteRollup,
  DriveRollup,
  FileItem,
  PaginatedResponse,
} from '../types';

export type LatestSitesPageSize = 10 | 30 | 50 | 100;

export interface LatestInventorySite {
  siteId: string;
  siteName: string;
  siteUrl: string;
  filesCount: number;
  bytesTotal: number;
  versionsBytesTotal: number;
  totalBytes: number;
  scanId: string;
  scannedAt: string;
}

export interface LatestSitesResponse {
  page: number;
  pageSize: LatestSitesPageSize;
  total: number;
  totalPages: number;
  items: LatestInventorySite[];
}

export interface LatestSiteFile {
  scanId: string;
  siteId: string;
  siteName: string;
  siteUrl: string;
  driveId: string;
  driveName: string;
  itemId: string;
  name: string;
  extension: string;
  fullPath: string;
  sizeBytes: number;
  created: string;
  modified: string;
  createdBy: string;
  modifiedBy: string;
  webUrl?: string;
  versionCount: number;
  versionsBytes: number;
  totalBytes: number;
}

export interface LatestSiteDrilldown {
  site: Pick<LatestInventorySite, 'siteId' | 'siteName' | 'siteUrl' | 'scanId' | 'scannedAt'>;
  page: number;
  pageSize: number;
  totalFiles: number;
  totalPages: number;
  libraries: Array<{
    driveId: string;
    driveName: string;
    files: LatestSiteFile[];
  }>;
}

/** Resumo agregado do scan (totais de sites, drives, bytes, extensões).
 * Normaliza os dois contratos do backend: o legado (loadMeta) já usa total*,
 * o rollup usa *Count/bytesTotal. Com siteId, recalcula os totais para o site. */
export async function getInventorySummary(
  scanId: string,
  siteId?: string,
): Promise<InventorySummary> {
  const raw = await get<Record<string, unknown>>(
    `/api/inventory/${scanId}/summary`,
    siteId ? { siteId } : undefined,
  );
  const num = (...vals: unknown[]): number => {
    for (const v of vals) { const n = Number(v); if (Number.isFinite(n) && v != null) return n; }
    return 0;
  };
  return {
    ...(raw as object),
    totalSites:    num(raw.totalSites,    raw.sitesCount),
    totalDrives:   num(raw.totalDrives,   raw.drivesCount),
    totalFiles:    num(raw.totalFiles,    raw.filesCount),
    totalBytes:    num(raw.totalBytes,    raw.bytesTotal),
    totalVersions: raw.totalVersions != null
      ? num(raw.totalVersions)
      : (raw.versionedFilesCount != null ? num(raw.versionedFilesCount) : undefined),
  } as InventorySummary;
}

export interface InventoryExtensionItem {
  extension: string;
  filesCount: number;
  bytesTotal: number;
}

/** Extensões reais do scan (popula o filtro de extensão e o painel "Top Extensões"). */
export async function getInventoryExtensions(
  scanId: string,
  limit = 500,
): Promise<InventoryExtensionItem[]> {
  const r = await get<{ items: InventoryExtensionItem[] }>(
    `/api/inventory/${scanId}/extensions`,
    { limit },
  );
  return r.items ?? [];
}

export async function getLatestInventorySites(params: {
  search?: string;
  page?: number;
  pageSize?: LatestSitesPageSize;
} = {}): Promise<LatestSitesResponse> {
  return get<LatestSitesResponse>('/api/inventory/sites/latest', params);
}

export async function getLatestInventorySiteFiles(
  siteId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<LatestSiteDrilldown> {
  return get<LatestSiteDrilldown>(
    `/api/inventory/sites/latest/${encodeURIComponent(siteId)}/files`,
    params,
  );
}

/** Lista de sites com rollup de tamanho. */
export async function getInventorySites(
  scanId: string,
  params?: { cursor?: string; pageSize?: number; sort?: string },
): Promise<PaginatedResponse<SiteRollup>> {
  return get<PaginatedResponse<SiteRollup>>(`/api/inventory/${scanId}/sites`, params);
}

/** Lista de drives com rollup de tamanho. */
export async function getInventoryDrives(
  scanId: string,
  params?: { cursor?: string; pageSize?: number; siteId?: string },
): Promise<PaginatedResponse<DriveRollup>> {
  return get<PaginatedResponse<DriveRollup>>(`/api/inventory/${scanId}/drives`, params);
}

/** Lista de arquivos com paginação por cursor keyset. */
export async function getInventoryFiles(
  scanId: string,
  params?: {
    cursor?: string;
    pageSize?: number;
    siteId?: string;
    driveId?: string;
    extension?: string;
    sort?: string;
  },
): Promise<PaginatedResponse<FileItem>> {
  return get<PaginatedResponse<FileItem>>(`/api/inventory/${scanId}/files`, params);
}

export type TopFilesMetric = 'size' | 'total' | 'versions';

interface TopFilesResponse {
  items: FileItem[];
}

/** Top N arquivos de um scan, com envelope legado { items }. */
export async function getTopFiles(
  scanId: string,
  params: { limit?: number; metric?: TopFilesMetric } = {},
): Promise<FileItem[]> {
  const metric = params.metric ?? 'size';
  const suffix = metric === 'total'
    ? 'top-files-total'
    : metric === 'versions'
      ? 'top-versioned'
      : 'top-files';
  const response = await get<TopFilesResponse>(
    `/api/inventory/${scanId}/${suffix}`,
    { limit: params.limit },
  );
  return response.items;
}
/** Top N consolidado, deduplicado pelo backend usando o scan concluído mais recente. */
export async function getLatestTopFiles(
  params: { limit?: number; metric?: TopFilesMetric } = {},
): Promise<FileItem[]> {
  const response = await get<TopFilesResponse>(
    '/api/inventory/top-files/latest',
    { limit: params.limit, metric: params.metric ?? 'size' },
  );
  return response.items;
}
