/**
 * main.tsx — Ponto de entrada da aplicação React (Sprint 10)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Reset CSS mínimo
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #f9fafb; color: #111827; line-height: 1.5; }
  a { color: inherit; }
  button { font-family: inherit; }
  table { border-spacing: 0; }
`;
document.head.appendChild(style);

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no HTML.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
