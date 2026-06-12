import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { logout as apiLogout } from '../api/auth.api';
import { usePreferences } from '../contexts/PreferencesContext';
import {
  LayoutDashboard, FileBarChart2, KeyRound,
  ScanLine, Globe, Database, TrendingUp,
  BarChart2, CalendarDays, Trash2,
  ScrollText, ShieldCheck, Settings2, Users,
  PanelLeft, LogOut, ChevronRight,
} from 'lucide-react';

// ─── Estrutura de navegação ────────────────────────────────────────────────────

interface NavItem {
  icon: React.ElementType;
  title: string;
  sub: string;
  to: string;
}

interface NavGroup {
  section: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    section: 'Visão executiva',
    items: [
      { icon: LayoutDashboard, title: 'Dashboard',        sub: 'KPIs, tendência e consumo',         to: '/' },
      { icon: FileBarChart2,   title: 'Relatórios',        sub: 'Exportações e Top 500',              to: '/reports' },
      { icon: KeyRound,        title: 'Licenças & Espaço', sub: 'Origem da capacidade SharePoint',    to: '/licenses' },
    ],
  },
  {
    section: 'Operação',
    items: [
      { icon: ScanLine,     title: 'Realizar Scans',          sub: 'Configurar e executar varreduras', to: '/scans' },
      { icon: Globe,        title: 'Sites',                   sub: 'Último inventário por site',        to: '/sites' },
      { icon: Database,     title: 'Inventário',              sub: 'Arquivos, filtros e base',         to: '/inventory' },
      { icon: TrendingUp,   title: 'Top Arquivos',            sub: 'Maiores e mais versionados',       to: '/top-files' },
      { icon: BarChart2,    title: 'Monitor Oneração',        sub: 'Crescimento e impacto',            to: '/oneration-monitor' },
      { icon: CalendarDays, title: 'Versionados por Período', sub: 'Dia, semana e mês',                to: '/versioned-by-period' },
      { icon: Trash2,       title: 'Simulação de Expurgo',    sub: 'Retenção e economia',              to: '/expurgo' },
    ],
  },
  {
    section: 'Governança e suporte',
    items: [
      { icon: ScrollText,  title: 'Logs',          sub: 'Jobs, erros e auditoria',             to: '/logs' },
      { icon: ShieldCheck, title: 'Auditoria',     sub: 'Trilha de ações e rastreabilidade',   to: '/audit' },
      { icon: Settings2,   title: 'Configurações', sub: 'Token, limites e motor',              to: '/settings' },
      { icon: Users,       title: 'Administração', sub: 'Usuários e controle de acesso',       to: '/admin' },
    ],
  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function Layout(): React.ReactElement {
  const navigate = useNavigate();
  const { session, onLogout } = useAuth();
  const { toggleSidebar, sidebar, variation } = usePreferences();

  const displayName = session?.displayName || session?.username || 'Operador';
  const initials    = displayName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  const showSubs    = variation === 'a';

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
              title={sidebar === 'compact' ? 'Expandir menu' : 'Recolher menu'}
              aria-label={sidebar === 'compact' ? 'Expandir menu' : 'Recolher menu'}
              onClick={toggleSidebar}
            >
              <PanelLeft size={15} />
            </button>
          </div>

          {/* Workspace badge */}
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
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={item.title}
                      className={({ isActive }) => 'nav-btn' + (isActive ? ' active' : '')}
                    >
                      <span className="nav-icon"><Icon size={16} /></span>
                      <span className="nav-copy">
                        <span className="nav-title">{item.title}</span>
                        {showSubs && <span className="nav-sub">{item.sub}</span>}
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
              <div className="side-avatar">{initials}</div>
              <div className="side-user-copy">
                <div className="side-user-name">{displayName}</div>
                <div className="side-user-role">Operador</div>
              </div>
              <button
                type="button"
                className="side-logout"
                title="Sair"
                onClick={handleLogout}
              >
                <LogOut size={15} />
              </button>
            </div>
            <a
              href="/api-docs"
              target="_blank"
              rel="noreferrer"
              className="api-link"
            >
              API Docs ↗
            </a>
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
