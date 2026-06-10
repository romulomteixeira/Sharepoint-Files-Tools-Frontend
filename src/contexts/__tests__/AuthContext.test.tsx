import { http, HttpResponse } from 'msw';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { AuthProvider, useAuth } from '../AuthContext';

function SessionProbe(): React.ReactElement {
  const { session, isAuthenticated, loading } = useAuth();

  if (loading) return <div>carregando</div>;
  return (
    <div>
      <span>{isAuthenticated ? 'autenticado' : 'anônimo'}</span>
      <span>{session?.displayName ?? 'sem sessão'}</span>
    </div>
  );
}

describe('AuthContext', () => {
  it('valida e expõe a sessão pelo endpoint dedicado', async () => {
    server.use(
      http.get('/api/session/check', () =>
        HttpResponse.json({
          ok: true,
          username: 'operador@allos.com',
          displayName: 'Operador QA',
          role: 'operator',
        }),
      ),
    );

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('autenticado')).toBeInTheDocument();
    expect(screen.getByText('Operador QA')).toBeInTheDocument();
  });

  it('limpa autenticação e sessão ao receber auth:unauthorized', async () => {
    server.use(
      http.get('/api/session/check', () =>
        HttpResponse.json({ ok: true, displayName: 'Operador QA' }),
      ),
    );

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('Operador QA')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    });

    await waitFor(() => expect(screen.getByText('anônimo')).toBeInTheDocument());
    expect(screen.getByText('sem sessão')).toBeInTheDocument();
  });
});
