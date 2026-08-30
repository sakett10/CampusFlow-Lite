import React, { useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import type { Notice, NoticeCategory, NoticePriority, NoticeCandidate } from '../lib/types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface NoticeEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  notice: Notice | null;
  onSave: (id: string, updates: Partial<NoticeCandidate>) => Promise<void>;
}

const CATEGORIES: NoticeCategory[] = [
  'academic',
  'exam',
  'assignment',
  'administrative',
  'event',
  'placement',
  'admission',
  'hostel',
  'fee',
  'scholarship',
  'alert',
  'general',
];

const PRIORITIES: NoticePriority[] = ['low', 'normal', 'important', 'urgent'];

interface NoticeEditFormProps {
  notice: Notice;
  onClose: () => void;
  onSave: (id: string, updates: Partial<NoticeCandidate>) => Promise<void>;
}

const NoticeEditForm: React.FC<NoticeEditFormProps> = ({ notice, onClose, onSave }) => {
  const [title, setTitle] = useState(notice.title);
  const [summary, setSummary] = useState(notice.summary);
  const [category, setCategory] = useState<NoticeCategory>(notice.category);
  const [priority, setPriority] = useState<NoticePriority>(notice.priority);
  const [audience, setAudience] = useState(notice.audience || '');
  const [actionRequired, setActionRequired] = useState(notice.actionRequired || '');
  const [venue, setVenue] = useState(notice.venue || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!summary.trim()) {
      setError('Summary is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(notice.id, {
        title: title.trim(),
        summary: summary.trim(),
        category,
        priority,
        audience: audience.trim() || undefined,
        actionRequired: actionRequired.trim() || undefined,
        venue: venue.trim() || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save notice edits');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-[var(--cf-surface)] border border-[var(--cf-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
      <div className="flex items-center justify-between border-b border-[var(--cf-border-subtle)] pb-3">
        <div>
          <h2 className="text-lg font-bold font-sans-display text-[var(--cf-text)]">
            Edit Notice Details
          </h2>
          <p className="text-xs text-[var(--cf-text-secondary)] font-mono">
            Review and refine information before publishing
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface-muted)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-[var(--cf-text)] mb-1">
            Title *
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notice title..."
            required
            className="w-full text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-[var(--cf-text)] mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as NoticeCategory)}
              className="w-full h-10 px-3 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] text-[var(--cf-text)] font-mono text-xs focus:border-[var(--cf-brand)] focus:outline-none"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[var(--cf-text)] mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as NoticePriority)}
              className="w-full h-10 px-3 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] text-[var(--cf-text)] font-mono text-xs focus:border-[var(--cf-brand)] focus:outline-none"
            >
              {PRIORITIES.map((pri) => (
                <option key={pri} value={pri}>
                  {pri.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block font-semibold text-[var(--cf-text)] mb-1">
            Summary *
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={3}
            placeholder="Concise factual summary..."
            required
            className="w-full p-3 rounded-xl border border-[var(--cf-border)] bg-[var(--cf-surface)] text-[var(--cf-text)] text-xs focus:border-[var(--cf-brand)] focus:outline-none leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-[var(--cf-text)] mb-1">
              Audience
            </label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. All B.Tech 2026 Batch"
              className="w-full text-xs"
            />
          </div>

          <div>
            <label className="block font-semibold text-[var(--cf-text)] mb-1">
              Venue
            </label>
            <Input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="e.g. SJT Hall 401"
              className="w-full text-xs"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-[var(--cf-text)] mb-1">
            Action Required
          </label>
          <Input
            value={actionRequired}
            onChange={(e) => setActionRequired(e.target.value)}
            placeholder="e.g. Submit form on VTOP before deadline"
            className="w-full text-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--cf-border-subtle)]">
          <Button variant="secondary" type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSaving} leftIcon={<Save className="w-4 h-4" />}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export const NoticeEditModal: React.FC<NoticeEditModalProps> = ({
  isOpen,
  onClose,
  notice,
  onSave,
}) => {
  if (!isOpen || !notice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <NoticeEditForm key={notice.id} notice={notice} onClose={onClose} onSave={onSave} />
    </div>
  );
};

export default NoticeEditModal;
