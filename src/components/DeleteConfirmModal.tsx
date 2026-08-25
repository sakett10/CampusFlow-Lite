import { useState } from 'react';

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--cf-overlay)] transition-opacity"
      role="presentation"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-confirm-title"
        className="w-full max-w-sm rounded-[var(--cf-radius-xl)] border border-[var(--cf-border)] bg-[var(--cf-surface)] p-6 shadow-[var(--cf-elev-3)] cf-animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-confirm-title"
          className="mb-2 text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-[number:var(--cf-text-title-weight)] text-[var(--cf-text)]"
        >
          Confirm deletion
        </h2>
        <p className="mb-4 text-[length:var(--cf-text-body-size)] leading-[var(--cf-text-body-line)] text-[var(--cf-text-secondary)]">
          {body}
        </p>

        {errorMsg && (
          <div className="mb-4 text-sm text-[var(--cf-danger)]">
            {errorMsg}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="min-h-11 rounded-[var(--cf-radius-md)] bg-[var(--cf-surface-muted)] px-4 py-2 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-[var(--cf-text)] transition-colors hover:bg-[var(--cf-border)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-brand)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="min-h-11 flex items-center justify-center rounded-[var(--cf-radius-md)] bg-[var(--cf-danger)] px-4 py-2 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] text-white transition-colors hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cf-danger)] disabled:opacity-50 min-w-[5rem]"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
