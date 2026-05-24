/**
 * Layout.tsx — Shell de navegação com sidebar lateral (Sprint 11)
 *
 * Replica o design do legado (public/index.html + styles.css):
 *   - Sidebar 290 px com gradiente escuro, grupos de navegação e footer
 *   - Main content ocupa o restante da viewport
 *
 * Itens implementados em React:   to != undefined
 * Itens ainda não migrados:       disabled = true  (visíveis mas não clicáveis)
 */

import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logout as apiLogout } from '../api/auth.api';

// ─── Estrutura de navegação (igual ao legado) ─────────────────────────────────

interface NavItem {
  icon: string;
  title: string;
  sub: string;
  to?: string;
  disabled?: boolean;
  external?: boolean;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'Visão executiva',
    items: [
      { icon: 'DB', title: 'Dashboard',        sub: 'KPIs, tendência e consumo',          to: '/' },
      { icon: 'RL', title: 'Relatórios',        sub: 'Exportações e Top 500',              to: '/reports' },
      { icon: 'LC', title: 'Licenças & Espaço', sub: 'Origem da capacidade SharePoint',    to: '/licenses' },
    ],
  },
  {
    section: 'Operação',
    items: [
      { icon: 'ST', title: 'Sites',                   sub: 'Origem e execução do scan',       to: '/scans' },
      { icon: 'IV', title: 'Inventário',              sub: 'Arquivos, filtros e base',        to: '/inventory' },
      { icon: 'TP', title: 'Top Arquivos',            sub: 'Maiores e mais versionados',      to: '/top-files' },
      { icon: 'ON', title: 'Monitor Oneração',        sub: 'Crescimento e impacto',           to: '/oneration-monitor' },
      { icon: 'VP', title: 'Versionados por Período', sub: 'Dia, semana e mês',               to: '/versioned-by-period' },
      { icon: 'EX', title: 'Simulação de Expurgo',    sub: 'Retenção e economia',             to: '/expurgo' },
    ],
  },
  {
    section: 'Governança e suporte',
    items: [
      { icon: 'LG', title: 'Logs',          sub: 'Jobs, erros e auditoria',              to: '/logs' },
      { icon: 'AU', title: 'Auditoria',     sub: 'Trilha de ações e rastreabilidade',   to: '/audit' },
      { icon: 'CF', title: 'Configurações', sub: 'Token, limites e motor',              to: '/settings' },
      { icon: 'US', title: 'Administração', sub: 'Usuários e controle de acesso',       to: '/admin' },
    ],
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Layout(): React.ReactElement {
  const navigate = useNavigate();
  const { onLogout } = useAuth();

  const handleLogout = async () => {
    try { await apiLogout(); } finally {
      onLogout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div style={styles.shell}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarInner}>

          {/* Brand */}
          <div style={styles.brandWrap}>
            <div style={styles.brand}>
              <div style={styles.logo}>SP</div>
              <div>
                <div style={styles.brandName}>SharePoint Monitor</div>
                <div style={styles.brandTag}>Inventário • Consumo • Retenção</div>
              </div>
            </div>
            <div style={styles.workspaceBadge}>
              <span style={styles.workspaceLabel}>Workspace</span>
              <span style={styles.workspaceValue}>SharePoint Online</span>
            </div>
          </div>

          {/* Nav */}
          <nav style={styles.nav} aria-label="Principal">
            {NAV_GROUPS.map(group => (
              <div key={group.section} style={styles.navGroup}>
                <div style={styles.navSection}>{group.section}</div>
                {group.items.map(item => (
                  item.disabled || !item.to
                    ? (
                      <div key={item.title} style={styles.navBtnDisabled} title="Em desenvolvimento">
                        <span style={styles.navIcon}>{item.icon}</span>
                        <span style={styles.navCopy}>
                          <span style={styles.navTitle}>{item.title}</span>
                          <span style={styles.navSub}>{item.sub}</span>
                        </span>
                        <span style={styles.navCaret}>›</span>
                      </div>
                    )
                    : (
                      <NavLink
                        key={item.title}
                        to={item.to}
                        end={item.to === '/'}
                        style={({ isActive }) => ({
                          ...styles.navBtn,
                          ...(isActive ? styles.navBtnActive : {}),
                        })}
                      >
                        <span style={styles.navIcon}>{item.icon}</span>
                        <span style={styles.navCopy}>
                          <span style={styles.navTitle}>{item.title}</span>
                          <span style={styles.navSub}>{item.sub}</span>
                        </span>
                        <span style={styles.navCaret}>›</span>
                      </NavLink>
                    )
                ))}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div style={styles.sideFooter}>
            <div style={styles.userCard}>
              <div style={styles.metaLabel}>Operador</div>
              <div style={styles.metaValue} id="currentUserDisplay">—</div>
              <div style={{ marginTop: 6 }}>
                <button style={styles.logoutBtn} type="button" onClick={handleLogout}>
                  Sair
                </button>
              </div>
            </div>
            <a
              href="/api-docs"
              target="_blank"
              rel="noreferrer"
              style={styles.apiDocsLink}
            >
              API Docs ↗
            </a>
          </div>

        </div>
      </aside>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <main style={styles.main}>
        <Outlet />
      </main>

    </div>
  );
}

// ─── Estilos (fiéis ao legado styles.css) ─────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  /* Shell: sidebar 290 px + main */
  shell: {
    display: 'grid',
    gridTemplateColumns: '290px 1fr',
    minHeight: '100vh',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },

  /* Sidebar */
  sidebar: {
    background: 'linear-gradient(180deg, #1a2332, #0f1720)',
    borderRight: '1px solid rgba(255,255,255,.08)',
    position: 'sticky',
    top: 0,
    height: '100vh',
    color: '#d0d8e4',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    overflowX: 'hidden',
  },

  sidebarInner: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    padding: 14,
    minHeight: 0,
  },

  /* Brand */
  brandWrap: {
    marginBottom: 4,
  },

  brand: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    marginBottom: 14,
  },

  logo: {
    width: 36,
    height: 36,
    borderRadius: 4,
    background: 'rgba(43,108,176,.14)',
    border: '1px solid rgba(43,108,176,.40)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 800,
    color: '#a0c4e8',
    fontSize: 13,
    letterSpacing: '.04em',
    flexShrink: 0,
  },

  brandName: {
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '.02em',
    color: '#e2e8f0',
  },

  brandTag: {
    color: 'rgba(208,216,228,.65)',
    fontSize: 11,
    letterSpacing: '.02em',
  },

  workspaceBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255,255,255,.05)',
    border: '1px solid rgba(255,255,255,.10)',
    borderRadius: 4,
    padding: '5px 8px',
    marginBottom: 8,
  },

  workspaceLabel: {
    fontSize: 10,
    color: 'rgba(208,216,228,.55)',
    textTransform: 'uppercase' as const,
    letterSpacing: '.06em',
    fontWeight: 700,
  },

  workspaceValue: {
    fontSize: 11,
    color: '#a0c4e8',
    fontWeight: 700,
  },

  /* Nav */
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 12,
    flex: 1,
  },

  navGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },

  navSection: {
    fontSize: 9,
    fontWeight: 800,
    color: 'rgba(208,216,228,.40)',
    textTransform: 'uppercase' as const,
    letterSpacing: '.10em',
    padding: '6px 4px 4px',
  },

  navBtn: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    width: '100%',
    padding: '8px 10px',
    borderRadius: 4,
    border: '1px solid transparent',
    color: '#d0d8e4',
    cursor: 'pointer',
    minHeight: 40,
    lineHeight: 1.2,
    fontWeight: 600,
    fontSize: 12,
    textDecoration: 'none',
    boxSizing: 'border-box' as const,
    transition: 'background .15s, border-color .15s',
  },

  navBtnActive: {
    background: 'rgba(43,108,176,.22)',
    borderColor: 'rgba(43,108,176,.45)',
    borderLeft: '3px solid rgba(43,108,176,.85)',
    color: '#e2e8f0',
  },

  navBtnDisabled: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    width: '100%',
    padding: '8px 10px',
    borderRadius: 4,
    border: '1px solid transparent',
    color: 'rgba(208,216,228,.30)',
    cursor: 'not-allowed',
    minHeight: 40,
    lineHeight: 1.2,
    fontWeight: 600,
    fontSize: 12,
    opacity: 0.5,
    userSelect: 'none' as const,
  },

  navIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    background: 'rgba(255,255,255,.06)',
    display: 'grid',
    placeItems: 'center',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '.03em',
    flexShrink: 0,
    color: '#a0c4e8',
  },

  navCopy: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    minWidth: 0,
  },

  navTitle: {
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  navSub: {
    fontSize: 10,
    color: 'rgba(208,216,228,.55)',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: 400,
  },

  navCaret: {
    fontSize: 14,
    color: 'rgba(208,216,228,.30)',
    flexShrink: 0,
  },

  /* Footer */
  sideFooter: {
    marginTop: 'auto',
    paddingTop: 12,
    borderTop: '1px solid rgba(255,255,255,.10)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },

  userCard: {
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.10)',
    borderRadius: 4,
    padding: '8px 10px',
  },

  metaLabel: {
    fontSize: 9,
    fontWeight: 800,
    color: 'rgba(208,216,228,.45)',
    textTransform: 'uppercase' as const,
    letterSpacing: '.08em',
  },

  metaValue: {
    fontSize: 12,
    fontWeight: 700,
    color: '#d0d8e4',
    marginTop: 2,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  logoutBtn: {
    background: 'rgba(255,255,255,.08)',
    border: '1px solid rgba(255,255,255,.15)',
    color: '#d0d8e4',
    fontSize: 10,
    fontWeight: 700,
    padding: '4px 8px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  apiDocsLink: {
    fontSize: 10,
    color: 'rgba(208,216,228,.40)',
    textDecoration: 'none',
    textAlign: 'center' as const,
    letterSpacing: '.04em',
  },

  /* Main content */
  main: {
    background: '#eef1f5',
    padding: '16px 20px',
    minWidth: 0,
    overflowX: 'hidden',
  },
};
