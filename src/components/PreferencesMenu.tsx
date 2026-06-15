/**
 * PreferencesMenu.tsx — Popover de preferências visuais do usuário.
 *
 * Expõe os eixos do design system (tema, variação, densidade, sidebar, accent,
 * raio) conforme o handoff. Substitui o `tweaks-panel.jsx` do protótipo (que era
 * apenas ferramenta de revisão) por um controle real exposto ao usuário.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Palette } from 'lucide-react';
import {
  ACCENTS,
  usePreferences,
  type AccentKey,
  type Density,
  type SidebarMode,
  type Theme,
  type Variation,
} from '../contexts/PreferencesContext';
import { Seg } from './ui';

export default function PreferencesMenu(): React.ReactElement {
  const { prefs, setPref } = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="api-link"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer' }}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Aparência"
      >
        <Palette size={13} /> Aparência
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Preferências de aparência"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--panel)',
            color: 'var(--text)',
            border: 'var(--card-border)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--shadow-pop)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            zIndex: 50,
          }}
        >
          <Row label="Tema">
            <Seg<Theme>
              value={prefs.theme}
              onChange={v => setPref('theme', v)}
              options={[{ value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]}
            />
          </Row>
          <Row label="Variação">
            <Seg<Variation>
              value={prefs.variation}
              onChange={v => setPref('variation', v)}
              options={[
                { value: 'a', label: 'Conserv.' },
                { value: 'b', label: 'Moderna' },
                { value: 'c', label: 'Ousada' },
              ]}
            />
          </Row>
          <Row label="Densidade">
            <Seg<Density>
              value={prefs.density}
              onChange={v => setPref('density', v)}
              options={[
                { value: 'compact', label: 'Compacta' },
                { value: 'comfortable', label: 'Confort.' },
              ]}
            />
          </Row>
          <Row label="Sidebar">
            <Seg<SidebarMode>
              value={prefs.sidebar}
              onChange={v => setPref('sidebar', v)}
              options={[
                { value: 'expanded', label: 'Expandida' },
                { value: 'compact', label: 'Compacta' },
              ]}
            />
          </Row>
          <Row label="Destaque">
            <div className="row" style={{ gap: 6 }}>
              {(Object.keys(ACCENTS) as AccentKey[]).map(key => {
                const acc = ACCENTS[key];
                const active = prefs.accent === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={acc.label}
                    aria-label={acc.label}
                    aria-pressed={active}
                    onClick={() => setPref('accent', key)}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--r-pill)',
                      background: prefs.theme === 'dark' ? acc.dark : acc.light,
                      border: active ? '2px solid var(--text)' : '2px solid transparent',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          </Row>
          <Row label={`Raio ${prefs.radius}%`}>
            <input
              type="range"
              min={40}
              max={200}
              step={10}
              value={prefs.radius}
              onChange={e => setPref('radius', Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="field-label">{label}</span>
      {children}
    </div>
  );
}
