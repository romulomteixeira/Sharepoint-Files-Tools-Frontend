/**
 * icons.ts — Mapeamento de ícones lucide-react usados na navegação e UI.
 *
 * Espelha o objeto `ICONS` e o `NAV` do protótipo de redesign (estilo Lucide,
 * stroke 1.8). As rotas usam os componentes lucide equivalentes.
 */

import {
  LayoutDashboard,
  FileText,
  KeyRound,
  ScanLine,
  Globe,
  Database,
  BarChart3,
  TrendingUp,
  CalendarClock,
  Trash2,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Ícone para cada rota da navegação principal. */
export const ROUTE_ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/reports': FileText,
  '/licenses': KeyRound,
  '/scans': ScanLine,
  '/sites': Globe,
  '/inventory': Database,
  '/top-files': BarChart3,
  '/oneration-monitor': TrendingUp,
  '/versioned-by-period': CalendarClock,
  '/expurgo': Trash2,
  '/logs': ScrollText,
  '/audit': ShieldCheck,
  '/settings': SlidersHorizontal,
  '/admin': Users,
};
