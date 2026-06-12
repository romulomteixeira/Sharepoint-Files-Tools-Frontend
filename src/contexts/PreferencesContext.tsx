/**
 * PreferencesContext — gerencia tema, idioma, densidade, sidebar, accent e raio.
 * Aplica atributos data-* no <html> antes do primeiro paint (via script inline no index.html
 * ou assim que o provider monta). Persiste em localStorage.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme     = 'light' | 'dark';
export type Variation = 'a' | 'b' | 'c';
export type Density   = 'compact' | 'comfortable';
export type Sidebar   = 'expanded' | 'compact';
export type AccentKey = 'original' | 'fluent' | 'deep' | 'teal';

interface Prefs {
  theme:     Theme;
  variation: Variation;
  density:   Density;
  sidebar:   Sidebar;
  accent:    AccentKey;
  radius:    number; // 40–200, percentual do --r-scale
}

interface PrefsCtx extends Prefs {
  setTheme:     (v: Theme)     => void;
  setVariation: (v: Variation) => void;
  setDensity:   (v: Density)   => void;
  setSidebar:   (v: Sidebar)   => void;
  setAccent:    (v: AccentKey) => void;
  setRadius:    (v: number)    => void;
  toggleSidebar: () => void;
  toggleTheme:   () => void;
}

const ACCENTS: Record<AccentKey, { light: string; dark: string }> = {
  original: { light: '#2b6cb0', dark: '#5b9bd9' },
  fluent:   { light: '#0f6cbd', dark: '#479ef5' },
  deep:     { light: '#1e548f', dark: '#7fb3e3' },
  teal:     { light: '#0d7377', dark: '#3fc1c9' },
};

const STORAGE_KEY = 'spm-prefs';

function load(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults();
}

function defaults(): Prefs {
  return {
    theme:     'light',
    variation: 'b',
    density:   'compact',
    sidebar:   'expanded',
    accent:    'original',
    radius:    100,
  };
}

function applyToHtml(prefs: Prefs): void {
  const el = document.documentElement;
  el.setAttribute('data-theme',     prefs.theme);
  el.setAttribute('data-variation', prefs.variation);
  el.setAttribute('data-density',   prefs.density);
  el.setAttribute('data-sidebar',   prefs.sidebar);
  el.style.setProperty('--r-scale', String(prefs.radius / 100));
  const acc = ACCENTS[prefs.accent] ?? ACCENTS.original;
  el.style.setProperty('--accent',      prefs.theme === 'dark' ? acc.dark : acc.light);
  el.style.setProperty('--accent-side', acc.dark);
}

const Ctx = createContext<PrefsCtx | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    const p = load();
    applyToHtml(p); // aplica antes do primeiro render
    return p;
  });

  useEffect(() => {
    applyToHtml(prefs);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs]);

  function set<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setPrefs(prev => ({ ...prev, [key]: value }));
  }

  const ctx: PrefsCtx = {
    ...prefs,
    setTheme:      v => set('theme', v),
    setVariation:  v => set('variation', v),
    setDensity:    v => set('density', v),
    setSidebar:    v => set('sidebar', v),
    setAccent:     v => set('accent', v),
    setRadius:     v => set('radius', v),
    toggleSidebar: () => set('sidebar', prefs.sidebar === 'expanded' ? 'compact' : 'expanded'),
    toggleTheme:   () => set('theme',   prefs.theme   === 'light'    ? 'dark'    : 'light'),
  };

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export function usePreferences(): PrefsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePreferences must be used inside PreferencesProvider');
  return ctx;
}
