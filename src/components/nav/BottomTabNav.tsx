import { Link, useLocation } from 'react-router-dom';
import { APP_NAV_ITEMS, isNavActive } from './navConfig';

export default function BottomTabNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="cf-safe-bottom z-40 shrink-0 border-t border-[var(--cf-border)] bg-[var(--cf-surface)] lg:hidden"
      aria-label="Primary"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch">
        {APP_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(pathname, item.path);
          return (
            <li key={item.path} className="flex min-w-0 flex-1">
              <Link
                to={item.path}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={[
                  'flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-[var(--cf-brand)] focus-visible:outline-offset-[-2px]',
                  active ? 'text-[var(--cf-brand)]' : 'text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text)]',
                ].join(' ')}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="max-w-full truncate text-[length:var(--cf-text-micro-size)] leading-[var(--cf-text-micro-line)] font-medium">
                  {item.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
