/**
 * AuthContext.tsx — Estado global de autenticação (Sprint 11)
 *
 * - Verifica sessão ao montar chamando um endpoint protegido
 * - Escuta o evento "auth:unauthorized" emitido pelo client.ts (sessão expirada)
 * - Expõe: isAuthenticated, loading, onLoginSuccess, onLogout
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { get } from '../api/client';
import type { Scan } from '../types';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AuthContextType {
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Verificação de sessão: tenta um endpoint protegido; 401 = não autenticado
  useEffect(() => {
    get<Scan[]>('/api/scans/list')
      .then(() => setIsAuthenticated(true))
      .catch(() => setIsAuthenticated(false))
      .finally(() => setLoading(false));
  }, []);

  // Escuta eventos de 401 emitidos pelo client.ts (sessão expirada mid-session)
  useEffect(() => {
    const handler = () => setIsAuthenticated(false);
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const onLoginSuccess = () => setIsAuthenticated(true);
  const onLogout = () => setIsAuthenticated(false);

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, onLoginSuccess, onLogout }}>
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
