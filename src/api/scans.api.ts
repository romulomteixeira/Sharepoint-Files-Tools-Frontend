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

/** Cancela um scan em execução. */
export async function cancelScan(scanId: string): Promise<void> {
  return post<void>(`/api/scans/${scanId}/cancel`);
}

/** Busca sites disponíveis por nome ou URL para seleção em operações e scans. */
export async function searchSites(search: string, top = 50): Promise<SiteSearchResult[]> {
  return get<SiteSearchResult[]>('/api/sites', { search, top });
}
