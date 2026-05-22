/**
 * jobs.api.ts — Endpoints de status e controle de jobs genéricos (Sprint 10)
 */

import { get } from './client';
import type { JobStatusDetail } from '../types';

/** Retorna o status detalhado de um job (scan, versão, export, expurgo). */
export async function getJobStatus(jobId: string): Promise<JobStatusDetail> {
  return get<JobStatusDetail>(`/api/jobs/${jobId}/status`);
}
