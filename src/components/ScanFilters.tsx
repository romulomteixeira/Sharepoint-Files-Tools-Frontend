/**
 * ScanFilters.tsx — Seleção de categorias de repositório a excluir do scan.
 * Renderiza checkboxes a partir do catálogo do backend (com fallback embutido)
 * e oferece presets rápidos (Recomendado / Mínimo / Agressivo / Limpar).
 */

import React from 'react';
import type { ScanFilters as ScanFiltersType, ScanFilterCategory } from '../types';
import type { ScanFilterPresetName } from '../api/scans.api';
import { RECOMMENDED_FILTERS } from '../api/scans.api';

// Catálogo de fallback caso a API /api/scan-filter-categories não responda.
const FALLBACK_CATEGORIES: ScanFilterCategory[] = [
  { key: 'excludeOneDrive', category: 'onedrive_personal', label: 'OneDrive pessoais', needsDrives: false, needsTeams: false },
  { key: 'excludeSystem', category: 'system_site', label: 'Sites de sistema', needsDrives: false, needsTeams: false },
  { key: 'excludeArchived', category: 'archived_site', label: 'Sites arquivados', needsDrives: false, needsTeams: false },
  { key: 'excludeNoDrives', category: 'no_drives', label: 'Sites sem bibliotecas (drives)', needsDrives: true, needsTeams: false },
  { key: 'excludeChannelPrivate', category: 'channel_private', label: 'Canais privados do Teams', needsDrives: false, needsTeams: true },
  { key: 'excludeChannelShared', category: 'channel_shared', label: 'Canais compartilhados do Teams', needsDrives: false, needsTeams: true },
  { key: 'excludeEmbedded', category: 'embedded_container', label: 'Containers SharePoint Embedded', needsDrives: false, needsTeams: false },
  { key: 'excludeSubsites', category: 'subsite', label: 'Sub-sites (não raiz)', needsDrives: false, needsTeams: false },
];

const PRESETS: Record<ScanFilterPresetName, ScanFiltersType> = {
  recommended: RECOMMENDED_FILTERS,
  minimal: {
    excludeOneDrive: true, excludeSystem: false, excludeArchived: false, excludeNoDrives: false,
    excludeChannelPrivate: false, excludeChannelShared: false, excludeEmbedded: false, excludeSubsites: false,
  },
  aggressive: {
    excludeOneDrive: true, excludeSystem: true, excludeArchived: true, excludeNoDrives: true,
    excludeChannelPrivate: true, excludeChannelShared: true, excludeEmbedded: true, excludeSubsites: true,
  },
  none: {
    excludeOneDrive: false, excludeSystem: false, excludeArchived: false, excludeNoDrives: false,
    excludeChannelPrivate: false, excludeChannelShared: false, excludeEmbedded: false, excludeSubsites: false,
  },
};

interface ScanFiltersProps {
  value: ScanFiltersType;
  onChange: (next: ScanFiltersType) => void;
  categories?: ScanFilterCategory[];
}

export default function ScanFilters({ value, onChange, categories }: ScanFiltersProps): React.ReactElement {
  const list = categories && categories.length > 0 ? categories : FALLBACK_CATEGORIES;

  function toggle(key: keyof ScanFiltersType): void {
    onChange({ ...value, [key]: !value[key] });
  }

  function applyPreset(name: ScanFilterPresetName): void {
    onChange({ ...PRESETS[name] });
  }

  const excludedCount = list.filter((c) => value[c.key]).length;

  return (
    <fieldset style={styles.fieldset}>
      <legend style={styles.legend}>Categorias de repositório a excluir</legend>
      <p style={styles.help}>
        Selecione o que <strong>não</strong> deve entrar no inventário. Padrão: preset Recomendado.
      </p>

      <div style={styles.presetRow} role="group" aria-label="Presets de filtro">
        <button type="button" onClick={() => applyPreset('recommended')} style={styles.presetBtn}>Recomendado</button>
        <button type="button" onClick={() => applyPreset('minimal')} style={styles.presetBtn}>Mínimo</button>
        <button type="button" onClick={() => applyPreset('aggressive')} style={styles.presetBtn}>Agressivo</button>
        <button type="button" onClick={() => applyPreset('none')} style={styles.presetBtn}>Limpar</button>
      </div>

      <div style={styles.grid}>
        {list.map((cat) => (
          <label key={cat.key} style={styles.row} title={cat.category}>
            <input
              type="checkbox"
              checked={!!value[cat.key]}
              onChange={() => toggle(cat.key)}
            />
            <span style={styles.rowText}>
              {cat.label}
              {cat.needsTeams && <small style={styles.tag}>requer Teams</small>}
              {cat.needsDrives && <small style={styles.tag}>avaliado por site</small>}
            </span>
          </label>
        ))}
      </div>

      <div style={styles.summary} aria-live="polite">
        {excludedCount === 0
          ? 'Nenhuma categoria excluída — todos os repositórios serão inventariados.'
          : `${excludedCount} categoria(s) marcada(s) para exclusão.`}
      </div>
    </fieldset>
  );
}

const styles: Record<string, React.CSSProperties> = {
  fieldset: { border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', margin: '1rem 0' },
  legend: { fontWeight: 600, fontSize: '0.95rem', padding: '0 0.4rem' },
  help: { color: '#6b7280', fontSize: '0.8rem', margin: '0 0 0.75rem' },
  presetRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' },
  presetBtn: { padding: '0.35rem 0.7rem', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.82rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 },
  row: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0.45rem 0.5rem', borderRadius: 6, cursor: 'pointer' },
  rowText: { fontSize: '0.88rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: 2 },
  tag: { color: '#9ca3af', fontSize: '0.7rem' },
  summary: { marginTop: '0.75rem', color: '#4b5563', fontSize: '0.8rem', background: '#f9fafb', borderRadius: 6, padding: '0.5rem 0.65rem' },
};
