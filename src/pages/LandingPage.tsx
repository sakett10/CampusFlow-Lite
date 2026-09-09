import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Calendar,
  Mail,
  Sparkles,
  ShieldCheck,
  Bell,
  CheckSquare,
  Inbox
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react';

export default function LandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--cf-bg)] text-[var(--cf-text)] font-sans selection:bg-slate-200 selection:text-slate-900 overflow-x-hidden">

      {/* 1. NAVBAR */}
      <nav className="sticky top-0 z-50 border-b border-[var(--cf-border)] bg-[var(--cf-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cf-brand)] text-white font-bold text-sm tracking-wider shadow-sm">
              CF
            </div>
            <span className="font-sans text-lg font-bold tracking-tight text-[var(--cf-text)]">
              CampusFlow
            </span>
          </div>

          <div className="hidden items-center gap-6 md:flex">
            <a href="#workflow" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">
              The Workflow
            </a>
            <a href="#command-center" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">
              Command Center
            </a>
            <a href="#privacy" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">
              Privacy &amp; Security
            </a>
            <Link to="/notices" className="text-xs font-semibold text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] transition-colors">
              Notices
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isSignedIn ? (
              <Link to="/dashboard">
                <Button variant="primary" size="sm">Open Home</Button>
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="secondary" size="sm">Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="primary" size="sm">Get Started</Button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </nav>

      <main>
        {/* 2. HERO SECTION */}
        <section className="relative px-4 pt-16 pb-16 text-center lg:pt-24 lg:pb-20">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700">
              <Sparkles className="w-3.5 h-3.5 text-slate-500" />
              <span>Campus Deadline &amp; Task Intelligence</span>
            </div>

            <h1 className="font-sans text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.12]">
              Turn scattered college updates into <span className="text-slate-900 underline decoration-slate-300 decoration-2 underline-offset-8">tasks you finish.</span>
            </h1>

            <p className="mx-auto max-w-2xl text-base sm:text-lg leading-relaxed text-slate-600 font-normal">
              CampusFlow connects your academic emails and campus announcements directly to an organized task and reminder workflow — so critical deadlines never get lost in your inbox.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              {isSignedIn ? (
                <Link to="/dashboard" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full justify-center px-6">
                    Open Command Center
                  </Button>
                </Link>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg" className="w-full justify-center px-6">
                    Get Started Free
                  </Button>
                </SignUpButton>
              )}
              <Link to="/notices" className="w-full sm:w-auto">
                <Button variant="secondary" size="lg" className="w-full justify-center">
                  Browse Notice Feed
                </Button>
              </Link>
            </div>

            {/* Factual Feature Signals */}
            <div className="pt-10 flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-slate-500">
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-slate-700" /> Official Gmail Sync (`gmail.readonly`)
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-slate-700" /> Automated Deadline Detection
              </span>
              <span className="flex items-center gap-1.5">
                <CheckSquare className="h-4 w-4 text-slate-700" /> 1-Click Notice to Task
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-slate-700" /> Strict Multi-User Isolation
              </span>
            </div>
          </div>
        </section>

        {/* 3. THE 4-STEP PRODUCT WORKFLOW */}
        <section id="workflow" className="py-20 px-4 border-y border-[var(--cf-border)] bg-[var(--cf-surface)]">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-16 space-y-3">
              <h2 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                The Product Workflow
              </h2>
              <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
                A calm, linear architecture designed to move academic noise into completed work.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Step 1 */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold text-slate-400">01</span>
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                      <Inbox className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-900 mb-2">College Information</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Official campus notices and verified academic emails are ingested directly through read-only Gmail sync or campus feeds.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500">
                  No copy-pasting required
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold text-slate-400">02</span>
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-900 mb-2">Understanding</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Deadlines, dates, times, venues, and actionable requirements are automatically extracted from dense circular text.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500">
                  Highlighted dates &amp; actions
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold text-slate-400">03</span>
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                      <CheckSquare className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-900 mb-2">Task Creation</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Convert any notice into a structured task with one click. Pre-populates due dates, priority, and links back to the source notice.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500">
                  1-Click Add to Tasks
                </div>
              </div>

              {/* Step 4 */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-xs font-bold text-slate-400">04</span>
                    <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                      <Bell className="w-4 h-4" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm text-slate-900 mb-2">Reminder &amp; Completion</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Timely reminders trigger before deadlines. Check off items directly on your daily command center as you finish them.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] font-medium text-slate-500">
                  Reliable delivery trigger
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. VISUAL DEMO: NOTICE TO TASK IN ACTION */}
        <section className="py-20 px-4">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-14 space-y-3">
              <Badge variant="neutral" className="px-3 py-1 font-semibold text-xs">
                CONCRETE DEMONSTRATION
              </Badge>
              <h2 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Notice to Task in 1 Click
              </h2>
              <p className="text-sm text-slate-600 max-w-lg mx-auto">
                See how a dense department email converts immediately into an actionable task with intelligent defaults.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              {/* Left: Raw Campus Notice */}
              <div className="p-5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-xs">Academic Notice</Badge>
                    <span className="text-xs text-slate-400">Dean of Academics</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">Received Today</span>
                </div>

                <div>
                  <h4 className="font-bold text-sm text-slate-900 mb-1">
                    Mid-Semester Project Proposal Submission &amp; Presentation Schedule
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    All students registered in final-year and 3rd-year capstone tracks must submit their project proposal documentation via the departmental portal no later than Friday at 11:59 PM. Late submissions will incur a 10% penalty.
                  </p>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="text-xs font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> Extracted Deadline
                  </div>
                  <div className="text-xs text-amber-800">
                    Deadline: <strong>Friday, 11:59 PM</strong> &bull; Action: <strong>Submit project proposal documentation</strong>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs">
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Add to Tasks</span>
                  </div>
                </div>
              </div>

              {/* Right: Converted Task Result */}
              <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="brand" className="text-xs">Actionable Task</Badge>
                    <span className="text-xs font-medium text-slate-500">Added to Today's Checklist</span>
                  </div>
                  <Badge variant="warning" className="text-xs font-semibold">High Priority</Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
                    <div className="mt-0.5 w-5 h-5 rounded border border-slate-300 flex items-center justify-center text-transparent hover:text-slate-400 cursor-pointer transition-colors">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h5 className="font-bold text-sm text-slate-900">
                        Submit project proposal documentation
                      </h5>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                        Mid-Semester Project Proposal Submission &amp; Presentation Schedule (Dean of Academics)
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                        <span className="flex items-center gap-1 text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <Calendar className="w-3.5 h-3.5" /> Friday &bull; 11:59 PM
                        </span>
                        <span className="flex items-center gap-1 text-slate-500">
                          <Bell className="w-3.5 h-3.5" /> 1 day before
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Source: Notice
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                    <span>Task is automatically scheduled in your Command Center.</span>
                    <span className="font-semibold text-slate-900 flex items-center gap-1">
                      Ready <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. COMMAND CENTER OVERVIEW */}
        <section id="command-center" className="py-20 px-4 border-t border-[var(--cf-border)] bg-[var(--cf-surface)]">
          <div className="mx-auto max-w-5xl">
            <div className="text-center mb-14 space-y-3">
              <h2 className="font-sans text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                The Home Command Center
              </h2>
              <p className="text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
                Every time you open CampusFlow, the system answers one clear question: <em>&ldquo;What do I need to do right now?&rdquo;</em>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card padding="lg" className="flex flex-col border-slate-200 bg-white">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                  <Clock className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 mb-1">Overdue &amp; Urgent Focus</h3>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  Overdue tasks are surfaced immediately at the top of your dashboard with 1-click completion toggles, ensuring urgent commitments are never overlooked.
                </p>
              </Card>

              <Card padding="lg" className="flex flex-col border-slate-200 bg-white">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                  <CheckSquare className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 mb-1">Today&apos;s Interactive Checklist</h3>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  A clutter-free, actionable checklist of everything due today. Check items off instantly without loading separate detail pages.
                </p>
              </Card>

              <Card padding="lg" className="flex flex-col border-slate-200 bg-white">
                <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                  <Calendar className="h-4 w-4" />
                </div>
                <h3 className="font-bold text-sm text-slate-900 mb-1">7-Day Deadline Lookahead</h3>
                <p className="text-xs text-slate-600 leading-relaxed flex-1">
                  Anticipate upcoming assignment deadlines and submission requirements over the coming week with clean date groupings and priority tags.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* 6. PRIVACY & SECURITY SECTION */}
        <section id="privacy" className="py-20 px-4 border-t border-[var(--cf-border)] bg-[var(--cf-bg)]">
          <div className="mx-auto max-w-4xl">
            <div className="p-8 rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-800 border border-slate-200">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Academic Privacy &amp; Security Standards</h3>
                  <p className="text-xs text-slate-500">How CampusFlow handles your university information</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 text-xs text-slate-600 leading-relaxed">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Read-Only Gmail Access</h4>
                  <p>
                    We exclusively request <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] text-slate-800">gmail.readonly</code> to scan for academic circulars. We can never send emails, modify messages, or alter your account.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Strict Multi-User Isolation</h4>
                  <p>
                    All database queries and notice extractions are strictly scoped to your authenticated identity. No user can access or query another student&apos;s tasks or tokens.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-1">Zero Commercial Monetization</h4>
                  <p>
                    Your academic data is never shared, sold, or used to train public advertising models. You can disconnect your Gmail sync at any time in Settings.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. FINAL CALL TO ACTION */}
        <section className="py-24 px-4 text-center border-t border-[var(--cf-border)] bg-white">
          <div className="mx-auto max-w-2xl space-y-6">
            <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Stop letting important college deadlines slip by.
            </h2>
            <p className="text-sm sm:text-base text-slate-600 max-w-md mx-auto">
              Bring clarity to your coursework and announcements with a dedicated student productivity system.
            </p>
            <div className="pt-2">
              {isSignedIn ? (
                <Link to="/dashboard">
                  <Button size="lg" className="px-8">Open Command Center</Button>
                </Link>
              ) : (
                <SignUpButton mode="modal">
                  <Button size="lg" className="px-8">Get Started Free</Button>
                </SignUpButton>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* 8. FOOTER */}
      <footer className="bg-slate-50 border-t border-slate-200 py-10 px-4">
        <div className="mx-auto max-w-6xl flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center sm:items-start gap-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-slate-900">CampusFlow</span>
              <span className="text-[11px] font-mono text-slate-400">v2.1</span>
            </div>
            <span className="text-slate-500 text-xs">
              Student deadline intelligence and academic command center.
            </span>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-xs font-medium text-slate-600">
            <Link to="/dashboard" className="hover:text-slate-900 transition-colors">Home</Link>
            <Link to="/assignments" className="hover:text-slate-900 transition-colors">Tasks</Link>
            <Link to="/notices" className="hover:text-slate-900 transition-colors">Notices</Link>
            <Link to="/settings" className="hover:text-slate-900 transition-colors">Settings</Link>
            <Link to="/privacy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-900 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
