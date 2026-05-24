/**
 * scans.api.ts — Endpoints de scans e status de jobs de scan (Sprint 10)
 *
 * Nota de compatibilidade (fix Sprint 19+):
 *   O backend retorna JSON plano sem envelope {success,data}.
 *   Os campos do backend diferem dos tipos frontend:
 *     backend.scanId      → Scan.id
 *     backend.files       → Scan.totalFiles
 *     backend.bytes       → Scan.totalBytes
 *     backend.error       → Scan.lastError
 *     backend.status      → normalizado de uppercase (DONE/RUNNING) para lowercase
 *     backend.progress    → ScanStatusDetail.progress (status fica dentro de progress)
 */

import { get, post } from './client';
import type { Scan, ScanStatus, ScanStatusDetail, ScanProgress } from '../types';

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Normaliza status do backend (DONE, RUNNING, ERROR…) para o tipo ScanStatus. */
function normaliseScanStatus(s: string | undefined): ScanStatus {
  const l = (s ?? '').toLowerCase().trim();
  if (l === 'done' || l === 'completed') return 'completed';
  if (l === 'running' || l === 'scanning' || l === 'active') return 'running';
  if (l === 'error' || l === 'failed') return 'failed';
  if (l === 'cancelled' || l === 'canceled') return 'cancelled';
  return 'pending';
}

/** Mapeia um item bruto da lista de scans do backend → Scan. */
function mapRawScan(item: Record<string, unknown>): Scan {
  return {
    id:          String(item.scanId ?? item.id ?? ''),
    status:      normaliseScanStatus(String(item.status ?? '')),
    createdAt:   String(item.createdAt ?? new Date().toISOString()),
    startedAt:   item.startedAt  ? String(item.startedAt)  : undefined,
    finishedAt:  item.finishedAt ? String(item.finishedAt) : undefined,
    totalSites:  Number(item.sitesAttempted ?? item.totalSites  ?? item.sitesOk ?? 0) || undefined,
    totalDrives: Number(item.totalDrives ?? 0) || undefined,
    totalFiles:  Number(item.files  ?? item.totalFiles  ?? 0) || undefined,
    totalBytes:  Number(item.bytes  ?? item.totalBytes  ?? 0) || undefined,
    lastError:   item.error ? String(item.error) : undefined,
  };
}

// ─── Interfaces de params ─────────────────────────────────────────────────────

export interface CreateScanParams {
  tenantId?: string;
  label?: string;
}

// ─── Funções exportadas ───────────────────────────────────────────────────────

/** Inicia um novo scan e retorna o objeto de scan criado. */
export async function createScan(params?: CreateScanParams): Promise<Scan> {
  const raw = await post<unknown>('/api/scans', params);
  return mapRawScan((raw ?? {}) as Record<string, unknown>);
}

/**
 * Lista scans anteriores (mais recentes primeiro).
 * Backend: GET /api/scans/list → { items: [...] }
 * Cada item tem scanId, status (uppercase), files, bytes, createdAt, etc.
 */
export async function listScans(): Promise<Scan[]> {
  const raw = await get<unknown>('/api/scans/list');
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r?.items)
    ? (r.items as Record<string, unknown>[])
    : Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : [];
  return items.map(mapRawScan);
}

/**
 * Retorna o status actual de um scan com progresso detalhado (polling).
 * Backend: GET /api/scans/:id/status → { scanId, progress: { status, ... }, source }
 * O status fica dentro de progress, não no nível raiz.
 */
export async function getScanStatus(scanId: string): Promise<ScanStatusDetail> {
  const raw = await get<unknown>(`/api/scans/${scanId}/status`);
  const r = (raw ?? {}) as Record<string, unknown>;
  const progress = (r.progress ?? {}) as Record<string, unknown>;

  return {
    scanId:     String(r.scanId ?? scanId),
    status:     normaliseScanStatus(String(progress.status ?? r.status ?? 'completed')),
    progress:   progress as unknown as ScanProgress,
    startedAt:  (r.startedAt  ?? progress.startedAt)  as string | undefined,
    finishedAt: (r.finishedAt ?? progress.finishedAt) as string | undefined,
    lastError:  (r.lastError  ?? progress.error)      as string | undefined,
  };
}

/** Cancela um scan em execução. */
export async function cancelScan(scanId: string): Promise<void> {
  await post<unknown>(`/api/scans/${scanId}/cancel`);
}
