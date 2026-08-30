import { UserButton } from '@clerk/clerk-react';
import NotificationBell from '../NotificationBell';

export default function TopBar() {
  return (
    <header
      className="cf-safe-top sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-[var(--cf-border)] bg-[var(--cf-surface)]/95 px-4 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/30 text-[var(--cf-brand)] font-extrabold text-xs">
          CF
        </div>
        <p className="text-[length:var(--cf-text-subtitle-size)] font-bold tracking-tight text-[var(--cf-text)]">
          CampusFlow
        </p>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <UserButton />
      </div>
    </header>
  );
}

