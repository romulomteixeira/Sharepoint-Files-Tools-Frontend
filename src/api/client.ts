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
    // Sinaliza sessão expirada — AuthContext escuta e redireciona para /login
    notifyUnauthorized(res);

    let errorBody: ApiResponse | { error?: string; message?: string } | null = null;
    try {
      if (contentType.includes('application/json')) {
        errorBody = (await res.json()) as ApiResponse;
      }
    } catch {
      // ignore parse error
    }
    const apiErr = errorBody && typeof errorBody.error === 'object'
      ? errorBody.error
      : null;
    const legacyMessage = errorBody && typeof errorBody.error === 'string'
      ? errorBody.error
      : errorBody && 'message' in errorBody && typeof errorBody.message === 'string'
        ? errorBody.message
        : undefined;
    throw new ApiClientError(
      apiErr?.code ?? 'HTTP_ERROR',
      apiErr?.message ?? legacyMessage ?? `HTTP ${res.status} ${res.statusText}`,
      res.status,
      apiErr?.details,
    );
  }

  if (contentType.includes('application/json')) {
    const payload = (await res.json()) as ApiResponse<T> | T;
    if (
      payload !== null
      && typeof payload === 'object'
      && 'success' in payload
      && typeof payload.success === 'boolean'
    ) {
      const envelope = payload as ApiResponse<T>;
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
    return payload as T;
  }

  // Resposta não-JSON (ex: download de arquivo) — retorna texto
  return (await res.text()) as unknown as T;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  ms = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const externalSignal = init.signal;
  const abortFromExternal = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  // ms <= 0 desabilita o limitador (ex.: enumeração de muitos sites que pode
  // legitimamente passar de 30s). Sem timer, a request só termina por resposta
  // do servidor ou abort externo.
  const timer = ms > 0
    ? window.setTimeout(() => { timedOut = true; controller.abort(); }, ms)
    : null;

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new ApiClientError('TIMEOUT', `Request excedeu ${ms}ms`);
    }
    throw err;
  } finally {
    if (timer !== null) window.clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

function notifyUnauthorized(res: Response): void {
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
}

// ─── Métodos públicos ─────────────────────────────────────────────────────────

export async function get<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const res = await fetchWithTimeout(buildUrl(path, params), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
    credentials: 'include',
    ...options,
  }, timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return parseResponse<T>(res);
}

export async function post<T>(
  path: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  const res = await fetchWithTimeout(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });
  return parseResponse<T>(res);
}

export async function del<T>(
  path: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  const res = await fetchWithTimeout(buildUrl(path), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });
  return parseResponse<T>(res);
}

export interface BlobDownload {
  blob: Blob;
  filename: string | null;
}

export type FileOrJsonResponse<T> =
  | { kind: 'file'; blob: Blob; filename: string | null }
  | { kind: 'json'; data: T; status: number };

function responseFilename(res: Response): string | null {
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename[^;=\n]*=["']?([^"';\n]+)/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Executa GET autenticado que pode retornar JSON (job assíncrono) ou arquivo.
 * JSONL/NDJSON é tratado como arquivo e nunca passa por JSON.parse().
 */
export async function getFileOrJson<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: RequestInit,
): Promise<FileOrJsonResponse<T>> {
  const res = await fetchWithTimeout(buildUrl(path, params), {
    method: 'GET',
    credentials: 'include',
    ...options,
  });

  if (!res.ok) {
    await parseResponse<never>(res);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const isJsonPayload = /^application\/json(?:\s*;|$)/i.test(contentType.trim());
  if (isJsonPayload) {
    return {
      kind: 'json',
      data: await parseResponse<T>(res),
      status: res.status,
    };
  }

  return {
    kind: 'file',
    blob: await res.blob(),
    filename: responseFilename(res),
  };
}

/** Executa POST autenticado e retorna um blob para download. */
export async function postBlob(
  path: string,
  body?: unknown,
  options?: RequestInit,
): Promise<BlobDownload> {
  const res = await fetchWithTimeout(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) },
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (!res.ok) {
    await parseResponse<never>(res);
  }

  return {
    blob: await res.blob(),
    filename: responseFilename(res),
  };
}

/**
 * openEventStream — abre um SSE (Server-Sent Events) para streaming de progresso.
 * Retorna um EventSource que o chamador deve fechar com .close() ao desmontar.
 */
export function openEventStream(path: string): EventSource {
  const url = buildUrl(path);
  return new EventSource(url, { withCredentials: true });
}
