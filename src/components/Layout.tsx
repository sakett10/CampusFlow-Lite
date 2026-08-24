import { Outlet } from 'react-router-dom';
import SidebarNav from './nav/SidebarNav';
import TopBar from './nav/TopBar';
import BottomTabNav from './nav/BottomTabNav';

export default function Layout() {
  return (
    <div className="flex h-dvh max-w-full overflow-x-hidden bg-[var(--cf-bg)] font-[family-name:var(--cf-font-sans)] text-[var(--cf-text)]">
      {/* Desktop sidebar — fixed; main scrolls independently */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-[240px] flex-col border-r border-[var(--cf-border)] bg-[var(--cf-surface)] lg:flex"
        aria-label="Application"
      >
        <div className="px-6 py-6">
          <p
            className="text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-semibold text-[var(--cf-brand)]"
          >
            CampusFlow
          </p>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pl-[240px]">
        <div className="lg:hidden shrink-0">
          <TopBar />
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8">
          <Outlet />
        </main>

        <BottomTabNav />
      </div>
    </div>
  );
}
