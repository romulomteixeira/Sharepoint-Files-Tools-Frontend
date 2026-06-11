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
  pageSize: LatestSitesPageSize;
  totalFiles: number;
  totalPages: number;
  libraries: Array<{
    driveId: string;
    driveName: string;
    files: LatestSiteFile[];
  }>;
}

/** Resumo agregado do scan (totais de sites, drives, bytes, extensões). */
export async function getInventorySummary(scanId: string): Promise<InventorySummary> {
  return get<InventorySummary>(`/api/inventory/${scanId}/summary`);
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
  params: { page?: number; pageSize?: LatestSitesPageSize } = {},
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

/** Top N arquivos por tamanho. */
export async function getTopFiles(
  scanId: string,
  params?: { limit?: number },
): Promise<FileItem[]> {
  return get<FileItem[]>(`/api/inventory/${scanId}/top-files`, params);
}

/** Versões agrupadas por período (dia / semana / mês). */
export async function getVersionedByPeriod(
  scanId: string,
  params?: { unit?: 'day' | 'week' | 'month' },
): Promise<import('../types').VersionedPeriodData> {
  return get(`/api/inventory/${scanId}/versioned-by-period`, params);
}
