import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Button } from './ui/Button';

type DeleteConfirmModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  /** Optional body copy; defaults to a generic irreversible-delete message. */
  description?: string;
};

export default function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        setErrorMsg(null);
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const body =
    description ??
    `Are you sure you want to delete ${title}? This action cannot be undone.`;

  const handleConfirm = async () => {
    try {
      setIsDeleting(true);
      setErrorMsg(null);
      await onConfirm();
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Deletion failed');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setErrorMsg(null);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] transition-opacity backdrop-blur-xs"
      role="presentation"
      onClick={handleClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="w-full max-w-sm rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 shadow-[var(--cf-elev-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-confirm-title"
          className="mb-2 font-sans-display text-base font-bold text-[var(--cf-text)]"
        >
          Confirm Deletion
        </h2>
        <p className="mb-5 text-xs text-[var(--cf-text-secondary)] leading-relaxed">
          {body}
        </p>

        {errorMsg && (
          <div className="mb-4 text-xs text-[var(--cf-danger)] font-medium p-2.5 rounded-xl bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)]">
            {errorMsg}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isDeleting}
            size="sm"
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={isDeleting}
            size="sm"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
