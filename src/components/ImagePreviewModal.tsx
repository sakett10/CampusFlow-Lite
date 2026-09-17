import React, { useEffect } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import { formatFileSize } from '../lib/attachmentUtils';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  filename: string;
  sizeBytes?: number;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  filename,
  sizeBytes,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${filename}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90 text-slate-100">
          <div className="flex items-center gap-2 truncate pr-4">
            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium truncate" title={filename}>
              {filename}
            </span>
            {sizeBytes !== undefined && sizeBytes > 0 && (
              <span className="text-xs text-slate-400 font-mono shrink-0">
                ({formatFileSize(sizeBytes)})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close image preview"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Content - Constrained Viewport Image */}
        <div className="flex items-center justify-center p-2 sm:p-4 overflow-auto max-h-[calc(90vh-4rem)]">
          <img
            src={imageUrl}
            alt={filename}
            className="max-h-[80vh] max-w-full object-contain rounded-lg select-none"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
};
