export function ShieldMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#594FF4" />
      <path d="M16 6 8 9v6c0 5 3.5 8.6 8 10 4.5-1.4 8-5 8-10V9l-8-3z" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M12 16h3l1.5-3 2 6 1.5-3h1" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
