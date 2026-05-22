/**
 * useJobStream.ts — Hook SSE para progresso em tempo real de jobs (Sprint 10)
 *
 * Conecta ao endpoint /api/jobs/:jobId/stream (Server-Sent Events) e
 * mantém o estado de progresso atualizado automaticamente.
 * Fecha a conexão quando o job termina ou o componente desmonta.
 */

import { useState, useEffect, useRef } from 'react';
import { openEventStream } from '../api/client';
import type { JobStatusDetail } from '../types';

export interface UseJobStreamState {
  status: JobStatusDetail | null;
  error: string | null;
  done: boolean;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * useJobStream — assina SSE de progresso do job.
 *
 * @param jobId  ID do job a monitorar (null/undefined = sem conexão)
 *
 * @example
 * const { status, done } = useJobStream(jobId);
 */
export function useJobStream(jobId: string | null | undefined): UseJobStreamState {
  const [status, setStatus] = useState<JobStatusDetail | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [done, setDone]     = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const es = openEventStream(`/api/jobs/${jobId}/stream`);
    esRef.current = es;
    setDone(false);
    setError(null);

    es.addEventListener('progress', (evt) => {
      try {
        const detail = JSON.parse((evt as MessageEvent).data) as JobStatusDetail;
        setStatus(detail);
        if (TERMINAL_STATUSES.has(detail.status)) {
          setDone(true);
          es.close();
        }
      } catch {
        // ignora parse errors
      }
    });

    es.addEventListener('done', (evt) => {
      try {
        const detail = JSON.parse((evt as MessageEvent).data) as JobStatusDetail;
        setStatus(detail);
      } catch {
        // ignora
      }
      setDone(true);
      es.close();
    });

    es.onerror = () => {
      setError('Conexão com o servidor perdida.');
      setDone(true);
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [jobId]);

  return { status, error, done };
}
