/**
 * PreferencesContext.tsx — Preferências visuais do usuário (redesign).
 *
 * Eixos do design system (aplicados como atributos/variáveis no <html>):
 *   - theme      light | dark
 *   - variation  a (conservadora) | b (moderna, padrão) | c (ousada)
 *   - density    compact | comfortable
 *   - sidebar    expanded | compact
 *   - accent     original | fluent | deep | teal
 *   - radius     40–200 (multiplicador % do raio base)
 *
 * Os valores são persistidos em localStorage ('spm-prefs') e aplicados no
 * documento. O index.html replica esta aplicação antes do primeiro paint para
 * evitar flash; este provider mantém o estado reativo e re-aplica nas trocas.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Variation = 'a' | 'b' | 'c';
export type Density = 'compact' | 'comfortable';
export type SidebarMode = 'expanded' | 'compact';
export type AccentKey = 'original' | 'fluent' | 'deep' | 'teal';

export interface Preferences {
  theme: Theme;
  variation: Variation;
  density: Density;
  sidebar: SidebarMode;
  accent: AccentKey;
  radius: number;
}

/** Acentos calibrados (par claro/escuro para contraste AA). */
// eslint-disable-next-line react-refresh/only-export-components
export const ACCENTS: Record<AccentKey, { label: string; light: string; dark: string }> = {
  original: { label: 'Azul atual',    light: '#2b6cb0', dark: '#5b9bd9' },
  fluent:   { label: 'Azul Fluent',   light: '#0f6cbd', dark: '#479ef5' },
  deep:     { label: 'Azul profundo', light: '#1e548f', dark: '#7fb3e3' },
  teal:     { label: 'Verde-azulado', light: '#0d7377', dark: '#3fc1c9' },
};

const DEFAULTS: Preferences = {
  theme: 'light',
  variation: 'b',
  density: 'compact',
  sidebar: 'expanded',
  accent: 'original',
  radius: 100,
};

const STORAGE_KEY = 'spm-prefs';

function loadPrefs(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Preferences>;
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

function applyPrefs(p: Preferences): void {
  const el = document.documentElement;
  el.setAttribute('data-theme', p.theme);
  el.setAttribute('data-variation', p.variation);
  el.setAttribute('data-density', p.density);
  el.setAttribute('data-sidebar', p.sidebar);
  el.style.setProperty('--r-scale', String(p.radius / 100));
  const acc = ACCENTS[p.accent] || ACCENTS.original;
  el.style.setProperty('--accent', p.theme === 'dark' ? acc.dark : acc.light);
  // Acento legível sobre a sidebar escura, em qualquer tema → sempre o tom dark.
  el.style.setProperty('--accent-side', acc.dark);
}

interface PreferencesContextValue {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  toggleSidebar: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs);

  useEffect(() => {
    applyPrefs(prefs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  const setPref = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      setPrefs(current => ({ ...current, [key]: value }));
    },
    [],
  );

  const toggleSidebar = useCallback(() => {
    setPrefs(current => ({ ...current, sidebar: current.sidebar === 'compact' ? 'expanded' : 'compact' }));
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({ prefs, setPref, toggleSidebar }),
    [prefs, setPref, toggleSidebar],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences deve ser usado dentro de PreferencesProvider');
  return ctx;
}
