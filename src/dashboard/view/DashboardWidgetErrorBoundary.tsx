import { Component, type ErrorInfo, type ReactNode } from "react";

interface DashboardWidgetErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
}

interface DashboardWidgetErrorBoundaryState {
  failed: boolean;
}

export class DashboardWidgetErrorBoundary extends Component<
  DashboardWidgetErrorBoundaryProps,
  DashboardWidgetErrorBoundaryState
> {
  state: DashboardWidgetErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): DashboardWidgetErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[dashboard-widget]", error, info.componentStack);
  }

  componentDidUpdate(previousProps: DashboardWidgetErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
