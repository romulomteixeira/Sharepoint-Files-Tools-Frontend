/**
 * App.tsx — Roteamento principal da aplicação (Sprint 11)
 *
 * Rotas:
 *   /login                 → LoginPage       (pública)
 *   /                      → DashboardPage   (protegida)
 *   /scans                 → ScansPage       (protegida)
 *   /jobs/:jobId           → JobStatusPage   (protegida, SSE de progresso)
 *   /inventory             → InventoryPage   (seletor de scans)
 *   /inventory/:scanId     → InventoryPage   (inventário de um scan)
 *   /reports               → ReportsPage     (exportações configuráveis)
 *   /top-files             → TopFilesPage    (top N maiores arquivos)
 *   *                      → NotFoundPage    (protegida)
 */

import React from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout        from './components/Layout';
import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ScansPage     from './pages/ScansPage';
import JobStatusPage from './pages/JobStatusPage';
import InventoryPage from './pages/InventoryPage';
import ReportsPage   from './pages/ReportsPage';
import TopFilesPage  from './pages/TopFilesPage';
import NotFoundPage  from './pages/NotFoundPage';

// ─── Guard de rota protegida ──────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div style={loadingStyles.wrap}>
        <p style={loadingStyles.text}>Verificando sessão…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

const loadingStyles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#5f6c83', fontSize: 15 },
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  return (
    <AuthProvider>
      <Routes>
        {/* Rota pública — tela de login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rotas protegidas — requerem sessão ativa */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="scans" element={<ScansPage />} />
          <Route path="jobs/:jobId" element={<JobStatusPage />} />
          <Route path="inventory"          element={<InventoryPage />} />
          <Route path="inventory/:scanId" element={<InventoryPage />} />
          <Route path="reports"           element={<ReportsPage />} />
          <Route path="top-files"         element={<TopFilesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
