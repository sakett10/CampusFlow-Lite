import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Mail, CheckCircle2, Shield, Sparkles, X, User, Bell, Palette, Database, BellRing, Laptop, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../lib/browserNotifications';
import { gmailApi } from '../api/gmailApi';

type SettingsTab = 'integrations' | 'account' | 'appearance' | 'notifications' | 'privacy';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    getBrowserNotificationPermission(),
  );
  const { getToken } = useAuth();

  // Load Gmail connection status
  const checkGmailConnection = useCallback(async () => {
    setGmailLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const data = await gmailApi.getStatus(token);
      setGmailConnected(data.connected);
      setGmailEmail(data.email ?? null);
    } catch (error) {
      console.error('Failed to check Gmail connection:', error);
    } finally {
      setGmailLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkGmailConnection();
  }, [checkGmailConnection]);

  // Handle OAuth initiation
  const handleConnectGmail = async () => {
    setIsConnecting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      const { url } = await gmailApi.getAuthUrl(token);
      if (url) {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to initiate Gmail OAuth:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle Gmail disconnection
  const handleDisconnectGmail = async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      await gmailApi.disconnect(token);
      setGmailConnected(false);
      setGmailEmail(null);
      setIsDisconnectModalOpen(false);
    } catch (error) {
      console.error('Failed to disconnect Gmail:', error);
      setDisconnectError(error instanceof Error ? error.message : 'Failed to disconnect Gmail');
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isConnectModalOpen) setIsConnectModalOpen(false);
        if (isDisconnectModalOpen) setIsDisconnectModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnectModalOpen, isDisconnectModalOpen]);

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
                    {gmailLoading ? (
                      <Badge variant="neutral" className="text-[10px]">
                        Checking...
                      </Badge>
                    ) : gmailConnected ? (
                      <Badge variant="success" className="text-[10px]">
                        Connected
                      </Badge>
                    ) : (
                      <Badge variant="neutral" className="text-[10px]">
                        Disconnected
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--cf-text-secondary)] max-w-lg">
                    {gmailConnected && gmailEmail 
                      ? `Syncing campus notices from ${gmailEmail}.` 
                      : 'CampusFlow can automatically identify important emails and turn them into organized campus notices.'}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                {gmailLoading ? (
                  <Button disabled variant="secondary">
                    Loading...
                  </Button>
                ) : gmailConnected ? (
                  <Button
                    variant="outline"
                    onClick={() => setIsDisconnectModalOpen(true)}
                    className="hover:border-rose-500/40 hover:text-rose-400"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button onClick={() => setIsConnectModalOpen(true)}>
                    Connect Gmail
                  </Button>
                )}
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
                    Circulars sent by department heads, clubs, and hackathon organizers turn into structured bulletin notices without copy-pasting.
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
        <Card padding="lg" className="space-y-6">
          <div>
            <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">Alert Preferences</h2>
            <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
              Configure how you receive urgent campus circulars, deadline reminders, and attendance updates.
            </p>
          </div>

          <div className="space-y-4">
            {/* Desktop Notifications */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)]">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[var(--cf-surface)] border border-[var(--cf-border)] text-[var(--cf-brand)]">
                  <Laptop className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-[var(--cf-text)]">Desktop Browser Notifications</h4>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        browserPermission === 'granted'
                          ? 'bg-[var(--cf-success)]/10 text-[var(--cf-success)] border border-[var(--cf-success)]/20'
                          : browserPermission === 'denied'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-[var(--cf-surface)] text-[var(--cf-text-tertiary)] border border-[var(--cf-border)]'
                      }`}
                    >
                      {browserPermission}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                    Receive opt-in desktop alerts whenever new campus notices or urgent deadlines are published.
                  </p>
                </div>
              </div>

              {isBrowserNotificationSupported() && browserPermission !== 'granted' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    const perm = await requestBrowserNotificationPermission();
                    setBrowserPermission(perm);
                  }}
                >
                  <BellRing className="w-3.5 h-3.5 mr-1.5" />
                  Enable Alerts
                </Button>
              )}
            </div>

            {/* In-App Notifications */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)]">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[var(--cf-surface)] border border-[var(--cf-border)] text-[var(--cf-brand)]">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[var(--cf-text)]">In-App Notification Bell</h4>
                  <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                    Always enabled. Displays unread count badge in the navigation bar.
                  </p>
                </div>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
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

      {/* Connect Gmail Modal */}
      {isConnectModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] transition-opacity backdrop-blur-xs"
          role="presentation"
          onClick={() => setIsConnectModalOpen(false)}
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
                Connect Gmail
              </h2>
              <button 
                type="button"
                onClick={() => setIsConnectModalOpen(false)}
                className="text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] transition-colors rounded-lg p-1.5 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <p className="mb-5 font-reading text-xs leading-relaxed text-[var(--cf-text-secondary)]">
              CampusFlow can automatically identify important emails and turn them into organized campus notices.
              <br /><br />
              Connect your Gmail account to let CampusFlow securely access relevant campus emails with read-only permissions.
            </p>
            
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsConnectModalOpen(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={handleConnectGmail} disabled={isConnecting} size="sm">
                {isConnecting ? 'Connecting...' : 'Connect Gmail'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Disconnect Gmail Confirmation Modal */}
      {isDisconnectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] transition-opacity backdrop-blur-xs"
          role="presentation"
          onClick={() => !isDisconnecting && setIsDisconnectModalOpen(false)}
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
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                Disconnect Gmail
              </h2>
            </div>

            <p className="mb-4 font-reading text-xs leading-relaxed text-[var(--cf-text-secondary)]">
              Are you sure you want to disconnect {gmailEmail ? <strong className="text-[var(--cf-text)]">{gmailEmail}</strong> : 'your Gmail account'}?
              <br /><br />
              CampusFlow will immediately stop scanning and syncing emails from this account. Stored OAuth tokens will be revoked.
            </p>

            {disconnectError && (
              <div className="mb-4 rounded-lg bg-rose-500/10 p-2.5 text-xs text-rose-400 border border-rose-500/20">
                {disconnectError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => setIsDisconnectModalOpen(false)}
                variant="secondary"
                size="sm"
                disabled={isDisconnecting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDisconnectGmail}
                disabled={isDisconnecting}
                variant="danger"
                size="sm"
              >
                {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
