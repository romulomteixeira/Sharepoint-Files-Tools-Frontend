/**
 * versions.api.ts — Disparo de enriquecimento de versões (fila persistente).
 *
 * POST /api/jobs/versions/enrich → cria um job version_enrich consumido pelos
 * version-workers. Escopo:
 *   - FULL    → sem siteIds (todos os sites do scan);
 *   - PARCIAL → siteIds = [site_id, ...] (apenas os sites escolhidos).
 */

import { get, post } from './client';

export interface EnrichVersionsRequest {
  scanId: string;
  /** Apenas estes sites (PARCIAL). Vazio/ausente = todos (FULL). */
  siteIds?: string[];
  /** true = re-enriquece inclusive arquivos já versionados. */
  force?: boolean;
  /** Teto de itens a enfileirar. */
  maxItems?: number;
}

export interface EnrichVersionsResponse {
  jobId: string;
  total: number;
  source?: string;
  siteIds?: number;
}

export async function enrichVersions(req: EnrichVersionsRequest): Promise<EnrichVersionsResponse> {
  const body: Record<string, unknown> = { scanId: req.scanId };
  if (req.siteIds && req.siteIds.length) body.siteIds = req.siteIds;
  if (req.force != null) body.force = req.force;
  if (req.maxItems != null) body.maxItems = req.maxItems;
  return post<EnrichVersionsResponse>('/api/jobs/versions/enrich', body);
}

// ─── Filtro: arquivos com mais de X versões (1..102) ───────────────────────────

export interface VersionedFile {
  siteId: string;
  siteName: string;
  driveName: string;
  fullPath: string;
  versionCount: number;
  versionsBytes: number;
  sizeBytes: number;
  totalBytes: number;
}

export interface VersionedFilesResponse {
  scanId: string;
  minVersions: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalVersionsBytes: number;
  items: VersionedFile[];
}

export async function getVersionedFiles(
  scanId: string,
  params: { minVersions?: number; page?: number; pageSize?: number } = {},
): Promise<VersionedFilesResponse> {
  return get<VersionedFilesResponse>(`/api/scans/${encodeURIComponent(scanId)}/versioned`, params);
}

// ─── Delta-update: verificar alterações no MS-Graph ────────────────────────────

export interface ScanDeltaResponse {
  ok?: boolean;
  jobId: string;
  scanId: string;
  partial?: boolean;
  sites?: number;
  source?: string;
}

// FULL: sem siteIds (re-lista todos os sites, detecta novos). PARCIAL: siteIds.
export async function checkScanChanges(scanId: string, siteIds?: string[]): Promise<ScanDeltaResponse> {
  const body: Record<string, unknown> = { scanId };
  if (siteIds && siteIds.length) body.siteIds = siteIds;
  return post<ScanDeltaResponse>('/api/jobs/scan-delta', body);
}
