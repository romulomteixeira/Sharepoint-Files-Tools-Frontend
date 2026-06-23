/**
 * versions.api.ts — Disparo de enriquecimento de versões (fila persistente).
 *
 * POST /api/jobs/versions/enrich → cria um job version_enrich consumido pelos
 * version-workers. Escopo:
 *   - FULL    → sem siteIds (todos os sites do scan);
 *   - PARCIAL → siteIds = [site_id, ...] (apenas os sites escolhidos).
 */

import { post } from './client';

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
