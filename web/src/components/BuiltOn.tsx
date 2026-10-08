/** Sponsors and the stack SnipeShield is built on. Marks are the projects' own assets except the X Layer lockup, drawn from the OKX X glyph. */
function XLayerMark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 40 31" className="h-7 w-auto" aria-hidden="true">
        <g fill="#111111">
          <rect x="0" y="0" width="10" height="10" rx="1" />
          <rect x="20.5" y="0" width="10" height="10" rx="1" />
          <rect x="10.25" y="10.5" width="10" height="10" rx="1" />
          <rect x="0" y="21" width="10" height="10" rx="1" />
          <rect x="20.5" y="21" width="10" height="10" rx="1" />
          <rect x="32.5" y="0" width="2.6" height="10" rx="0.8" />
          <rect x="36.9" y="0" width="2.6" height="10" rx="0.8" />
          <rect x="32.5" y="21" width="2.6" height="10" rx="0.8" />
          <rect x="36.9" y="21" width="2.6" height="10" rx="0.8" />
        </g>
      </svg>
      <span className="text-[22px] font-semibold tracking-tight text-ink">X Layer</span>
    </span>
  );
}

function MetagentsMark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 60 60" className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" aria-hidden="true">
        <g fill="#111111">
          <rect x="0" y="0" width="12" height="60" rx="2.07" />
          <rect x="24" y="22.92" width="12" height="37.08" rx="2.07" />
          <rect x="48" y="0" width="12" height="60" rx="2.07" />
        </g>
        <circle cx="30" cy="11.46" r="6.18" fill="#F26B0F" />
      </svg>
      <span className="font-mono text-[12px] font-medium tracking-[0.04em] text-ink sm:text-[16px] sm:tracking-[0.06em]">METAGENTS.AI</span>
    </span>
  );
}

function TapeOutMark() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/brands/tapeout.svg" alt="" className="h-9 w-9" />
      <span className="text-[22px] font-semibold tracking-tight text-ink">TapeOut</span>
    </span>
  );
}

const ITEMS = [
  { role: "Chain", href: "https://web3.okx.com/xlayer", label: "X Layer", mark: <XLayerMark /> },
  { role: "Circuits", href: "https://www.tapeout.net", label: "TapeOut", mark: <TapeOutMark /> },
  { role: "Launchpad", href: "https://ignix.bot", label: "IGNIX", mark: <img src="/brands/ignix.svg" alt="" className="h-9 w-auto" /> },
  { role: "Partner", href: "https://metagents.ai", label: "Metagents", mark: <MetagentsMark /> },
];

export function BuiltOn() {
  return (
    <section className="wrap pt-12" aria-labelledby="built-on">
      <p id="built-on" className="eyebrow">Built on</p>
      <ul className="mt-5 grid grid-cols-2 border-y border-mist md:grid-cols-4">
        {ITEMS.map((it, i) => (
          <li key={it.label} className={`border-mist ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
            <a href={it.href} target="_blank" rel="noreferrer" aria-label={`${it.label}, ${it.role.toLowerCase()}`}
              className="flex h-full min-h-[120px] flex-col items-start justify-between gap-4 px-4 py-6 sm:px-5 transition-colors hover:bg-cloud">
              {it.mark}
              <span className="text-[14px] text-smoke">{it.role}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
