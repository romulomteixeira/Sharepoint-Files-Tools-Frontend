/**
 * AuthContext.tsx — Estado global de autenticação (Sprint 11)
 *
 * - Verifica sessão ao montar via endpoint dedicado
 * - Escuta o evento "auth:unauthorized" emitido pelo client.ts (sessão expirada)
 * - Expõe: sessão, isAuthenticated, loading, onLoginSuccess, onLogout
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getSessionInfo } from '../api/settings.api';
import type { SessionInfo } from '../api/settings.api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuthContextType {
  /** Dados da sessão autenticada atual */
  session: SessionInfo | null;
  /** true após verificação de sessão bem-sucedida */
  isAuthenticated: boolean;
  /** true enquanto a verificação inicial de sessão ainda não concluiu */
  loading: boolean;
  /** Chamar após login bem-sucedido para marcar sessão como ativa */
  onLoginSuccess: () => void;
  /** Chamar após logout para limpar o estado */
  onLogout: () => void;
}

// ─── Contexto ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((nextSession: SessionInfo) => {
    setSession(nextSession.ok ? nextSession : null);
    setIsAuthenticated(nextSession.ok);
  }, []);

  // Verificação de sessão: usa o contrato dedicado; 401 = não autenticado
  useEffect(() => {
    getSessionInfo()
      .then(applySession)
      .catch(() => {
        setSession(null);
        setIsAuthenticated(false);
      })
      .finally(() => setLoading(false));
  }, [applySession]);

  // Escuta eventos de 401 emitidos pelo client.ts (sessão expirada mid-session)
  useEffect(() => {
    const handler = () => {
      setSession(null);
      setIsAuthenticated(false);
    };
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const onLoginSuccess = () => {
    setIsAuthenticated(true);
    void getSessionInfo().then(applySession).catch(() => setSession(null));
  };
  const onLogout = () => {
    setSession(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ session, isAuthenticated, loading, onLoginSuccess, onLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
