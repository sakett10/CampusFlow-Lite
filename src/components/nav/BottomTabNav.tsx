import { Link, useLocation } from 'react-router-dom';
import { APP_NAV_ITEMS, isNavActive } from './navConfig';

export default function BottomTabNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="cf-safe-bottom z-40 shrink-0 border-t border-[var(--cf-border)] bg-[var(--cf-surface)]/95 backdrop-blur-md lg:hidden"
      aria-label="Primary"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch px-2">
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
                  'relative flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-1 px-1 py-1 rounded-xl transition-all duration-[var(--cf-transition-fast)]',
                  'focus-visible:outline-2 focus-visible:outline-[var(--cf-brand)] focus-visible:outline-offset-[-2px]',
                  active
                    ? 'text-[var(--cf-brand)] font-semibold'
                    : 'text-[var(--cf-text-tertiary)] hover:text-[var(--cf-text-secondary)]',
                ].join(' ')}
              >
                {active && (
                  <span
                    className="absolute inset-x-2 top-1 h-0.5 rounded-full bg-[var(--cf-brand)] shadow-[0_0_8px_var(--cf-brand)]"
                    aria-hidden="true"
                  />
                )}
                <Icon
                  className={`h-5 w-5 shrink-0 transition-transform duration-150 ${active ? 'scale-110 text-[var(--cf-brand)]' : ''}`}
                  aria-hidden="true"
                />
                <span
                  className={`max-w-full truncate text-[length:var(--cf-text-micro-size)] leading-[var(--cf-text-micro-line)] ${
                    active ? 'font-bold' : 'font-medium'
                  }`}
                >
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
