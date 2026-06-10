import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import {
  diagnoseAuth,
  getWorkersHealth,
  searchOauthGroups,
  validateOauthGroups,
} from '../settings.api';
import { server } from '../../test/server';

describe('settings.api', () => {
  it('envia a consulta ao endpoint homologado de grupos OAuth', async () => {
    server.use(
      http.get('/api/oauth/groups/search', ({ request }) => {
        expect(new URL(request.url).searchParams.get('q')).toBe('Administradores');
        return HttpResponse.json({
          ok: true,
          items: [{ id: 'group-admin', name: 'Administradores SharePoint' }],
        });
      }),
    );

    await expect(searchOauthGroups('Administradores')).resolves.toEqual([
      { id: 'group-admin', name: 'Administradores SharePoint' },
    ]);
  });

  it('valida grupos com credenciais principais e OAuth do formulário', async () => {
    server.use(
      http.post('/api/oauth/groups/validate', async ({ request }) => {
        await expect(request.json()).resolves.toEqual({
          tenantId: 'tenant-main',
          clientId: 'client-main',
          clientSecret: '',
          oauthTenantId: 'tenant-oauth',
          oauthClientId: 'client-oauth',
          oauthClientSecret: '',
          oauthReaderGroups: 'reader-id|Leitores',
          oauthAdminGroups: 'admin-id|Administradores',
        });
        return HttpResponse.json({
          ok: true,
          reader: [{ id: 'reader-id', name: 'Leitores', role: 'reader', exists: true }],
          admin: [{ id: 'admin-id', name: 'Administradores', role: 'admin', exists: true }],
          summary: { total: 2, valid: 2, invalid: 0 },
        });
      }),
    );

    await expect(validateOauthGroups({
      tenantId: 'tenant-main',
      clientId: 'client-main',
      clientSecret: '',
      oauthTenantId: 'tenant-oauth',
      oauthClientId: 'client-oauth',
      oauthClientSecret: '',
      oauthReaderGroups: 'reader-id|Leitores',
      oauthAdminGroups: 'admin-id|Administradores',
    })).resolves.toMatchObject({
      ok: true,
      summary: { total: 2, valid: 2, invalid: 0 },
    });
  });

  it('consulta diagnóstico Graph e saúde dos version workers', async () => {
    server.use(
      http.post('/api/auth/diagnose', () =>
        HttpResponse.json({
          ok: true,
          authority: { tenant: 'tenant-main', tokenUrl: 'https://login/token' },
          openid: { ok: true, issuer: 'https://login/issuer' },
          org: { id: 'org-1', displayName: 'ALLOS' },
        }),
      ),
      http.get('/api/health/workers', () =>
        HttpResponse.json({
          ok: true,
          count: 2,
          versionWorker: {
            enabled: true,
            expected: 2,
            heartbeatCount: 2,
            localProcessCount: 2,
            extraAppsConfigured: 1,
            extraAppsInvalid: 0,
            configError: null,
          },
        }),
      ),
    );

    await expect(diagnoseAuth()).resolves.toMatchObject({
      ok: true,
      org: { displayName: 'ALLOS' },
    });
    await expect(getWorkersHealth()).resolves.toMatchObject({
      versionWorker: {
        expected: 2,
        heartbeatCount: 2,
        extraAppsConfigured: 1,
      },
    });
  });
});
