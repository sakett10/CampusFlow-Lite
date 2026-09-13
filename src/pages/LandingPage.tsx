import { Link } from 'react-router-dom';
import {
  Mail,
  Calendar,
  Clock,
  CheckSquare,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Inbox,
  ArrowRight,
  Lock,
  ExternalLink,
  AlertTriangle,
  Cpu,
  Bookmark,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SignInButton, SignUpButton, useAuth } from '@clerk/clerk-react';

export default function LandingPage() {
  const { isSignedIn } = useAuth();

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A] font-sans selection:bg-slate-900 selection:text-white overflow-x-hidden">
      {/* -------------------------------------------------------------------------- */}
      {/* TOP TELEMETRY STRIP (Cybercore Accent)                                     */}
      {/* -------------------------------------------------------------------------- */}
      <div className="border-b border-slate-900/10 bg-white/70 backdrop-blur-sm px-4 py-1.5 text-xs font-mono text-slate-500">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 font-semibold text-slate-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              SYSTEM // v2.1 STABLE
            </span>
            <span className="hidden sm:inline text-slate-300">|</span>
            <span className="hidden sm:inline text-slate-600">
              PROTOCOL: GMAIL.READONLY + LOCAL PARSER
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-600">TENANT ISOLATION: STRICT</span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span className="hidden md:inline text-slate-500">ZERO TRACKING COOKIES</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------------- */}
      {/* 1. EDITORIAL NAVBAR                                                        */}
      {/* -------------------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 border-b-2 border-slate-900 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-900 text-white font-extrabold text-sm tracking-wider shadow-[2px_2px_0px_#0f172a] transition-transform group-hover:translate-x-[-1px] group-hover:translate-y-[-1px]">
                CF
              </div>
              <div className="leading-none">
                <span className="font-sans text-lg font-extrabold tracking-tight text-slate-900">
                  CampusFlow
                </span>
                <span className="block text-xs font-mono font-semibold uppercase tracking-widest text-slate-500">
                  Lite / Student OS
                </span>
              </div>
            </Link>
          </div>

          <nav className="hidden lg:flex items-center gap-7 text-xs font-bold uppercase tracking-wider text-slate-700">
            <a href="#how-it-works" className="hover:text-slate-900 transition-colors">
              How It Works
            </a>
            <a href="#notice-intelligence" className="hover:text-slate-900 transition-colors">
              Intelligence
            </a>
            <a href="#deadlines" className="hover:text-slate-900 transition-colors">
              Deadlines
            </a>
            <a href="#opportunities" className="hover:text-slate-900 transition-colors">
              Opportunities
            </a>
            <a href="#security" className="hover:text-slate-900 transition-colors">
              Security
            </a>
            <Link to="/notices" className="hover:text-slate-900 transition-colors text-slate-900 flex items-center gap-1">
              Notice Board <ArrowRight className="w-3 h-3" />
            </Link>
          </nav>

          <div className="flex items-center gap-2.5">
            {isSignedIn ? (
              <Link to="/dashboard">
                <Button variant="brutal" size="sm">
                  Open Command Center
                </Button>
              </Link>
            ) : (
              <>
                <SignInButton mode="modal">
                  <Button variant="outline" size="sm" className="hidden sm:inline-flex border-slate-300 hover:border-slate-900 font-semibold">
                    Sign In
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button variant="brutal" size="sm" leftIcon={<Mail className="w-3.5 h-3.5" />}>
                    Connect Gmail
                  </Button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* -------------------------------------------------------------------------- */}
        {/* 2. HERO SECTION (Swiss Typography + Neo-Brutalist Structure)                */}
        {/* -------------------------------------------------------------------------- */}
        <section className="relative px-4 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-20 lg:pb-24 border-b-2 border-slate-900 bg-[#F8F9FA] cf-grid-dot-pattern">
          <div className="mx-auto max-w-6xl">
            {/* Section Index Marker */}
            <div className="flex items-center gap-2 mb-4 font-mono text-xs font-bold text-slate-600 tracking-wider">
              <span className="px-2 py-0.5 rounded border border-slate-900/20 bg-white font-mono">
                SEC // 00
              </span>
              <span>CAMPUS INFORMATION INFRASTRUCTURE</span>
            </div>

            {/* Main Headline */}
            <div className="max-w-4xl space-y-5">
              <h1 className="font-sans text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.06]">
                Campus information <br className="hidden sm:inline" />
                <span className="relative inline-block mt-1 sm:mt-0">
                  <span className="relative z-10 px-2 py-0.5 bg-slate-900 text-white rounded">
                    without the chaos.
                  </span>
                </span>
              </h1>

              <p className="max-w-2xl text-base sm:text-xl text-slate-700 font-normal leading-relaxed">
                Connect your university Gmail to automatically convert circulars, exam schedules, and department notices into verified, deadline-tracked tasks you actually complete.
              </p>
            </div>

            {/* Action Bar */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              {isSignedIn ? (
                <Link to="/dashboard">
                  <Button variant="brutal" size="lg" className="w-full sm:w-auto px-7" rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Open Command Center
                  </Button>
                </Link>
              ) : (
                <SignUpButton mode="modal">
                  <Button variant="brutal" size="lg" className="w-full sm:w-auto px-7" leftIcon={<Mail className="w-4 h-4" />} rightIcon={<ArrowRight className="w-4 h-4" />}>
                    Connect University Gmail
                  </Button>
                </SignUpButton>
              )}
              <Link to="/notices">
                <Button variant="brutal-secondary" size="lg" className="w-full sm:w-auto px-6">
                  Explore Notice Board
                </Button>
              </Link>
              <a href="#how-it-works" className="hidden sm:inline-flex items-center gap-1 text-xs font-mono font-semibold text-slate-600 hover:text-slate-900 px-3 py-2">
                [ READ SYSTEM SPEC &darr; ]
              </a>
            </div>

            {/* Strict Factual Capability Indicators */}
            <div className="mt-8 pt-6 border-t border-slate-300 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-slate-900 rounded-xs" />
                <span className="font-semibold text-slate-900">gmail.readonly only</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-slate-900 rounded-xs" />
                <span className="font-semibold text-slate-900">1-Click Notice to Task</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-slate-900 rounded-xs" />
                <span className="font-semibold text-slate-900">Zero Commercial Ads</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-slate-900 rounded-xs" />
                <span className="font-semibold text-slate-900">Audited User Isolation</span>
              </div>
            </div>

            {/* -------------------------------------------------------------------------- */}
            {/* HERO PRODUCT UI PREVIEW (Bento Window)                                     */}
            {/* -------------------------------------------------------------------------- */}
            <div className="mt-12 rounded-xl border-2 border-slate-900 bg-white shadow-[6px_6px_0px_#0f172a] overflow-hidden">
              {/* Window Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 bg-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full border border-slate-900 bg-rose-400" />
                  <span className="h-3 w-3 rounded-full border border-slate-900 bg-amber-400" />
                  <span className="h-3 w-3 rounded-full border border-slate-900 bg-emerald-400" />
                  <span className="ml-2 font-mono text-xs font-bold text-slate-700 tracking-wider">
                    CAMPUSFLOW // INGESTION &rarr; TASK PIPELINE PREVIEW
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-2 font-mono text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  SYNC: ACTIVE
                </div>
              </div>

              {/* Window Content: Two-Column Live Comparison */}
              <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 bg-white">
                {/* Left Column: Raw Circular (5 cols) */}
                <div className="lg:col-span-5 rounded-lg border-2 border-slate-900 bg-slate-50 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-300 text-xs font-mono">
                      <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-600" /> Source: University Gmail
                      </span>
                      <span className="text-slate-500">10:42 AM</span>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-mono text-slate-500">
                        From: <span className="text-slate-800 font-semibold">academics@univ.edu</span> &bull; Subject: <span className="text-slate-800 font-semibold">CIR/2026/CS-402</span>
                      </div>
                      <h4 className="font-bold text-base text-slate-900 leading-snug">
                        Submission of Final Capstone Project Report &amp; Plagiarism Declaration
                      </h4>
                      <p className="font-reading text-sm text-slate-600 leading-relaxed">
                        All final-year B.Tech students enrolled in CSE4001 are hereby notified that the final softcopy of the Project Milestone II report, along with the Turnitin plagiarism declaration form, must be submitted via the VTOP departmental portal no later than Friday, Nov 14 at 11:59 PM.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
                    <span>STATUS: RAW TEXT</span>
                    <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded">UNSTRUCTURED</span>
                  </div>
                </div>

                {/* Center Connector (2 cols on large screen, row on mobile) */}
                <div className="lg:col-span-2 flex flex-col items-center justify-center py-2 lg:py-0">
                  <div className="flex items-center lg:flex-col gap-2 font-mono text-xs font-bold text-slate-900">
                    <span className="px-2 py-1 rounded bg-slate-900 text-white text-xs uppercase tracking-wider shadow-[2px_2px_0px_#0f172a]">
                      1-CLICK PARSE
                    </span>
                    <ArrowRight className="w-5 h-5 hidden lg:block text-slate-900" />
                    <span className="lg:hidden">&darr;</span>
                  </div>
                </div>

                {/* Right Column: Structured Task Result (5 cols) */}
                <div className="lg:col-span-5 rounded-lg border-2 border-slate-900 bg-white p-4 shadow-[3px_3px_0px_#0f172a] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <Badge variant="brand" className="font-mono text-xs">TASK #402</Badge>
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          CSE4001
                        </span>
                      </div>
                      <Badge variant="danger" className="text-xs font-mono font-bold">URGENT</Badge>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 h-5 w-5 rounded border-2 border-slate-900 bg-emerald-500 flex items-center justify-center text-white shrink-0 shadow-[1px_1px_0px_#0f172a]">
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="space-y-1 min-w-0">
                        <h4 className="font-bold text-base text-slate-900">
                          Submit Capstone Report &amp; Plagiarism Declaration
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs pt-1 font-mono">
                          <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <Clock className="w-3 h-3" /> Friday, 11:59 PM
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                            <Bookmark className="w-3 h-3" /> Auto-linked: VTOP
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-mono">
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> READY IN DASHBOARD
                    </span>
                    <span className="text-slate-500">REMINDER: 1D BEFORE</span>
                  </div>
                </div>
              </div>

              {/* Status Bar */}
              <div className="border-t-2 border-slate-900 bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-4">
                  <span>TELEMETRY // ID: CSE4001-AUTO</span>
                  <span className="hidden sm:inline text-slate-400">|</span>
                  <span className="hidden sm:inline text-slate-300">ACCURACY: VERIFIED SOURCE MESSAGE</span>
                </div>
                <div className="text-emerald-400 font-bold">
                  ZERO MANUAL COPY-PASTE
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------------- */}
        {/* 3. SECTION 1: HOW CAMPUSFLOW WORKS (4-Step Linear Flow)                    */}
        {/* -------------------------------------------------------------------------- */}
        <section id="how-it-works" className="py-20 px-4 border-b-2 border-slate-900 bg-white">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-2 mb-3 font-mono text-xs font-bold text-slate-600 tracking-wider">
              <span className="px-2 py-0.5 rounded border border-slate-900/20 bg-slate-100 font-mono">
                SEC // 01
              </span>
              <span>OPERATIONAL PIPELINE</span>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between mb-14 gap-4">
              <div>
                <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                  How CampusFlow Works
                </h2>
                <p className="text-base text-slate-600 mt-2 max-w-xl">
                  A four-stage deterministic workflow engineered to transform college correspondence into completed work.
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-slate-400">
                TOTAL LATENCY: &lt; 200MS
              </span>
            </div>

            {/* 4-Step Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Step 1 */}
              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-5 shadow-[4px_4px_0px_#0f172a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                    <span className="font-mono text-sm font-extrabold text-slate-900">01 // INGEST</span>
                    <Inbox className="w-5 h-5 text-slate-800" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mb-2">
                    Read-Only Gmail Sync
                  </h3>
                  <p className="font-reading text-sm text-slate-600 leading-relaxed">
                    Connect your student email once. CampusFlow scans for administrative circulars using strict read-only permissions. Never modifies, deletes, or sends emails.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-200 font-mono text-xs text-slate-500">
                  REF: `gmail.readonly`
                </div>
              </div>

              {/* Step 2 */}
              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-5 shadow-[4px_4px_0px_#0f172a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                    <span className="font-mono text-sm font-extrabold text-slate-900">02 // PARSE</span>
                    <Sparkles className="w-5 h-5 text-slate-800" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mb-2">
                    Notice Intelligence
                  </h3>
                  <p className="font-reading text-sm text-slate-600 leading-relaxed">
                    Extracts deadlines, required action items, venues, eligibility rules, and portal links out of dense institutional PDFs and unstructured email bodies.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-200 font-mono text-xs text-slate-500">
                  OUTPUT: STRUCTURED DATA
                </div>
              </div>

              {/* Step 3 */}
              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-5 shadow-[4px_4px_0px_#0f172a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                    <span className="font-mono text-sm font-extrabold text-slate-900">03 // CONVERT</span>
                    <CheckSquare className="w-5 h-5 text-slate-800" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mb-2">
                    1-Click Task Creation
                  </h3>
                  <p className="font-reading text-sm text-slate-600 leading-relaxed">
                    Convert any academic circular directly into a personal task. Automatically assigns due dates, course codes, and smart priority badges.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-200 font-mono text-xs text-slate-500">
                  ACTION: ZERO RETYPING
                </div>
              </div>

              {/* Step 4 */}
              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-5 shadow-[4px_4px_0px_#0f172a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                    <span className="font-mono text-sm font-extrabold text-slate-900">04 // EXECUTE</span>
                    <Calendar className="w-5 h-5 text-slate-800" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 mb-2">
                    Daily Command Center
                  </h3>
                  <p className="font-reading text-sm text-slate-600 leading-relaxed">
                    Open your dashboard to an uncluttered view of overdue commitments, today&apos;s checklist, and upcoming dates. Complete tasks with one click.
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-200 font-mono text-xs text-slate-500">
                  GOAL: 100% TIMELY DELIVERY
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------------- */}
        {/* 4. SECTION 2: NOTICE INTELLIGENCE (Structural Breakdown)                   */}
        {/* -------------------------------------------------------------------------- */}
        <section id="notice-intelligence" className="py-20 px-4 border-b-2 border-slate-900 bg-[#F8F9FA]">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-2 mb-3 font-mono text-xs font-bold text-slate-600 tracking-wider">
              <span className="px-2 py-0.5 rounded border border-slate-900/20 bg-white font-mono">
                SEC // 02
              </span>
              <span>INFORMATION EXTRACTION</span>
            </div>

            <div className="mb-14 max-w-3xl">
              <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                Notice Intelligence: From Circular to Structured Action
              </h2>
              <p className="text-base text-slate-600 mt-2">
                University announcements contain crucial dates buried within dense formal text. CampusFlow dissects circulars into three structured analytical layers.
              </p>
            </div>

            {/* Editorial Feature Breakdown Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="rounded-lg border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_#0f172a]">
                <div className="font-mono text-xs font-bold text-slate-400 mb-2">LAYER 01</div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-800" /> Deadline Isolation
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Extracts specific dates, submission cutoffs, and times. Identifies conflicting timelines and flags urgent windows (e.g. &ldquo;Closes in 48 hours&rdquo;).
                </p>
                <div className="mt-4 p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700">
                  &bull; Registration: Nov 10<br />
                  &bull; Final Cutoff: Nov 14, 23:59
                </div>
              </div>

              {/* Feature 2 */}
              <div className="rounded-lg border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_#0f172a]">
                <div className="font-mono text-xs font-bold text-slate-400 mb-2">LAYER 02</div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Action Requirements
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Isolates the single most important action you need to take right now, eliminating the need to re-read long circular paragraphs multiple times.
                </p>
                <div className="mt-4 p-2.5 rounded bg-amber-50 border border-amber-200 font-mono text-xs text-amber-900">
                  ACTION: &ldquo;Submit softcopy via departmental portal&rdquo;
                </div>
              </div>

              {/* Feature 3 */}
              <div className="rounded-lg border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0px_#0f172a]">
                <div className="font-mono text-xs font-bold text-slate-400 mb-2">LAYER 03</div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2 flex items-center gap-2">
                  <ExternalLink className="w-4 h-4 text-slate-800" /> Smart Portal Links
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Finds and surfaces direct URLs for portals, Google Forms, Devfolio/Unstop registration pages, and downloadable circular PDFs directly on the card.
                </p>
                <div className="mt-4 p-2.5 rounded bg-slate-50 border border-slate-200 font-mono text-xs text-slate-700 flex items-center justify-between">
                  <span>[ Open VTOP Portal ]</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------------- */}
        {/* 5. SECTION 3: DEADLINE & CALENDAR ORGANIZATION                             */}
        {/* -------------------------------------------------------------------------- */}
        <section id="deadlines" className="py-20 px-4 border-b-2 border-slate-900 bg-white">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-2 mb-3 font-mono text-xs font-bold text-slate-600 tracking-wider">
              <span className="px-2 py-0.5 rounded border border-slate-900/20 bg-slate-100 font-mono">
                SEC // 03
              </span>
              <span>TIME &amp; ATTENDANCE INTELLIGENCE</span>
            </div>

            <div className="mb-14 max-w-3xl">
              <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                Deadline &amp; Calendar Organization
              </h2>
              <p className="text-base text-slate-600 mt-2">
                A calm, linear dashboard architecture designed to answer one question immediately upon opening: <em>&ldquo;What demands my attention today?&rdquo;</em>
              </p>
            </div>

            {/* Bento Grid Layout for Dashboard Capabilities */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Bento Card 1: Urgent Focus & Checklist (7 cols) */}
              <div className="lg:col-span-7 rounded-xl border-2 border-slate-900 bg-[#F8F9FA] p-6 shadow-[4px_4px_0px_#0f172a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                    <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wider">
                      COMMAND CENTER // DAILY CHECKLIST
                    </span>
                    <Badge variant="danger" className="font-mono text-xs">ACTION REQUIRED</Badge>
                  </div>

                  <h3 className="font-bold text-lg text-slate-900 mb-2">
                    Overdue &amp; Due Today Priority Queue
                  </h3>
                  <p className="font-reading text-sm text-slate-600 mb-4">
                    Overdue items persist visibly at the top until resolved. Check off completed items directly from the home feed without loading nested pages.
                  </p>

                  <div className="space-y-2.5">
                    <div className="p-3 rounded-lg border border-rose-300 bg-rose-50/50 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="h-4 w-4 rounded border border-rose-500 bg-white" />
                        <div>
                          <span className="font-bold text-slate-900 block">Lab Manual Experiment 6 Submission</span>
                          <span className="text-xs font-mono text-rose-700">OVERDUE &bull; Yesterday at 17:00</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-rose-200 text-rose-700">
                        CSE2004
                      </span>
                    </div>

                    <div className="p-3 rounded-lg border border-slate-200 bg-white flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5">
                        <span className="h-4 w-4 rounded border border-slate-400 bg-white" />
                        <div>
                          <span className="font-bold text-slate-900 block">Mid-Term Quiz 2 (Online Portal)</span>
                          <span className="text-xs font-mono text-slate-600">TODAY &bull; at 19:30</span>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                        MAT3001
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between font-mono text-xs text-slate-500">
                  <span>1-CLICK COMPLETION TOGGLE</span>
                  <span>SYNCED ACROSS DEVICES</span>
                </div>
              </div>

              {/* Bento Card 2: Attendance Threshold Engine (5 cols) */}
              <div className="lg:col-span-5 rounded-xl border-2 border-slate-900 bg-white p-6 shadow-[4px_4px_0px_#0f172a] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                    <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wider">
                      ACADEMIC HEALTH
                    </span>
                    <Badge variant="brand" className="font-mono text-xs">VTOP FORMULA</Badge>
                  </div>

                  <h3 className="font-bold text-lg text-slate-900 mb-2">
                    Attendance Deficit Calculator
                  </h3>
                  <p className="font-reading text-sm text-slate-600 mb-4">
                    Track your attendance against the mandatory 75% institutional threshold with instant &ldquo;classes needed&rdquo; math.
                  </p>

                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="font-mono text-xs font-bold text-slate-700">CSE3002: COMPILERS</span>
                      <span className="font-mono text-base font-extrabold text-rose-600">71.4%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className="bg-rose-500 h-2 rounded-full" style={{ width: '71.4%' }} />
                    </div>
                    <div className="text-xs font-mono text-rose-800 bg-rose-100/70 p-2 rounded border border-rose-200">
                      &bull; Attend next <strong>2 consecutive classes</strong> to restore 75.0% threshold.
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between font-mono text-xs text-slate-500">
                  <span>THRESHOLD: 75.0%</span>
                  <span>RECORD ATTENDANCE WITH 1 TAP</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------------- */}
        {/* 6. SECTION 4: OPPORTUNITY DISCOVERY                                        */}
        {/* -------------------------------------------------------------------------- */}
        <section id="opportunities" className="py-20 px-4 border-b-2 border-slate-900 bg-[#F8F9FA]">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-2 mb-3 font-mono text-xs font-bold text-slate-600 tracking-wider">
              <span className="px-2 py-0.5 rounded border border-slate-900/20 bg-white font-mono">
                SEC // 04
              </span>
              <span>CURATED OPPORTUNITIES</span>
            </div>

            <div className="mb-14 max-w-3xl">
              <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                Opportunity Discovery: Never Miss High-Value Deadlines
              </h2>
              <p className="text-base text-slate-600 mt-2">
                Hackathons, research seminars, placement tests, and merit scholarships frequently get lost among administrative spam. CampusFlow isolates them automatically.
              </p>
            </div>

            {/* Opportunity Categories Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="p-5 rounded-lg border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a]">
                <div className="h-8 w-8 rounded bg-slate-100 border border-slate-300 flex items-center justify-center font-mono font-bold text-slate-800 mb-3">
                  01
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1.5">Hackathons &amp; Contests</h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Isolates Devfolio, Unstop, and university-hosted hackathon announcements with team deadlines.
                </p>
              </div>

              <div className="p-5 rounded-lg border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a]">
                <div className="h-8 w-8 rounded bg-slate-100 border border-slate-300 flex items-center justify-center font-mono font-bold text-slate-800 mb-3">
                  02
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1.5">Placement &amp; Internships</h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Surfaces registration cutoffs, eligibility criteria, and assessment schedules before links close.
                </p>
              </div>

              <div className="p-5 rounded-lg border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a]">
                <div className="h-8 w-8 rounded bg-slate-100 border border-slate-300 flex items-center justify-center font-mono font-bold text-slate-800 mb-3">
                  03
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1.5">Workshops &amp; Seminars</h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Extracts venue, guest speaker, hands-on lab prerequisites, and certificate registration requirements.
                </p>
              </div>

              <div className="p-5 rounded-lg border-2 border-slate-900 bg-white shadow-[3px_3px_0px_#0f172a]">
                <div className="h-8 w-8 rounded bg-slate-100 border border-slate-300 flex items-center justify-center font-mono font-bold text-slate-800 mb-3">
                  04
                </div>
                <h3 className="font-bold text-base text-slate-900 mb-1.5">Scholarships &amp; Grants</h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Flags government and university endowment application dates with required paperwork checklists.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------------- */}
        {/* 7. SECTION 5: SECURITY & ACADEMIC PRIVACY                                  */}
        {/* -------------------------------------------------------------------------- */}
        <section id="security" className="py-20 px-4 border-b-2 border-slate-900 bg-white">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center gap-2 mb-3 font-mono text-xs font-bold text-slate-600 tracking-wider">
              <span className="px-2 py-0.5 rounded border border-slate-900/20 bg-slate-100 font-mono">
                SEC // 05
              </span>
              <span>DATA GOVERNANCE &amp; TENANT ISOLATION</span>
            </div>

            <div className="mb-12 max-w-3xl">
              <h2 className="font-sans text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
                Academic Privacy &amp; Security Guarantees
              </h2>
              <p className="text-base text-slate-600 mt-2">
                We handle university correspondence with strict technical safeguards. Here is our verified data governance architecture.
              </p>
            </div>

            {/* 4 Security Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-6 shadow-[3px_3px_0px_#0f172a]">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 mb-2">
                  <ShieldCheck className="w-4 h-4 text-slate-900" />
                  PILLAR 01 // AUDITED TENANT ISOLATION
                </div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2">
                  Strict Multi-User Isolation
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Every notice, campus email, and extracted task is explicitly constrained by authenticated Clerk user IDs. No database query can expose or leak one student&apos;s personal notices or tokens to another account.
                </p>
                <div className="mt-4 font-mono text-xs text-slate-500 pt-2 border-t border-slate-200">
                  AUDITED INVARIANT: `notices.source_type IN (institutional, gmail_personal)`
                </div>
              </div>

              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-6 shadow-[3px_3px_0px_#0f172a]">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 mb-2">
                  <Lock className="w-4 h-4 text-slate-900" />
                  PILLAR 02 // READ-ONLY OAUTH SCOPE
                </div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2">
                  Zero Mailbox Write Access
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  CampusFlow requests only the <code className="bg-white px-1.5 py-0.5 border border-slate-300 rounded font-mono text-xs text-slate-900">gmail.readonly</code> OAuth scope. We physically cannot send emails, delete messages, modify threads, or contact anyone on your behalf.
                </p>
                <div className="mt-4 font-mono text-xs text-slate-500 pt-2 border-t border-slate-200">
                  SCOPE: HTTPS://WWW.GOOGLEAPIS.COM/AUTH/GMAIL.READONLY
                </div>
              </div>

              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-6 shadow-[3px_3px_0px_#0f172a]">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 mb-2">
                  <Cpu className="w-4 h-4 text-slate-900" />
                  PILLAR 03 // ZERO COMMERCIAL MONETIZATION
                </div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2">
                  No Ads &amp; No Data Brokering
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Your academic records, courses, and correspondence are never sold, monetized for advertising, or used to train third-party public models. You are the sole user of your data.
                </p>
                <div className="mt-4 font-mono text-xs text-slate-500 pt-2 border-t border-slate-200">
                  POLICY: FERPA &amp; STUDENT PRIVACY COMPLIANT
                </div>
              </div>

              <div className="rounded-lg border-2 border-slate-900 bg-[#F8F9FA] p-6 shadow-[3px_3px_0px_#0f172a]">
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 mb-2">
                  <RefreshCw className="w-4 h-4 text-slate-900" />
                  PILLAR 04 // 1-CLICK DISCONNECT &amp; PURGE
                </div>
                <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2">
                  Complete Data Eradication
                </h3>
                <p className="font-reading text-sm text-slate-600 leading-relaxed">
                  Disconnect your Gmail at any time in Settings. Choose between unlinking OAuth or executing an immediate, irrevocable purge of all synced notices and emails from the database.
                </p>
                <div className="mt-4 font-mono text-xs text-slate-500 pt-2 border-t border-slate-200">
                  CONTROL: SETTINGS &rarr; INTEGRATIONS &rarr; PURGE DATA
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------------------- */}
        {/* 8. SECTION 6: FINAL CALL TO ACTION (Neo-Brutalist Closing Box)             */}
        {/* -------------------------------------------------------------------------- */}
        <section className="py-24 px-4 bg-[#F8F9FA] cf-grid-dot-pattern">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border-2 border-slate-900 bg-white p-8 sm:p-14 text-center shadow-[6px_6px_0px_#0f172a] space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-slate-900 bg-slate-100 font-mono text-xs font-bold text-slate-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                ACADEMIC YEAR 2026 // OPEN ACCESS
              </div>

              <h2 className="font-sans text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
                Stop letting important college deadlines slip by.
              </h2>

              <p className="mx-auto max-w-xl text-base text-slate-600">
                Join students organizing course deadlines, exam notices, and attendance without the inbox clutter. Setup takes less than 30 seconds.
              </p>

              <div className="pt-3 flex flex-col sm:flex-row items-center justify-center gap-3.5">
                {isSignedIn ? (
                  <Link to="/dashboard" className="w-full sm:w-auto">
                    <Button variant="brutal" size="lg" className="w-full sm:w-auto px-8" rightIcon={<ArrowRight className="w-4 h-4" />}>
                      Open Command Center
                    </Button>
                  </Link>
                ) : (
                  <SignUpButton mode="modal">
                    <Button variant="brutal" size="lg" className="w-full sm:w-auto px-8" leftIcon={<Mail className="w-4 h-4" />} rightIcon={<ArrowRight className="w-4 h-4" />}>
                      Connect University Gmail
                    </Button>
                  </SignUpButton>
                )}
                <Link to="/notices" className="w-full sm:w-auto">
                  <Button variant="brutal-secondary" size="lg" className="w-full sm:w-auto px-6">
                    Browse Notice Feed
                  </Button>
                </Link>
              </div>

              <div className="pt-6 border-t border-slate-200 flex flex-wrap items-center justify-center gap-6 text-xs font-mono text-slate-500">
                <span>AUTH: CLERK IDENTITY</span>
                <span>&bull;</span>
                <span>SYNC: READ-ONLY</span>
                <span>&bull;</span>
                <span>ZERO COMMERCIAL MONETIZATION</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------------------- */}
      {/* 9. FOOTER (Swiss Minimalist Grid)                                          */}
      {/* -------------------------------------------------------------------------- */}
      <footer className="border-t-2 border-slate-900 bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            {/* Col 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-white font-extrabold text-xs">
                  CF
                </div>
                <span className="font-bold text-base tracking-tight text-slate-900">CampusFlow</span>
              </div>
              <p className="font-reading text-sm text-slate-500 leading-relaxed">
                A student information product engineered to transform college circulars into completed work.
              </p>
              <div className="pt-2 font-mono text-xs text-slate-400">
                RELEASE // v2.1 LITE
              </div>
            </div>

            {/* Col 2 */}
            <div className="space-y-2 text-sm">
              <p className="font-mono font-bold text-slate-900 uppercase tracking-wider text-xs">Product</p>
              <ul className="space-y-1.5 text-slate-600 font-medium">
                <li><Link to="/dashboard" className="hover:text-slate-900 transition-colors">Command Center</Link></li>
                <li><Link to="/assignments" className="hover:text-slate-900 transition-colors">Task Management</Link></li>
                <li><Link to="/notices" className="hover:text-slate-900 transition-colors">Campus Notices</Link></li>
                <li><Link to="/courses" className="hover:text-slate-900 transition-colors">Attendance Tracker</Link></li>
              </ul>
            </div>

            {/* Col 3 */}
            <div className="space-y-2 text-sm">
              <p className="font-mono font-bold text-slate-900 uppercase tracking-wider text-xs">System</p>
              <ul className="space-y-1.5 text-slate-600 font-medium">
                <li><Link to="/settings" className="hover:text-slate-900 transition-colors">Settings &amp; Gmail Sync</Link></li>
                <li><a href="#security" className="hover:text-slate-900 transition-colors">Multi-Tenant Isolation</a></li>
                <li><a href="#how-it-works" className="hover:text-slate-900 transition-colors">Technical Architecture</a></li>
              </ul>
            </div>

            {/* Col 4 */}
            <div className="space-y-2 text-sm">
              <p className="font-mono font-bold text-slate-900 uppercase tracking-wider text-xs">Legal &amp; Trust</p>
              <ul className="space-y-1.5 text-slate-600 font-medium">
                <li><Link to="/privacy" className="hover:text-slate-900 transition-colors">Privacy Policy</Link></li>
                <li><Link to="/terms" className="hover:text-slate-900 transition-colors">Terms of Service</Link></li>
                <li className="text-xs text-slate-400 pt-2 font-mono">
                  ZERO DATA BROKERING GUARANTEE
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-500">
            <span>&copy; {new Date().getFullYear()} CampusFlow-Lite. Built for students.</span>
            <span>SWISS MINIMALISM &bull; BENTO ARCHITECTURE &bull; NEO-BRUTAL PERSONALITY</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
