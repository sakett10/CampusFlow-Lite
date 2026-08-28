import { useState, useEffect } from 'react';
import { campusApi } from '../api/campusApi';
import type { CampusItem, ItemType } from '../lib/types';
import { Sparkles, AlertTriangle, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuth } from '@clerk/clerk-react';

const normalizeDate = (
  value: string | null | undefined,
  fallbackYear?: string
): string => {
  if (!value) return '';

  // Already in HTML date format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  // Handle "DD Month YYYY" or "Month DD, YYYY" (and variations with/without year)
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };

  // 1. Try matching "25 September 2026"
  const matchDDMonth = value.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+(\d{4}))?/i
  );
  if (matchDDMonth) {
    const day = matchDDMonth[1].padStart(2, '0');
    const month = months[matchDDMonth[2].toLowerCase()];
    const year = matchDDMonth[3] || fallbackYear;
    if (year) return `${year}-${month}-${day}`;
  }

  // 2. Try matching "September 25, 2026"
  const matchMonthDD = value.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s+(\d{4}))?/i
  );
  if (matchMonthDD) {
    const month = months[matchMonthDD[1].toLowerCase()];
    const day = matchMonthDD[2].padStart(2, '0');
    const year = matchMonthDD[3] || fallbackYear;
    if (year) return `${year}-${month}-${day}`;
  }

  return '';
};

type AnalyzeNoticeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<CampusItem, 'id'>) => void;
};

export default function AnalyzeNoticeModal({ isOpen, onClose, onSave }: AnalyzeNoticeModalProps) {
  const [step, setStep] = useState<'INPUT' | 'ANALYZING' | 'REVIEW'>('INPUT');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const [formData, setFormData] = useState<Partial<CampusItem>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setStep('INPUT');
        setText('');
        setFormData({});
        setError(null);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError("Please paste a notice to analyze.");
      return;
    }
    setError(null);
    setStep('ANALYZING');
    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication required');
      const result = await campusApi.analyzeNotice(token, text);
setFormData({
  ...result,
  title: result.title || null,
  type: result.type || null,
  description: result.description || null,
  date: normalizeDate(result.date),
  registrationDeadline: normalizeDate(
    result.registrationDeadline,
    normalizeDate(result.date).substring(0, 4)
  ),
  venue: result.venue || null,
  eligibility: result.eligibility || null,
  organizer: result.organizer || null,
  importantActions: result.importantActions || [],
  sourceText: text,
});
      setStep('REVIEW');
    } catch (err: unknown) {
      console.error("ANALYZE NOTICE FAILED:", err);
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setStep('INPUT');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title?.trim() || !formData.type) {
      setError("Title and Type are required.");
      return;
    }

    onSave({
      title: formData.title,
      type: formData.type as ItemType,
      description: formData.description || null,
      date: formData.date || null,
      startTime: formData.startTime || null,
      endTime: formData.endTime || null,
      registrationDeadline: formData.registrationDeadline || null,
      venue: formData.venue || null,
      eligibility: formData.eligibility || null,
      organizer: formData.organizer || null,
      importantActions: formData.importantActions || [],
      sourceText: text
    });

    // Reset state
    setStep('INPUT');
    setText('');
    setFormData({});
    onClose();
  };

  const closeAndReset = () => {
    setStep('INPUT');
    setText('');
    setFormData({});
    setError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-[var(--cf-overlay)] flex items-center justify-center p-4 z-50 transition-opacity backdrop-blur-xs"
      onClick={closeAndReset}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--cf-surface)] rounded-[var(--cf-radius-xl)] shadow-[var(--cf-elev-3)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 border border-[var(--cf-border)] relative"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="modal-title" className="font-sans-display text-lg font-bold text-[var(--cf-text)] flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--cf-ai)]" aria-hidden="true" />
            Analyze Campus Notice
          </h2>
          <button
            type="button"
            onClick={closeAndReset}
            className="text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] rounded-lg p-1.5 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 p-3 bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] text-[var(--cf-danger)] rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {step === 'INPUT' && (
          <div className="space-y-4">
            <p className="font-reading text-sm text-[var(--cf-text-secondary)]">
              Paste an email, announcement, circular, or WhatsApp message. CampusFlow will extract events, dates, and deadlines.
            </p>
            <textarea
              id="notice-text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste raw notice text here (e.g. 'Annual Hackathon on Oct 14th at Hall B, registration deadline Oct 10th')..."
              className="w-full h-48 p-3.5 border border-[var(--cf-border)] rounded-xl font-reading text-[15px] focus:ring-2 focus:ring-[var(--cf-brand)] focus:border-transparent outline-none resize-none bg-[var(--cf-surface-muted)] text-[var(--cf-text)] placeholder:text-[var(--cf-text-tertiary)]"
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={closeAndReset}>Cancel</Button>
              <Button variant="ai" onClick={handleAnalyze} rightIcon={<Sparkles className="w-4 h-4" />}>
                Extract Information
              </Button>
            </div>
          </div>
        )}

        {step === 'ANALYZING' && (
          <div className="py-14 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--cf-ai-subtle)] text-[var(--cf-ai)] border border-[var(--cf-ai-border)] shadow-[var(--cf-elev-ai)]">
              <Sparkles className="h-6 w-6 animate-pulse" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="font-sans-display text-base font-semibold text-[var(--cf-text)]">
                Analyzing campus notice...
              </p>
              <p className="text-xs text-[var(--cf-text-secondary)] font-mono-meta">
                Detecting dates, deadlines, and key actions
              </p>
            </div>
          </div>
        )}

        {step === 'REVIEW' && (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="p-3 bg-[var(--cf-ai-subtle)] border border-[var(--cf-ai-border)] rounded-xl text-xs font-medium text-[var(--cf-ai)] flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-[var(--cf-text)]">
                Review the structured fields extracted below. You can adjust any field before publishing to your feed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input id="field-title" required label="Notice Title *" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div>
                <label htmlFor="field-type" className="block text-sm font-medium text-[var(--cf-text)] mb-1.5">Category *</label>
                <select id="field-type" required value={formData.type || ''} onChange={e => setFormData({...formData, type: e.target.value as ItemType})} className="w-full h-11 px-3.5 border border-[var(--cf-border)] rounded-xl bg-[var(--cf-surface)] text-[var(--cf-text)] text-sm focus:ring-2 focus:ring-[var(--cf-brand)] focus:border-transparent outline-none">
                  <option value="" disabled>Select Category</option>
                  <option value="HACKATHON">Hackathon</option>
                  <option value="WORKSHOP">Workshop</option>
                  <option value="EVENT">Event</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="DEADLINE">Deadline</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="field-description" className="block text-sm font-medium text-[var(--cf-text)] mb-1.5">Description</label>
              <textarea id="field-description" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-3 border border-[var(--cf-border)] rounded-xl h-20 bg-[var(--cf-surface)] text-[var(--cf-text)] text-sm focus:ring-2 focus:ring-[var(--cf-brand)] focus:border-transparent outline-none resize-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['date', 'startTime', 'endTime', 'registrationDeadline', 'venue', 'organizer', 'eligibility'].map((field) => {
                const isMissing = formData[field as keyof CampusItem] === null;
                const fieldId = `field-${field}`;
                const errorId = `error-${field}`;

                return (
                <div key={field}>
                  <label htmlFor={fieldId} className="block text-sm font-medium text-[var(--cf-text)] mb-1.5 capitalize flex justify-between">
                    {field.replace(/([A-Z])/g, ' $1').trim()}
                    {isMissing && (
                      <span id={errorId} className="text-[var(--cf-warning)] text-xs flex items-center gap-1 font-mono-meta"><AlertTriangle className="w-3 h-3" aria-hidden="true"/> Not found</span>
                    )}
                  </label>
                  <Input
                    id={fieldId}
                    aria-invalid={isMissing ? "true" : undefined}
                    aria-describedby={isMissing ? errorId : undefined}
                    type={field.toLowerCase().includes('date') || field.toLowerCase().includes('deadline') ? "date" : field.toLowerCase().includes('time') ? "time" : "text"}
                    value={(formData[field as keyof CampusItem] as string) || ''}
                    onChange={e => setFormData({...formData, [field]: e.target.value || null})}
                    placeholder={isMissing ? "Not found in text" : ""}
                    className={isMissing ? 'border-[var(--cf-border-subtle)] bg-[var(--cf-surface-muted)]' : ''}
                  />
                </div>
              )})}
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-[var(--cf-border-subtle)]">
              <Button type="button" variant="secondary" onClick={() => setStep('INPUT')}>Back</Button>
              <Button type="submit" variant="primary">Save to Feed</Button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
