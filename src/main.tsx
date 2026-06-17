/**
 * main.tsx — Ponto de entrada da aplicação React (Sprint 10)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { PreferencesProvider } from './contexts/PreferencesContext';
import './styles/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado no HTML.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PreferencesProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PreferencesProvider>
  </React.StrictMode>,
);
