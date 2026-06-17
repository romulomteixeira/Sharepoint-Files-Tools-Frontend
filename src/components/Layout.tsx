/**
 * Layout.tsx — Shell de navegação com sidebar lateral (redesign).
 *
 * Usa o design system de `src/styles/tokens.css` (classes .shell/.sidebar/.nav…),
 * dirigido pelas preferências do usuário (tema/variação/densidade/sidebar/accent).
 * Sidebar recolhível com ícones lucide; estrutura de navegação (NAV_GROUPS)
 * preservada do legado.
 */

import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ChevronRight, PanelLeft, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { logout as apiLogout } from '../api/auth.api';
import { ROUTE_ICONS } from './icons';
import PreferencesMenu from './PreferencesMenu';

// ─── Estrutura de navegação ───────────────────────────────────────────────────

interface NavItem { title: string; sub: string; to: string; }
interface NavGroup { section: string; items: NavItem[]; }

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'Visão executiva',
    items: [
      { title: 'Dashboard',         sub: 'KPIs, tendência e consumo',       to: '/' },
      { title: 'Relatórios',        sub: 'Exportações e Top 500',           to: '/reports' },
      { title: 'Licenças & Espaço', sub: 'Origem da capacidade SharePoint', to: '/licenses' },
    ],
  },
  {
    section: 'Operação',
    items: [
      { title: 'Realizar Scans',          sub: 'Configurar e executar varreduras', to: '/scans' },
      { title: 'Sites',                   sub: 'Último inventário por site',        to: '/sites' },
      { title: 'Inventário',              sub: 'Arquivos, filtros e base',          to: '/inventory' },
      { title: 'Top Arquivos',            sub: 'Maiores e mais versionados',        to: '/top-files' },
      { title: 'Monitor Oneração',        sub: 'Crescimento e impacto',             to: '/oneration-monitor' },
      { title: 'Versionados por Período', sub: 'Dia, semana e mês',                 to: '/versioned-by-period' },
      { title: 'Simulação de Expurgo',    sub: 'Retenção e economia',               to: '/expurgo' },
    ],
  },
  {
    section: 'Governança e suporte',
    items: [
      { title: 'Logs',          sub: 'Jobs, erros e auditoria',            to: '/logs' },
      { title: 'Auditoria',     sub: 'Trilha de ações e rastreabilidade',  to: '/audit' },
      { title: 'Configurações', sub: 'Token, limites e motor',             to: '/settings' },
      { title: 'Administração', sub: 'Usuários e controle de acesso',      to: '/admin' },
    ],
  },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '–';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Layout(): React.ReactElement {
  const navigate = useNavigate();
  const { session, onLogout } = useAuth();
  const { prefs, toggleSidebar } = usePreferences();

  const currentUserDisplay = session?.displayName || session?.username || 'Operador autenticado';
  const role = session?.role === 'admin' ? 'Administrador' : 'Operador';
  const collapsed = prefs.sidebar === 'compact';
  const showSubs = prefs.variation === 'a';

  const handleLogout = async () => {
    try { await apiLogout(); } finally {
      onLogout();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="shell">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-inner">

          {/* Brand */}
          <div className="brand">
            <div className="logo">SP</div>
            <div className="brand-copy">
              <div className="brand-name">SharePoint Monitor</div>
              <div className="brand-tag">Inventário • Consumo • Retenção</div>
            </div>
            <button
              type="button"
              className="side-collapse"
              onClick={toggleSidebar}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            >
              <PanelLeft size={15} />
            </button>
          </div>

          <div className="ws-badge">
            <span className="ws-label">Workspace</span>
            <span className="ws-value">SharePoint Online</span>
          </div>

          {/* Nav */}
          <nav className="nav" aria-label="Principal">
            {NAV_GROUPS.map(group => (
              <div key={group.section} className="nav-group">
                <div className="nav-section">{group.section}</div>
                {group.items.map(item => {
                  const Icon = ROUTE_ICONS[item.to];
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={item.title}
                      className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}
                    >
                      <span className="nav-icon">{Icon ? <Icon size={16} /> : null}</span>
                      <span className="nav-copy">
                        <span className="nav-title">{item.title}</span>
                        {showSubs ? <span className="nav-sub">{item.sub}</span> : null}
                      </span>
                      <span className="nav-caret"><ChevronRight size={13} /></span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Footer */}
          <div className="side-footer">
            <div className="side-user">
              <div className="side-avatar">{initials(currentUserDisplay)}</div>
              <div className="side-user-copy">
                <div className="side-user-name" id="currentUserDisplay" title={currentUserDisplay}>
                  {currentUserDisplay}
                </div>
                <div className="side-user-role">{role}</div>
              </div>
              <button type="button" className="side-logout" title="Sair" aria-label="Sair" onClick={handleLogout}>
                <LogOut size={15} />
              </button>
            </div>
            <PreferencesMenu />
            <a className="api-link" href="/api-docs" target="_blank" rel="noreferrer">API Docs ↗</a>
          </div>

        </div>
      </aside>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
