/**
 * purge.api.ts — Endpoints de expurgo seguro com confirmação dupla (Sprint 20)
 *
 * Fluxo obrigatório para qualquer operação destrutiva:
 *   1. POST /api/purge/confirm          → { confirmToken, expiresAt, requestHash }
 *   2. POST /api/<operação>/execute-job  → { jobId }  (requer confirmToken no body)
 *
 * Operações suportadas:
 *   - retention_execute      → /api/retention/execute-job      (retenção de versões)
 *   - file_retention_execute → /api/file-retention/execute-job (expurgo de arquivos)
 *   - recycle_bin_execute    → /api/recycle-bin/execute-job    (limpeza de lixeira)
 *   - retention_sites        → /api/sites/execute-job          (exclusão de sites — Sprint 21)
 */

import { post, get } from './client';
import type { JobStatusDetail } from '../types';

// ─── Tipos de operação ────────────────────────────────────────────────────────

export type PurgeOperation =
  | 'retention_execute'
  | 'file_retention_execute'
  | 'recycle_bin_execute'
  | 'retention_sites';

// ─── Tipos compartilhados ─────────────────────────────────────────────────────

export interface PurgeConfirmToken {
  confirmToken: string;
  expiresAt:    string;
  requestHash:  string;
}

export interface PurgeJobResult {
  jobId: string;
}

/** Scope para file-retention e recycle-bin */
export interface ScopeParam {
  type:      'all' | 'sites';
  siteIds?:  string[];
}

// ─── Retenção de versões ──────────────────────────────────────────────────────

export interface VersionRetentionRule {
  scanId:          string;
  extensions?:     string[];
  olderThanDays?:  number;
  largerThanMb?:   number;
  siteId?:         string;
  driveId?:        string;
}

/** Alias de compatibilidade */
export type PurgeRule = VersionRetentionRule;

export interface SimulateVersionResult {
  count:  number;
  bytes:  number;
  items?: Array<{
    fileId?:    string;
    fileName?:  string;
    siteId?:    string;
    driveId?:   string;
    versionId?: string;
    sizeBytes?: number;
    modifiedAt?: string;
  }>;
}

// ─── Expurgo de arquivos ──────────────────────────────────────────────────────

export interface FileRetentionParams {
  scanId:        string;
  scope?:        ScopeParam;
  mode?:         'years' | 'date_range';
  keepYears?:    number;
  fromDate?:     string | null;
  toDate?:       string | null;
  previewLimit?: number;
}

export interface FileRetentionPreviewItem {
  name?:       string;
  siteId?:     string;
  siteName?:   string;
  extension?:  string;
  sizeBytes?:  number;
  sizeHuman?:  string;
  modifiedAt?: string;
  webUrl?:     string;
}

export interface SimulateFileResult {
  result: {
    filesAffected: number;
    purgeHuman:    string;
    summary?:      string;
  };
  preview: FileRetentionPreviewItem[];
}

// ─── Limpeza de lixeira ───────────────────────────────────────────────────────

export interface RecycleBinParams {
  scanId:        string;
  scope?:        ScopeParam;
  previewLimit?: number;
}

export interface RecycleBinPreviewItem {
  siteId?:    string;
  siteName?:  string;
  dirName?:   string;
  leafName?:  string;
  title?:     string;
  deletedAt?: string;
  sizeBytes?: number;
  sizeHuman?: string;
  deletedBy?: string;
}

export interface SimulateRecycleBinResult {
  result: {
    items:           number;
    purgeHuman:      string;
    sitesAffected?:  number;
    failedSites?:    number;
    summary?:        string;
  };
  preview: RecycleBinPreviewItem[];
}

// ─── Token de confirmação (genérico) ─────────────────────────────────────────

export async function requestPurgeToken(
  operation: PurgeOperation,
  params:    unknown,
): Promise<PurgeConfirmToken> {
  return post<PurgeConfirmToken>('/api/purge/confirm', { operation, params });
}

// ─── Retenção de versões ──────────────────────────────────────────────────────

export async function simulateVersionRetention(rule: VersionRetentionRule): Promise<SimulateVersionResult> {
  return post<SimulateVersionResult>('/api/retention/simulate', rule);
}

export async function executeVersionRetentionJob(
  rule:         VersionRetentionRule,
  confirmToken: string,
): Promise<PurgeJobResult> {
  return post<PurgeJobResult>('/api/retention/execute-job', { ...rule, confirmToken });
}

// ─── Expurgo de arquivos ──────────────────────────────────────────────────────

export async function simulateFileRetention(params: FileRetentionParams): Promise<SimulateFileResult> {
  return post<SimulateFileResult>('/api/file-retention/simulate', params);
}

export async function executeFileRetentionJob(
  params:       FileRetentionParams,
  confirmToken: string,
): Promise<PurgeJobResult> {
  return post<PurgeJobResult>('/api/file-retention/execute-job', { ...params, confirmToken });
}

export async function exportFileRetentionBlob(
  params: FileRetentionParams,
  format: 'csv' | 'xlsx' = 'csv',
): Promise<void> {
  return postBlobDownload(
    '/api/file-retention/export',
    { ...params, format },
    `expurgo_arquivos_${params.scanId}.${format}`,
  );
}

// ─── Limpeza de lixeira ───────────────────────────────────────────────────────

export async function simulateRecycleBin(params: RecycleBinParams): Promise<SimulateRecycleBinResult> {
  return post<SimulateRecycleBinResult>('/api/recycle-bin/simulate', params);
}

export async function executeRecycleBinJob(
  params:       RecycleBinParams,
  confirmToken: string,
): Promise<PurgeJobResult> {
  return post<PurgeJobResult>('/api/recycle-bin/execute-job', { ...params, confirmToken });
}

export async function exportRecycleBinBlob(
  params: RecycleBinParams,
  format: 'csv' | 'xlsx' = 'csv',
): Promise<void> {
  return postBlobDownload(
    '/api/recycle-bin/export',
    { ...params, format },
    `lixeira_sharepoint_${params.scanId}.${format}`,
  );
}

// ─── Status de job ────────────────────────────────────────────────────────────

export async function getPurgeJobStatus(jobId: string): Promise<JobStatusDetail> {
  return get<JobStatusDetail>(`/api/jobs/${jobId}/status`);
}

// ─── Helper interno: download de blob ────────────────────────────────────────

async function postBlobDownload(path: string, body: unknown, fallbackName: string): Promise<void> {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
  const res = await fetch(`${base}${path}`, {
    method:      'POST',
    headers:     { 'Content-Type': 'application/json' },
    credentials: 'include',
    body:        JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Exportação falhou: HTTP ${res.status}`);
  const blob = await res.blob();
  const cd    = res.headers.get('content-disposition') ?? '';
  const match = cd.match(/filename[^;=\n]*=["']?([^"';\n]+)/);
  const name  = match?.[1]?.trim() || fallbackName;
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
