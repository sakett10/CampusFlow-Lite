import { useState } from 'react';
import { campusApi } from '../api/campusApi';
import type { CampusItem, ItemType } from '../lib/types';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

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

  const [formData, setFormData] = useState<Partial<CampusItem>>({});

  if (!isOpen) return null;

  const handleAnalyze = async () => {
    if (!text.trim()) {
      setError("Please paste a notice to analyze.");
      return;
    }
    setError(null);
    setStep('ANALYZING');
    try {
      const result = await campusApi.analyzeNotice(text);
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
    <div className="fixed inset-0 bg-[var(--cf-overlay)] flex items-center justify-center p-4 z-50 transition-opacity">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-[var(--cf-surface)] rounded-[var(--cf-radius-xl)] shadow-[var(--cf-elev-3)] w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 cf-animate-scale-in border border-[var(--cf-border)]"
      >
        <h2 id="modal-title" className="text-[length:var(--cf-text-title-size)] font-bold text-[var(--cf-text)] mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--cf-ai)]" aria-hidden="true" />
          Campus Intelligence
        </h2>

        {error && <div role="alert" className="mb-4 p-3 bg-[var(--cf-danger-subtle)] text-[var(--cf-danger)] rounded-[var(--cf-radius-md)] text-[length:var(--cf-text-body-size)]">{error}</div>}

        {step === 'INPUT' && (
          <div className="space-y-4">
            <label htmlFor="notice-text" className="block text-[length:var(--cf-text-body-size)] text-[var(--cf-text-secondary)]">Paste any campus email, WhatsApp message, or notice. Our AI will extract the important details instantly.</label>
            <textarea
              id="notice-text"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Paste notice text here..."
              className="w-full h-48 p-3 border border-[var(--cf-border-strong)] rounded-[var(--cf-radius-md)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none resize-none bg-[var(--cf-surface)] text-[var(--cf-text)] placeholder:text-[var(--cf-text-tertiary)]"
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={closeAndReset}>Cancel</Button>
              <Button variant="ai" onClick={handleAnalyze} rightIcon={<Sparkles className="w-4 h-4" />}>
                Analyze Notice
              </Button>
            </div>
          </div>
        )}

        {step === 'ANALYZING' && (
          <div className="py-12 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-10 h-10 text-[var(--cf-ai)] animate-spin" aria-hidden="true" />
            <p className="text-[var(--cf-text-secondary)] font-medium">Extracting information...</p>
          </div>
        )}

        {step === 'REVIEW' && (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="p-3 bg-[var(--cf-ai-subtle)] border border-[var(--cf-ai)]/20 rounded-[var(--cf-radius-md)] text-[length:var(--cf-text-body-size)] text-[var(--cf-ai)] flex items-start gap-2">
              <Sparkles className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <p>Review the extracted details below. <span className="font-bold text-[var(--cf-danger)]">Missing information</span> could not be reliably found in the source text.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input id="field-title" required label="Title *" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div>
                <label htmlFor="field-type" className="block text-[length:var(--cf-text-body-strong-size)] font-medium text-[var(--cf-text)] mb-1.5">Type *</label>
                <select id="field-type" required value={formData.type || ''} onChange={e => setFormData({...formData, type: e.target.value as ItemType})} className="w-full p-2 border border-[var(--cf-border-strong)] rounded-[var(--cf-radius-md)] bg-[var(--cf-surface)] text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none">
                  <option value="" disabled>Select Type</option>
                  <option value="HACKATHON">Hackathon</option>
                  <option value="WORKSHOP">Workshop</option>
                  <option value="EVENT">Event</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="DEADLINE">Deadline</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="field-description" className="block text-[length:var(--cf-text-body-strong-size)] font-medium text-[var(--cf-text)] mb-1.5">Description</label>
              <textarea id="field-description" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-2 border border-[var(--cf-border-strong)] rounded-[var(--cf-radius-md)] h-20 bg-[var(--cf-surface)] text-[var(--cf-text)] focus:ring-2 focus:ring-[var(--cf-brand)] outline-none resize-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['date', 'startTime', 'endTime', 'registrationDeadline', 'venue', 'organizer', 'eligibility'].map((field) => {
                const isMissing = formData[field as keyof CampusItem] === null;
                const fieldId = `field-${field}`;
                const errorId = `error-${field}`;

                return (
                <div key={field}>
                  <label htmlFor={fieldId} className="block text-[length:var(--cf-text-body-strong-size)] font-medium text-[var(--cf-text)] mb-1.5 capitalize flex justify-between">
                    {field.replace(/([A-Z])/g, ' $1').trim()}
                    {isMissing && (
                      <span id={errorId} className="text-[var(--cf-danger)] text-[length:var(--cf-text-caption-size)] flex items-center gap-1"><AlertTriangle className="w-3 h-3" aria-hidden="true"/> Missing</span>
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
                    className={isMissing ? 'border-[var(--cf-danger)] bg-[var(--cf-danger-subtle)]/50' : ''}
                  />
                </div>
              )})}
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-[var(--cf-border)]">
              <Button type="button" variant="secondary" onClick={() => setStep('INPUT')}>Back</Button>
              <Button type="submit" variant="primary">Save to Feed</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
