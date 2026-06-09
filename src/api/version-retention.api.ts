/**
 * version-retention.api.ts — Expurgo de versões (não de arquivos).
 *
 * Fluxo:
 *   1. simulate() → preview com totalVersions, totalBytes e amostra por arquivo.
 *   2. requestConfirmToken() → token single-use (válido 5min).
 *   3. executeJob() → enfileira job assíncrono no retention-worker.
 */

import { post } from './client';

export interface VersionRetentionRule {
  scanId: string;
  /** ISO 8601 inclusivo. Versões com modified_at >= fromDate. */
  fromDate?: string;
  /** ISO 8601 inclusivo. Versões com modified_at <= toDate. */
  toDate?: string;
  /** Preserva sempre as N versões mais recentes de cada arquivo (default 0). */
  keepRecentVersions?: number;
  siteIds?: string[];
  extensions?: string[];
  minSizeBytes?: number;
  /** Quantos arquivos no preview (default 100). */
  sampleLimit?: number;
}

export interface VersionRetentionPreview {
  scanId: string;
  totalVersions: number;
  totalBytes: number;
  filesAffected: number;
  keepRecentVersions: number;
  fromDate?: string;
  toDate?: string;
  sample: VersionRetentionSampleRow[];
}

export interface VersionRetentionSampleRow {
  siteName: string;
  driveName: string;
  name: string;
  extension: string;
  fullPath: string;
  webUrl: string;
  versionsAffected: number;
  bytesAffected: number;
  oldestAffectedAt: string | null;
  newestAffectedAt: string | null;
}

export interface ConfirmTokenResponse {
  confirmToken: string;
  expiresAt: string;
}

export interface VersionRetentionJob {
  jobId: string;
  scanId: string;
  tasksSeeded?: number;
  message?: string;
}

/** Preview do impacto. Pode ser chamado livremente — não muda nada. */
export async function simulateVersionRetention(rule: VersionRetentionRule): Promise<VersionRetentionPreview> {
  return post<VersionRetentionPreview>('/api/version-retention/simulate', rule);
}

/** Emite token de confirmação (single-use, 5min de TTL). */
export async function requestVersionRetentionConfirmToken(rule: VersionRetentionRule): Promise<ConfirmTokenResponse> {
  return post<ConfirmTokenResponse>('/api/version-retention/confirm', rule);
}

/**
 * Enfileira job de execução real. O confirmToken DEVE ter sido emitido pela
 * mesma sessão e ainda estar dentro do TTL. Esta chamada é IRREVERSÍVEL.
 */
export async function executeVersionRetentionJob(rule: VersionRetentionRule, confirmToken: string): Promise<VersionRetentionJob> {
  return post<VersionRetentionJob>('/api/version-retention/execute-job', { ...rule, confirmToken });
}
