/** Crosshair with one arm cut: a snipe that can't land. */
export function ShieldMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#1F5BFF" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M16 4.5v6M16 21.5v6M4.5 16h6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <path d="M23.5 12.5v7" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.8" fill="#fff" />
    </svg>
  );
}
