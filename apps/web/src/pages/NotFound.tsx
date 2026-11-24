import { Link } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-100 text-accent-600 dark:bg-accent-500/15 dark:text-accent-400">
          <Compass className="h-7 w-7" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-accent-600">
          Error 404
        </span>
        <h1 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          The page you are looking for doesn’t exist or has been moved.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/login/student">
            <Button variant="primary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back to CampusBite
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

export default NotFound;
