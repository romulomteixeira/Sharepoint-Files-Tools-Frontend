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

/** Resumo agregado do scan (totais de sites, drives, bytes, extensões). */
export async function getInventorySummary(scanId: string): Promise<InventorySummary> {
  return get<InventorySummary>(`/api/inventory/${scanId}/summary`);
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
