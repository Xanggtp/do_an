import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <div className="app-loading">Something went wrong. Please refresh the page.</div>;
    return this.props.children;
  }
}
