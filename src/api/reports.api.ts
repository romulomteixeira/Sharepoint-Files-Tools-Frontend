/**
 * reports.api.ts — Endpoints de exportação assíncrona.
 *
 * Backend: POST /api/export/inventory/{scanId} cria job; GET /api/export/{id}/status
 * polla até completed; GET /api/export/download/{id} baixa o arquivo gerado.
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
 * Inicia exportação do inventário (assíncrona). Retorna { jobId, status: 'pending', ... }.
 * Frontend deve poll getExportJobStatus(jobId) até status == 'completed' e então baixar
 * via getDownloadUrl(jobId).
 */
export async function exportInventory(params: ExportInventoryParams): Promise<ExportJob> {
  const { scanId, ...rest } = params;
  // POST com body JSON (o backend lê tanto body quanto query — body é o canônico).
  return post<ExportJob>(`/api/export/inventory/${scanId}`, rest);
}

/** URL de download do arquivo gerado (use em <a href> ou window.open). */
export function getDownloadUrl(jobId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  return `${base}/api/export/download/${jobId}`;
}

/**
 * Verifica status do job de exportação. Usa endpoint dedicado
 * /api/export/{id}/status que consulta a tabela export_jobs.
 */
export async function getExportJobStatus(jobId: string): Promise<ExportJob> {
  return get<ExportJob>(`/api/export/${jobId}/status`);
}

/**
 * Solicita token de confirmação para operação de expurgo.
 */
export async function requestPurgeConfirmToken(
  operation: string,
  params: Record<string, unknown>,
): Promise<{ confirmToken: string; expiresAt: string; requestHash: string }> {
  return post('/api/purge/confirm', { operation, params });
}
