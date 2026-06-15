/**
 * Hook de monitoramento de jobs com SSE e fallback automático para polling.
 */

import { useEffect, useRef, useState } from 'react';
import { get, openEventStream } from '../api/client';
import type { JobStatus, JobStatusDetail, JobType } from '../types';

export interface UseJobStreamOptions {
  fallbackDelayMs?: number;
  pollIntervalMs?: number;
  getStatus?: (jobId: string) => Promise<unknown>;
  onProgress?: (status: JobStatusDetail) => void;
  onComplete?: (status: JobStatusDetail) => void;
  onError?: (message: string) => void;
}

export interface UseJobStreamState {
  status: JobStatusDetail | null;
  error: string | null;
  done: boolean;
  transport: 'idle' | 'sse' | 'polling';
}

const TERMINAL_STATUSES = new Set<JobStatus>(['completed', 'failed', 'cancelled']);

function numberValue(...values: unknown[]): number {
  const value = values.find((item) => Number.isFinite(Number(item)));
  return value == null ? 0 : Number(value);
}

function normalizeStatus(value: unknown): JobStatus {
  switch (String(value || '').toUpperCase()) {
    case 'DONE':
    case 'COMPLETED':
    case 'SUCCESS':
      return 'completed';
    case 'ERROR':
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    case 'RUNNING':
    case 'EXECUTING':
      return 'running';
    default:
      return 'pending';
  }
}

type UnknownRecord = Record<string, unknown>;

export function normalizeJobStatus(
  payload: unknown,
  jobId: string,
  previous?: JobStatusDetail | null,
): JobStatusDetail | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as UnknownRecord;
  if (root.type === 'hello' || root.type === 'ping' || root.type === 'log') return null;

  const nested = root.progress && typeof root.progress === 'object'
    ? root.progress as UnknownRecord
    : root;
  const total = numberValue(nested.total, nested.tasksTotal);
  const completed = numberValue(nested.completed, nested.processed, nested.done, nested.ok);
  const failed = numberValue(nested.failed, nested.fail);
  const running = numberValue(nested.running, normalizeStatus(nested.status) === 'running' ? 1 : 0);
  const pending = numberValue(nested.pending, Math.max(0, total - completed - failed - running));
  const status = normalizeStatus(nested.status ?? root.status);
  const rawType = root.type === 'progress' ? undefined : root.type;

  return {
    jobId: String(root.jobId ?? previous?.jobId ?? jobId),
    scanId: typeof nested.scanId === 'string'
      ? nested.scanId
      : typeof root.scanId === 'string'
        ? root.scanId
        : previous?.scanId,
    type: String(rawType ?? nested.kind ?? previous?.type ?? 'retention_execute') as JobType,
    status,
    progress: { total, pending, running, completed, failed },
    startedAt: typeof nested.startedAt === 'string' ? nested.startedAt : previous?.startedAt,
    finishedAt: typeof nested.finishedAt === 'string' ? nested.finishedAt : previous?.finishedAt,
    lastError: typeof nested.error === 'string'
      ? nested.error
      : typeof root.lastError === 'string'
        ? root.lastError
        : previous?.lastError,
  };
}

async function defaultGetStatus(jobId: string): Promise<unknown> {
  return get(`/api/jobs/${jobId}/status`);
}

export function useJobStream(
  jobId: string | null | undefined,
  options: UseJobStreamOptions = {},
): UseJobStreamState {
  const [status, setStatus] = useState<JobStatusDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [transport, setTransport] = useState<UseJobStreamState['transport']>('idle');
  const statusRef = useRef<JobStatusDetail | null>(null);
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    if (!jobId) {
      statusRef.current = null;
      setStatus(null);
      setError(null);
      setDone(false);
      setTransport('idle');
      return;
    }

    let disposed = false;
    let polling = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    const es = openEventStream(`/api/jobs/${jobId}/stream`);
    const fallbackDelayMs = callbacksRef.current.fallbackDelayMs ?? 5_000;
    const pollIntervalMs = callbacksRef.current.pollIntervalMs ?? 5_000;
    const getStatus = callbacksRef.current.getStatus ?? defaultGetStatus;

    statusRef.current = null;
    setStatus(null);
    setError(null);
    setDone(false);
    setTransport('sse');

    const applyStatus = (payload: unknown) => {
      const detail = normalizeJobStatus(payload, jobId, statusRef.current);
      if (!detail || disposed) return;
      statusRef.current = detail;
      setStatus(detail);
      setError(null);
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      callbacksRef.current.onProgress?.(detail);
      if (TERMINAL_STATUSES.has(detail.status)) {
        setDone(true);
        callbacksRef.current.onComplete?.(detail);
        es.close();
        if (pollTimer) clearTimeout(pollTimer);
        if (fallbackTimer) clearTimeout(fallbackTimer);
      }
    };

    const poll = async () => {
      if (disposed || !polling) return;
      try {
        applyStatus(await getStatus(jobId));
        if (!disposed && polling && !TERMINAL_STATUSES.has(statusRef.current?.status ?? 'pending')) {
          pollTimer = setTimeout(() => void poll(), pollIntervalMs);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao consultar o status do job.';
        setError(message);
        callbacksRef.current.onError?.(message);
        if (!disposed && polling) pollTimer = setTimeout(() => void poll(), pollIntervalMs);
      }
    };

    const startPolling = () => {
      if (disposed || polling || TERMINAL_STATUSES.has(statusRef.current?.status ?? 'pending')) return;
      polling = true;
      es.close();
      setTransport('polling');
      void poll();
    };

    const handleMessage = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as unknown;
        applyStatus(payload);
      } catch {
        // Eventos inválidos não devem interromper o monitoramento.
      }
    };

    es.addEventListener('message', handleMessage);
    es.addEventListener('progress', handleMessage);
    es.addEventListener('done', handleMessage);
    es.onerror = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(startPolling, fallbackDelayMs);
    };

    fallbackTimer = setTimeout(startPolling, fallbackDelayMs);

    return () => {
      disposed = true;
      es.removeEventListener('message', handleMessage);
      es.removeEventListener('progress', handleMessage);
      es.removeEventListener('done', handleMessage);
      es.onerror = null;
      es.close();
      if (pollTimer) clearTimeout(pollTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [jobId]);

  return { status, error, done, transport };
}
