import { Component, type ReactNode } from "react";
import { Globe2, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class GlobeErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
          <Globe2 className="h-12 w-12 text-primary opacity-60" />
          <div className="space-y-1">
            <p className="text-sm font-bold uppercase tracking-widest text-primary">
              Earth View unavailable
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              The 3D globe could not start on this device. Try refreshing or opening on desktop.
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-bold uppercase text-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
