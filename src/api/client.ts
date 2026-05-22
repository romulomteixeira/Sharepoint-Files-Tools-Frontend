/**
 * client.ts — Cliente HTTP centralizado do frontend (Sprint 10)
 *
 * - URL base configurável via import.meta.env.VITE_API_BASE_URL
 * - Em desenvolvimento usa proxy Vite (/api → backend:8787)
 * - Em produção Docker usa proxy Nginx (/api → backend:8787)
 * - Envelope padronizado { success, data, error, meta }
 * - Timeout de 30s por request
 * - Sem dependências externas — fetch nativo
 */

import type { ApiResponse } from '../types';

// URL base: em prod Docker o Nginx faz proxy de /api → backend,
// então o padrão é string vazia (caminhos relativos).
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const DEFAULT_TIMEOUT_MS = 30_000;

// ─── Erros tipados ────────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) {
        url.searchParams.set(key, String(val));
      }
    }
  }
  return url.toString();
}

async function parseResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';

  if (!res.ok) {
    let errorBody: ApiResponse | null = null;
    try {
      if (contentType.includes('application/json')) {
        errorBody = (await res.json()) as ApiResponse;
      }
    } catch {
      // ignore parse error
    }
    const apiErr = errorBody?.error;
    throw new ApiClientError(
      apiErr?.code ?? 'HTTP_ERROR',
      apiErr?.message ?? `HTTP ${res.status} ${res.statusText}`,
      res.status,
      apiErr?.details,
    );
  }

  if (contentType.includes('application/json')) {
    const envelope = (await res.json()) as ApiResponse<T>;
    if (envelope.success === false) {
      throw new ApiClientError(
        envelope.error?.code ?? 'API_ERROR',
        envelope.error?.message ?? 'Erro desconhecido da API',
        res.status,
        envelope.error?.details,
      );
    }
    return envelope.data as T;
  }

  // Resposta não-JSON (ex: download de arquivo) — retorna texto
  return (await res.text()) as unknown as T;
}

function withTimeout(promise: Promise<Response>, ms: number): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ApiClientError('TIMEOUT', `Request excedeu ${ms}ms`)), ms);
    promise.then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Métodos públicos ─────────────────────────────────────────────────────────

export async function get<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: RequestInit,
): Promise<T> {
  const res = await withTimeout(
    fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
      credentials: 'include',
      ...options,
    }),
    DEFAULT_TIMEOUT_MS,
  );
  return parseResponse<T>(res);
}

export async function post<T>(
  path: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  const res = await withTimeout(
    fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
    DEFAULT_TIMEOUT_MS,
  );
  return parseResponse<T>(res);
}

export async function del<T>(
  path: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  const res = await withTimeout(
    fetch(buildUrl(path), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
    DEFAULT_TIMEOUT_MS,
  );
  return parseResponse<T>(res);
}

/**
 * openEventStream — abre um SSE (Server-Sent Events) para streaming de progresso.
 * Retorna um EventSource que o chamador deve fechar com .close() ao desmontar.
 */
export function openEventStream(path: string): EventSource {
  const url = buildUrl(path);
  return new EventSource(url, { withCredentials: true });
}
