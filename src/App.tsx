/**
 * App.tsx — Roteamento principal da aplicação (Sprint 10)
 *
 * Rotas:
 *   /                      → DashboardPage
 *   /scans                 → ScansPage
 *   /jobs/:jobId           → JobStatusPage (SSE de progresso)
 *   /inventory/:scanId     → InventoryPage
 *   *                      → NotFoundPage
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage  from './pages/DashboardPage';
import ScansPage      from './pages/ScansPage';
import JobStatusPage  from './pages/JobStatusPage';
import InventoryPage  from './pages/InventoryPage';
import NotFoundPage   from './pages/NotFoundPage';

export default function App(): React.ReactElement {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="scans" element={<ScansPage />} />
        <Route path="jobs/:jobId" element={<JobStatusPage />} />
        <Route path="inventory/:scanId" element={<InventoryPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
