import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logoSrc } from '../lib/logo';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[kalai] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="auth-page">
        <div className="auth-card">
          <img className="auth-logo" src={logoSrc()} alt="KALAI DIGITAL" />
          <div className="auth-name" style={{ fontSize: 20 }}>Something went wrong</div>
          <p style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 8 }}>
            Your saved bills are safe. Reload the application to continue. If the problem repeats, export a backup from Settings after signing in.
          </p>
          <pre style={{ textAlign: 'left', fontSize: 10.5, background: 'var(--surface-3)', padding: 10, borderRadius: 8, marginTop: 12, overflow: 'auto', maxHeight: 150 }}>
            {this.state.error.message}
          </pre>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => window.location.reload()}>
            Reload KALAI DIGITAL
          </button>
        </div>
      </div>
    );
  }
}
