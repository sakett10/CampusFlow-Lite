import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ArrowLeft, Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[var(--cf-bg)] text-[var(--cf-text)] font-[family-name:var(--cf-font-sans)] flex flex-col justify-center items-center px-4 py-16 selection:bg-[var(--cf-brand-subtle)] selection:text-[var(--cf-brand)]">
      <Card padding="lg" className="max-w-md w-full text-center border border-[var(--cf-border)] shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] font-mono text-base font-bold">
          404
        </div>
        <h1 className="font-sans-display text-[length:var(--cf-text-title-size)] font-bold tracking-tight text-[var(--cf-text)]">
          Page Not Found
        </h1>
        <p className="mt-2 text-sm text-[var(--cf-text-secondary)] leading-relaxed">
          The page you requested does not exist or may have been moved.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/dashboard" className="w-full sm:w-auto">
            <Button variant="primary" size="md" className="w-full justify-center" leftIcon={<Home className="h-4 w-4" />}>
              Dashboard
            </Button>
          </Link>
          <Link to="/notices" className="w-full sm:w-auto">
            <Button variant="secondary" size="md" className="w-full justify-center" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Campus Notices
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
