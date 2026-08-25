import { BookOpen, CheckSquare, LayoutDashboard, Radio, type LucideIcon } from 'lucide-react';

export type AppNavItem = {
  path: string;
  icon: LucideIcon;
  label: string;
  shortLabel: string;
};

/** Desktop order per design spec; shared with bottom tabs. */
export const APP_NAV_ITEMS: AppNavItem[] = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', shortLabel: 'Dashboard' },
  { path: '/campus-feed', icon: Radio, label: 'Campus Feed', shortLabel: 'Feed' },
  { path: '/assignments', icon: CheckSquare, label: 'Assignments', shortLabel: 'Assignments' },
  { path: '/courses', icon: BookOpen, label: 'Courses', shortLabel: 'Courses' },
];

export function isNavActive(pathname: string, path: string): boolean {
  return pathname === path;
}
