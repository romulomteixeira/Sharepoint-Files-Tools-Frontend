/**
 * scans.api.ts — Endpoints de scans e status de jobs de scan.
 */

import { get, post } from './client';
import type { Scan, ScanStatusDetail } from '../types';

export interface CreateScanParams {
  tenantId?: string;
  label?: string;
  /** Quantidade máxima de sites a varrer (0 ou omitir = todos do tenant). */
  maxSites?: number;
  /** Varrer todos os sites (default true). */
  allSites?: boolean;
  /** Filtro de busca (passa para o Graph). Aceita "*". */
  siteSearch?: string;
  /** Lista explícita de site IDs — quando passada, sobrepõe allSites. */
  siteIds?: string[];
  /** Quick mode: '' (completo) | 'fast' | 'estimate' */
  quickMode?: string;
  /** Concorrência por drive */
  concurrency?: number;
  /** Delta $top da Graph API */
  deltaTop?: number;
}

/** Inicia um novo scan e retorna o objeto de scan criado. */
export async function createScan(params?: CreateScanParams): Promise<Scan> {
  return post<Scan>('/api/scans', params);
}

/** Lista scans anteriores (mais recentes primeiro). */
export async function listScans(): Promise<Scan[]> {
  return get<Scan[]>('/api/scans/list');
}

/** Retorna o status atual de um scan com progresso detalhado (polling). */
export async function getScanStatus(scanId: string): Promise<ScanStatusDetail> {
  return get<ScanStatusDetail>(`/api/scans/${scanId}/status`);
}

/** Cancela um scan em execução. Workers param em ≤5s. */
export async function cancelScan(scanId: string): Promise<void> {
  return post<void>(`/api/scans/${scanId}/cancel`);
}

/**
 * Exclui um scan e TODOS os dados associados (scan_files, file_versions,
 * rollups, logs, jobs/tasks no queue DB). Irreversível.
 */
export async function deleteScan(scanId: string): Promise<void> {
  return post<void>(`/api/scans/${scanId}/delete`);
}
