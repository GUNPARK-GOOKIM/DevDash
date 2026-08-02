import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught DevDash React Error:', error, errorInfo);
  }

  private handleResetSession = () => {
    localStorage.removeItem('devdash_workspace_tabs');
    localStorage.removeItem('devdash_active_tab_id');
    localStorage.removeItem('devdash_show_welcome');
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#0F0F10] text-white p-6 font-sans">
          <div className="max-w-md w-full bg-[#18181B] border border-red-500/30 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto text-red-400 text-xl font-bold">
              ⚠️
            </div>
            <h1 className="text-lg font-bold text-white">DevDash Recoverable Exception</h1>
            <p className="text-xs text-zinc-400 font-mono bg-black/50 p-3 rounded-lg border border-white/5 overflow-x-auto text-left max-h-32">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-lg transition-colors"
              >
                Reload Window
              </button>
              <button
                onClick={this.handleResetSession}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold rounded-lg transition-colors"
              >
                Reset Session & Welcome
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
