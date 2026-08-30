import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Mail, CheckCircle2, Shield, Sparkles, X, User, Bell, Palette, Database, BellRing, Laptop } from 'lucide-react';
import { motion } from 'motion/react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  isBrowserNotificationSupported,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
} from '../lib/browserNotifications';

type SettingsTab = 'account' | 'appearance' | 'notifications' | 'integrations' | 'privacy';


interface GmailTestResult {
  status: number;
  messageCount: number;
  messages: Array<{ id: string; threadId?: string | null }>;
  messageIds: string[];
  resultSizeEstimate?: number;
  nextPageToken?: string | null;
  error?: string;
}

interface GmailMessageDetailResult {
  status: number;
  id?: string;
  sender?: string;
  recipient?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  bodyPreview?: string;
  error?: string;
}

interface GmailSyncTestResult {
  status: number;
  checked: number;
  newMessages: number;
  skipped: number;
  processed: number;
  noticesCreated?: number;
  error?: string;
  details?: string;
}


interface NoticeCandidateTestResult {
  status: number;
  candidate?: {
    title: string;
    summary: string;
    category: string;
    priority: string;
    audience?: string;
    importantDates?: Array<{ label: string; date: string }>;
    actionRequired?: string;
    venue?: string;
    links?: Array<{ label: string; url: string }>;
    documents?: Array<{ label: string; url: string }>;
    source: {
      provider: string;
      messageId: string;
      sender: string;
      subject: string;
    };
  };
  error?: string;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailLoading, setGmailLoading] = useState(true);

  // Dev-only test state
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<GmailTestResult | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string>('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailResult, setDetailResult] = useState<GmailMessageDetailResult | null>(null);
  const [detailsByMessageId, setDetailsByMessageId] = useState<Record<string, GmailMessageDetailResult>>({});
  const [detailLoadingById, setDetailLoadingById] = useState<Record<string, boolean>>({});
  const [analyzeLoadingById, setAnalyzeLoadingById] = useState<Record<string, boolean>>({});
  const [candidatesByMessageId, setCandidatesByMessageId] = useState<Record<string, NoticeCandidateTestResult>>({});
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<GmailSyncTestResult | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<NoticeCandidateTestResult | null>(null);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    getBrowserNotificationPermission(),
  );
  const { getToken } = useAuth();





  // Gmail connection status
  useEffect(() => {
    const checkGmailConnection = async () => {
      try {
        const token = await getToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/gmail/status', {
          headers,
        });

        if (!response.ok) {
          throw new Error('Failed to check Gmail status');
        }

        const data = await response.json();

        setGmailConnected(data.connected);
        setGmailEmail(data.email ?? null);
      } catch (error) {
        console.error('Failed to check Gmail connection:', error);
      } finally {
        setGmailLoading(false);
      }
    };

    checkGmailConnection();
  }, [getToken]);

  const handleTestFetchMessages = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/gmail/messages', {
        headers,
      });

      const status = response.status;
      const data = await response.json();

      if (!response.ok) {
        setTestResult({
          status,
          messageCount: 0,
          messages: [],
          messageIds: [],
          error: data.error || `HTTP ${status} Error`,
        });
        return;
      }

      const rawMessages = Array.isArray(data.messages) ? data.messages : [];
      const messages: Array<{ id: string; threadId: string | null }> = rawMessages
        .map((m: { id?: string; threadId?: string | null }) => ({
          id: m.id || '',
          threadId: m.threadId ?? null,
        }))
        .filter((m: { id: string; threadId: string | null }) => Boolean(m.id));

      const messageIds: string[] = messages.map((m: { id: string; threadId: string | null }) => m.id);


      if (messageIds.length > 0 && !selectedMessageId) {
        setSelectedMessageId(messageIds[0]);
      }

      setTestResult({
        status,
        messageCount: messages.length,
        messages,
        messageIds,
        resultSizeEstimate: data.resultSizeEstimate,
        nextPageToken: data.nextPageToken ?? null,
      });
    } catch (err) {
      setTestResult({
        status: 0,
        messageCount: 0,
        messages: [],
        messageIds: [],
        error: err instanceof Error ? err.message : 'Failed to fetch messages',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestFetchMessageDetails = async (messageIdToFetch?: string) => {
    const targetId = messageIdToFetch || selectedMessageId;
    if (!targetId || !targetId.trim()) {
      setDetailResult({
        status: 400,
        error: 'Please select or enter a valid message ID',
      });
      return;
    }

    const trimmedId = targetId.trim();
    setSelectedMessageId(trimmedId);
    setDetailLoading(true);
    setDetailLoadingById((prev) => ({ ...prev, [trimmedId]: true }));
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/gmail/messages/${encodeURIComponent(trimmedId)}`, {
        headers,
      });

      const status = response.status;
      const data = await response.json();

      if (!response.ok) {
        const errorResult: GmailMessageDetailResult = {
          status,
          error: data.error || `HTTP ${status} Error`,
        };
        setDetailResult(errorResult);
        setDetailsByMessageId((prev) => ({ ...prev, [trimmedId]: errorResult }));
        return;
      }

      const successResult: GmailMessageDetailResult = {
        status,
        id: data.id,
        sender: data.from,
        recipient: data.to,
        subject: data.subject,
        date: data.date,
        snippet: data.snippet,
        bodyPreview: data.body || data.bodyText || data.snippet || '',
      };
      setDetailResult(successResult);
      setDetailsByMessageId((prev) => ({ ...prev, [trimmedId]: successResult }));
    } catch (err) {
      const errorResult: GmailMessageDetailResult = {
        status: 0,
        error: err instanceof Error ? err.message : 'Failed to fetch message details',
      };
      setDetailResult(errorResult);
      setDetailsByMessageId((prev) => ({ ...prev, [trimmedId]: errorResult }));
    } finally {
      setDetailLoading(false);
      setDetailLoadingById((prev) => ({ ...prev, [trimmedId]: false }));
    }
  };

  const handleTestSync = async () => {
    setSyncLoading(true);
    setSyncResult(null);
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers,
      });

      const status = response.status;
      const data = await response.json();

      if (!response.ok) {
        setSyncResult({
          status,
          checked: 0,
          newMessages: 0,
          skipped: 0,
          processed: 0,
          noticesCreated: 0,
          error: data.error || `HTTP ${status} Error`,
          details: data.details,
        });
        return;
      }

      setSyncResult({
        status,
        checked: data.checked ?? 0,
        newMessages: data.newMessages ?? 0,
        skipped: data.skipped ?? 0,
        processed: data.processed ?? 0,
        noticesCreated: data.noticesCreated ?? data.processed ?? 0,
      });
    } catch (err) {
      setSyncResult({
        status: 0,
        checked: 0,
        newMessages: 0,
        skipped: 0,
        processed: 0,
        noticesCreated: 0,
        error: err instanceof Error ? err.message : 'Failed to sync Gmail messages',
      });

    } finally {
      setSyncLoading(false);
    }
  };

  const handleTestAnalyzeMessage = async (messageIdToAnalyze?: string) => {
    const targetId = messageIdToAnalyze || selectedMessageId;
    if (!targetId || !targetId.trim()) {
      setAnalyzeResult({
        status: 400,
        error: 'Please select or enter a valid message ID',
      });
      return;
    }

    const trimmedId = targetId.trim();
    setSelectedMessageId(trimmedId);
    setAnalyzeLoading(true);
    setAnalyzeLoadingById((prev) => ({ ...prev, [trimmedId]: true }));
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`/api/gmail/analyze/${encodeURIComponent(trimmedId)}`, {
        method: 'POST',
        headers,
      });

      const status = response.status;
      const data = await response.json();

      if (!response.ok) {
        const errorResult: NoticeCandidateTestResult = {
          status,
          error: data.error || `HTTP ${status} Error`,
        };
        setAnalyzeResult(errorResult);
        setCandidatesByMessageId((prev) => ({ ...prev, [trimmedId]: errorResult }));
        return;
      }

      const successResult: NoticeCandidateTestResult = {
        status,
        candidate: data,
      };
      setAnalyzeResult(successResult);
      setCandidatesByMessageId((prev) => ({ ...prev, [trimmedId]: successResult }));
    } catch (err) {
      const errorResult: NoticeCandidateTestResult = {
        status: 0,
        error: err instanceof Error ? err.message : 'Failed to analyze message',
      };
      setAnalyzeResult(errorResult);
      setCandidatesByMessageId((prev) => ({ ...prev, [trimmedId]: errorResult }));
    } finally {
      setAnalyzeLoading(false);
      setAnalyzeLoadingById((prev) => ({ ...prev, [trimmedId]: false }));
    }
  };






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
                  <Button variant="secondary" disabled>
                    Connected
                  </Button>
                ) : (
                  <Button onClick={() => setIsModalOpen(true)}>
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
                    Once released, circulars sent by department heads, clubs, and hackathon organizers will turn into structured feed items without copy-pasting.
                  </p>
                </div>
              </div>
            </div>

            {/* Dev Only: Test Gmail Message Retrieval */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                      DEV / TEST ONLY
                    </span>
                    <h4 className="font-sans-display text-xs font-bold text-[var(--cf-text)]">
                      Test Gmail Message Retrieval (GET /api/gmail/messages)
                    </h4>
                  </div>
                  <p className="text-xs text-[var(--cf-text-secondary)] mt-1">
                    Fetch up to 5 message metadata references using your authenticated session.
                  </p>
                </div>
                <Button
                  onClick={handleTestFetchMessages}
                  disabled={testLoading}
                  variant="secondary"
                  size="sm"
                >
                  {testLoading ? 'Fetching...' : 'Test GET Messages'}
                </Button>
              </div>

              {testResult && (
                <div className="mt-3 rounded-lg bg-[var(--cf-surface-muted)] p-3 border border-[var(--cf-border-subtle)] text-xs font-mono space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--cf-text-secondary)]">HTTP Status:</span>
                    <span className={testResult.status === 200 ? 'text-[var(--cf-success)] font-bold' : 'text-rose-400 font-bold'}>
                      {testResult.status}
                    </span>
                  </div>

                  {testResult.error ? (
                    <div className="text-rose-400">
                      Error: {testResult.error}
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="font-semibold text-[var(--cf-text-secondary)]">Messages Returned:</span>{' '}
                        <span className="text-[var(--cf-text)]">{testResult.messageCount}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--cf-text-secondary)]">Result Size Estimate:</span>{' '}
                        <span className="text-[var(--cf-text)]">{testResult.resultSizeEstimate ?? 'N/A'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--cf-text-secondary)]">Next Page Token:</span>{' '}
                        <span className="text-[var(--cf-text)]">{testResult.nextPageToken || 'None (null)'}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[var(--cf-text-secondary)] block mb-1">
                          Messages ({testResult.messages.length}):
                        </span>
                        {testResult.messages.length > 0 ? (
                          <div className="space-y-2 mt-2">
                            {testResult.messages.map((m, idx) => {
                              const msgDetail = detailsByMessageId[m.id];
                              const msgCandidate = candidatesByMessageId[m.id];
                              const isDetailLoading = detailLoadingById[m.id];
                              const isAnalyzeLoading = analyzeLoadingById[m.id];

                              return (
                                <div
                                  key={m.id}
                                  className={`p-3 rounded-lg border text-xs space-y-2.5 transition-all ${
                                    selectedMessageId === m.id
                                      ? 'bg-[var(--cf-brand-subtle)] border-[var(--cf-brand)]'
                                      : 'bg-[var(--cf-surface)] border-[var(--cf-border-subtle)]'
                                  }`}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="space-y-0.5 font-mono">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-[var(--cf-text-tertiary)]">
                                          #{idx + 1}
                                        </span>
                                        <span className="font-semibold text-[var(--cf-text)]">
                                          ID: {m.id}
                                        </span>
                                      </div>
                                      {m.threadId && (
                                        <div className="text-[11px] text-[var(--cf-text-secondary)] pl-4">
                                          Thread ID: {m.threadId}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        disabled={isDetailLoading}
                                        onClick={() => handleTestFetchMessageDetails(m.id)}
                                        className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--cf-surface-muted)] hover:bg-[var(--cf-brand)] hover:text-white border border-[var(--cf-border)] text-[var(--cf-text)] transition-all cursor-pointer disabled:opacity-50"
                                      >
                                        {isDetailLoading ? 'Fetching...' : 'Fetch Details'}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isAnalyzeLoading}
                                        onClick={() => handleTestAnalyzeMessage(m.id)}
                                        className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--cf-brand-subtle)] hover:bg-[var(--cf-brand)] hover:text-white border border-[var(--cf-brand)]/30 text-[var(--cf-brand)] transition-all cursor-pointer disabled:opacity-50"
                                      >
                                        {isAnalyzeLoading ? 'Analyzing...' : 'Analyze'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Individual Message Details */}
                                  {msgDetail && (
                                    <div className="rounded bg-[var(--cf-surface-muted)] p-2.5 border border-[var(--cf-border-subtle)] text-[11px] space-y-1.5 font-sans">
                                      {msgDetail.error ? (
                                        <div className="text-rose-400 font-mono">
                                          Error: {msgDetail.error}
                                        </div>
                                      ) : (
                                        <>
                                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                                            <div>
                                              <span className="font-semibold text-[var(--cf-text-secondary)]">Subject:</span>{' '}
                                              <span className="font-bold text-[var(--cf-text)]">{msgDetail.subject || '<No Subject>'}</span>
                                            </div>
                                            <div>
                                              <span className="font-semibold text-[var(--cf-text-secondary)]">Date:</span>{' '}
                                              <span className="text-[var(--cf-text)]">{msgDetail.date || '<No Date>'}</span>
                                            </div>
                                          </div>
                                          <div>
                                            <span className="font-semibold text-[var(--cf-text-secondary)]">From:</span>{' '}
                                            <span className="text-[var(--cf-text)]">{msgDetail.sender || '<Empty>'}</span>
                                          </div>
                                          <div>
                                            <span className="font-semibold text-[var(--cf-text-secondary)] block mb-0.5">Body Preview:</span>
                                            <div className="max-h-24 overflow-y-auto rounded bg-[var(--cf-surface)] p-2 border border-[var(--cf-border-subtle)] font-mono text-[10.5px] text-[var(--cf-text)] whitespace-pre-wrap">
                                              {msgDetail.bodyPreview || '<Empty Body>'}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Individual Candidate Analysis */}
                                  {msgCandidate && msgCandidate.candidate && (
                                    <div className="rounded bg-[var(--cf-brand-subtle)]/40 p-2.5 border border-[var(--cf-brand)]/20 text-[11px] space-y-1 font-sans">
                                      <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider bg-[var(--cf-brand)] text-white">
                                          {msgCandidate.candidate.category}
                                        </span>
                                        <span className="text-[10px] text-[var(--cf-text-secondary)] uppercase font-semibold">
                                          Priority: {msgCandidate.candidate.priority}
                                        </span>
                                      </div>
                                      <div className="font-bold text-[var(--cf-text)]">
                                        {msgCandidate.candidate.title}
                                      </div>
                                      <div className="text-[var(--cf-text-secondary)]">
                                        {msgCandidate.candidate.summary}
                                      </div>
                                      {msgCandidate.candidate.audience && (
                                        <div className="text-[var(--cf-text-tertiary)] text-[10.5px]">
                                          <span className="font-semibold">Audience:</span> {msgCandidate.candidate.audience}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-[var(--cf-text-tertiary)] font-sans">None</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Case B: Message Detail Retrieval */}
              <div className="border-t border-amber-500/20 pt-3 mt-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="font-sans-display text-xs font-bold text-[var(--cf-text)]">
                      Test Message Details (GET /api/gmail/messages/:messageId)
                    </h5>
                    <p className="text-[11px] text-[var(--cf-text-secondary)] mt-0.5">
                      Retrieve and parse complete email metadata and body text for a specific message ID.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={selectedMessageId}
                    onChange={(e) => setSelectedMessageId(e.target.value)}
                    placeholder="Enter or select Gmail message ID"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-[var(--cf-surface)] border border-[var(--cf-border)] text-[var(--cf-text)] placeholder:text-[var(--cf-text-tertiary)] focus:outline-none focus:border-[var(--cf-brand)]"
                  />
                  <Button
                    onClick={() => handleTestFetchMessageDetails()}
                    disabled={detailLoading || !selectedMessageId.trim()}
                    variant="secondary"
                    size="sm"
                  >
                    {detailLoading ? 'Fetching Details...' : 'Fetch Details'}
                  </Button>
                </div>

                {detailResult && (
                  <div className="rounded-lg bg-[var(--cf-surface-muted)] p-3 border border-[var(--cf-border-subtle)] text-xs space-y-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-semibold text-[var(--cf-text-secondary)]">HTTP Status:</span>
                      <span className={detailResult.status === 200 ? 'text-[var(--cf-success)] font-bold' : 'text-rose-400 font-bold'}>
                        {detailResult.status}
                      </span>
                    </div>

                    {detailResult.error ? (
                      <div className="text-rose-400 font-mono text-xs">
                        Error: {detailResult.error}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Message ID:</span>{' '}
                          <span className="font-mono text-[var(--cf-text)]">{detailResult.id}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Sender:</span>{' '}
                          <span className="text-[var(--cf-text)]">{detailResult.sender || '<Empty>'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Recipient:</span>{' '}
                          <span className="text-[var(--cf-text)]">{detailResult.recipient || '<Empty>'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Subject:</span>{' '}
                          <span className="text-[var(--cf-text)] font-semibold">{detailResult.subject || '<No Subject>'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Date:</span>{' '}
                          <span className="text-[var(--cf-text)]">{detailResult.date || '<No Date>'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Snippet:</span>{' '}
                          <span className="text-[var(--cf-text-secondary)] italic">{detailResult.snippet || '<Empty>'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)] block mb-1">Body Preview:</span>
                          <div className="max-h-40 overflow-y-auto rounded bg-[var(--cf-surface)] p-2.5 border border-[var(--cf-border-subtle)] font-mono text-[11px] text-[var(--cf-text)] whitespace-pre-wrap">
                            {detailResult.bodyPreview || '<Empty Body>'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Case C: Automatic Gmail Sync (POST /api/gmail/sync) */}
              <div className="border-t border-amber-500/20 pt-3 mt-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="font-sans-display text-xs font-bold text-[var(--cf-text)]">
                      Test Gmail Sync (POST /api/gmail/sync)
                    </h5>
                    <p className="text-[11px] text-[var(--cf-text-secondary)] mt-0.5">
                      Fetch up to 10 recent messages, deduplicate against processed records, and return structured sync statistics.
                    </p>
                  </div>
                  <Button
                    onClick={handleTestSync}
                    disabled={syncLoading}
                    variant="secondary"
                    size="sm"
                  >
                    {syncLoading ? 'Syncing...' : 'Test POST Sync'}
                  </Button>
                </div>

                {syncResult && (
                  <div className="rounded-lg bg-[var(--cf-surface-muted)] p-3 border border-[var(--cf-border-subtle)] text-xs font-mono space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--cf-text-secondary)]">HTTP Status:</span>
                      <span className={syncResult.status === 200 ? 'text-[var(--cf-success)] font-bold' : 'text-rose-400 font-bold'}>
                        {syncResult.status}
                      </span>
                    </div>

                    {syncResult.error ? (
                      <div className="text-rose-400 space-y-1">
                        <div>Error: {syncResult.error}</div>
                        {syncResult.details && (
                          <div className="text-[11px] text-rose-300/80 font-mono">
                            Details: {syncResult.details}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                        <div className="rounded bg-[var(--cf-surface)] p-2 border border-[var(--cf-border-subtle)]">
                          <span className="text-[10px] text-[var(--cf-text-secondary)] block font-sans">Checked</span>
                          <span className="text-sm font-bold text-[var(--cf-text)]">{syncResult.checked}</span>
                        </div>
                        <div className="rounded bg-[var(--cf-surface)] p-2 border border-[var(--cf-border-subtle)]">
                          <span className="text-[10px] text-[var(--cf-text-secondary)] block font-sans">New Messages</span>
                          <span className="text-sm font-bold text-[var(--cf-brand)]">{syncResult.newMessages}</span>
                        </div>
                        <div className="rounded bg-[var(--cf-surface)] p-2 border border-[var(--cf-border-subtle)]">
                          <span className="text-[10px] text-[var(--cf-text-secondary)] block font-sans">Skipped</span>
                          <span className="text-sm font-bold text-[var(--cf-text-tertiary)]">{syncResult.skipped}</span>
                        </div>
                        <div className="rounded bg-[var(--cf-surface)] p-2 border border-[var(--cf-border-subtle)]">
                          <span className="text-[10px] text-[var(--cf-text-secondary)] block font-sans">Processed</span>
                          <span className="text-sm font-bold text-[var(--cf-success)]">{syncResult.processed}</span>
                        </div>
                        <div className="rounded bg-[var(--cf-surface)] p-2 border border-[var(--cf-border-subtle)]">
                          <span className="text-[10px] text-[var(--cf-text-secondary)] block font-sans">Notices Created</span>
                          <span className="text-sm font-bold text-amber-500">{syncResult.noticesCreated ?? 0}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Case D: Notice Analysis (POST /api/gmail/analyze/:messageId) */}
              <div className="border-t border-amber-500/20 pt-3 mt-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="font-sans-display text-xs font-bold text-[var(--cf-text)]">
                      Test Notice Analysis (POST /api/gmail/analyze/:messageId)
                    </h5>
                    <p className="text-[11px] text-[var(--cf-text-secondary)] mt-0.5">
                      Analyze a message using the Notice Analyzer to extract a validated NoticeCandidate without publishing.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={selectedMessageId}
                    onChange={(e) => setSelectedMessageId(e.target.value)}
                    placeholder="Enter or select Gmail message ID"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono bg-[var(--cf-surface)] border border-[var(--cf-border)] text-[var(--cf-text)] placeholder:text-[var(--cf-text-tertiary)] focus:outline-none focus:border-[var(--cf-brand)]"
                  />
                  <Button
                    onClick={() => handleTestAnalyzeMessage()}
                    disabled={analyzeLoading || !selectedMessageId.trim()}
                    variant="secondary"
                    size="sm"
                  >
                    {analyzeLoading ? 'Analyzing...' : 'Analyze Message'}
                  </Button>
                </div>

                {analyzeResult && (
                  <div className="rounded-lg bg-[var(--cf-surface-muted)] p-3 border border-[var(--cf-border-subtle)] text-xs space-y-2">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-semibold text-[var(--cf-text-secondary)]">HTTP Status:</span>
                      <span className={analyzeResult.status === 200 ? 'text-[var(--cf-success)] font-bold' : 'text-rose-400 font-bold'}>
                        {analyzeResult.status}
                      </span>
                    </div>

                    {analyzeResult.error ? (
                      <div className="text-rose-400 font-mono text-xs">
                        Error: {analyzeResult.error}
                      </div>
                    ) : analyzeResult.candidate ? (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] border border-[var(--cf-brand)]/20">
                            {analyzeResult.candidate.category}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--cf-surface)] text-[var(--cf-text-secondary)] border border-[var(--cf-border)]">
                            Priority: {analyzeResult.candidate.priority}
                          </span>
                        </div>

                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Title:</span>{' '}
                          <span className="font-sans-display font-bold text-[var(--cf-text)]">{analyzeResult.candidate.title}</span>
                        </div>

                        <div>
                          <span className="font-semibold text-[var(--cf-text-secondary)]">Summary:</span>{' '}
                          <span className="text-[var(--cf-text)]">{analyzeResult.candidate.summary}</span>
                        </div>

                        {analyzeResult.candidate.audience && (
                          <div>
                            <span className="font-semibold text-[var(--cf-text-secondary)]">Audience:</span>{' '}
                            <span className="text-[var(--cf-text)]">{analyzeResult.candidate.audience}</span>
                          </div>
                        )}

                        {analyzeResult.candidate.actionRequired && (
                          <div>
                            <span className="font-semibold text-[var(--cf-text-secondary)]">Action Required:</span>{' '}
                            <span className="text-[var(--cf-text)]">{analyzeResult.candidate.actionRequired}</span>
                          </div>
                        )}

                        {analyzeResult.candidate.venue && (
                          <div>
                            <span className="font-semibold text-[var(--cf-text-secondary)]">Venue:</span>{' '}
                            <span className="text-[var(--cf-text)]">{analyzeResult.candidate.venue}</span>
                          </div>
                        )}

                        {analyzeResult.candidate.importantDates && analyzeResult.candidate.importantDates.length > 0 && (
                          <div>
                            <span className="font-semibold text-[var(--cf-text-secondary)] block mb-1">Important Dates:</span>
                            <ul className="list-disc list-inside space-y-0.5 text-[var(--cf-text)]">
                              {analyzeResult.candidate.importantDates.map((d, idx) => (
                                <li key={idx}>
                                  <span className="font-medium">{d.label}:</span> {d.date}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {analyzeResult.candidate.links && analyzeResult.candidate.links.length > 0 && (
                          <div>
                            <span className="font-semibold text-[var(--cf-text-secondary)] block mb-1">Links:</span>
                            <div className="flex flex-wrap gap-2">
                              {analyzeResult.candidate.links.map((l, idx) => (
                                <a
                                  key={idx}
                                  href={l.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--cf-brand)] hover:underline font-mono text-[11px]"
                                >
                                  [{l.label}] {l.url}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {analyzeResult.candidate.documents && analyzeResult.candidate.documents.length > 0 && (
                          <div>
                            <span className="font-semibold text-[var(--cf-text-secondary)] block mb-1">Documents:</span>
                            <div className="flex flex-wrap gap-2">
                              {analyzeResult.candidate.documents.map((doc, idx) => (
                                <a
                                  key={idx}
                                  href={doc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--cf-brand)] hover:underline font-mono text-[11px]"
                                >
                                  [{doc.label}] {doc.url}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-1 border-t border-[var(--cf-border-subtle)] text-[10px] text-[var(--cf-text-tertiary)] font-mono">
                          Source Message ID: {analyzeResult.candidate.source.messageId} | Sender: {analyzeResult.candidate.source.sender}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
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
                    Always enabled. Displays unread count badge in the top navigation bar.
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

      {/* Gmail Connection Modal */}
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
                Connect Gmail
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
              CampusFlow can automatically identify important emails and turn them into organized campus notices.
              <br /><br />
              Connect your Gmail account to let CampusFlow securely access relevant campus emails.
            </p>
            
            <div className="flex justify-end gap-2">
              <Button onClick={() => setIsModalOpen(false)} variant="secondary" size="sm">
                Cancel
              </Button>
              <Button onClick={() => { window.location.href = '/api/gmail/connect'; }} size="sm">
                Connect Gmail
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
