import { Link, useLocation } from 'react-router-dom';
import { APP_NAV_ITEMS, isNavActive } from './navConfig';

export default function SidebarNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 pb-6" aria-label="Primary">
      {APP_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? 'page' : undefined}
            className={[
              'group relative flex min-h-11 items-center gap-3 rounded-[var(--cf-radius-md)] px-3.5 py-2.5 text-[length:var(--cf-text-body-strong-size)] font-medium transition-colors duration-[var(--cf-transition-fast)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cf-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cf-surface)]',
              active
                ? 'bg-[var(--cf-brand-subtle)] text-[var(--cf-brand)] font-semibold border border-[var(--cf-brand)]/20 shadow-2xs'
                : 'text-[var(--cf-text-secondary)] hover:bg-[var(--cf-surface-muted)] hover:text-[var(--cf-text)] border border-transparent',
            ].join(' ')}
          >
            {active && (
              <span
                className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[var(--cf-brand)]"
                aria-hidden="true"
              />
            )}
            <Icon
              className={`h-5 w-5 shrink-0 transition-colors duration-150 ${
                active ? 'text-[var(--cf-brand)]' : 'text-[var(--cf-text-tertiary)] group-hover:text-[var(--cf-text)]'
              }`}
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
            {active && (
              <span
                className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--cf-brand)]"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
