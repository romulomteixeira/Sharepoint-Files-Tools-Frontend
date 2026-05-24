/**
 * settings.api.ts — Endpoints de configuração e administração (Sprint 18)
 *
 * Usa fetch nativo (como auth.api.ts) porque o backend retorna JSON plano,
 * sem o envelope { success, data } tratado por client.ts.
 *
 * GET  /api/config                    → AppConfig (objeto plano)
 * POST /api/config                    → { ok: boolean; error?: string }  (admin only)
 * GET  /api/session/check             → { ok, username, displayName, role }
 * GET  /api/admin/users               → { ok: boolean; users: AppUser[] } (admin only)
 * POST /api/admin/users               → { ok: boolean; message?: string; error?: string }
 * POST /api/admin/users/delete        → { ok: boolean; message?: string; error?: string }
 * POST /api/admin/users/reset-password→ { ok: boolean; message?: string; error?: string }
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  tenantId?:               string;
  clientId?:               string;
  clientSecret?:           string;   // sempre '' na resposta pública
  operatorName?:           string;
  operatorEmail?:          string;
  concurrency?:            number;
  deltaPageLimit?:         number;
  pricePerTbMonth?:        number;
  versionsAuto?:           string;   // 'top' | 'all' | 'none'
  versionsAutoTopN?:       number;
  versionsAutoMaxItems?:   number;
  versionsAutoConcurrency?: number;
  versionsBatchSize?:      number;
  versionsAutoForce?:      boolean;
  useVersionWorker?:       boolean;
  nVersionWorkers?:        number;
  brandingLoginTitle?:     string;
  brandingLoginSubtitle?:  string;
  [key: string]: unknown;
}

export interface AppUser {
  id:                   number;
  username:             string;
  display_name:         string;
  role:                 string;
  must_change_password: number;   // 0 | 1
  created_at:           string;
  updated_at:           string;
}

export interface SessionInfo {
  ok:                  boolean;
  username?:           string;
  displayName?:        string;
  role?:               string;
  mustChangePassword?: boolean;
}

export interface OkResponse {
  ok:       boolean;
  message?: string;
  error?:   string;
}

// ─── Fetch interno ────────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

async function sfetch<T>(
  method:  'GET' | 'POST',
  path:    string,
  body?:   unknown,
): Promise<T> {
  const opts: RequestInit = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  const json: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const errMsg = (json as OkResponse)?.error ?? `HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return json as T;
}

// ─── Funções ──────────────────────────────────────────────────────────────────

/** Informações da sessão atual (username, role). */
export async function getSessionInfo(): Promise<SessionInfo> {
  return sfetch<SessionInfo>('GET', '/api/session/check');
}

/** Carrega configuração pública do servidor (clientSecret sempre vazio). */
export async function getConfig(): Promise<AppConfig> {
  return sfetch<AppConfig>('GET', '/api/config');
}

/** Salva configuração (requer sessão de administrador). */
export async function saveConfig(config: Partial<AppConfig>): Promise<OkResponse> {
  return sfetch<OkResponse>('POST', '/api/config', config);
}

/** Lista todos os usuários cadastrados (requer sessão de administrador). */
export async function listAdminUsers(): Promise<{ ok: boolean; users: AppUser[] }> {
  return sfetch<{ ok: boolean; users: AppUser[] }>('GET', '/api/admin/users');
}

/** Cria um novo usuário (requer sessão de administrador). */
export async function createAdminUser(data: {
  username:     string;
  password:     string;
  displayName?: string;
  role?:        string;
}): Promise<OkResponse> {
  return sfetch<OkResponse>('POST', '/api/admin/users', data);
}

/** Exclui um usuário (requer sessão de administrador). */
export async function deleteAdminUser(username: string): Promise<OkResponse> {
  return sfetch<OkResponse>('POST', '/api/admin/users/delete', { username });
}

/** Redefine a senha de um usuário (requer sessão de administrador). */
export async function resetAdminPassword(data: {
  username:    string;
  newPassword: string;
  email?:      string;
}): Promise<OkResponse> {
  return sfetch<OkResponse>('POST', '/api/admin/users/reset-password', data);
}
