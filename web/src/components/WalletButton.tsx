import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addrUrl, short } from "../lib/chain";
import { useWallet } from "../lib/wallet";

const LANDING = ["/", "/how"];

export function WalletButton({ onDark = false }: { onDark?: boolean }) {
  const w = useWallet();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function connect() {
    const ok = await w.connect();
    // Connecting from the landing page means you came to use the app: take you to it.
    if (ok && LANDING.includes(loc.pathname)) nav("/launches");
  }

  if (w.account && !w.chainOk)
    return <button className="btn-primary !py-2.5" onClick={() => w.switchChain()}>Switch to X Layer</button>;

  if (w.account)
    return (
      <div className="relative" ref={ref}>
        <button
          className={`mono flex items-center gap-2 rounded-pill px-4 py-2.5 transition-colors ${onDark ? "bg-white/15 text-white hover:bg-white/25" : "bg-cloud text-ink hover:bg-mist"}`}
          aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="h-2 w-2 rounded-full bg-safe" aria-hidden="true" />
          {short(w.account)}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
        {open && (
          <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-media border border-mist bg-white py-2 text-[15px] text-ink shadow-float">
            <button role="menuitem" className="block w-full px-4 py-2.5 text-left hover:bg-cloud"
              onClick={() => navigator.clipboard?.writeText(w.account!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? "Address copied" : "Copy address"}
            </button>
            <a role="menuitem" className="block px-4 py-2.5 hover:bg-cloud" href={addrUrl(w.account)} target="_blank" rel="noreferrer">View on OKLink</a>
            <button role="menuitem" className="block w-full border-t border-mist px-4 py-2.5 text-left text-dangertext hover:bg-cloud"
              onClick={async () => { setOpen(false); await w.disconnect(); }}>
              Disconnect wallet
            </button>
          </div>
        )}
      </div>
    );

  return (
    <button className={onDark ? "btn-light !py-2.5" : "btn-primary !py-2.5"} onClick={connect} disabled={w.connecting}>
      {w.connecting ? "Check your wallet…" : "Connect wallet"}
    </button>
  );
}
