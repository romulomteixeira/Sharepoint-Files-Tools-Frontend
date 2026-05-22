/**
 * useApi.ts — Hook genérico para chamadas à API com estados loading/error/data (Sprint 10)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiClientError } from '../api/client';

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * useApi — executa uma função assíncrona e expõe { data, loading, error, refetch }.
 *
 * @param fn    Função que retorna uma Promise com o dado
 * @param deps  Dependências que, ao mudar, re-executam a função
 *
 * @example
 * const { data: scans, loading } = useApi(() => listScans(), []);
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): UseApiState<T> {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fn()
      .then((result) => {
        if (!cancelled && mounted.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && mounted.current) {
          const msg = err instanceof ApiClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Erro desconhecido';
          setError(msg);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, refetch };
}
