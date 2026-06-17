/**
 * ui.tsx — Componentes base do design system (redesign).
 *
 * Portados de `redesign/core.jsx` para TSX tipado. Usam as classes definidas em
 * `src/styles/tokens.css`. Mantêm as mesmas APIs do protótipo.
 */

import React from 'react';
import type { LucideIcon } from 'lucide-react';

/** Cabeçalho de página: título + subtítulo + ações à direita. */
export function PageHead({
  title,
  sub,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {children ? <div className="head-actions">{children}</div> : null}
    </div>
  );
}

/** Card de KPI. */
export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  color,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  color?: string;
}): React.ReactElement {
  return (
    <div className="kpi">
      <div className="kpi-top">
        <div className="kpi-label">{label}</div>
        {Icon ? <div className="kpi-ico"><Icon size={14} /></div> : null}
      </div>
      <div className="kpi-value" style={{ color: color ?? 'var(--accent)' }}>{value}</div>
      {hint ? <div className="kpi-hint">{hint}</div> : null}
    </div>
  );
}

/** Card genérico com cabeçalho opcional. */
export function Card({
  title,
  sub,
  right,
  children,
  className,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={'card' + (className ? ' ' + className : '')}>
      {(title || right) ? (
        <div className="card-head">
          <div>
            {title ? <h2 className="card-title" style={{ margin: 0 }}>{title}</h2> : null}
            {sub ? <div className="card-sub">{sub}</div> : null}
          </div>
          {right ? <div className="row">{right}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

type BtnVariant = 'primary' | 'danger' | 'ghost';

/** Botão estilizado com ícone opcional. */
export function Btn({
  children,
  icon: Icon,
  variant,
  small,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: BtnVariant;
  small?: boolean;
}): React.ReactElement {
  const cls = ['btn', variant ? `btn-${variant}` : '', small ? 'btn-sm' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

export type PillStatus = 'completed' | 'running' | 'pending' | 'failed' | 'cancelled' | string;

const STATUS_MAP: Record<string, [string, string]> = {
  completed: ['good', 'Concluído'],
  running:   ['info', 'Em execução'],
  pending:   ['warn', 'Pendente'],
  failed:    ['bad', 'Falhou'],
  cancelled: ['mute', 'Cancelado'],
};

/** Pílula de status com bolinha colorida. */
export function StatusPill({ status, label }: { status: PillStatus; label?: React.ReactNode }): React.ReactElement {
  const [kind, defaultLabel] = STATUS_MAP[status] || ['mute', status];
  return (
    <span className={`pill pill-${kind}`}>
      <span className="dot" />
      {label ?? defaultLabel}
    </span>
  );
}

/** Controle segmentado (toggle de opções). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
}): React.ReactElement {
  return (
    <div className="seg">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Campo de formulário com rótulo. */
export function Field({
  label,
  children,
  style,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}): React.ReactElement {
  return (
    <label className="field" style={style}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
