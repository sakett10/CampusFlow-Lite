import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { Card } from '../components/ui/Card';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--cf-bg)] text-[var(--cf-text)] font-[family-name:var(--cf-font-sans)] selection:bg-[var(--cf-brand-subtle)] selection:text-[var(--cf-brand)]">
      <header className="sticky top-0 z-40 border-b border-[var(--cf-border-subtle)] bg-[var(--cf-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Home
          </Link>
          <span className="font-sans-display text-sm font-bold text-[var(--cf-text)]">CampusFlow</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-lg bg-[var(--cf-brand-subtle)] px-3 py-1 text-xs font-semibold text-[var(--cf-brand)] mb-3">
            <Shield className="h-3.5 w-3.5" /> Privacy Notice
          </div>
          <h1 className="font-sans-display text-3xl font-bold tracking-tight text-[var(--cf-text)] sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-[var(--cf-text-secondary)]">
            Last updated: September 2026 • CampusFlow V1
          </p>
        </div>

        <Card padding="lg" className="space-y-8 text-sm leading-relaxed text-[var(--cf-text)] border border-[var(--cf-border)]">
          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">1. Overview</h2>
            <p className="text-[var(--cf-text-secondary)]">
              CampusFlow is an academic organizer and verified campus notice hub designed for students. We believe in minimal data collection and transparent handling of your academic schedule and notifications.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">2. Information We Collect and Process</h2>
            <div className="space-y-2 text-[var(--cf-text-secondary)]">
              <p>
                <strong className="text-[var(--cf-text)]">Authentication & Profile:</strong> User account registration and authentication are powered by Clerk. We receive your unique user ID, name, and email address. We do not store raw passwords.
              </p>
              <p>
                <strong className="text-[var(--cf-text)]">Academic Records:</strong> Course schedules, attendance tallies, and assignment deadlines you enter are stored in a PostgreSQL database hosted on Neon. This data is strictly scoped to your user account and cannot be accessed by other students.
              </p>
              <p>
                <strong className="text-[var(--cf-text)]">Reviewer Gmail Ingestion:</strong> For designated institutional reviewers who connect a Gmail account, OAuth access tokens are encrypted at rest using AES-256-GCM. Only public campus announcements and event notices are parsed; student personal email is never published or exposed.
              </p>
              <p>
                <strong className="text-[var(--cf-text)]">AI Extraction:</strong> When reviewers process raw notice text, structured details (dates, venues, deadlines) are extracted using the Google Gemini API. This data is processed strictly for categorization into the campus notice board.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">3. Data Sharing & Third-Party Infrastructure</h2>
            <p className="text-[var(--cf-text-secondary)]">
              We never sell your personal data. We utilize reputable infrastructure providers strictly to deliver application services:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[var(--cf-text-secondary)]">
              <li><strong>Clerk:</strong> User identity, session authentication, and access control.</li>
              <li><strong>Neon:</strong> Managed, secure cloud PostgreSQL database with TLS encryption in transit.</li>
              <li><strong>Google Cloud & Gemini API:</strong> Optional reviewer notice parsing and token authorization.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">4. Data Control & Retention</h2>
            <p className="text-[var(--cf-text-secondary)]">
              You maintain control over your coursework data. You may delete individual assignments, courses, and custom notices directly from the application at any time. To permanently delete your account and all associated data, you can submit an account deletion request through your account settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">5. Security Measures</h2>
            <p className="text-[var(--cf-text-secondary)]">
              We enforce multi-tenant isolation at the database query level, authenticated API routes via JSON Web Tokens, AES-256-GCM token encryption, and strict Cross-Origin Resource Sharing (CORS) policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">6. Contact</h2>
            <p className="text-[var(--cf-text-secondary)]">
              For security disclosures, questions about this policy, or data privacy requests, please reach out via the official project repository or your institutional coordinator.
            </p>
          </section>
        </Card>
      </main>
    </div>
  );
}
