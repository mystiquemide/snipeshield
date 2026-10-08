import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Contract, formatEther, isAddress, parseEther, ZeroAddress } from "ethers";
import { Layout, NotDeployed, RpcError } from "../components/Layout";
import { TxStatusLine } from "../components/TxStatusLine";
import { isDeployed } from "../lib/config";
import { TOKEN_ABI } from "../lib/abi";
import {
  SIGNALS, TAX_TABLE, addrUrl, bitOn, cpuAt, fmtOkb, fmtPrice, fmtTokens, pct, perMillion, provider, remaining, short, tierTone, tokenAt, txUrl,
} from "../lib/chain";
import { findTradeTx, readLaunches, readTrades, useBlock, usePoll, type Launch, type TradeRow } from "../lib/hooks";
import { useWallet } from "../lib/wallet";
import { useTx } from "../lib/useTx";

type Quote = { out: bigint; bits: number; tier: number; bps: number };

function reasonSentence(bits: number, bps: number, windowOpen: boolean) {
  if (!windowOpen) return "Flat 1%. The 30 minute protection window has ended.";
  const on = SIGNALS.filter((_, i) => i !== 1 && bitOn(bits, i)).map((s) => s.reason);
  if (on.length === 0) return `${pct(bps)}. Nothing about this trade looks like a snipe.`;
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(", ")} and ${on[on.length - 1]}`;
  return `Taxed ${pct(bps)} because ${list}.`;
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  return {
    copied,
    copy: (t: string) => navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }),
  };
}

function StatusPill({ meta, block }: { meta: Launch; block: number | null }) {
  if (block === null) return <span className="skeleton" />;
  const left = meta.windowEnd - block;
  return left > 0 ? (
    <span className="rounded-pill bg-accent-tint px-4 py-2 text-[14px] font-medium text-accent">Shield on · {remaining(left)} left</span>
  ) : (
    <span className="rounded-pill bg-cloud px-4 py-2 text-[14px] font-medium text-slate">Window closed · flat 1%</span>
  );
}

function PriceChart({ trades }: { trades: TradeRow[] }) {
  const pts = trades.filter((t) => t.tokenAmount > 0n).map((t) => Number(formatEther(t.okbAmount)) / Number(formatEther(t.tokenAmount)));
  if (pts.length < 2)
    return <p className="text-[15px] text-slate">The chart appears after 2 trades. It plots the price each trade actually paid.</p>;
  const W = 520, H = 180, P = 8;
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || max || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" role="img" aria-label={`Price per trade, ${pts.length} trades`}>
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#E7E7E7" />
        <path d={d} fill="none" stroke="#1F5BFF" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="#1F5BFF" />)}
      </svg>
      <div className="mt-2 flex justify-between font-mono text-[12px] text-smoke">
        <span>low {perMillion(min)}</span>
        <span>{pts.length} trades, OKB per 1M tokens, after tax</span>
        <span>high {perMillion(max)}</span>
      </div>
    </div>
  );
}

function TxCell({ token, row }: { token: string; row: TradeRow }) {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    findTradeTx(token, row).then((h) => alive && setHash(h)).catch(() => alive && setHash(null));
    return () => { alive = false; };
  }, [token, row.index]); // eslint-disable-line react-hooks/exhaustive-deps
  if (hash === undefined) return <span className="text-ash">…</span>;
  if (!hash) return <a className="link" href={`${addrUrl(row.trader)}`} target="_blank" rel="noreferrer">wallet</a>;
  return <a className="link" href={txUrl(hash)} target="_blank" rel="noreferrer">view</a>;
}

function TradeTable({ token, meta, trades }: { token: string; meta: Launch; trades: TradeRow[] }) {
  if (trades.length === 0)
    return <p className="py-6 text-slate">No trades yet. The first 5 seconds after launch are the snipe zone.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-mist text-smoke">
            {["After launch", "Side", "Wallet", "Amount", "Tier", "Tax", "Tx"].map((h) => <th key={h} className="py-3 pr-4 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((t) => (
            <tr key={t.index} className="border-b border-mist">
              <td className="mono py-3 pr-4">+{remaining(t.blockNumber - meta.launchBlock) || "0s"}</td>
              <td className="py-3 pr-4">{t.isBuy ? "Buy" : "Sell"}</td>
              <td className="mono py-3 pr-4"><a className="hover:text-accent" href={addrUrl(t.trader)} target="_blank" rel="noreferrer">{short(t.trader)}</a></td>
              <td className="mono py-3 pr-4">{t.isBuy ? `${fmtOkb(t.okbAmount)} OKB` : `${fmtTokens(t.tokenAmount)} ${meta.symbol}`}</td>
              <td className={`mono py-3 pr-4 ${tierTone(t.tier)}`}>{t.tier}</td>
              <td className={`mono py-3 pr-4 font-medium ${tierTone(t.tier)}`}>{pct(t.taxBps)}</td>
              <td className="py-3"><TxCell token={token} row={t} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradePanel({ token, meta, block, onTraded, onQuote }: { token: string; meta: Launch; block: number | null; onTraded: () => void; onQuote: (q: Quote | null) => void }) {
  const w = useWallet();
  const tx = useTx();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.01");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const seq = useRef(0);
  const windowOpen = block !== null && block < meta.windowEnd;

  let wei: bigint | null = null;
  try { wei = amount && Number(amount) > 0 ? parseEther(amount) : null; } catch { wei = null; }

  // balance
  useEffect(() => {
    if (!w.account) { setBalance(null); return; }
    const load = () => (side === "buy" ? provider.getBalance(w.account!) : tokenAt(token).balanceOf(w.account!)).then((b: bigint) => setBalance(b)).catch(() => {});
    load();
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [w.account, side, token, tx.status.kind]);

  // quote + hint
  useEffect(() => {
    if (!wei) { setQuote(null); setHint(null); onQuote(null); return; }
    const my = ++seq.current;
    const who = w.account ?? ZeroAddress;
    const t = tokenAt(token);
    (side === "buy" ? t.quoteBuy(who, wei) : t.quoteSell(who, wei))
      .then(async (r: [bigint, bigint, bigint, bigint]) => {
        if (my !== seq.current) return;
        const q = { out: r[0], bits: Number(r[1]), tier: Number(r[2]), bps: Number(r[3]) };
        setQuote(q);
        onQuote(q);
        setQuoteErr(null);
        // Hint: flip each signal the trader controls and ask the real circuit what tier that would give.
        if (!windowOpen || q.tier === 0) { setHint(null); return; }
        const cpu = cpuAt(meta.processor);
        const options: { bit: number; text: string }[] = [
          { bit: 0, text: block !== null ? `wait ${remaining(meta.launchBlock + 5 - block) || "a few seconds"}` : "wait a few seconds" },
          { bit: 2, text: "trade under 0.5% of supply" },
          { bit: 3, text: "wait one block" },
          { bit: 4, text: "wait a minute since your last trade" },
        ].filter((o) => bitOn(q.bits, o.bit));
        const tiers = await Promise.all(options.map(async (o) => {
          const out: string = await cpu.eval(meta.circuitId, "0x" + (q.bits & ~(1 << o.bit)).toString(16).padStart(2, "0"));
          return { ...o, tier: Number(out) & 7 };
        }));
        if (my !== seq.current) return;
        const best = tiers.filter((o) => o.tier < q.tier).sort((a, b) => a.tier - b.tier)[0];
        setHint(best ? `To pay ${pct(TAX_TABLE[best.tier])} instead, ${best.text}.` : null);
      })
      .catch(() => { if (my === seq.current) { setQuote(null); setQuoteErr("Couldn't get a quote from X Layer. Retrying."); } });
  }, [amount, side, w.account, token, block, windowOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const insufficient = balance !== null && wei !== null && wei > balance;

  async function submit() {
    if (!w.account) return w.connect();
    if (!w.chainOk) return w.switchChain();
    if (!wei || !quote) return;
    const signer = await w.getSigner();
    const c = new Contract(token, TOKEN_ABI, signer);
    const minOut = (quote.out * 97n) / 100n;
    const rc = await tx.run(() => (side === "buy" ? c.buy(minOut, { value: wei }) : c.sell(wei, minOut)));
    if (rc) onTraded();
  }

  let label = side === "buy" ? `Buy ${meta.symbol}` : `Sell ${meta.symbol}`;
  if (!w.account) label = "Connect wallet";
  else if (!w.chainOk) label = "Switch to X Layer";
  else if (tx.status.kind === "confirm") label = "Confirm in wallet";
  else if (tx.status.kind === "pending") label = "Waiting for block…";
  const disabled = tx.busy || (w.account && w.chainOk && (!wei || !quote || insufficient));

  return (
    <div className="rounded-panel bg-cloud p-6 md:p-8">
      <div className="inline-flex rounded-pill bg-white p-1" role="tablist">
        {(["buy", "sell"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={side === s}
            className={`rounded-pill px-6 py-2 text-[15px] font-medium transition-colors ${side === s ? "bg-accent text-white" : "text-slate hover:text-ink"}`}
            onClick={() => { setSide(s); setAmount(s === "buy" ? "0.01" : ""); tx.reset(); }}>
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <label className="mt-6 block text-[15px] text-slate" htmlFor="amt">You pay</label>
      <div className="mt-2 flex items-center gap-3 rounded-input border border-mist bg-white px-4 focus-within:border-accent">
        <input id="amt" inputMode="decimal" className="w-full bg-transparent py-3.5 text-[22px] outline-none" value={amount}
          onChange={(e) => { setAmount(e.target.value.replace(",", ".")); tx.reset(); }} placeholder="0.0" aria-describedby="bal" />
        <span className="font-medium text-graphite">{side === "buy" ? "OKB" : meta.symbol}</span>
      </div>
      <div id="bal" className="mt-2 flex items-center justify-between text-[14px] text-smoke">
        <span>{balance !== null ? `Balance ${side === "buy" ? fmtOkb(balance) + " OKB" : fmtTokens(balance) + " " + meta.symbol}` : w.account ? "Loading balance…" : "Connect to see your balance"}</span>
        {balance !== null && balance > 0n && (
          <button className="link text-[14px]" onClick={() => setAmount(formatEther(side === "buy" ? (balance * 95n) / 100n : balance))}>
            {side === "buy" ? "Use 95%" : "Max"}
          </button>
        )}
      </div>

      <div className="mt-6 border-t border-mist pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-slate">You get</span>
          <span className="mono text-[17px] text-ink">
            {quote ? (side === "buy" ? `${fmtTokens(quote.out)} ${meta.symbol}` : `${fmtOkb(quote.out, 6)} OKB`) : wei ? <span className="skeleton" /> : "0"}
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-slate">Tax on this trade</span>
          <span className={`text-[28px] font-medium ${quote ? tierTone(quote.tier) : "text-ash"}`}>{quote ? pct(quote.bps) : "0%"}</span>
        </div>
        {quote && <p className="mt-3 text-[15px] text-graphite">{reasonSentence(quote.bits, quote.bps, windowOpen)}</p>}
        {hint && <p className="mt-1 text-[15px] text-accent">{hint}</p>}
        {quoteErr && <p className="mt-2 text-[15px] text-dangertext">{quoteErr}</p>}
        {insufficient && <p className="mt-2 text-[15px] text-dangertext">That's more than your balance.</p>}
      </div>

      <button className="btn-primary mt-6 w-full !py-4 text-[17px]" disabled={Boolean(disabled)} onClick={submit}>{label}</button>
      <p className="mt-3 text-center text-[13px] text-smoke">3% slippage protection. The tax shown is what the contract charges.</p>
      <div className="mt-3"><TxStatusLine status={tx.status} doneText={side === "buy" ? "Bought" : "Sold"} /></div>
    </div>
  );
}

function WhyPanel({ meta, bits, tier, bps, windowOpen }: { meta: Launch; bits: number | null; tier: number | null; bps: number | null; windowOpen: boolean }) {
  return (
    <div>
      <p className="eyebrow">Why this tax</p>
      <ul className="mt-4">
        {SIGNALS.map((s, i) => {
          const on = bits !== null && windowOpen && bitOn(bits, i);
          return (
            <li key={s.key} className="flex items-center justify-between border-b border-mist py-3 text-[15px]">
              <span className={on ? "text-ink" : "text-slate"}>{s.label}</span>
              <span className={`mono ${on ? "text-accent" : "text-ash"}`}>{on ? "on" : "off"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[15px] text-graphite">
        {windowOpen && tier !== null && bps !== null ? (
          <>Circuit #{meta.circuitId} returns tier <span className={tierTone(tier)}>{tier}</span>, which the contract maps to <span className={`font-medium ${tierTone(tier)}`}>{pct(bps)}</span>.</>
        ) : !windowOpen ? "The window has closed, so the circuit isn't consulted. Every trade pays 1%." : "Enter an amount to see the signals."}
      </p>
      <Link className="link mt-2 inline-block text-[15px]" to={`/policy/${meta.processor}/${meta.circuitId}`}>See the full policy</Link>
    </div>
  );
}

function CreatorRow({ token, meta }: { token: string; meta: Launch }) {
  const w = useWallet();
  const tx = useTx();
  const owed = usePoll(() => tokenAt(token).taxOwed() as Promise<bigint>, 8000, [token, tx.status.kind]);
  if (!w.account || w.account.toLowerCase() !== meta.creator.toLowerCase()) return null;
  async function withdraw() {
    if (!w.chainOk) return w.switchChain();
    const c = new Contract(token, TOKEN_ABI, await w.getSigner());
    await tx.run(() => c.withdrawTax());
  }
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-panel border border-mist p-6">
      <div>
        <p className="eyebrow">You created this launch</p>
        <p className="mt-2 text-[17px]">Your earnings: <span className="mono">{owed.data !== null ? fmtOkb(owed.data, 6) : "…"} OKB</span> <span className="text-slate">(1% of each trade)</span></p>
        <div className="mt-1"><TxStatusLine status={tx.status} doneText="Withdrawn" /></div>
      </div>
      <button className="btn-primary" disabled={!owed.data || owed.data === 0n || tx.busy} onClick={withdraw}>
        {owed.data === 0n ? "Nothing to withdraw yet" : "Withdraw"}
      </button>
    </div>
  );
}

export default function TokenPage() {
  const { address = "" } = useParams();
  const valid = isAddress(address);
  const block = useBlock();
  const meta = usePoll(async () => (valid ? (await readLaunches([address]))[0] : null), 5000, [address]);
  const trades = usePoll(async () => {
    if (!valid) return [] as TradeRow[];
    const n = Number(await tokenAt(address).tradeCount());
    return n ? readTrades(address, n, 60) : [];
  }, 6000, [address]);
  const [preview, setPreview] = useState<Quote | null>(null);
  const [live, setLive] = useState<Quote | null>(null);
  const { copied, copy } = useCopy();

  const m = meta.data;
  const windowOpen = Boolean(m && block.data !== null && block.data < m.windowEnd);

  // quote a default 0.01 OKB buy for the why panel so it is never empty on load
  useEffect(() => {
    if (!m) return;
    tokenAt(address).quoteBuy(ZeroAddress, parseEther("0.01")).then((r: [bigint, bigint, bigint, bigint]) =>
      setPreview({ out: r[0], bits: Number(r[1]), tier: Number(r[2]), bps: Number(r[3]) })).catch(() => {});
  }, [m?.address, block.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = useMemo(() => {
    if (!isDeployed()) return <NotDeployed />;
    if (!valid || (m && !m.symbol))
      return (
        <div className="wrap py-24">
          <h1 className="text-[36px]">This isn't a SnipeShield launch.</h1>
          <Link className="btn-primary mt-6" to="/launches">See all launches</Link>
        </div>
      );
    if (!m)
      return <div className="wrap py-16">{meta.error ? <RpcError onRetry={meta.refresh} /> : <p className="text-slate">Reading the launch from X Layer…</p>}</div>;
    return (
      <div className="wrap py-10 md:py-14">
        <Link to="/launches" className="text-[15px] text-slate hover:text-ink">← All launches</Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{m.symbol}</p>
            <h1 className="mt-2 text-[40px] leading-[1.05] md:text-[56px]">{m.name}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-slate">
              <button className="mono hover:text-ink" onClick={() => copy(address)}>{copied ? "Copied" : short(address)}</button>
              <span>·</span>
              <span>created by <a className="mono hover:text-ink" href={addrUrl(m.creator)} target="_blank" rel="noreferrer">{short(m.creator)}</a></span>
              <span>·</span>
              <Link className="hover:text-ink" to={`/policy/${m.processor}/${m.circuitId}`}>policy #{m.circuitId}</Link>
            </p>
          </div>
          <StatusPill meta={m} block={block.data} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-media border border-mist bg-mist md:grid-cols-4">
          {[
            ["Price per 1M tokens", `${fmtPrice(m.price)} OKB`],
            ["Trades", m.trades.toLocaleString()],
            ["Volume", `${fmtOkb(m.volume)} OKB`],
            ["Kept from snipers", `${fmtOkb(m.penaltyKept)} OKB`],
          ].map(([k, v]) => (
            <div key={k} className="bg-white p-5">
              <p className="text-[14px] text-smoke">{k}</p>
              <p className="mono mt-1 text-[17px] text-ink">{v}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <TradePanel token={address} meta={m} block={block.data} onTraded={() => { meta.refresh(); trades.refresh(); }} onQuote={setLive} />
          <div className="space-y-10">
            <div>
              <p className="eyebrow">Price paid per trade</p>
              <div className="mt-4">{trades.data ? <PriceChart trades={trades.data} /> : <p className="text-slate">Loading trades…</p>}</div>
            </div>
            <WhyPanel meta={m} bits={(live ?? preview)?.bits ?? null} tier={(live ?? preview)?.tier ?? null} bps={(live ?? preview)?.bps ?? null} windowOpen={windowOpen} />
          </div>
        </div>

        <CreatorRow token={address} meta={m} />

        <div className="mt-14">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Trades</p>
            {m.trades > 60 && <span className="text-[14px] text-smoke">Showing the latest 60 of {m.trades}</span>}
          </div>
          <div className="mt-4">{trades.data ? <TradeTable token={address} meta={m} trades={trades.data} /> : trades.error ? <RpcError onRetry={trades.refresh} /> : <p className="text-slate">Loading trades…</p>}</div>
        </div>
      </div>
    );
  }, [m, meta.error, valid, address, block.data, trades.data, trades.error, preview, live, windowOpen, copied]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Layout>{body}</Layout>;
}
