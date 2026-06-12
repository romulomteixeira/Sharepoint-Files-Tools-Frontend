import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage(): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6rem 1rem', gap: '1rem' }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 700, color: 'var(--faint)', margin: 0 }}>404</h1>
      <p className="muted" style={{ fontSize: '1.1rem' }}>Página não encontrada.</p>
      <Link to="/" className="td-link" style={{ fontWeight: 600 }}>← Voltar ao Dashboard</Link>
    </div>
  );
}
