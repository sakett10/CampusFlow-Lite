import { Link } from 'react-router-dom';
import { Sparkles, BookOpen, CheckSquare, Radio, ArrowRight, Brain } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import CampusItemCard from '../components/CampusItemCard';
import type { CampusItem } from '../lib/types';
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react';

const MOCK_ITEM: CampusItem = {
  id: 'mock-1',
  title: 'Spring Hackathon 2026',
  type: 'HACKATHON',
  description: 'Join us for a 48-hour coding marathon to build the future of campus technology. Free food and prizes!',
  date: '2026-04-15',
  startTime: '18:00',
  endTime: null,
  registrationDeadline: '2026-04-10',
  venue: 'Main Tech Center',
  eligibility: 'All students',
  organizer: 'Computer Science Society',
  importantActions: ['Register teams of 3-4', 'Bring student ID'],
  sourceText: ''
};

export default function LandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--cf-bg)] text-[var(--cf-text)] font-[family-name:var(--cf-font-sans)] selection:bg-[var(--cf-brand-subtle)] overflow-x-hidden">
      
      {/* 1. NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-[var(--cf-border)] bg-[var(--cf-surface)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--cf-text-title-size)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-brand)]">
              CampusFlow
            </span>
          </div>
          
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-[length:var(--cf-text-body-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">Features</a>
            <a href="#how-it-works" className="text-[length:var(--cf-text-body-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">How it works</a>
            <a href="#intelligence" className="text-[length:var(--cf-text-body-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">Campus Intelligence</a>
          </div>

          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <Link to="/dashboard" tabIndex={-1}>
                <Button variant="primary">Open CampusFlow</Button>
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="secondary">Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="primary">Sign Up</Button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="cf-animate-enter">
        {/* 2. HERO */}
        <section className="relative px-4 pt-24 pb-20 text-center lg:pt-32 lg:pb-28">
          <div className="mx-auto max-w-4xl space-y-6">
            <Badge variant="brand" className="mb-4 inline-flex cf-animate-scale-in delay-150">Now in open beta</Badge>
            <h1 className="text-4xl leading-[1.1] font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)] md:text-5xl lg:text-7xl">
              Academic <span className="text-[var(--cf-brand)]">tracking</span> and campus <span className="text-[var(--cf-ai)]">opportunities</span> in one place.
            </h1>
            <p className="mx-auto max-w-2xl text-[length:var(--cf-text-subtitle-size)] leading-[var(--cf-text-subtitle-line)] text-[var(--cf-text-secondary)] md:text-xl">
              CampusFlow helps students manage academics and discover campus opportunities seamlessly. Built for the modern student experience.
            </p>
            
            <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
              {isSignedIn ? (
                <Link to="/dashboard" tabIndex={-1} className="w-full sm:w-auto">
                  <Button size="lg" className="w-full justify-center shadow-[var(--cf-elev-2)]">Open CampusFlow</Button>
                </Link>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg" className="w-full justify-center shadow-[var(--cf-elev-2)]">Get Started for Free</Button>
                </SignUpButton>
              )}
              <Link to="/campus-feed" tabIndex={-1} className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full justify-center">Explore Campus Feed</Button>
              </Link>
            </div>

            <div className="pt-12 flex flex-wrap items-center justify-center gap-6 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)]">
              <span className="flex items-center gap-2"><CheckSquare className="h-5 w-5 text-[var(--cf-success)]" /> Academic tracking</span>
              <span className="flex items-center gap-2"><Radio className="h-5 w-5 text-[var(--cf-brand)]" /> Campus opportunities</span>
              <span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--cf-ai)]" /> AI notice analysis</span>
            </div>
          </div>
        </section>

        {/* 3. PRODUCT PREVIEW & 4. FEATURES */}
        <section id="features" className="bg-[var(--cf-surface)] py-20 px-4 border-y border-[var(--cf-border)]">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-[number:var(--cf-text-display-weight)] tracking-tight mb-4">Everything you need to succeed</h2>
              <p className="text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)] max-w-2xl mx-auto">
                Stop jumping between five different portals. We brought it all together.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card padding="lg" className="flex flex-col border-[var(--cf-border)] shadow-[var(--cf-elev-1)]">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--cf-radius-lg)] bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)]">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Academic Tracking</h3>
                <p className="text-[var(--cf-text-secondary)] mb-6 flex-1">
                  Monitor your courses, attendance percentages, and get immediate alerts when your attendance drops below the required threshold.
                </p>
                <div className="mt-auto border-t border-[var(--cf-border)] pt-4 flex gap-2">
                  <Badge variant="success">Courses</Badge>
                  <Badge variant="info">Attendance</Badge>
                  <Badge variant="danger">Risk alerts</Badge>
                </div>
              </Card>

              <Card padding="lg" className="flex flex-col border-[var(--cf-border)] shadow-[var(--cf-elev-1)]">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--cf-radius-lg)] bg-[var(--cf-success-subtle)] text-[var(--cf-success)]">
                  <CheckSquare className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Assignment Management</h3>
                <p className="text-[var(--cf-text-secondary)] mb-6 flex-1">
                  Keep track of all assignments across courses. Automatically detect overdue tasks and prioritize upcoming deadlines.
                </p>
                <div className="mt-auto border-t border-[var(--cf-border)] pt-4 flex gap-2">
                  <Badge variant="success">Deadlines</Badge>
                  <Badge variant="info">Status</Badge>
                  <Badge variant="danger">Overdue detection</Badge>
                </div>
              </Card>

              <Card padding="lg" className="flex flex-col border-[var(--cf-border)] shadow-[var(--cf-elev-1)]">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--cf-radius-lg)] bg-[var(--cf-warning-subtle)] text-[var(--cf-warning)]">
                  <Radio className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Campus Feed</h3>
                <p className="text-[var(--cf-text-secondary)] mb-6 flex-1">
                  Discover hackathons, workshops, and announcements. A unified feed of all the opportunities happening on your campus.
                </p>
                <div className="mt-auto border-t border-[var(--cf-border)] pt-4 flex gap-2 flex-wrap">
                  <Badge variant="brand">Hackathons</Badge>
                  <Badge variant="brand">Workshops</Badge>
                  <Badge variant="neutral">Events</Badge>
                </div>
              </Card>

              <Card padding="lg" className="flex flex-col border-[var(--cf-ai)]/30 bg-[var(--cf-ai-subtle)]/30 shadow-[var(--cf-elev-1)]">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--cf-radius-lg)] bg-[var(--cf-ai)]/15 text-[var(--cf-ai)]">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">Campus Intelligence</h3>
                <p className="text-[var(--cf-text-secondary)] mb-6 flex-1">
                  Transform messy campus emails or WhatsApp messages into structured items. We automatically extract dates, venues, and registration deadlines.
                </p>
                <div className="mt-auto border-t border-[var(--cf-border)] pt-4 flex gap-2 flex-wrap">
                  <Badge variant="neutral">Extraction</Badge>
                  <Badge variant="neutral">Structuring</Badge>
                  <Badge variant="brand">AI Powered</Badge>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* 5. HOW IT WORKS */}
        <section id="how-it-works" className="py-24 px-4">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-[number:var(--cf-text-display-weight)] tracking-tight mb-16 text-center">How CampusFlow works</h2>
            
            <div className="flex flex-col lg:flex-row justify-between gap-8 relative">
              {/* Desktop connecting line */}
              <div className="hidden lg:block absolute top-12 left-24 right-24 h-0.5 bg-[var(--cf-border)] -z-10"></div>
              
              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-24 h-24 rounded-full bg-[var(--cf-surface)] border-4 border-[var(--cf-bg)] shadow-[var(--cf-elev-2)] flex items-center justify-center mb-6 text-2xl font-bold text-[var(--cf-brand)]">01</div>
                <h3 className="text-xl font-bold mb-2">Track your academics</h3>
                <p className="text-[var(--cf-text-secondary)] px-4">Add your courses and track attendance to ensure you meet requirements.</p>
              </div>

              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-24 h-24 rounded-full bg-[var(--cf-surface)] border-4 border-[var(--cf-bg)] shadow-[var(--cf-elev-2)] flex items-center justify-center mb-6 text-2xl font-bold text-[var(--cf-brand)]">02</div>
                <h3 className="text-xl font-bold mb-2">Discover opportunities</h3>
                <p className="text-[var(--cf-text-secondary)] px-4">Check the Campus Feed to find relevant events, hackathons, and deadlines.</p>
              </div>

              <div className="flex flex-col items-center text-center flex-1">
                <div className="w-24 h-24 rounded-full bg-[var(--cf-surface)] border-4 border-[var(--cf-bg)] shadow-[var(--cf-elev-2)] flex items-center justify-center mb-6 text-2xl font-bold text-[var(--cf-brand)]">03</div>
                <h3 className="text-xl font-bold mb-2">Let AI organize it</h3>
                <p className="text-[var(--cf-text-secondary)] px-4">Use Campus Intelligence to extract details from messy notices automatically.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. CAMPUS INTELLIGENCE SECTION */}
        <section id="intelligence" className="bg-[var(--cf-surface-muted)] py-24 px-4 border-y border-[var(--cf-border)]">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="flex-1 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--cf-ai-subtle)] text-[var(--cf-ai)] text-sm font-bold tracking-wide uppercase border border-[var(--cf-ai)]/20">
                  <Brain className="w-4 h-4" /> Feature Highlight
                </div>
                <h2 className="text-3xl md:text-4xl font-[number:var(--cf-text-display-weight)] tracking-tight">
                  Stop reading walls of text. Let AI do it.
                </h2>
                <p className="text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)]">
                  Got a messy WhatsApp forward or a huge email about an upcoming event? Just paste it in. Campus Intelligence extracts the what, when, where, and how in seconds.
                </p>
                <Link to="/dashboard" className="inline-block mt-4">
                  <Button variant="ai" size="lg" rightIcon={<ArrowRight className="w-4 h-4" />}>Try it now</Button>
                </Link>
              </div>
              
              <div className="flex-1 w-full bg-[var(--cf-surface)] p-6 rounded-[var(--cf-radius-xl)] shadow-[var(--cf-elev-2)] border border-[var(--cf-border)] relative">
                <div className="absolute -top-4 -left-4 bg-[var(--cf-ai)] text-white px-4 py-2 rounded-full shadow-[var(--cf-elev-1)] font-bold flex items-center gap-2 transform -rotate-2 z-10">
                  <Sparkles className="w-4 h-4" /> Magic
                </div>
                <div className="text-sm font-mono text-[var(--cf-text-tertiary)] mb-4 italic p-4 bg-[var(--cf-bg)] rounded-[var(--cf-radius-md)] border border-[var(--cf-border-strong)]/30 line-clamp-3">
                  "Hey everyone! We are hosting the Spring Hackathon 2026 at the Main Tech Center. It starts at 6pm on April 15. You MUST register by April 10 in teams of 3-4..."
                </div>
                <div className="flex justify-center mb-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--cf-ai-subtle)] flex items-center justify-center text-[var(--cf-ai)]">
                    <ArrowRight className="w-4 h-4 rotate-90 lg:rotate-0" />
                  </div>
                </div>
                <div className="pointer-events-none">
                  <CampusItemCard item={MOCK_ITEM} onDelete={() => {}} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FINAL CTA */}
        <section className="py-32 px-4 text-center">
          <div className="mx-auto max-w-2xl space-y-8">
            <h2 className="text-4xl font-[number:var(--cf-text-display-weight)] tracking-tight text-[var(--cf-text)]">
              Your campus is full of opportunities.<br/>Don't miss them.
            </h2>
            {isSignedIn ? (
              <Link to="/dashboard" className="inline-block">
                <Button size="lg" className="px-12 shadow-[var(--cf-elev-2)] hover:scale-105 transition-transform duration-[var(--cf-transition-normal)]">Open CampusFlow</Button>
              </Link>
            ) : (
              <SignUpButton mode="modal">
                <Button size="lg" className="px-12 shadow-[var(--cf-elev-2)] hover:scale-105 transition-transform duration-[var(--cf-transition-normal)]">Get Started</Button>
              </SignUpButton>
            )}
          </div>
        </section>
      </main>

      {/* 8. FOOTER */}
      <footer className="bg-[var(--cf-surface)] border-t border-[var(--cf-border)] py-12 px-4">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <span className="text-xl font-bold tracking-tight text-[var(--cf-brand)]">CampusFlow</span>
            <span className="text-[var(--cf-text-tertiary)] text-sm">Academic tracking and campus opportunities.</span>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text-secondary)]">
            <Link to="/dashboard" className="hover:text-[var(--cf-brand)] transition-colors">Dashboard</Link>
            <Link to="/campus-feed" className="hover:text-[var(--cf-brand)] transition-colors">Campus Feed</Link>
            <Link to="/courses" className="hover:text-[var(--cf-brand)] transition-colors">Courses</Link>
            <Link to="/assignments" className="hover:text-[var(--cf-brand)] transition-colors">Assignments</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
