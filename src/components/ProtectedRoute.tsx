import { useAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--cf-brand)]" />
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
