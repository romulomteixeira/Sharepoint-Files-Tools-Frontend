/**
 * scans.api.ts — Endpoints de scans e status de jobs de scan (Sprint 10)
 */

import { get, post } from './client';
import type { Scan, ScanStatusDetail } from '../types';

export interface CreateScanParams {
  tenantId?: string;
  label?: string;
  siteIds?: string[];
  enableVersioning?: boolean;
}

export interface SiteSearchResult {
  id: string;
  displayName: string;
  webUrl: string;
}

interface LegacyScan {
  id?: string;
  scanId?: string;
  status?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  totalSites?: number;
  totalDrives?: number;
  totalFiles?: number;
  totalBytes?: number;
  sitesAttempted?: number;
  files?: number;
  bytes?: number;
  error?: string;
  lastError?: string;
  request?: Scan['request'];
}

interface LegacyListResponse {
  items: LegacyScan[];
}

interface CreateScanResponse {
  id?: string;
  scanId?: string;
  status?: string;
  createdAt?: string;
}

function normalizeStatus(status?: string): Scan['status'] {
  switch (String(status || '').toUpperCase()) {
    case 'QUEUED':
    case 'PENDING':
      return 'pending';
    case 'RUNNING':
    case 'FINALIZING':
    case 'MATERIALIZING':
    case 'ENRICHING':
      return 'running';
    case 'DONE':
    case 'COMPLETED':
      return 'completed';
    case 'ERROR':
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

function normalizeScan(scan: LegacyScan): Scan {
  const id = scan.id ?? scan.scanId ?? '';
  return {
    id,
    status: normalizeStatus(scan.status),
    createdAt: scan.createdAt ?? new Date(0).toISOString(),
    startedAt: scan.startedAt,
    finishedAt: scan.finishedAt,
    totalSites: scan.totalSites ?? scan.sitesAttempted,
    totalDrives: scan.totalDrives,
    totalFiles: scan.totalFiles ?? scan.files,
    totalBytes: scan.totalBytes ?? scan.bytes,
    lastError: scan.lastError ?? scan.error,
    request: scan.request,
  };
}

/** Inicia um novo scan e retorna o objeto de scan criado. */
export async function createScan(params?: CreateScanParams): Promise<Scan> {
  const siteIds = params?.siteIds?.filter(Boolean) ?? [];
  const payload = {
    allSites: siteIds.length === 0,
    ...(siteIds.length > 0 ? { sites: siteIds } : { siteSearch: '*', maxSites: 5000 }),
    options: {
      enableVersioning: params?.enableVersioning ?? false,
    },
  };
  const response = await post<CreateScanResponse>('/api/scans', payload);
  return normalizeScan({
    ...response,
    status: response.status ?? 'QUEUED',
    createdAt: response.createdAt ?? new Date().toISOString(),
    request: {
      allSites: payload.allSites,
      sites: siteIds,
      options: payload.options,
    },
  });
}

/** Lista scans anteriores (mais recentes primeiro). */
export async function listScans(): Promise<Scan[]> {
  const response = await get<LegacyListResponse | LegacyScan[]>('/api/scans/list');
  const items = Array.isArray(response) ? response : response.items;
  return items.map(normalizeScan).filter((scan) => scan.id);
}

/** Retorna o status atual de um scan com progresso detalhado (polling). */
export async function getScanStatus(scanId: string): Promise<ScanStatusDetail> {
  return get<ScanStatusDetail>(`/api/scans/${scanId}/status`);
}

/** Cancela um scan em execução. */
export async function cancelScan(scanId: string): Promise<void> {
  return post<void>(`/api/scans/${scanId}/cancel`);
}

/** Busca sites disponíveis por nome ou URL para seleção em operações e scans. */
export async function searchSites(search: string, top = 50): Promise<SiteSearchResult[]> {
  const response = await get<{ items: SiteSearchResult[] } | SiteSearchResult[]>(
    '/api/sites',
    { search: search.trim() || '*', top },
  );
  return Array.isArray(response) ? response : response.items;
}
