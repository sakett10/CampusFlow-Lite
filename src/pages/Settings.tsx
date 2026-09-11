import { useState, useEffect, useCallback } from 'react';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { Mail, Shield, X, User, Bell, BellRing, Laptop, AlertTriangle, RefreshCw, LogOut, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../lib/browserNotifications';
import { gmailApi } from '../api/gmailApi';

type SettingsTab = 'account' | 'integrations' | 'notifications';

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Not yet synced';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recently';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return 'Just now';
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes === 1) return '1 minute ago';
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    if (typeof window === 'undefined') return 'account';
    const params = new URLSearchParams(window.location.search);
    return params.get('gmail') || params.get('gmail_error') ? 'integrations' : 'account';
  });
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [purgeData, setPurgeData] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusText, setSyncStatusText] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const gmailParam = params.get('gmail');
    const gmailErr = params.get('gmail_error');
    if (gmailParam === 'connected') {
      return {
        type: 'success',
        text: 'Gmail successfully connected. CampusFlow can now organize your campus notices and academic deadlines.',
      };
    }
    if (gmailErr) {
      const decodedErr = decodeURIComponent(gmailErr);
      const friendlyErr =
        decodedErr === 'access_denied'
          ? 'Google OAuth authorization was cancelled or denied.'
          : decodedErr === 'invalid_state'
            ? 'OAuth session expired. Please click Connect Gmail to try again.'
            : decodedErr === 'missing_code'
              ? 'Google did not provide an authorization code.'
              : `Gmail connection failed: ${decodedErr}`;
      return {
        type: 'error',
        text: friendlyErr,
      };
    }
    return null;
  });

  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    getBrowserNotificationPermission(),
  );

  const { getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  const isDemo =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('demo') === '1' ||
      window.sessionStorage?.getItem('cf_demo') === '1');

  // Load Gmail connection status
  const checkGmailConnection = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        if (
          typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('demo') === '1' ||
            window.sessionStorage?.getItem('cf_demo') === '1')
        ) {
          setGmailConnected(true);
          setGmailEmail('alex.chen@university.edu');
          setLastSyncedAt(new Date(Date.now() - 12 * 60000).toISOString());
          setGmailLoading(false);
          return;
        }
        setGmailLoading(false);
        return;
      }

      const data = await gmailApi.getStatus(token);
      setGmailConnected(data.connected);
      setGmailEmail(data.email ?? null);
      setLastSyncedAt(data.updatedAt || data.connectedAt || null);
    } catch (error) {
      console.error('Failed to check Gmail connection:', error);
    } finally {
      setGmailLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkGmailConnection();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gmail') || params.get('gmail_error')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
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
      setFeedbackMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to start Gmail authorization',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle manual sync
  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncStatusText(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      const stats = await gmailApi.sync(token);
      const academicCount = stats.relevantAcademicMessages ?? 0;
      const tasksAdded = stats.tasksGenerated ?? 0;
      setLastSyncedAt(new Date().toISOString());

      let statusMsg = '';
      if (academicCount === 0 && tasksAdded === 0) {
        statusMsg = 'Sync complete. 0 relevant academic emails found.';
      } else {
        statusMsg = `Sync complete: ${academicCount} relevant academic email${academicCount === 1 ? '' : 's'} found, ${tasksAdded} deadline task${tasksAdded === 1 ? '' : 's'} added.`;
      }

      setSyncStatusText(statusMsg);
      setFeedbackMessage({
        type: 'success',
        text: statusMsg,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campusflow:refresh-tasks'));
        window.dispatchEvent(new CustomEvent('campusflow:refresh-notices'));
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.toLowerCase().includes('not connected') ||
        errMsg.toLowerCase().includes('expired') ||
        errMsg.toLowerCase().includes('revoked')
      ) {
        setGmailConnected(false);
        setFeedbackMessage({
          type: 'error',
          text: 'Gmail authorization expired or was revoked. Please reconnect your account.',
        });
      } else {
        setSyncStatusText(`Sync failed: ${errMsg}`);
        setFeedbackMessage({
          type: 'error',
          text: `Gmail sync failed: ${errMsg}`,
        });
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle Gmail disconnection
  const handleDisconnectGmail = async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');

      const res = await gmailApi.disconnect(token, { purgeData });
      setGmailConnected(false);
      setGmailEmail(null);
      setLastSyncedAt(null);
      setIsDisconnectModalOpen(false);
      setFeedbackMessage({
        type: 'success',
        text: res.purged
          ? 'Gmail account disconnected. Imported Gmail data was deleted.'
          : 'Gmail account disconnected. Imported Gmail data was preserved.',
      });
      setPurgeData(false);
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
        if (isDisconnectModalOpen) {
          setIsDisconnectModalOpen(false);
          setPurgeData(false);
        }
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
        <p className="mt-1 text-sm text-[var(--cf-text-secondary)]">
          Manage your account profile, Gmail integration, and notification preferences.
        </p>

        {/* Settings Navigation Tabs */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pt-6">
          {[
            { id: 'account' as SettingsTab, label: 'Account', icon: User },
            { id: 'integrations' as SettingsTab, label: 'Integrations', icon: Mail },
            { id: 'notifications' as SettingsTab, label: 'Notifications', icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-h-9 items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-[var(--cf-brand)] text-white shadow-xs'
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

      {/* Global Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="hover:opacity-75 transition-opacity cursor-pointer p-1"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
                    className="h-12 w-12 rounded-xl border border-[var(--cf-border)] object-cover shadow-xs"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-800 border border-slate-200 font-bold text-base">
                    {user?.firstName?.[0] || (isDemo ? 'A' : 'U')}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                      {user?.fullName || (isDemo ? 'Alex Chen' : 'Student Account')}
                    </h2>
                    <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {userRole}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--cf-text-secondary)]">
                    {user?.primaryEmailAddress?.emailAddress ||
                      (isDemo ? 'alex.chen@university.edu' : 'No email associated')}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => signOut({ redirectUrl: '/' })}
                  leftIcon={<LogOut className="w-3.5 h-3.5 text-slate-600" />}
                  className="text-xs font-semibold"
                >
                  Sign Out
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)] p-4 space-y-1">
                <span className="font-semibold text-[var(--cf-text-tertiary)] uppercase tracking-wider text-[10px]">
                  Authentication Provider
                </span>
                <p className="font-medium text-[var(--cf-text)]">Clerk Identity Management</p>
                <p className="text-[var(--cf-text-secondary)]">Signed session with JWT authentication</p>
              </div>

              <div className="rounded-xl border border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)] p-4 space-y-1">
                <span className="font-semibold text-[var(--cf-text-tertiary)] uppercase tracking-wider text-[10px]">
                  Data Storage & Isolation
                </span>
                <p className="font-medium text-[var(--cf-text)]">PostgreSQL Database</p>
                <p className="text-[var(--cf-text-secondary)]">Per-user isolated tenant records</p>
              </div>
            </div>

            <div className="border-t border-[var(--cf-border-subtle)] pt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--cf-text-secondary)]">
              <span>Legal policies and terms</span>
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

      {/* Tab 2: Integrations (Gmail) */}
      {activeTab === 'integrations' && (
        <section className="space-y-6">
          <Card padding="lg" className="flex flex-col gap-6 border-[var(--cf-border)]">
            {/* Gmail Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-[var(--cf-border-subtle)] pb-6">
              <div className="flex items-start gap-4 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-800">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                      Google Workspace / Gmail
                    </h2>
                    {gmailLoading ? (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Checking...
                      </span>
                    ) : gmailConnected ? (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        Connected
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        Disconnected
                      </span>
                    )}
                  </div>

                  {gmailConnected && gmailEmail ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-xs font-semibold text-[var(--cf-text)]">
                        Account: <span className="font-mono">{gmailEmail}</span>
                      </p>
                      <p className="text-xs text-[var(--cf-text-secondary)]">
                        Last synced: {formatRelativeTime(lastSyncedAt)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--cf-text-secondary)] leading-relaxed max-w-lg">
                      Connect your college Gmail account to automatically scan for campus circulars, exam schedules, and submission deadlines.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start">
                {gmailLoading ? (
                  <Button disabled variant="secondary" size="sm">
                    Checking...
                  </Button>
                ) : gmailConnected ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSyncNow}
                      disabled={isSyncing}
                      className="gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsDisconnectModalOpen(true)}
                      className="text-rose-700 hover:bg-rose-50 border-rose-200"
                    >
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => setIsConnectModalOpen(true)}>
                    Connect Gmail
                  </Button>
                )}
              </div>
            </div>

            {syncStatusText && (
              <div className="p-3 rounded-lg bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)] text-xs text-[var(--cf-text-secondary)]">
                {syncStatusText}
              </div>
            )}

            {/* Scope & Explanation */}
            <div className="space-y-4 text-xs">
              <h3 className="font-sans-display text-xs font-bold uppercase tracking-wider text-[var(--cf-text-tertiary)] flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-700" />
                Integration Scope & Transparency
              </h3>
              <div className="rounded-xl border border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)] p-4 space-y-2.5 text-[var(--cf-text-secondary)] leading-relaxed">
                <p>
                  • <strong>Read-only access:</strong> CampusFlow requests <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">gmail.readonly</code> permission. It cannot compose, delete, or modify any messages.
                </p>
                <p>
                  • <strong>Academic purpose:</strong> The integration is used exclusively to parse student notices, examination circulars, and course assignment deadlines.
                </p>
                <p>
                  • <strong>User control:</strong> You can disconnect at any time to purge stored OAuth tokens immediately.
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Tab 3: Notifications */}
      {activeTab === 'notifications' && (
        <Card padding="lg" className="space-y-6 border-[var(--cf-border)]">
          <div>
            <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">Notification Alerts</h2>
            <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
              Configure browser notifications and in-app deadline reminder alerts.
            </p>
          </div>

          <div className="space-y-4">
            {/* Desktop Notifications */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)]">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700">
                  <Laptop className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--cf-text)]">Browser Push Notifications</h3>
                  <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                    Receive immediate browser notifications when critical campus notices are published.
                  </p>
                </div>
              </div>

              {browserPermission === 'unsupported' ? (
                <span className="text-xs text-slate-400">Not supported on this browser</span>
              ) : browserPermission === 'granted' ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Enabled
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await requestBrowserNotificationPermission();
                    setBrowserPermission(res);
                  }}
                >
                  <BellRing className="w-3.5 h-3.5 mr-1.5" />
                  Enable Browser Alerts
                </Button>
              )}
            </div>

            {/* In-App Notifications */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--cf-surface-muted)] border border-[var(--cf-border-subtle)]">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-700">
                  <Bell className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--cf-text)]">In-App Deadline Reminders</h3>
                  <p className="text-xs text-[var(--cf-text-secondary)] mt-0.5">
                    Active. Displays task deadline reminders dynamically based on scheduled reminder rules.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                <CheckCircle className="w-3.5 h-3.5" />
                Active
              </span>
            </div>
          </div>
        </Card>
      )}

      {/* Connect Gmail Modal */}
      {isConnectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] backdrop-blur-xs"
          role="presentation"
          onClick={() => setIsConnectModalOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-sm rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 shadow-md"
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
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-5 text-xs leading-relaxed text-[var(--cf-text-secondary)]">
              CampusFlow requests read-only access to scan college emails and circulars for academic deadlines and notices. Access is strictly scoped to your private workflow.
            </p>

            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsConnectModalOpen(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={handleConnectGmail} disabled={isConnecting} size="sm">
                {isConnecting ? 'Redirecting...' : 'Authorize with Google'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Disconnect Gmail Confirmation Modal */}
      {isDisconnectModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] backdrop-blur-xs"
          role="presentation"
          onClick={() => {
            if (!isDisconnecting) {
              setIsDisconnectModalOpen(false);
              setPurgeData(false);
            }
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-sm rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 shadow-md"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <h2 className="font-sans-display text-base font-bold text-[var(--cf-text)]">
                Disconnect Gmail
              </h2>
            </div>

            <p className="mb-3 text-xs leading-relaxed text-[var(--cf-text-secondary)]">
              Are you sure you want to disconnect {gmailEmail ? <strong className="text-[var(--cf-text)]">{gmailEmail}</strong> : 'your mailbox'}?
              <br /><br />
              Stored OAuth access tokens will be purged immediately.
            </p>

            <div className="mb-4 rounded-lg bg-[var(--cf-surface-muted)] p-3 border border-[var(--cf-border-subtle)]">
              <label className="flex items-start gap-2.5 text-xs text-[var(--cf-text)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={purgeData}
                  onChange={(e) => setPurgeData(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <div className="space-y-0.5">
                  <span className="font-semibold text-[var(--cf-text)]">
                    Also delete synced Gmail data from CampusFlow
                  </span>
                  <p className="text-[11px] text-[var(--cf-text-secondary)] leading-relaxed">
                    This removes imported email content and Gmail sync history. Your tasks and noticeboard notices will be preserved.
                  </p>
                </div>
              </label>
            </div>

            {disconnectError && (
              <div className="mb-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
                {disconnectError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  setIsDisconnectModalOpen(false);
                  setPurgeData(false);
                }}
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
