/**
 * purge.api.ts — Endpoints de expurgo seguro com confirmação dupla (Sprint 16)
 *
 * Fluxo obrigatório:
 *   1. POST /api/purge/confirm          → { confirmToken, expiresAt, requestHash }
 *   2. POST /api/retention/execute-job  → { jobId }  (requer confirmToken no body)
 *
 * O backend valida que os parâmetros de (1) e (2) são idênticos via requestHash.
 */

import { post, get } from './client';
import type { JobStatusDetail } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PurgeRule {
  scanId:          string;
  extensions?:     string[];   // extensões a expurgar
  olderThanDays?:  number;     // arquivos não modificados há X dias
  largerThanMb?:   number;     // arquivos maiores que X MB
  siteId?:         string;     // restringir a um site
  driveId?:        string;     // restringir a um drive
}

export interface PurgeConfirmToken {
  confirmToken: string;
  expiresAt:    string;
  requestHash:  string;
}

export interface PurgeJobResult {
  jobId: string;
}

// ─── Funções ──────────────────────────────────────────────────────────────────

/**
 * Solicita token de confirmação.
 * Deve ser chamado imediatamente antes de executePurgeJob com os mesmos params.
 */
export async function requestPurgeToken(rule: PurgeRule): Promise<PurgeConfirmToken> {
  return post<PurgeConfirmToken>('/api/purge/confirm', {
    operation: 'retention_execute',
    params:    rule,
  });
}

/**
 * Inicia o job de expurgo (requer confirmToken obtido de requestPurgeToken).
 * Retorna { jobId } para polling via getJobStatus().
 */
export async function executePurgeJob(
  rule: PurgeRule,
  confirmToken: string,
): Promise<PurgeJobResult> {
  return post<PurgeJobResult>('/api/retention/execute-job', {
    ...rule,
    confirmToken,
  });
}

/**
 * Polling de progresso do job de expurgo.
 * Reutiliza /api/jobs/:jobId/status (mesmo endpoint de qualquer job).
 */
export async function getPurgeJobStatus(jobId: string): Promise<JobStatusDetail> {
  return get<JobStatusDetail>(`/api/jobs/${jobId}/status`);
}
