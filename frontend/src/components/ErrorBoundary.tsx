import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary — a rendering bug shows a friendly recovery
 * screen instead of a blank white page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary glass">
          <span className="msym error-boundary-icon" aria-hidden="true">
            sentiment_dissatisfied
          </span>
          <h2>Something went wrong</h2>
          <p className="muted">
            The page hit an unexpected error. Your saved data in MongoDB is
            safe — reload to continue.
          </p>
          <pre className="error-boundary-detail">{this.state.error.message}</pre>
          <div className="row gap-12" style={{ justifyContent: "center" }}>
            <button
              className="btn btn-outline"
              onClick={() => this.setState({ error: null })}
            >
              <span className="msym" aria-hidden="true">refresh</span>
              Try again
            </button>
            <button
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <span className="msym" aria-hidden="true">restart_alt</span>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
