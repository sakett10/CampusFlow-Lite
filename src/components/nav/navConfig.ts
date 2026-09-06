import { Bell, BookOpen, CheckSquare, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';

export type AppNavItem = {
  path: string;
  icon: LucideIcon;
  label: string;
  shortLabel: string;
};

/** Core 4-tab primary student navigation items */
export const PRIMARY_NAV_ITEMS: AppNavItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortLabel: 'Dashboard' },
  { path: '/courses', icon: BookOpen, label: 'Courses', shortLabel: 'Courses' },
  { path: '/assignments', icon: CheckSquare, label: 'Assignments', shortLabel: 'Tasks' },
  { path: '/notices', icon: Bell, label: 'Notices', shortLabel: 'Notices' },
];

/** Secondary / account level navigation items */
export const SECONDARY_NAV_ITEMS: AppNavItem[] = [
  { path: '/settings', icon: Settings, label: 'Settings', shortLabel: 'Settings' },
];

/** Combined navigation items for sidebar */
export const APP_NAV_ITEMS: AppNavItem[] = [
  ...PRIMARY_NAV_ITEMS,
  ...SECONDARY_NAV_ITEMS,
];

export function isNavActive(pathname: string, path: string): boolean {
  if (path === '/notices') {
    return (
      pathname === '/notices' ||
      pathname === '/notice-board' ||
      pathname === '/campus-feed' ||
      pathname.startsWith('/notices/') ||
      pathname.startsWith('/campus-feed/')
    );
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
