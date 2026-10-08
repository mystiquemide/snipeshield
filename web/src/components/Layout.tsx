import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ShieldMark } from "./Shield";
import { WalletButton } from "./WalletButton";
import { useWallet } from "../lib/wallet";
import { CONFIG } from "../lib/config";
import { addrUrl } from "../lib/chain";

function Nav({ overHero }: { overHero: boolean }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);
  const tone = overHero ? "text-white" : "text-ink";
  const item = ({ isActive }: { isActive: boolean }) =>
    `text-[15px] font-medium transition-colors ${overHero ? "text-white/85 hover:text-white" : isActive ? "text-accent" : "text-graphite hover:text-ink"}`;
  return (
    <header className={overHero ? "absolute inset-x-0 top-0 z-20" : "border-b border-mist bg-white"}>
      <div className="wrap flex h-[72px] items-center justify-between gap-4">
        <Link to="/" className={`flex items-center gap-2.5 text-[19px] font-semibold ${tone}`}>
          <ShieldMark /> SnipeShield
        </Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
          <NavLink to="/launches" className={item}>Launches</NavLink>
          <NavLink to="/launch" className={item}>Launch a token</NavLink>
          <Link to="/#how" className={item({ isActive: false })}>How it works</Link>
        </nav>
        <div className="hidden md:block"><WalletButton onDark={overHero} /></div>
        <button className={`md:hidden ${tone} p-2`} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <div className="border-b border-mist bg-white md:hidden">
          <div className="wrap flex flex-col gap-1 py-4">
            <Link to="/launches" className="py-3 text-[17px] font-medium">Launches</Link>
            <Link to="/launch" className="py-3 text-[17px] font-medium">Launch a token</Link>
            <Link to="/#how" className="py-3 text-[17px] font-medium">How it works</Link>
            <div className="pt-3"><WalletButton /></div>
          </div>
        </div>
      )}
    </header>
  );
}

function NetworkStrip() {
  const w = useWallet();
  if (!w.account || w.chainOk) return null;
  return (
    <div className="border-b border-mist bg-cloud">
      <div className="wrap flex flex-wrap items-center justify-between gap-3 py-3 text-[15px]">
        <span>Your wallet is on another network. SnipeShield runs on X Layer.</span>
        <button className="btn-primary !py-2" onClick={() => w.switchChain()}>Switch to X Layer</button>
      </div>
    </div>
  );
}

function InstallSheet() {
  const w = useWallet();
  if (!w.installOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Get a wallet" onClick={() => w.setInstallOpen(false)}>
      <div className="w-full max-w-md rounded-panel bg-white p-8" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">No wallet found</p>
        <h2 className="mt-3 text-[26px] leading-tight">Install a wallet to trade on X Layer</h2>
        <p className="mt-3 text-slate">Either works. Once it's installed, refresh this page and connect.</p>
        <div className="mt-6 flex flex-col gap-3">
          <a className="btn-primary" href="https://www.okx.com/web3" target="_blank" rel="noreferrer">Get OKX Wallet</a>
          <a className="btn-secondary" href="https://metamask.io/download/" target="_blank" rel="noreferrer">Get MetaMask</a>
          <button className="btn-secondary" onClick={() => w.setInstallOpen(false)}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  const contracts: [string, string][] = [
    ["TapeOut factory", CONFIG.factory],
    ...(CONFIG.launcher ? ([["Launcher", CONFIG.launcher]] as [string, string][]) : []),
    ...(CONFIG.processor ? ([["SHIELD processor", CONFIG.processor]] as [string, string][]) : []),
  ];
  return (
    <footer className="bg-obsidian pb-6 pt-16">
      <div className="wrap">
        <div className="rounded-panel bg-white p-8 md:p-12">
          <div className="grid gap-10 md:grid-cols-4">
            <div>
              <Link to="/" className="flex items-center gap-2.5 text-[19px] font-semibold"><ShieldMark /> SnipeShield</Link>
              <p className="mt-4 text-[15px] text-slate">Fair launches on X Layer, enforced by a public TapeOut circuit.</p>
            </div>
            <div>
              <p className="eyebrow">Product</p>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                <li><Link to="/launches" className="hover:text-accent">Launches</Link></li>
                <li><Link to="/launch" className="hover:text-accent">Launch a token</Link></li>
                {CONFIG.processor && <li><Link to={`/policy/${CONFIG.processor}/${CONFIG.circuitId}`} className="hover:text-accent">Default policy</Link></li>}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Contracts</p>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                {contracts.map(([label, a]) => (
                  <li key={a}><a href={addrUrl(a)} target="_blank" rel="noreferrer" className="hover:text-accent">{label}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow">Source</p>
              <ul className="mt-4 space-y-2.5 text-[15px]">
                <li><a href={CONFIG.repo} target="_blank" rel="noreferrer" className="hover:text-accent">GitHub</a></li>
                <li><a href="https://www.tapeout.net" target="_blank" rel="noreferrer" className="hover:text-accent">TapeOut</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 border-t border-mist pt-6 text-[14px] text-smoke">
            <p>Tokens launched here are experimental. Prices move and you can lose what you spend. Nothing here is investment advice.</p>
            <p className="mt-2">
              Photos on Unsplash by{" "}
              <a className="hover:text-ink" href="https://unsplash.com/photos/abstract-blue-and-purple-light-streaks-PG-viUKr_2E" target="_blank" rel="noreferrer">Inigo Concepcion</a>,{" "}
              <a className="hover:text-ink" href="https://unsplash.com/photos/close-up-of-a-computer-processor-with-many-pins-GhLDc9jRKNw" target="_blank" rel="noreferrer">Akshat Sharma</a> and{" "}
              <a className="hover:text-ink" href="https://unsplash.com/photos/abstract-blue-light-streaks-on-a-dark-background-dOYVMySdXd0" target="_blank" rel="noreferrer">灿雄 邱</a>.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function Layout({ children, overHero = false, footer = false }: { children: ReactNode; overHero?: boolean; footer?: boolean }) {
  const loc = useLocation();
  useEffect(() => {
    if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);
  return (
    <div className="flex min-h-screen flex-col">
      <div className="relative">
        <Nav overHero={overHero} />
      </div>
      <NetworkStrip />
      <main className="flex-1">{children}</main>
      {footer && <Footer />}
      <InstallSheet />
    </div>
  );
}

export function NotDeployed() {
  return (
    <div className="wrap py-24">
      <p className="eyebrow">Not live yet</p>
      <h1 className="mt-3 text-[36px] leading-tight">SnipeShield contracts aren't deployed on this network yet.</h1>
      <p className="mt-3 text-slate">Check back shortly, or read the source on GitHub.</p>
      <a className="btn-primary mt-6" href={CONFIG.repo} target="_blank" rel="noreferrer">View source</a>
    </div>
  );
}

export function RpcError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-[15px] text-slate" role="alert">
      Couldn't reach X Layer. Retrying every few seconds.{" "}
      <button className="link" onClick={onRetry}>Retry now</button>
    </p>
  );
}
