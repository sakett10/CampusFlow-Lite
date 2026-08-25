export default function TopBar() {
  return (
    <header
      className="cf-safe-top sticky top-0 z-40 flex h-14 shrink-0 items-center border-b border-[var(--cf-border)] bg-[var(--cf-surface)] px-4"
    >
      <p
        className="text-[length:var(--cf-text-title-size)] leading-[var(--cf-text-title-line)] font-[number:var(--cf-text-title-weight)] tracking-tight text-[var(--cf-brand)]"
      >
        CampusFlow
      </p>
    </header>
  );
}
