import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { Card } from '../components/ui/Card';

export default function TermsPage() {
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
          <div className="inline-flex items-center gap-2 rounded-lg bg-[var(--cf-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--cf-text-secondary)] mb-3">
            <FileText className="h-3.5 w-3.5" /> Legal Terms
          </div>
          <h1 className="font-sans-display text-3xl font-bold tracking-tight text-[var(--cf-text)] sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-[var(--cf-text-secondary)]">
            Last updated: September 2026 • CampusFlow V1
          </p>
        </div>

        <Card padding="lg" className="space-y-8 text-sm leading-relaxed text-[var(--cf-text)] border border-[var(--cf-border)]">
          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">1. Acceptance of Terms</h2>
            <p className="text-[var(--cf-text-secondary)]">
              By accessing or using CampusFlow, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">2. Purpose of CampusFlow</h2>
            <p className="text-[var(--cf-text-secondary)]">
              CampusFlow is an academic productivity companion designed to assist individual students in tracking coursework, attendance percentages, assignment deadlines, and campus notice updates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">3. Academic Responsibility Disclaimer</h2>
            <p className="text-[var(--cf-text-secondary)]">
              CampusFlow serves as an organizational aid. You remain solely responsible for ensuring the accuracy of your academic deadlines, attendance requirements, examination schedules, and institution-specific policies. CampusFlow is not an official university registrar or institutional grading portal.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">4. Acceptable Use</h2>
            <p className="text-[var(--cf-text-secondary)]">
              You agree to use CampusFlow solely for lawful academic and personal productivity purposes. You may not attempt to reverse engineer, disrupt API endpoints, bypass role authorization checks, or publish misleading campus notices.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">5. Modifications and Availability</h2>
            <p className="text-[var(--cf-text-secondary)]">
              We reserve the right to modify or discontinue features in CampusFlow V1 as development progresses. We strive for maximum uptime and data integrity, but do not guarantee uninterrupted availability.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">6. Contact</h2>
            <p className="text-[var(--cf-text-secondary)]">
              Questions regarding these Terms of Service can be directed to the repository maintainers or administrative team.
            </p>
          </section>
        </Card>
      </main>
    </div>
  );
}
