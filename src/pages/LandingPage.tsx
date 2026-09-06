import { Link } from 'react-router-dom';
import { Sparkles, BookOpen, CheckSquare, Radio, ArrowRight, Brain, Mail } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import CampusItemCard from '../components/CampusItemCard';
import type { CampusItem } from '../lib/types';
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react';

const SAMPLE_NOTICE_PREVIEW: CampusItem = {
  id: 'preview-notice-1',
  title: 'Annual HackNITR 2026',
  type: 'HACKATHON',
  description: 'Join over 1,200 builders for a 36-hour hackathon focused on AI and decentralized applications. Free food, mentors, and prize pool.',
  date: '2026-04-15',
  startTime: '18:00',
  endTime: null,
  registrationDeadline: '2026-04-10',
  venue: 'Main Auditorium & CS Hall',
  eligibility: 'All college undergraduates',
  organizer: 'Tech & Coding Club',
  importantActions: ['Register teams of 2-4 members', 'Submit GitHub handles'],
  sourceText: ''
};

export default function LandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--cf-bg)] text-[var(--cf-text)] font-sans selection:bg-[var(--cf-brand-subtle)] selection:text-[var(--cf-brand)] overflow-x-hidden">
      
      {/* 1. NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-[var(--cf-border-subtle)] bg-[var(--cf-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/30 text-[var(--cf-brand)] font-extrabold text-sm shadow-sm">
              CF
            </div>
            <span className="font-sans-display text-lg font-bold tracking-tight text-[var(--cf-text)] hidden min-[360px]:inline">
              CampusFlow
            </span>
          </div>
          
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">Features</a>
            <a href="#how-it-works" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">How it works</a>
            <a href="#intelligence" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">Notice Extraction</a>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isSignedIn ? (
              <Link to="/dashboard" tabIndex={-1}>
                <Button variant="primary" size="sm">Open Dashboard</Button>
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="secondary" size="sm">Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="primary" size="sm">Sign Up</Button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        {/* 2. HERO */}
        <section className="relative px-4 pt-20 pb-16 text-center lg:pt-28 lg:pb-24">
          <div className="mx-auto max-w-4xl space-y-6">
            <Badge variant="brand" className="mb-2 inline-flex gap-1.5 px-3 py-1 text-xs font-semibold">
              <BookOpen className="w-3.5 h-3.5" /> Student Academic Workspace
            </Badge>

            <h1 className="font-sans-display text-4xl leading-[1.12] font-bold tracking-tight text-[var(--cf-text)] sm:text-5xl lg:text-6xl">
              Keep your coursework, attendance, and <span className="text-[var(--cf-brand)]">campus notices</span> in sync.
            </h1>

            <p className="mx-auto max-w-2xl font-reading text-base leading-relaxed text-[var(--cf-text-secondary)] sm:text-lg">
              CampusFlow organizes course requirements, attendance thresholds, and verified campus announcements so you never miss an academic deadline.
            </p>
            
            <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
              {isSignedIn ? (
                <Link to="/dashboard" tabIndex={-1} className="w-full sm:w-auto">
                  <Button size="lg" className="w-full justify-center">Open Dashboard</Button>
                </Link>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg" className="w-full justify-center">Get Started Free</Button>
                </SignUpButton>
              )}
              <Link to="/notices" tabIndex={-1} className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full justify-center">Browse Notices</Button>
              </Link>
            </div>

            {/* Value Props Bar */}
            <div className="pt-10 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold text-[var(--cf-text-secondary)]">
              <span className="flex items-center gap-1.5"><CheckSquare className="h-4 w-4 text-[var(--cf-success)]" /> Course & Task Tracking</span>
              <span className="flex items-center gap-1.5"><Radio className="h-4 w-4 text-[var(--cf-brand)]" /> Verified Notice Board</span>
              <span className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[var(--cf-ai)]" /> Structured Notice Extraction</span>
              <span className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-[var(--cf-warning)]" /> Institutional Reviewer Ingestion</span>
            </div>
          </div>
        </section>

        {/* 3. BENTO GRID FEATURES */}
        <section id="features" className="bg-[var(--cf-surface)] py-20 px-4 border-y border-[var(--cf-border)]">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-14">
              <h2 className="font-sans-display text-3xl font-bold tracking-tight text-[var(--cf-text)] mb-3">
                Built for Real Student Workflows
              </h2>
              <p className="font-reading text-base text-[var(--cf-text-secondary)] max-w-xl mx-auto">
                Replace cluttered group chats and buried university emails with a single, calm academic workspace.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card padding="lg" className="flex flex-col border-[var(--cf-border)] bg-[var(--cf-bg)] transition-all hover:border-[var(--cf-border-strong)] hover:shadow-[var(--cf-elev-2)]">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h3 className="font-sans-display text-base font-bold mb-2 text-[var(--cf-text)]">Academic & Attendance Tracking</h3>
                <p className="font-reading text-sm text-[var(--cf-text-secondary)] leading-relaxed mb-4 flex-1">
                  Keep real-time tabs on your course credits, classes attended, and calculated attendances needed to stay above your institution's 75% threshold.
                </p>
                <div className="border-t border-[var(--cf-border-subtle)] pt-3 flex gap-2">
                  <Badge variant="brand">Attendance</Badge>
                  <Badge variant="success">Threshold Alerts</Badge>
                </div>
              </Card>

              <Card padding="lg" className="flex flex-col border-[var(--cf-border)] bg-[var(--cf-bg)] transition-all hover:border-[var(--cf-border-strong)] hover:shadow-[var(--cf-elev-2)]">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cf-success-subtle)] text-[var(--cf-success)] border border-[var(--cf-success-border)]">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <h3 className="font-sans-display text-base font-bold mb-2 text-[var(--cf-text)]">Assignment Due Dates</h3>
                <p className="font-reading text-sm text-[var(--cf-text-secondary)] leading-relaxed mb-4 flex-1">
                  Automatic deadline sorting with overdue indicators, urgency alerts for items due soon, and quick status cycling.
                </p>
                <div className="border-t border-[var(--cf-border-subtle)] pt-3 flex gap-2">
                  <Badge variant="warning">Deadlines</Badge>
                  <Badge variant="neutral">Task Status</Badge>
                </div>
              </Card>

              <Card padding="lg" className="flex flex-col border-[var(--cf-ai-border)] bg-[var(--cf-ai-subtle)]/20 transition-all hover:border-[var(--cf-ai)]/40 hover:shadow-sm">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--cf-ai-subtle)] text-[var(--cf-ai)] border border-[var(--cf-ai-border)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h3 className="font-sans-display text-base font-bold mb-2 text-[var(--cf-text)]">Structured Notice Extraction</h3>
                <p className="font-reading text-sm text-[var(--cf-text-secondary)] leading-relaxed mb-4 flex-1">
                  Extract dates, registration deadlines, venues, and required action items from raw campus circulars automatically.
                </p>
                <div className="border-t border-[var(--cf-ai-border)] pt-3 flex gap-2">
                  <Badge variant="ai">AI Extraction</Badge>
                  <Badge variant="brand">Verified Hub</Badge>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* 4. HOW IT WORKS */}
        <section id="how-it-works" className="py-20 px-4">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-sans-display text-3xl font-bold tracking-tight mb-14 text-center text-[var(--cf-text)]">
              How CampusFlow Works
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-[var(--cf-surface)] border border-[var(--cf-border)] shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20 flex items-center justify-center mb-4 font-mono-meta font-bold text-base">01</div>
                <h3 className="font-sans-display text-base font-bold mb-2 text-[var(--cf-text)]">Enrol Courses</h3>
                <p className="font-reading text-sm text-[var(--cf-text-secondary)] leading-relaxed">Enter your semester courses and log attendance with simple daily check-ins.</p>
              </div>

              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-[var(--cf-surface)] border border-[var(--cf-border)] shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20 flex items-center justify-center mb-4 font-mono-meta font-bold text-base">02</div>
                <h3 className="font-sans-display text-base font-bold mb-2 text-[var(--cf-text)]">Track Assignments</h3>
                <p className="font-reading text-sm text-[var(--cf-text-secondary)] leading-relaxed">Manage deliverables, set deadlines, and monitor completion progress per course.</p>
              </div>

              <div className="flex flex-col items-center text-center p-6 rounded-2xl bg-[var(--cf-surface)] border border-[var(--cf-border)] shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20 flex items-center justify-center mb-4 font-mono-meta font-bold text-base">03</div>
                <h3 className="font-sans-display text-base font-bold mb-2 text-[var(--cf-text)]">Stay Informed</h3>
                <p className="font-reading text-sm text-[var(--cf-text-secondary)] leading-relaxed">Review verified campus notices, hackathons, and registration deadlines in one feed.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. INTERACTIVE INTELLIGENCE SHOWCASE */}
        <section id="intelligence" className="bg-[var(--cf-surface-muted)] py-20 px-4 border-y border-[var(--cf-border)]">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="flex-1 space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--cf-ai-subtle)] text-[var(--cf-ai)] text-xs font-bold uppercase border border-[var(--cf-ai-border)]">
                  <Brain className="w-3.5 h-3.5" /> Structured Extraction
                </div>
                <h2 className="font-sans-display text-3xl md:text-4xl font-bold tracking-tight text-[var(--cf-text)]">
                  Turn unstructured circulars into clean, actionable records.
                </h2>
                <p className="font-reading text-base text-[var(--cf-text-secondary)] leading-relaxed">
                  Campus notices often come in dense emails or forwarded text. CampusFlow extracts the title, organizer, dates, venue, and action items into a clean notice card.
                </p>
                <div className="pt-2">
                  <Link to="/notices">
                    <Button variant="secondary" rightIcon={<ArrowRight className="w-4 h-4" />}>Browse Notice Board</Button>
                  </Link>
                </div>
              </div>
              
              <div className="flex-1 w-full bg-[var(--cf-surface)] p-6 rounded-2xl shadow-[var(--cf-elev-2)] border border-[var(--cf-border)] relative">
                <div className="text-xs font-reading text-[var(--cf-text-secondary)] mb-4 italic p-4 bg-[var(--cf-surface-muted)] rounded-xl border border-[var(--cf-border-subtle)] line-clamp-3">
                  "Notice: Annual HackNITR 2026 is scheduled for April 15 at Main Aud & CS Hall. Registration closes April 10. Open to all undergraduates. Teams of 2-4 members..."
                </div>
                <div className="flex justify-center mb-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--cf-surface-muted)] border border-[var(--cf-border)] flex items-center justify-center text-[var(--cf-text-secondary)]">
                    <ArrowRight className="w-4 h-4 rotate-90 lg:rotate-0" />
                  </div>
                </div>
                <div className="pointer-events-none">
                  <CampusItemCard item={SAMPLE_NOTICE_PREVIEW} canDelete={false} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 6. FINAL CTA */}
        <section className="py-24 px-4 text-center">
          <div className="mx-auto max-w-2xl space-y-6">
            <h2 className="font-sans-display text-3xl sm:text-4xl font-bold tracking-tight text-[var(--cf-text)]">
              Take control of your academic schedule.
            </h2>
            <p className="text-sm text-[var(--cf-text-secondary)]">
              Keep your courses, attendance thresholds, and campus notices organized in one place.
            </p>
            <div className="pt-2">
              {isSignedIn ? (
                <Link to="/dashboard">
                  <Button size="lg">Open Dashboard</Button>
                </Link>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg">Get Started for Free</Button>
                </SignUpButton>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 7. FOOTER */}
      <footer className="bg-[var(--cf-surface)] border-t border-[var(--cf-border)] py-10 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <span className="font-sans-display text-base font-bold tracking-tight text-[var(--cf-brand)]">CampusFlow</span>
            <span className="text-[var(--cf-text-tertiary)] text-xs">Student academic workspace and verified campus notice hub.</span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-5 text-xs font-semibold text-[var(--cf-text-secondary)]">
            <Link to="/dashboard" className="hover:text-[var(--cf-text)] transition-colors">Dashboard</Link>
            <Link to="/courses" className="hover:text-[var(--cf-text)] transition-colors">Courses</Link>
            <Link to="/assignments" className="hover:text-[var(--cf-text)] transition-colors">Assignments</Link>
            <Link to="/notices" className="hover:text-[var(--cf-text)] transition-colors">Notices</Link>
            <Link to="/privacy" className="hover:text-[var(--cf-text)] transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-[var(--cf-text)] transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
