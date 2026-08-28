import { useState, useEffect } from 'react';
import { Mail, CheckCircle2, Shield, Sparkles, X, User, Bell, Palette, Database } from 'lucide-react';
import { motion } from 'motion/react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

type SettingsTab = 'account' | 'appearance' | 'notifications' | 'integrations' | 'privacy';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="mx-auto max-w-4xl space-y-8 pb-12"
    >
      {/* Header */}
      <header className="border-b border-[var(--cf-border-subtle)] pb-4">
        <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-tight font-bold text-[var(--cf-text)]">
          Settings
        </h1>
        <p className="mt-1 font-reading text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)]">
          Manage your account preferences, appearance, and university integrations.
        </p>

        {/* Settings Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pt-6">
          {[
            { id: 'integrations' as SettingsTab, label: 'Integrations', icon: Mail },
            { id: 'account' as SettingsTab, label: 'Account', icon: User },
            { id: 'appearance' as SettingsTab, label: 'Appearance', icon: Palette },
            { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
            { id: 'privacy' as SettingsTab, label: 'Data & Privacy', icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-10 items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] ${
                  active
                    ? 'bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20 shadow-sm'
                    : 'text-[var(--cf-text-secondary)] hover:bg-[var(--cf-surface-muted)] hover:text-[var(--cf-text)] border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Tab 1: Integrations */}
      {activeTab === 'integrations' && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                Campus Integrations
              </h2>
              <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                Automate your information flow by linking university communication channels.
              </p>
            </div>
          </div>

          <Card padding="lg" className="flex flex-col gap-6 border-[var(--cf-border)]">
            {/* Main Gmail Integration Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-[var(--cf-border-subtle)] pb-6">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/20 text-[var(--cf-brand)]">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                      Gmail Integration
                    </h3>
                    <Badge variant="neutral" className="text-[10px]">COMING SOON</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--cf-text-secondary)] max-w-lg">
                    CampusFlow can automatically identify important emails and turn them into organized campus notices.
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                <Button variant="outline" onClick={() => setIsModalOpen(true)}>
                  Integration Details
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* How it works */}
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-sans-display text-xs font-bold uppercase tracking-wider text-[var(--cf-text-tertiary)]">
                  <CheckCircle2 className="h-4 w-4 text-[var(--cf-success)]" />
                  How it works
                </h4>
                <ol className="relative border-s border-[var(--cf-border)] ml-2 space-y-3.5">
                  {[
                    'Connect your university Google account',
                    "Review Google's explicit permission screen",
                    'Approve read-only email metadata access',
                    'CampusFlow intelligently filters campus circulars',
                    'Key deadlines automatically appear on your dashboard'
                  ].map((step, idx) => (
                    <li key={idx} className="ms-4 text-xs text-[var(--cf-text-secondary)]">
                      <div className="absolute w-2 h-2 bg-[var(--cf-border-strong)] rounded-full mt-1 -start-1 border border-[var(--cf-surface)]"></div>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Privacy & Control */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="flex items-center gap-2 font-sans-display text-xs font-bold uppercase tracking-wider text-[var(--cf-text-tertiary)]">
                    <Shield className="h-4 w-4 text-[var(--cf-brand)]" />
                    Privacy & Control
                  </h4>
                  <ul className="space-y-2 text-xs text-[var(--cf-text-secondary)]">
                    <li className="flex gap-2"><span className="text-[var(--cf-text-tertiary)]">•</span> CampusFlow accesses email data only after your OAuth approval.</li>
                    <li className="flex gap-2"><span className="text-[var(--cf-text-tertiary)]">•</span> Personal emails are ignored; only campus notices are parsed.</li>
                    <li className="flex gap-2"><span className="text-[var(--cf-text-tertiary)]">•</span> You can disconnect or revoke access at any time.</li>
                  </ul>
                </div>

                {/* AI Processing Preview */}
                <div className="rounded-xl bg-[var(--cf-surface-muted)] p-4 border border-[var(--cf-border-subtle)] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--cf-ai)]">
                    <Sparkles className="w-3.5 h-3.5" />
                    Automated Opportunity Pipeline
                  </div>
                  <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
                    Once released, circulars sent by department heads, clubs, and hackathon organizers will turn into structured feed items without copy-pasting.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Tab 2: Account */}
      {activeTab === 'account' && (
        <Card padding="lg" className="space-y-4">
          <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">Account Profile</h2>
          <p className="text-xs text-[var(--cf-text-secondary)]">
            Your user authentication and session are securely managed via Clerk.
          </p>
          <div className="pt-2">
            <Badge variant="brand" className="text-xs">Active Session</Badge>
          </div>
        </Card>
      )}

      {/* Tab 3: Appearance */}
      {activeTab === 'appearance' && (
        <Card padding="lg" className="space-y-4">
          <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">Theme & Display</h2>
          <p className="text-xs text-[var(--cf-text-secondary)]">
            CampusFlow defaults to a high-contrast obsidian dark palette optimized for late-night reading and academic triage.
          </p>
          <div className="flex gap-3 pt-2">
            <div className="p-3 rounded-xl border border-[var(--cf-brand)] bg-[var(--cf-surface-muted)] text-xs font-semibold text-[var(--cf-brand)]">
              Dark (Charcoal Foundation)
            </div>
          </div>
        </Card>
      )}

      {/* Tab 4: Notifications */}
      {activeTab === 'notifications' && (
        <Card padding="lg" className="space-y-4">
          <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">Alert Preferences</h2>
          <p className="text-xs text-[var(--cf-text-secondary)]">
            Configure how you receive urgent attendance warnings and 24-hour deadline reminders.
          </p>
          <p className="text-xs text-[var(--cf-text-tertiary)] italic">In-app notifications enabled by default.</p>
        </Card>
      )}

      {/* Tab 5: Data & Privacy */}
      {activeTab === 'privacy' && (
        <Card padding="lg" className="space-y-4">
          <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">Data & Multi-Tenant Privacy</h2>
          <p className="text-xs text-[var(--cf-text-secondary)] leading-relaxed">
            All course, assignment, and notice records are isolated by your user ID with strict multi-tenant database policies.
          </p>
        </Card>
      )}

      {/* Coming Soon Modal */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] transition-opacity backdrop-blur-xs"
          role="presentation"
          onClick={() => setIsModalOpen(false)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="w-full max-w-sm rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 shadow-[var(--cf-elev-3)]"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                Gmail Sync in Development
              </h2>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] transition-colors rounded-lg p-1.5 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <p className="mb-5 font-reading text-xs leading-relaxed text-[var(--cf-text-secondary)]">
              "CampusFlow can automatically identify important emails and turn them into organized campus notices."
              <br /><br />
              OAuth integration will be available in an upcoming update following Google Workspace verification.
            </p>
            
            <div className="flex justify-end">
              <Button onClick={() => setIsModalOpen(false)} variant="secondary" size="sm">
                Got it
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
