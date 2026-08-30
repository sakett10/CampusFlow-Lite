import React, { useState, useRef, useEffect } from 'react';
import { Bell, Check, Clock, ShieldCheck, Sparkles, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../lib/types';

export const NotificationBell: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
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
        return <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'deadline_reminder':
        return <Clock className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'notice_published':
        return <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Bell className="w-4 h-4 text-sky-400 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--cf-surface-muted)] text-[var(--cf-text-secondary)] hover:text-[var(--cf-text)] hover:bg-[var(--cf-surface)] border border-[var(--cf-border-subtle)] transition-all cursor-pointer"
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-[var(--cf-bg)] animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popup */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-[var(--cf-border)] bg-[var(--cf-surface)] p-3 shadow-2xl z-50 space-y-2 animate-in fade-in zoom-in-95 duration-100 font-sans">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--cf-border-subtle)] pb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-[var(--cf-text)] uppercase tracking-wider">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold font-mono text-rose-400">
                  {unreadCount} new
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[11px] font-medium text-[var(--cf-brand)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1 divide-y divide-[var(--cf-border-subtle)]/50">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--cf-text-tertiary)] font-reading">
                No notifications right now.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`pt-2 first:pt-0 p-2 rounded-xl transition-all cursor-pointer flex items-start gap-2.5 ${
                    n.isRead
                      ? 'opacity-70 hover:opacity-100 hover:bg-[var(--cf-surface-muted)]'
                      : 'bg-[var(--cf-brand-subtle)]/30 hover:bg-[var(--cf-brand-subtle)]/60'
                  }`}
                >
                  <div className="mt-0.5">{getIconForType(n.type)}</div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs font-semibold truncate ${
                          n.isRead ? 'text-[var(--cf-text)]' : 'text-[var(--cf-text)] font-bold'
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--cf-brand)] shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--cf-text-secondary)] line-clamp-2 leading-relaxed font-reading">
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between pt-1 text-[9.5px] text-[var(--cf-text-tertiary)] font-mono">
                      <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {n.link && (
                        <span className="flex items-center gap-0.5 text-[var(--cf-brand)]">
                          View <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
