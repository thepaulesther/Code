import { Component, type ReactNode } from 'react';

/**
 * Keeps one broken page from blanking the whole app. Saved data is untouched (it lives in
 * localStorage), so the message says so and offers a way back.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { error: Error | null; key?: string }) {
    // Navigating to another page clears the error.
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error('Elora page error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-state" role="alert">
        <h2>This page couldn’t be shown</h2>
        <p>Something went wrong while drawing it. Your data is safe: it’s stored in this browser and hasn’t been changed.</p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Reload Elora</button>
      </div>
    );
  }
}
