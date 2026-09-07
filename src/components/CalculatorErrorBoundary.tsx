import { Component, type ReactNode } from "react";

export default class CalculatorErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <div role="alert" className="space-y-4 text-center">
          <p>
            計算画面を読み込めませんでした。ページを再読み込みしてください。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          >
            再読み込み
          </button>
        </div>
      );
    return this.props.children;
  }
}
