/**
 * reports.api.ts — Endpoints de exportação assíncrona (Sprint 10)
 *
 * Exportações grandes retornam { jobId, downloadUrl } — o frontend deve
 * aguardar a conclusão via polling em getJobStatus() antes de baixar.
 */

import { get, getFileOrJson } from './client';
import type { ExportJob, ExportFormat, JobStatus } from '../types';

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
interface AsyncExportResponse {
  jobId: string;
  downloadUrl?: string;
  statusUrl?: string;
  fileName?: string;
  status?: string;
  createdAt?: string;
}

interface ExportStatusResponse {
  jobId?: string;
  status?: string;
  downloadUrl?: string;
  createdAt?: string;
  finishedAt?: string;
  progress?: {
    status?: string;
    createdAt?: string;
    finishedAt?: string;
    error?: string;
  };
}

function normalizeExportStatus(value: unknown): JobStatus {
  switch (String(value ?? '').toUpperCase()) {
    case 'DONE':
    case 'COMPLETED':
    case 'SUCCESS':
      return 'completed';
    case 'ERROR':
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    case 'RUNNING':
    case 'PROCESSING':
      return 'running';
    default:
      return 'pending';
  }
}

export async function exportInventory(params: ExportInventoryParams): Promise<ExportJob> {
  const { scanId, extension, format = 'csv', ...rest } = params;
  const response = await getFileOrJson<AsyncExportResponse>(
    `/api/export/inventory/${scanId}`,
    {
      ...rest,
      format,
      ext: extension,
    },
  );

  const createdAt = new Date().toISOString();
  if (response.kind === 'file') {
    return {
      jobId: `sync-${Date.now()}`,
      status: 'completed',
      downloadUrl: URL.createObjectURL(response.blob),
      format,
      createdAt,
    };
  }

  return {
    jobId: response.data.jobId,
    status: normalizeExportStatus(response.data.status),
    downloadUrl: response.data.downloadUrl,
    format,
    createdAt: response.data.createdAt ?? createdAt,
  };
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
  const response = await get<ExportStatusResponse>(`/api/jobs/${jobId}/status`);
  return {
    jobId: response.jobId ?? jobId,
    status: normalizeExportStatus(response.progress?.status ?? response.status),
    downloadUrl: response.downloadUrl,
    format: 'csv',
    createdAt: response.progress?.createdAt ?? response.createdAt ?? new Date().toISOString(),
    finishedAt: response.progress?.finishedAt ?? response.finishedAt,
  };
}
