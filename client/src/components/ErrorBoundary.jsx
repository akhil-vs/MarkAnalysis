import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-6">
        <p className="text-clay-600" role="alert">
          Something went wrong on this page.
        </p>
        <button
          type="button"
          className="btn-ghost mt-3"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
