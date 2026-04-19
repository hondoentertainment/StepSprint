import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "../sentry";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    captureException(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="app">
          <section className="panel" role="alert">
            <h2>Something went wrong</h2>
            <p className="status status-error">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              type="button"
              className="cta-primary"
              onClick={() => window.location.reload()}
            >
              Reload the page
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
