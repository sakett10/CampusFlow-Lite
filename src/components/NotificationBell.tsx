import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Clock, ShieldCheck, Sparkles, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';

import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../lib/types';

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = (n: AppNotification) => {
    markAsRead(n.id);
    setIsOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'pending_review':
        return <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />;
      case 'deadline_reminder':
        return <Clock className="w-4 h-4 text-rose-500 shrink-0" />;
      case 'notice_published':
        return <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-sky-500 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="notifications-popup"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface)] border border-[var(--cf-border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] focus-visible:ring-offset-2 transition-colors cursor-pointer"
      >
        <Bell className="h-4.5 w-4.5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--cf-danger)] px-1 text-[10px] font-bold font-mono text-white shadow-xs ring-2 ring-[var(--cf-surface)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="notifications-popup"
            role="region"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-3 shadow-[var(--cf-elev-3)] z-50 space-y-2 font-sans"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--cf-border-subtle)] pb-2 px-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-[var(--cf-text)] uppercase tracking-wider font-mono">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-[var(--cf-danger-subtle)] border border-[var(--cf-danger-border)] px-2 py-0.5 text-[10px] font-bold font-mono text-[var(--cf-danger)]">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[11px] font-medium text-[var(--cf-brand)] hover:underline flex items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--cf-brand)] rounded"
                >
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            {/* List of Notification Rows */}
            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--cf-border-subtle)]">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-[var(--cf-text-tertiary)] font-reading">
                  No notifications right now.
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className={`w-full text-left pt-2 first:pt-0 p-2.5 rounded-xl transition-colors duration-150 cursor-pointer flex items-start gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] focus-visible:ring-offset-1 ${
                      n.isRead
                        ? 'opacity-70 hover:opacity-100 hover:bg-[var(--cf-surface-muted)]'
                        : 'bg-[var(--cf-brand-subtle)] hover:bg-[var(--cf-surface-muted)]'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">{getIconForType(n.type)}</div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-xs truncate ${
                            n.isRead ? 'font-medium text-[var(--cf-text)]' : 'font-bold text-[var(--cf-text)]'
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--cf-brand)] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--cf-text-secondary)] line-clamp-2 leading-relaxed font-reading">
                        {n.message}
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[10px] text-[var(--cf-text-tertiary)] font-mono-meta">
                        <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {n.link && (
                          <span className="flex items-center gap-0.5 text-[var(--cf-brand)] font-medium">
                            View <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
