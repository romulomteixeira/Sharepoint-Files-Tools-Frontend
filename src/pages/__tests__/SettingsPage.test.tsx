import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import SettingsPage from '../SettingsPage';
import { server } from '../../test/server';

const baseConfig = {
  tenantId: 'tenant-main',
  clientId: 'client-main',
  clientSecret: '',
  oauthEnabled: false,
  oauthTenantId: '',
  oauthClientId: '',
  oauthClientSecret: '',
  oauthButtonLabel: 'Entrar com Microsoft',
  oauthReaderGroups: '',
  oauthAdminGroups: '',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
};

function useSettingsHandlers(onSave?: (payload: Record<string, unknown>) => void): void {
  server.use(
    http.get('/api/session/check', () => HttpResponse.json({ ok: true, role: 'admin' })),
    http.get('/api/config', () => HttpResponse.json(baseConfig)),
    http.post('/api/config', async ({ request }) => {
      onSave?.(await request.json() as Record<string, unknown>);
      return HttpResponse.json({ ok: true });
    }),
  );
}

describe('SettingsPage', () => {
  it('salva os parâmetros SMTP e OAuth sem substituir secrets não informados', async () => {
    let savedPayload: Record<string, unknown> | undefined;
    useSettingsHandlers(payload => { savedPayload = payload; });

    render(<SettingsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /editar configurações/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /habilitar autenticação microsoft/i }));
    fireEvent.change(screen.getByLabelText('Tenant OAuth'), { target: { value: 'tenant-oauth' } });
    fireEvent.change(screen.getByLabelText('Client ID OAuth'), { target: { value: 'client-oauth' } });
    fireEvent.change(screen.getByLabelText('Domínios permitidos'), { target: { value: 'allos.com.br' } });

    fireEvent.click(screen.getByRole('button', { name: /^smtp/i }));
    fireEvent.change(screen.getByLabelText('SMTP Host'), { target: { value: 'smtp.allos.com.br' } });
    fireEvent.change(screen.getByLabelText('SMTP Porta'), { target: { value: '465' } });
    fireEvent.change(screen.getByLabelText('SMTP Usuário'), { target: { value: 'mailer@allos.com.br' } });
    fireEvent.change(screen.getByLabelText('SMTP Remetente (From)'), { target: { value: 'no-reply@allos.com.br' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /usar tls direto/i }));

    fireEvent.click(screen.getAllByRole('button', { name: /salvar configurações/i })[0]);

    await waitFor(() => expect(savedPayload).toMatchObject({
      oauthEnabled: true,
      oauthTenantId: 'tenant-oauth',
      oauthClientId: 'client-oauth',
      oauthClientSecret: '',
      oauthAllowedDomains: 'allos.com.br',
      smtpHost: 'smtp.allos.com.br',
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: 'mailer@allos.com.br',
      smtpPass: '',
      smtpFrom: 'no-reply@allos.com.br',
    }));
  });

  it('busca, adiciona e valida um grupo administrador', async () => {
    useSettingsHandlers();
    server.use(
      http.get('/api/oauth/groups/search', () =>
        HttpResponse.json({
          ok: true,
          items: [{ id: 'group-admin', name: 'Administradores SharePoint' }],
        }),
      ),
      http.post('/api/oauth/groups/validate', async ({ request }) => {
        const payload = await request.json() as Record<string, unknown>;
        expect(payload.oauthAdminGroups).toBe('group-admin|Administradores SharePoint');
        return HttpResponse.json({
          ok: true,
          reader: [],
          admin: [{
            id: 'group-admin',
            name: 'Administradores SharePoint',
            role: 'admin',
            exists: true,
          }],
          summary: { total: 1, valid: 1, invalid: 0 },
        });
      }),
    );

    render(<SettingsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /editar configurações/i }));
    fireEvent.change(screen.getByLabelText('Buscar grupo no Entra ID'), {
      target: { value: 'Administradores' },
    });
    fireEvent.click(screen.getByRole('button', { name: /buscar grupos/i }));
    fireEvent.click(await screen.findByRole('button', { name: /\+ admin/i }));
    fireEvent.click(screen.getByRole('button', { name: /^validar grupos$/i }));

    expect(await screen.findByText(/1 válido\(s\), 0 inválido\(s\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Grupos com acesso de administrador')).toHaveValue(
      'group-admin|Administradores SharePoint',
    );
  });
});
