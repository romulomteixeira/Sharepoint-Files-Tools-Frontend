/**
 * reports.api.ts — Endpoints de exportação assíncrona (Sprint 10)
 *
 * Exportações grandes retornam { jobId, downloadUrl } — o frontend deve
 * aguardar a conclusão via polling em getJobStatus() antes de baixar.
 */

import { get, post } from './client';
import type { ExportJob, ExportFormat } from '../types';

export interface ExportInventoryParams {
  scanId: string;
  format?: ExportFormat;
  limit?: number;
  siteId?: string;
  driveId?: string;
  extension?: string;
}

/**
 * Inicia exportação do inventário.
 * - Para lotes pequenos (≤ EXPORT_SYNC_LIMIT) retorna o arquivo imediatamente (blob URL).
 * - Para lotes grandes retorna { jobId } — use getJobStatus() para aguardar.
 */
export async function exportInventory(params: ExportInventoryParams): Promise<ExportJob> {
  const { scanId, ...rest } = params;
  return get<ExportJob>(`/api/export/inventory/${scanId}`, rest as Record<string, string | number | boolean | undefined | null>);
}

/**
 * Baixa o arquivo de exportação após o job estar concluído.
 * Retorna a URL de download para uso em <a href> ou fetch.
 */
export function getDownloadUrl(jobId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return `${base}/api/export/download/${jobId}`;
}

/** Verifica status do job de exportação. */
export async function getExportJobStatus(jobId: string): Promise<ExportJob> {
  return get<ExportJob>(`/api/jobs/${jobId}/status`);
}

/**
 * Solicita token de confirmação para operação de expurgo.
 * Deve ser chamado antes de execute-job para operações destrutivas.
 */
export async function requestPurgeConfirmToken(
  operation: string,
  params: Record<string, unknown>,
): Promise<{ confirmToken: string; expiresAt: string; requestHash: string }> {
  return post('/api/purge/confirm', { operation, params });
}
