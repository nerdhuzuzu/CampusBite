import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected UI error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
          <Card className="max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {this.state.message}
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                variant="primary"
                leftIcon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  this.setState({ hasError: false, message: '' });
                  window.location.reload();
                }}
              >
                Reload Application
              </Button>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
