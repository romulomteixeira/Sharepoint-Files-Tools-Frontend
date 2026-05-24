/**
 * inventory.api.ts — Endpoints de inventário e dashboards (Sprint 10)
 *
 * Nota de compatibilidade (fix Sprint 19+):
 *   O backend retorna JSON plano sem envelope {success,data} e usa nomes de
 *   campos diferentes dos tipos do frontend:
 *     backend.filesCount  → InventorySummary.totalFiles
 *     backend.bytesTotal  → InventorySummary.totalBytes
 *     backend.sitesCount  → InventorySummary.totalSites
 *     backend.drivesCount → InventorySummary.totalDrives
 *   Endpoints de lista retornam { items: [...] } sem pageInfo — pageInfo é
 *   inferido como vazio (sem próxima página).
 */

import { get } from './client';
import type {
  InventorySummary,
  ExtensionRollup,
  SiteRollup,
  DriveRollup,
  FileItem,
  PaginatedResponse,
} from '../types';

// ─── Helper: extrai array de items de resposta { items } ou raw array ─────────

function extractItems<T>(raw: unknown): T[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw as T[];
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.items)) return r.items as T[];
  return [];
}

/** Wrap de array bruto para PaginatedResponse com pageInfo vazio. */
function wrapPaginated<T>(raw: unknown): PaginatedResponse<T> {
  const r = raw as Record<string, unknown> | null;
  return {
    items:    extractItems<T>(raw),
    pageInfo: (r?.pageInfo as PaginatedResponse<T>['pageInfo']) ?? {
      nextCursor:  null,
      hasNextPage: false,
    },
    summary: r?.summary as Record<string, unknown> | undefined,
  };
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * Resumo agregado do scan (totais de sites, drives, bytes, extensões).
 * Backend (PostgreSQL): { scanId, filesCount, bytesTotal, sitesCount, drivesCount, ... }
 * Backend (legado meta): { totals: { files, bytes, ... } }
 */
export async function getInventorySummary(scanId: string): Promise<InventorySummary> {
  const raw = await get<unknown>(`/api/inventory/${scanId}/summary`);
  const r = (raw ?? {}) as Record<string, unknown>;
  // Legado: totals aninhado
  const t = (r.totals ?? {}) as Record<string, unknown>;
  return {
    scanId:        String(r.scanId ?? r.scan_id ?? scanId),
    totalSites:    Number(r.totalSites  ?? r.sitesCount  ?? t.sites  ?? t.totalSites  ?? 0),
    totalDrives:   Number(r.totalDrives ?? r.drivesCount ?? t.drives ?? t.totalDrives ?? 0),
    totalFiles:    Number(r.totalFiles  ?? r.filesCount  ?? t.files  ?? t.totalFiles  ?? 0),
    totalBytes:    Number(r.totalBytes  ?? r.bytesTotal  ?? t.bytes  ?? t.totalBytes  ?? 0),
    totalVersions: Number(r.totalVersions ?? r.versionsReady ?? r.versionedFilesCount ?? 0) || undefined,
    topExtensions: Array.isArray(r.topExtensions)
      ? (r.topExtensions as ExtensionRollup[])
      : undefined,
  };
}

/** Lista de sites com rollup de tamanho. */
export async function getInventorySites(
  scanId: string,
  params?: { cursor?: string; pageSize?: number; sort?: string },
): Promise<PaginatedResponse<SiteRollup>> {
  const raw = await get<unknown>(`/api/inventory/${scanId}/sites`, params);
  return wrapPaginated<SiteRollup>(raw);
}

/** Lista de drives com rollup de tamanho. */
export async function getInventoryDrives(
  scanId: string,
  params?: { cursor?: string; pageSize?: number; siteId?: string },
): Promise<PaginatedResponse<DriveRollup>> {
  const raw = await get<unknown>(`/api/inventory/${scanId}/drives`, params);
  return wrapPaginated<DriveRollup>(raw);
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
  const raw = await get<unknown>(`/api/inventory/${scanId}/files`, params);
  return wrapPaginated<FileItem>(raw);
}

/**
 * Top N arquivos por tamanho.
 * Backend: { items: [...] }
 */
export async function getTopFiles(
  scanId: string,
  params?: { limit?: number },
): Promise<FileItem[]> {
  const raw = await get<unknown>(`/api/inventory/${scanId}/top-files`, params);
  return extractItems<FileItem>(raw);
}

/** Versões agrupadas por período (dia / semana / mês). */
export async function getVersionedByPeriod(
  scanId: string,
  params?: { unit?: 'day' | 'week' | 'month' },
): Promise<import('../types').VersionedPeriodData> {
  return get(`/api/inventory/${scanId}/versioned-by-period`, params);
}
