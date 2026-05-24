/**
 * logs.api.ts — Endpoints de logs e auditoria (Sprint 17)
 *
 * GET /api/logs    → { items: LogEntry[]   }  (até 2 000 entradas)
 * GET /api/audit   → { items: AuditEntry[] }  (filtros: scanId, evt, user)
 *
 * O backend retorna JSON plano (sem envelope { success, data }).
 * O helper castRaw() extrai o campo items independente do formato.
 */

import { get } from './client';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LogEntry {
  t:       string | null;
  level:   'info' | 'warn' | 'error';
  msg:     string;
  kind?:   string;
  scanId?: string;
  jobId?:  string;
  source?: string;
  action?: string;
  [key: string]: unknown;
}

export interface AuditEntry {
  t:                string | null;
  level:            string;
  msg:              string;
  action:           string;
  targetLabel:      string;
  actorUsername:    string;
  actorDisplayName: string;
  operatorName:     string;
  operatorEmail:    string;
  kind?:   string;
  scanId?: string;
  jobId?:  string;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * O backend devolve { items: T[] } sem envelope { success, data }.
 * parseResponse() retorna envelope.data que é undefined nesses casos.
 * castRaw() recupera os items do objeto bruto ou retorna [] como fallback.
 */
export function castRaw<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as Record<string, unknown>).items)) {
    return (res as { items: T[] }).items;
  }
  return [];
}

// ─── Funções ──────────────────────────────────────────────────────────────────

/** Lista os eventos de sistema (jobs, scans, erros). */
export async function getLogs(
  params?: { limit?: number },
): Promise<{ items: LogEntry[] }> {
  return get<{ items: LogEntry[] }>('/api/logs', params);
}

/** Lista a trilha de auditoria (ações administrativas). */
export async function getAuditLogs(
  params?: {
    limit?:   number;
    scanId?:  string;
    evt?:     string;
    user?:    string;
  },
): Promise<{ items: AuditEntry[] }> {
  return get<{ items: AuditEntry[] }>('/api/audit', params);
}
