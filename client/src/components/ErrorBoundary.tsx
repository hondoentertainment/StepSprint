import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";
import { captureException } from "../sentry";

type OwnProps = {
  children: ReactNode;
  fallback?: (reset: () => void, error: Error) => ReactNode;
};

type Props = OwnProps & WithTranslation;

type State = {
  hasError: boolean;
  error: Error | null;
};

class ErrorBoundaryInner extends Component<Props, State> {
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
    const { t } = this.props;
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.reset, this.state.error);
      }
      return (
        <div className="app" role="alert">
          <section className="panel">
            <h2>{t("errorBoundary.title")}</h2>
            <p>{t("errorBoundary.message")}</p>
            <button
              type="button"
              className="cta-primary"
              onClick={this.reset}
            >
              {t("errorBoundary.tryAgain")}
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryInner);
export default ErrorBoundary;
