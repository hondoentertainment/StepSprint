import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "../sentry";

type Props = {
  children: ReactNode;
  fallback?: (reset: () => void, error: Error) => ReactNode;
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
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
    captureException(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.reset, this.state.error);
      }
      return (
        <div className="app" role="alert">
          <section className="panel">
            <h2>Something went wrong</h2>
            <p>
              The app hit an unexpected error. You can try again, or reload the
              page if the problem persists.
            </p>
            <button
              type="button"
              className="cta-primary"
              onClick={this.reset}
            >
              Try again
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
