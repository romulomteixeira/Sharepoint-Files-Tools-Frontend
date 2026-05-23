/**
 * auth.api.ts — Funções de autenticação (sessão, primeiro acesso, OAuth)
 *
 * Os endpoints de auth NÃO seguem o envelope padrão { success, data, error }.
 * Usam fetch nativo para respeitar o formato legado { ok, error, code }.
 */

import type { BrandingResponse } from '../types';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

// ─── Tipos de resposta ────────────────────────────────────────────────────────

export interface LoginResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export interface FirstAdminRequestResult {
  ok?: boolean;
  message?: string;
  delivery?: 'smtp' | 'console';
  devLink?: string;
  code?: string;
  error?: string;
}

export interface FirstAdminConfirmResult {
  ok?: boolean;
  message?: string;
  error?: string;
}

export interface UnlockRequestResult {
  message?: string;
  error?: string;
}

// ─── Helper interno ───────────────────────────────────────────────────────────

async function authFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts?.headers as Record<string, string> | undefined),
    },
  });
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/**
 * Busca configurações de branding da tela de login (endpoint público).
 * Retorna objeto plano — não usa o envelope padrão da API.
 */
export async function getBranding(): Promise<BrandingResponse> {
  const r = await authFetch('/api/public/branding');
  return r.json() as Promise<BrandingResponse>;
}

/**
 * Login com usuário e senha.
 * Resposta: { ok, error?, code? }
 */
export async function login(username: string, password: string): Promise<LoginResult> {
  const r = await authFetch('/api/session/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return r.json() as Promise<LoginResult>;
}

/**
 * Solicita envio de e-mail de primeiro acesso do administrador.
 * Resposta: { ok, message?, delivery?, devLink? } ou { code?, error? }
 */
export async function requestFirstAdmin(
  email: string,
  password: string,
): Promise<{ result: FirstAdminRequestResult; httpOk: boolean }> {
  const r = await authFetch('/api/session/first-admin/request', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const result = (await r.json()) as FirstAdminRequestResult;
  return { result, httpOk: r.ok };
}

/**
 * Confirma cadastro do admin com o token recebido por e-mail.
 * Resposta: { ok, message? } ou { error? }
 */
export async function confirmFirstAdmin(
  token: string,
  newPassword: string,
): Promise<{ result: FirstAdminConfirmResult; httpOk: boolean }> {
  const r = await authFetch('/api/session/first-admin/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  const result = (await r.json()) as FirstAdminConfirmResult;
  return { result, httpOk: r.ok };
}

/**
 * Solicita desbloqueio do admin por e-mail.
 * Resposta: { message? } ou { error? }
 */
export async function unlockAdminRequest(
  email: string,
): Promise<{ result: UnlockRequestResult; httpOk: boolean }> {
  const r = await authFetch('/api/session/first-admin/unlock-request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const result = (await r.json()) as UnlockRequestResult;
  return { result, httpOk: r.ok };
}

/**
 * Encerra a sessão atual no backend.
 */
export async function logout(): Promise<void> {
  await authFetch('/api/session/logout', { method: 'POST' });
}
