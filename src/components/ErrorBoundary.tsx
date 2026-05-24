/**
 * ErrorBoundary.tsx — Captura erros de render para evitar tela branca
 *
 * Envolve o conteúdo principal das rotas protegidas.
 * Em caso de crash de componente mostra mensagem de erro + botão para tentar novamente.
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Componente lançou excepção:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const msg = this.state.error?.message ?? 'Erro desconhecido';

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠</div>
          <h2 style={styles.title}>Ocorreu um erro nesta página</h2>
          <p style={styles.msg}>{msg}</p>
          <div style={styles.actions}>
            <button style={styles.retryBtn} type="button" onClick={this.handleRetry}>
              Tentar novamente
            </button>
            <button
              style={styles.reloadBtn}
              type="button"
              onClick={() => window.location.reload()}
            >
              Recarregar página
            </button>
          </div>
          {import.meta.env.DEV && this.state.error?.stack && (
            <pre style={styles.stack}>{this.state.error.stack}</pre>
          )}
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: '#fff',
    border: '1px solid #c8ced8',
    borderRadius: 8,
    padding: '32px 36px',
    maxWidth: 560,
    width: '100%',
    textAlign: 'center',
  },
  icon: {
    fontSize: 36,
    marginBottom: 12,
    color: '#c05621',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#1a202c',
    margin: '0 0 8px',
  },
  msg: {
    fontSize: 13,
    color: '#4a5568',
    margin: '0 0 20px',
    wordBreak: 'break-word',
  },
  actions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'center',
  },
  retryBtn: {
    background: '#2b6cb0',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '8px 18px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  reloadBtn: {
    background: '#fff',
    color: '#2b6cb0',
    border: '1px solid #2b6cb0',
    borderRadius: 4,
    padding: '8px 18px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  stack: {
    marginTop: 20,
    background: '#f7fafc',
    border: '1px solid #c8ced8',
    borderRadius: 4,
    padding: '10px 12px',
    fontSize: 11,
    color: '#4a5568',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 200,
    overflowY: 'auto',
  },
};
