import { useState } from "react";
import { Link } from "react-router-dom";
import { Layout, RpcError } from "../components/Layout";
import { CONFIG, isDeployed } from "../lib/config";
import { TAX_TABLE, fmtOkb, fmtPrice, pct, remaining, tierTone } from "../lib/chain";
import { useBlock, useLaunches, type Launch } from "../lib/hooks";
import { BuiltOn } from "../components/BuiltOn";

const TIER_ROWS = [
  "Normal trade, or any trade after the 30 minute window",
  "Selling, or trading again within a minute",
  "Large trade (over 0.5% of supply) or a busy block",
  "Large or busy, and also selling or trading again",
  "First 5 seconds",
  "First 5 seconds, and selling or trading again",
  "First 5 seconds and large or busy, or large in a busy block",
  "All of the above stacked: early or large and busy, plus a sell or repeat",
];

const FAQ = [
  ["Can the creator change the tax?", "No. The token contract has no function that changes the policy, the tax table or the 25% cap. The policy is chosen once at launch and stays forever. You can confirm this in the verified source."],
  ["Where does the snipe tax go?", "The creator only ever receives the base 1%. Everything above that stays inside the token's price curve, which raises the price for everyone holding. A creator who snipes their own launch pays the penalty like anyone else."],
  ["What counts as a sniper?", "Six signals feed the circuit on every trade during the first 30 minutes: the first 5 seconds, the protection window, trades over 0.5% of supply, 2 or more trades in the same block, trading again within a minute, and selling."],
  ["What if the circuit breaks?", "If the circuit call fails for any reason, the trade is charged the top tier, 25%. It never goes above that, because the cap is a constant in the contract."],
  ["What is TapeOut?", "TapeOut is an on-chain protocol where logic circuits made of NAND gates are written to the chain and can be run by any contract. SnipeShield's tax rule is one of those circuits, so anyone can read and run it."],
  ["Is it audited?", "SnipeShield's contracts are tested against a copy of X Layer mainnet but have not had a third-party audit. TapeOut's factory is not yet sealed, so its owner can still upgrade how circuits are evaluated. Treat every launch here as experimental."],
] as const;

function Stats({ launches, block }: { launches: Launch[] | null; block: number | null }) {
  const trades = launches?.reduce((a, l) => a + l.trades, 0) ?? null;
  const kept = launches?.reduce((a, l) => a + l.penaltyKept, 0n) ?? null;
  const items: [string, string | null][] = [
    ["Launches", launches ? launches.length.toLocaleString() : null],
    ["Trades", trades !== null ? trades.toLocaleString() : null],
    ["Kept from snipers", kept !== null ? `${fmtOkb(kept)} OKB` : null],
    ["X Layer block", block !== null ? block.toLocaleString() : null],
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4">
      {items.map(([k, v], i) => (
        <div key={k} className={`py-6 ${i % 2 ? "pl-6" : ""} md:pl-6 ${i ? "md:border-l" : "md:pl-0"} border-mist`}>
          <p className="text-[14px] text-smoke">{k}</p>
          <p className="mt-1 text-[26px] leading-tight md:text-[36px]">{v ?? <span className="skeleton h-8" />}</p>
        </div>
      ))}
    </div>
  );
}

function LaunchRows({ launches, block, limit }: { launches: Launch[]; block: number | null; limit?: number }) {
  return (
    <ul>
      {launches.slice(0, limit).map((l) => {
        const left = block !== null ? l.windowEnd - block : 0;
        return (
          <li key={l.address} className="border-b border-mist">
            <Link to={`/token/${l.address}`} className="grid grid-cols-2 items-center gap-2 py-5 transition-colors hover:bg-cloud md:grid-cols-[1.4fr_1fr_0.7fr_1fr_24px] md:gap-6 md:px-3">
              <span>
                <span className="block text-[20px]">{l.name}</span>
                <span className="mono text-smoke">{l.symbol}</span>
              </span>
              <span className={`justify-self-end text-[15px] md:justify-self-start ${left > 0 ? "text-accent" : "text-slate"}`}>
                {left > 0 ? `Shield on · ${remaining(left)} left` : "Window closed"}
              </span>
              <span className="text-[15px] text-slate">{l.trades.toLocaleString()} trades</span>
              <span className="mono justify-self-end text-graphite md:justify-self-start">{fmtPrice(l.price)} OKB / 1M</span>
              <span className="hidden text-accent md:block" aria-hidden="true">→</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function EmptyLaunches() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-mist py-8">
      <p className="text-[20px]">No launches yet. Be the first.</p>
      <Link to="/launch" className="btn-primary">Launch a token</Link>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-3">
      {FAQ.map(([q, a], i) => (
        <div key={q} className="rounded-media bg-cloud">
          <button className="flex w-full items-center justify-between gap-6 px-6 py-5 text-left text-[18px]" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            {q}
            <span className="text-[22px] text-accent" aria-hidden="true">{open === i ? "−" : "+"}</span>
          </button>
          {open === i && <p className="px-6 pb-6 text-slate">{a}</p>}
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const launches = useLaunches();
  const block = useBlock();
  const deployed = isDeployed();

  return (
    <Layout overHero footer>
      {/* Hero */}
      <section className="relative overflow-hidden bg-obsidian">
        <img src="/img/hero-2400.webp" srcSet="/img/hero-1200.webp 1200w, /img/hero-2400.webp 2400w" sizes="100vw" alt=""
          className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-black/35 md:bg-black/20" aria-hidden="true" />
        <div className="wrap relative flex min-h-[640px] flex-col justify-end pb-16 pt-32 md:min-h-[720px] md:pb-24">
          <p className="font-mono text-[12px] uppercase tracking-[0.075em] text-white/80">Launch protection on X Layer</p>
          <h1 className="mt-4 max-w-[860px] text-[48px] leading-[1.05] text-white md:text-[72px]">Fair launches, enforced by a circuit.</h1>
          <p className="mt-5 max-w-[620px] text-[18px] text-white/85 md:text-[20px]">
            Bots that buy in the first seconds pay up to 25%. Everyone else pays 1%. Nobody can raise it, not even the creator.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/launches" className="btn-primary">Explore launches</Link>
            <Link to="/launch" className="btn-light">Launch a token</Link>
          </div>
        </div>
      </section>

      <BuiltOn />

      {/* Live stats */}
      <section className="wrap pt-12">
        <p className="eyebrow">Live on X Layer mainnet</p>
        {deployed ? (
          launches.error && !launches.data ? <div className="py-6"><RpcError onRetry={launches.refresh} /></div> : <Stats launches={launches.data} block={block.data} />
        ) : (
          <p className="py-6 text-slate">Contracts are being deployed. Live numbers appear here as soon as they're on chain.</p>
        )}
      </section>

      {/* How it works */}
      <section id="how" className="wrap scroll-mt-24 py-24">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-3 max-w-[760px] text-[36px] leading-[1.1]">The tax rule runs on chain, in the open, on every trade.</h2>
        <div className="mt-12 grid border-t border-mist md:grid-cols-3">
          {[
            ["01", "Launch", "Pick a tax policy when you launch. It locks to your token forever, along with the 25% cap."],
            ["02", "Trade", "For 30 minutes, every buy and sell is scored by the policy circuit. Snipe-like trades pay more."],
            ["03", "Window closes", "After 30 minutes the circuit steps aside and every trade pays a flat 1%."],
          ].map(([n, t, d], i) => (
            <div key={n} className={`border-b border-mist py-8 md:border-b-0 md:py-10 ${i ? "md:border-l md:pl-8" : "md:pr-8"}`}>
              <p className="mono text-accent">{n}</p>
              <h3 className="mt-3 text-[26px]">{t}</h3>
              <p className="mt-2 text-slate">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tax table */}
      <section className="bg-cloud py-24">
        <div className="wrap grid gap-12 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="eyebrow">What you pay</p>
            <h2 className="mt-3 text-[36px] leading-[1.1]">The tax table is written into the contract.</h2>
            <p className="mt-4 text-slate">The circuit picks a tier. The contract turns the tier into a tax using this fixed table. Tier 7 is the ceiling, 25%, and no code path can charge more.</p>
          </div>
          <ul className="border-t border-mist">
            {TAX_TABLE.map((bps, t) => (
              <li key={t} className="grid grid-cols-[64px_1fr_64px] items-center gap-3 border-b border-mist py-4">
                <span className="mono text-smoke">Tier {t}</span>
                <span className="text-[15px] text-graphite">{TIER_ROWS[t]}</span>
                <span className={`text-right text-[20px] font-medium ${tierTone(t)}`}>{pct(bps)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Circuit */}
      <section className="wrap grid items-center gap-12 py-24 md:grid-cols-2">
        <img src="/img/circuit-1200.webp" srcSet="/img/circuit-1200.webp 1200w, /img/circuit-2400.webp 2400w" sizes="(min-width: 768px) 50vw, 100vw"
          alt="Close-up of a processor's pin array" className="aspect-[4/3] w-full rounded-panel border border-mist object-cover" loading="lazy" />
        <div>
          <p className="eyebrow">The circuit</p>
          <h2 className="mt-3 text-[36px] leading-[1.1]">18 NAND gates decide the tier.</h2>
          <p className="mt-4 text-slate">
            The default policy is taped out on TapeOut and lives on X Layer. Anyone can read its gates, run all 64 input combinations, and check any trade against it.
          </p>
          {deployed && CONFIG.processor ? (
            <Link to={`/policy/${CONFIG.processor}/${CONFIG.circuitId}`} className="link mt-6 inline-block text-[17px]">Inspect the policy →</Link>
          ) : (
            <a href={`${CONFIG.repo}/blob/main/policy/default.js`} className="link mt-6 inline-block text-[17px]" target="_blank" rel="noreferrer">Read the policy source →</a>
          )}
        </div>
      </section>

      {/* Live launches */}
      <section className="wrap pb-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Live launches</p>
            <h2 className="mt-3 text-[36px] leading-[1.1]">Newest shielded tokens</h2>
          </div>
          {launches.data && launches.data.length > 0 && <Link to="/launches" className="link text-[17px]">See all launches →</Link>}
        </div>
        <div className="mt-8 border-t border-mist">
          {!deployed ? <EmptyLaunches /> : launches.data === null ? (
            launches.error ? <div className="py-6"><RpcError onRetry={launches.refresh} /></div> : <p className="py-6 text-slate">Reading launches from X Layer…</p>
          ) : launches.data.length === 0 ? <EmptyLaunches /> : <LaunchRows launches={launches.data} block={block.data} limit={5} />}
        </div>
      </section>

      {/* FAQ */}
      <section className="wrap grid gap-10 pb-24 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 text-[36px] leading-[1.1]">What people ask before they buy</h2>
        </div>
        <Faq />
      </section>

      {/* CTA band */}
      <section className="wrap pb-24">
        <div className="relative overflow-hidden rounded-panel bg-obsidian">
          <img src="/img/cta-2400.webp" srcSet="/img/cta-1200.webp 1200w, /img/cta-2400.webp 2400w" sizes="100vw" alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-black/30" aria-hidden="true" />
          <div className="relative flex flex-col items-start gap-6 px-8 py-20 md:px-16 md:py-28">
            <h2 className="max-w-[640px] text-[40px] leading-[1.05] text-white md:text-[56px]">Launch with the rules in the open.</h2>
            <Link to="/launch" className="btn-light">Launch a token</Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}

export { LaunchRows };
