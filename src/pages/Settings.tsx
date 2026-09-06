import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { Mail, CheckCircle2, Shield, X, User, Bell, BellRing, Laptop, AlertTriangle, ShieldCheck } from 'lucide-react';
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

type SettingsTab = 'account' | 'notifications' | 'ingestion';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    getBrowserNotificationPermission(),
  );

  const { getToken } = useAuth();
  const { user } = useUser();

  const isReviewer = Boolean(
    user?.publicMetadata?.role === 'reviewer' ||
    user?.publicMetadata?.role === 'admin'
  );

  // Load Gmail connection status only for reviewers
  const checkGmailConnection = useCallback(async () => {
    if (!isReviewer) return;
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
  }, [getToken, isReviewer]);

  useEffect(() => {
    if (isReviewer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void checkGmailConnection();
    }
  }, [checkGmailConnection, isReviewer]);

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

  const userRole = (user?.publicMetadata?.role as string) || 'student';

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <header className="border-b border-[var(--cf-border-subtle)] pb-4">
        <h1 className="font-sans-display text-[length:var(--cf-text-display-size)] leading-tight font-bold text-[var(--cf-text)]">
          Settings
        </h1>
        <p className="mt-1 font-reading text-[length:var(--cf-text-subtitle-size)] text-[var(--cf-text-secondary)]">
          Manage your account profile, notification alerts, and campus notice ingestion.
        </p>

        {/* Settings Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pt-6">
          {[
            { id: 'account' as SettingsTab, label: 'Profile & Account', icon: User },
            { id: 'notifications' as SettingsTab, label: 'Notification Alerts', icon: Bell },
            { id: 'ingestion' as SettingsTab, label: 'Notice Ingestion', icon: Mail },
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

      {/* Tab 1: Account Profile */}
      {activeTab === 'account' && (
        <section className="space-y-6">
          <Card padding="lg" className="space-y-6 border-[var(--cf-border)]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--cf-border-subtle)] pb-6">
              <div className="flex items-center gap-4">
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt={user.fullName || 'User avatar'}
                    className="h-14 w-14 rounded-2xl border border-[var(--cf-border)] object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20 font-bold text-lg">
                    {user?.firstName?.[0] || 'U'}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-sans-display text-lg font-bold text-[var(--cf-text)]">
                      {user?.fullName || 'Student Account'}
                    </h2>
                    <Badge variant={isReviewer ? 'brand' : 'neutral'} className="text-[10px] uppercase font-bold tracking-wider">
                      {userRole}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--cf-text-secondary)]">
                    {user?.primaryEmailAddress?.emailAddress || 'No email associated'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="success" className="text-xs">
                  Active Session
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)] p-4 space-y-1">
                <span className="font-semibold text-[var(--cf-text-tertiary)] uppercase tracking-wider text-[10px]">
                  Authentication Provider
                </span>
                <p className="font-medium text-[var(--cf-text)]">Clerk Identity Management</p>
                <p className="text-[var(--cf-text-secondary)]">Encrypted sessions with JWT authentication</p>
              </div>

              <div className="rounded-xl border border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)] p-4 space-y-1">
                <span className="font-semibold text-[var(--cf-text-tertiary)] uppercase tracking-wider text-[10px]">
                  Data Storage & Isolation
                </span>
                <p className="font-medium text-[var(--cf-text)]">PostgreSQL on Neon Cloud</p>
                <p className="text-[var(--cf-text-secondary)]">Per-user isolated tenant records</p>
              </div>
            </div>

            <div className="border-t border-[var(--cf-border-subtle)] pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--cf-text-secondary)]">
              <span>Looking for policies and legal terms?</span>
              <div className="flex gap-4 font-medium">
                <Link to="/privacy" className="text-[var(--cf-brand)] hover:underline">
                  Privacy Policy
                </Link>
                <Link to="/terms" className="text-[var(--cf-brand)] hover:underline">
                  Terms of Service
                </Link>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Tab 2: Notifications */}
      {activeTab === 'notifications' && (
        <Card padding="lg" className="space-y-6 border-[var(--cf-border)]">
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
                  <h4 className="text-xs font-bold text-[var(--cf-text)]">In-App Notification Center</h4>
                  <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                    Active. Displays unread alerts and persistent dismissals across device sessions.
                  </p>
                </div>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </Card>
      )}

      {/* Tab 3: Ingestion */}
      {activeTab === 'ingestion' && (
        <section className="space-y-6">
          {isReviewer ? (
            <Card padding="lg" className="flex flex-col gap-6 border-[var(--cf-border)]">
              {/* Reviewer Gmail Integration */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-[var(--cf-border-subtle)] pb-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/20 text-[var(--cf-brand)]">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                        Reviewer Gmail Ingestion
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
                        ? `Ingesting campus notices from ${gmailEmail}.`
                        : 'Connect your institutional mailbox to scan incoming circulars and stage them for bulletin review.'}
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
                    Reviewer Ingestion Pipeline
                  </h4>
                  <ol className="relative border-s border-[var(--cf-border)] ml-2 space-y-3.5">
                    {[
                      'Link your institutional Google account via OAuth',
                      'OAuth tokens are encrypted at rest using AES-256-GCM',
                      'Only public campus announcements are analyzed',
                      'Structured candidates appear on Notice Board review tab',
                      'Approved notices publish directly to all enrolled students'
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
                      Security & Isolation
                    </h4>
                    <ul className="space-y-2 text-xs text-[var(--cf-text-secondary)]">
                      <li className="flex gap-2"><span className="text-[var(--cf-text-tertiary)]">•</span> Scoped strictly to read-only metadata permissions.</li>
                      <li className="flex gap-2"><span className="text-[var(--cf-text-tertiary)]">•</span> Tokens are authenticated and encrypted per-session.</li>
                      <li className="flex gap-2"><span className="text-[var(--cf-text-tertiary)]">•</span> You can revoke or disconnect at any time.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="lg" className="space-y-4 border-[var(--cf-border)]">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/20 text-[var(--cf-brand)]">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                    Verified Campus Ingestion
                  </h3>
                  <p className="text-sm text-[var(--cf-text-secondary)] leading-relaxed max-w-2xl">
                    Campus notices and examination alerts are vetted and ingested by designated departmental reviewers. As an enrolled student, all verified circulars, hackathons, and registration deadlines flow directly to your <strong>Notice Board</strong> and <strong>Dashboard</strong> automatically.
                  </p>
                  <p className="text-xs text-[var(--cf-text-tertiary)]">
                    No individual email connection is required for student accounts.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </section>
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
                Connect Reviewer Mailbox
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
              Link your institutional Gmail account to enable read-only notice candidate ingestion for campus moderation.
            </p>
            
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsConnectModalOpen(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={handleConnectGmail} disabled={isConnecting} size="sm">
                {isConnecting ? 'Connecting...' : 'Authorize Gmail'}
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
                Disconnect Mailbox
              </h2>
            </div>

            <p className="mb-4 font-reading text-xs leading-relaxed text-[var(--cf-text-secondary)]">
              Are you sure you want to disconnect {gmailEmail ? <strong className="text-[var(--cf-text)]">{gmailEmail}</strong> : 'your institutional mailbox'}?
              <br /><br />
              Stored OAuth access tokens will be purged immediately.
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
    </div>
  );
}
