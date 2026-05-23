/**
 * Layout.tsx — Shell de navegação principal (Sprint 11)
 */

import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logout as apiLogout } from '../api/auth.api';

interface NavItem {
  to: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',      label: 'Dashboard' },
  { to: '/scans', label: 'Scans' },
];

export default function Layout(): React.ReactElement {
  const navigate = useNavigate();
  const { onLogout } = useAuth();

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      onLogout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div style={styles.shell}>
      <nav style={styles.nav}>
        <div style={styles.brand}>
          <span style={styles.brandIcon}>📊</span>
          <span style={styles.brandName}>SharePoint Monitor</span>
        </div>
        <ul style={styles.navList}>
          {NAV_ITEMS.map(({ to, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                style={({ isActive }) => ({
                  ...styles.navLink,
                  ...(isActive ? styles.navLinkActive : {}),
                })}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div style={styles.navRight}>
          <a
            href="/api-docs"
            target="_blank"
            rel="noreferrer"
            style={styles.apiDocsLink}
            title="Documentação OpenAPI"
          >
            API Docs
          </a>
          <button style={styles.logoutBtn} type="button" onClick={handleLogout} title="Sair">
            Sair
          </button>
        </div>
      </nav>

      <main style={styles.main}>
        <Outlet />
      </main>

      <footer style={styles.footer}>
        <span>SharePoint Monitor — Sprint 11</span>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell:         { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f9fafb', fontFamily: "'Inter', system-ui, sans-serif" },
  nav:           { background: '#1e293b', color: '#fff', padding: '0 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', height: 56, position: 'sticky', top: 0, zIndex: 100 },
  brand:         { display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' },
  brandIcon:     { fontSize: '1.25rem' },
  brandName:     { fontWeight: 700, fontSize: '1rem', color: '#f8fafc', whiteSpace: 'nowrap' },
  navList:       { display: 'flex', listStyle: 'none', margin: 0, padding: 0, gap: '0.25rem', flex: 1 },
  navLink:       { display: 'block', padding: '0.4rem 0.75rem', borderRadius: 6, color: '#94a3b8', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500, transition: 'color 0.15s, background 0.15s' },
  navLinkActive: { color: '#f8fafc', background: '#334155' },
  navRight:      { display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' },
  apiDocsLink:   { color: '#64748b', textDecoration: 'none', fontSize: '0.8rem' },
  logoutBtn:     { background: 'transparent', border: '1px solid #475569', borderRadius: 6, color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600, padding: '0.3rem 0.75rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.15s, border-color 0.15s' },
  main:          { flex: 1, padding: '1.5rem' },
  footer:        { background: '#f1f5f9', borderTop: '1px solid #e2e8f0', padding: '0.75rem 1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' },
};
