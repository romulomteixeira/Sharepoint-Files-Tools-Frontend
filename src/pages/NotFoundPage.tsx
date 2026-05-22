import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage(): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6rem 1rem', gap: '1rem' }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 700, color: '#e5e7eb', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.1rem', color: '#6b7280' }}>Página não encontrada.</p>
      <Link to="/" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 600 }}>← Voltar ao Dashboard</Link>
    </div>
  );
}
