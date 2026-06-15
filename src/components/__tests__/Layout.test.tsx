import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Layout from '../Layout';
import { useAuth } from '../../contexts/AuthContext';
import { PreferencesProvider } from '../../contexts/PreferencesContext';

vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../api/auth.api', () => ({ logout: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

describe('Layout', () => {
  it('exibe o nome homologado da sessão no rodapé', () => {
    mockedUseAuth.mockReturnValue({
      session: {
        ok: true,
        username: 'operador@allos.com',
        displayName: 'Operador QA',
        role: 'operator',
      },
      isAuthenticated: true,
      loading: false,
      onLoginSuccess: vi.fn(),
      onLogout: vi.fn(),
    });

    render(
      <PreferencesProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </PreferencesProvider>,
    );

    expect(screen.getByText('Operador QA')).toHaveAttribute('id', 'currentUserDisplay');
  });
});
