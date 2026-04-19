import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: (reset: () => void, error: Error) => ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Top-level error boundary. Catches render-time errors anywhere below it,
 * shows a friendly fallback, and logs to the console.
 *
 * TODO: forward errors to Sentry (or equivalent) once monitoring is wired up.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] Uncaught error:", error, info);
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
