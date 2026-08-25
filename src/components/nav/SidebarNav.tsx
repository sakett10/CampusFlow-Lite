import { Link, useLocation } from 'react-router-dom';
import { APP_NAV_ITEMS, isNavActive } from './navConfig';

export default function SidebarNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 pb-6" aria-label="Primary">
      {APP_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavActive(pathname, item.path);
        return (
          <Link
            key={item.path}
            to={item.path}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex min-h-11 items-center gap-3 rounded-[var(--cf-radius-md)] px-3 py-2.5 text-[length:var(--cf-text-body-strong-size)] font-[number:var(--cf-text-body-strong-weight)] transition-all duration-[var(--cf-transition-fast)]',
              'focus-visible:outline-2 focus-visible:outline-[var(--cf-brand)] focus-visible:outline-offset-2',
              active
                ? 'bg-[var(--cf-surface)] text-[var(--cf-brand)] shadow-sm border border-[var(--cf-border)] font-bold'
                : 'border border-transparent text-[var(--cf-text-secondary)] hover:bg-[var(--cf-surface-muted)] hover:text-[var(--cf-text)]',
            ].join(' ')}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
