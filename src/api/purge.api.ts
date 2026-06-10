/**
 * purge.api.ts — Endpoints de expurgo seguro com confirmação dupla
 *
 * Fluxo obrigatório para qualquer operação destrutiva:
 *   1. POST /api/purge/confirm          → { confirmToken, expiresAt, requestHash }
 *   2. POST /api/<operação>/execute-job  → { jobId }  (requer confirmToken no body)
 *
 * Operações suportadas (nomes exatos validados pelo backend VALID_OPERATIONS):
 *   - retention_versions → /api/retention/execute-job      (retenção de versões)
 *   - retention_files    → /api/file-retention/execute-job (expurgo de arquivos)
 *   - recycle_bin        → /api/recycle-bin/execute-job    (limpeza de lixeira)
 *
 * Formato do body para /api/purge/confirm:
 *   FLAT: { operation, scanId, ...outrosParams }
 *   O backend passa o body inteiro como requestParams e faz hash de { operation, scanId, params: cleanRest }
 */

import { post, get, postBlob } from './client';
import type { JobStatusDetail } from '../types';

// ─── Tipos de operação ────────────────────────────────────────────────────────

/** Nomes exatos validados pelo backend (purge-confirm.js VALID_OPERATIONS) */
export type PurgeOperation =
  | 'retention_versions'
  | 'retention_files'
  | 'recycle_bin';

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

export interface VersionRetentionPreviewItem {
  scanId?:                 string;
  siteId?:                 string;
  siteName?:               string;
  siteUrl?:                string;
  driveId?:                string;
  driveName?:              string;
  itemId?:                 string;
  name?:                   string;
  extension?:              string;
  fullPath?:               string;
  sizeBytes?:              number;
  modified?:               string;
  webUrl?:                 string;
  versionCount?:           number;
  purgeCount?:             number;
  purgeBytes?:             number;
  totalBytes?:             number;
  remainingVersionCount?:  number;
}

export interface SimulateVersionResult {
  scanId: string;
  result: {
    filesAffected:   number;
    purgeVersions:   number;
    purgeBytes:      number;
    purgeHuman:      string;
    sitesAffected:   number;
    unknownSizeCount: number;
    summary?:        string;
  };
  preview: VersionRetentionPreviewItem[];
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

/**
 * Solicita token de confirmação para qualquer operação de expurgo.
 *
 * O body enviado é FLAT: { operation, ...params }
 * O backend passa o body inteiro como requestParams e faz hash dos campos restantes
 * após remover operation, scanId, confirmToken, jobId, createdAt.
 *
 * Portanto params DEVE conter { scanId, ...outrosParams }.
 */
export async function requestPurgeToken(
  operation: PurgeOperation,
  params:    unknown,
): Promise<PurgeConfirmToken> {
  return post<PurgeConfirmToken>('/api/purge/confirm', { operation, ...(params as Record<string, unknown>) });
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
  const { blob, filename } = await postBlob(path, body);
  const name = filename || fallbackName;
  const url  = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
