import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Courses = lazy(() => import('./pages/Courses'));
const Assignments = lazy(() => import('./pages/Assignments'));
const NoticeBoard = lazy(() => import('./pages/NoticeBoard'));
const CampusItemDetail = lazy(() => import('./pages/CampusItemDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageFallback() {
  return (
    <div className="flex h-64 w-full items-center justify-center" aria-label="Loading page">
      <Loader2 className="h-7 w-7 animate-spin text-[var(--cf-brand)]" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

          {/* Authenticated workspace */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/assignments" element={<Assignments />} />
            <Route path="/tasks" element={<Navigate to="/assignments" replace />} />

            {/* Canonical Notice Board */}
            <Route path="/notices" element={<NoticeBoard />} />
            <Route path="/notices/:id" element={<CampusItemDetail />} />

            {/* Backwards compatibility redirects & deep-links */}
            <Route path="/feed" element={<Navigate to="/notices" replace />} />
            <Route path="/notice-board" element={<Navigate to="/notices" replace />} />
            <Route path="/campus-feed" element={<Navigate to="/notices" replace />} />
            <Route path="/campus-feed/:id" element={<CampusItemDetail />} />

            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Catch-all 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

