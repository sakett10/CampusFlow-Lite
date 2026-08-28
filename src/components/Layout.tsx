import { Outlet } from 'react-router-dom';
import SidebarNav from './nav/SidebarNav';
import TopBar from './nav/TopBar';
import BottomTabNav from './nav/BottomTabNav';
import { UserButton } from '@clerk/clerk-react';

export default function Layout() {
  return (
    <div className="flex h-dvh max-w-full overflow-x-hidden bg-[var(--cf-bg)] font-[family-name:var(--cf-font-sans)] text-[var(--cf-text)]">
      {/* Desktop sidebar — fixed; main scrolls independently */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-[var(--cf-border)] bg-[var(--cf-surface)] lg:flex"
        aria-label="Application"
      >
        <div className="flex items-center justify-between px-6 py-6 border-b border-[var(--cf-border)]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--cf-brand-subtle)] border border-[var(--cf-brand)]/30 text-[var(--cf-brand)] font-extrabold text-sm shadow-[0_0_12px_var(--cf-brand-subtle)]">
              CF
            </div>
            <div>
              <p className="text-[length:var(--cf-text-subtitle-size)] font-bold tracking-tight text-[var(--cf-text)]">
                CampusFlow
              </p>
              <p className="text-[10px] uppercase font-bold tracking-wider text-[var(--cf-text-tertiary)]">
                Student Hub
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>

        <div className="p-4 border-t border-[var(--cf-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserButton />
            <span className="text-xs font-medium text-[var(--cf-text-secondary)]">Account</span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pl-[260px]">
        <div className="lg:hidden shrink-0">
          <TopBar />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>

        <BottomTabNav />
      </div>
    </div>
  );
}
