import { Bell, CheckSquare, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react';

export type AppNavItem = {
  path: string;
  icon: LucideIcon;
  label: string;
  shortLabel: string;
};

/** Core 4-tab primary student navigation items: Home, Tasks, Notices, Settings */
export const PRIMARY_NAV_ITEMS: AppNavItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Home', shortLabel: 'Home' },
  { path: '/assignments', icon: CheckSquare, label: 'Tasks', shortLabel: 'Tasks' },
  { path: '/notices', icon: Bell, label: 'Notices', shortLabel: 'Notices' },
  { path: '/settings', icon: Settings, label: 'Settings', shortLabel: 'Settings' },
];

/** Secondary / account level navigation items */
export const SECONDARY_NAV_ITEMS: AppNavItem[] = [];

/** Combined navigation items for sidebar */
export const APP_NAV_ITEMS: AppNavItem[] = [
  ...PRIMARY_NAV_ITEMS,
];

export function isNavActive(pathname: string, path: string): boolean {
  if (path === '/dashboard') {
    return pathname === '/dashboard' || pathname === '/';
  }
  if (path === '/assignments') {
    return (
      pathname === '/assignments' ||
      pathname === '/tasks' ||
      pathname.startsWith('/assignments/') ||
      pathname.startsWith('/tasks/')
    );
  }
  if (path === '/notices') {
    return (
      pathname === '/notices' ||
      pathname === '/notice-board' ||
      pathname === '/campus-feed' ||
      pathname === '/feed' ||
      pathname.startsWith('/notices/') ||
      pathname.startsWith('/campus-feed/')
    );
  }
  return pathname === path || pathname.startsWith(`${path}/`);
}
