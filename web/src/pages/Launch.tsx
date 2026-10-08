import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Contract, isAddress } from "ethers";
import { Layout, NotDeployed } from "../components/Layout";
import { TxStatusLine } from "../components/TxStatusLine";
import { CONFIG, isDeployed } from "../lib/config";
import { FACTORY_ABI, LAUNCHER_ABI } from "../lib/abi";
import { cpuAt, launcherIface, provider } from "../lib/chain";
import { useWallet } from "../lib/wallet";
import { useTx } from "../lib/useTx";

type Check = { state: "idle" | "checking" | "ok" | "bad"; text: string; gates?: number };

export default function Launch() {
  const w = useWallet();
  const tx = useTx();
  const [params] = useSearchParams();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const custom0 = params.get("processor") && params.get("processor")!.toLowerCase() !== CONFIG.processor.toLowerCase();
  const [mode, setMode] = useState<"default" | "custom">(custom0 || (params.get("circuit") && Number(params.get("circuit")) !== CONFIG.circuitId) ? "custom" : "default");
  const [cpu, setCpu] = useState(params.get("processor") ?? "");
  const [cid, setCid] = useState(params.get("circuit") ?? "");
  const [check, setCheck] = useState<Check>({ state: "idle", text: "" });
  const [confirming, setConfirming] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const processor = mode === "default" ? CONFIG.processor : cpu.trim();
  const circuit = mode === "default" ? CONFIG.circuitId : Number(cid);

  useEffect(() => {
    if (!isDeployed()) return;
    if (!isAddress(processor) || !Number.isInteger(circuit) || circuit <= 0) {
      setCheck(mode === "custom" && (cpu || cid) ? { state: "bad", text: "Enter a processor address and a circuit number." } : { state: "idle", text: "" });
      return;
    }
    let alive = true;
    setCheck({ state: "checking", text: "Checking the circuit on X Layer…" });
    (async () => {
      const f = new Contract(CONFIG.factory, FACTORY_ABI, provider);
      if (!(await f.isCPU(processor))) return { state: "bad", text: "That address isn't a TapeOut processor." } as Check;
      try {
        const [nIn, nOut, nState, gates] = await cpuAt(processor).circuitInfo(circuit);
        if (Number(nIn) !== 6 || Number(nOut) !== 3 || Number(nState) !== 0)
          return { state: "bad", text: `Circuit #${circuit} has ${nIn} inputs, ${nOut} outputs and ${nState} memory cells. A policy needs 6, 3 and 0.` } as Check;
        return { state: "ok", text: `6 inputs, 3 outputs, no memory, ${gates} gates. Valid policy.`, gates: Number(gates) } as Check;
      } catch {
        return { state: "bad", text: `There's no circuit #${circuit} on that processor.` } as Check;
      }
    })().then((c) => alive && setCheck(c)).catch(() => alive && setCheck({ state: "bad", text: "Couldn't reach X Layer to check the circuit. Try again." }));
    return () => { alive = false; };
  }, [processor, circuit, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isDeployed()) return <Layout><NotDeployed /></Layout>;

  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const formOk = name.trim().length >= 2 && name.trim().length <= 32 && sym.length >= 2 && sym.length <= 8 && check.state === "ok";

  async function doLaunch() {
    if (!w.account) return w.connect();
    if (!w.chainOk) return w.switchChain();
    const l = new Contract(CONFIG.launcher, LAUNCHER_ABI, await w.getSigner());
    const rc = await tx.run(() => l.launch(name.trim(), sym, processor, circuit));
    setConfirming(false);
    if (rc) {
      const ev = rc.logs.map((x) => { try { return launcherIface.parseLog(x); } catch { return null; } }).find((e) => e?.name === "Launched");
      if (ev) setCreated(String(ev.args.token));
    }
  }

  if (created) {
    const url = `${window.location.origin}/token/${created}`;
    return (
      <Layout>
        <section className="wrap py-20">
          <p className="eyebrow">Launched</p>
          <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">{sym} is live. The 30 minute window has started.</h1>
          <p className="mt-4 max-w-[640px] text-slate">Share the link now. Anyone who buys in the first 5 seconds pays the snipe tier, and everyone after pays far less.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={`/token/${created}`} className="btn-primary">Open your launch</Link>
            <button className="btn-secondary" onClick={() => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
          <div className="mt-4"><TxStatusLine status={tx.status} doneText="Launched" /></div>
        </section>
      </Layout>
    );
  }

  let cta = "Launch token";
  if (!w.account) cta = "Connect wallet";
  else if (!w.chainOk) cta = "Switch to X Layer";

  return (
    <Layout>
      <section className="wrap grid gap-12 py-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="eyebrow">Launch a token</p>
          <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Launch with the rules in the open.</h1>
          <form className="mt-10 space-y-6" onSubmit={(e) => { e.preventDefault(); if (!w.account || !w.chainOk) { void doLaunch(); return; } if (formOk) setConfirming(true); }}>
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <label className="block">
                <span className="text-[15px] text-slate">Name</span>
                <input className="input mt-2" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </label>
              <label className="block">
                <span className="text-[15px] text-slate">Symbol</span>
                <input className="input mt-2 uppercase" value={sym} maxLength={8} onChange={(e) => setSymbol(e.target.value)} autoComplete="off" />
              </label>
            </div>
            <p className="-mt-3 text-[14px] text-smoke">Name 2 to 32 characters. Symbol 2 to 8 letters or numbers.</p>

            <fieldset>
              <legend className="text-[15px] text-slate">Policy</legend>
              <div className="mt-3 space-y-3">
                <label className={`flex cursor-pointer items-start gap-3 rounded-media border p-5 ${mode === "default" ? "border-accent bg-accent-tint/40" : "border-mist"}`}>
                  <input type="radio" className="mt-1 accent-[#1F5BFF]" checked={mode === "default"} onChange={() => setMode("default")} />
                  <span>
                    <span className="block text-[17px]">SnipeShield default</span>
                    <span className="block text-[15px] text-slate">Circuit #{CONFIG.circuitId} on the SHIELD processor. <Link className="link" to={`/policy/${CONFIG.processor}/${CONFIG.circuitId}`}>Preview</Link></span>
                  </span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-media border p-5 ${mode === "custom" ? "border-accent bg-accent-tint/40" : "border-mist"}`}>
                  <input type="radio" className="mt-1 accent-[#1F5BFF]" checked={mode === "custom"} onChange={() => setMode("custom")} />
                  <span className="w-full">
                    <span className="block text-[17px]">Another TapeOut circuit</span>
                    <span className="block text-[15px] text-slate">Any stateless circuit with 6 inputs and 3 outputs.</span>
                    {mode === "custom" && (
                      <span className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px]">
                        <input className="input mono" placeholder="Processor address" value={cpu} onChange={(e) => setCpu(e.target.value)} aria-label="Processor address" />
                        <input className="input mono" placeholder="Circuit" inputMode="numeric" value={cid} onChange={(e) => setCid(e.target.value.replace(/\D/g, ""))} aria-label="Circuit number" />
                      </span>
                    )}
                  </span>
                </label>
              </div>
              {check.state !== "idle" && (
                <p className={`mt-3 text-[15px] ${check.state === "ok" ? "text-safe" : check.state === "bad" ? "text-dangertext" : "text-slate"}`} role="status">{check.text}</p>
              )}
            </fieldset>

            <button type="submit" className="btn-primary w-full !py-4 text-[17px] sm:w-auto" disabled={tx.busy || (w.account !== null && w.chainOk && !formOk)}>{cta}</button>
            <TxStatusLine status={tx.status} doneText="Launched" />
          </form>
        </div>

        <aside className="h-fit rounded-panel bg-cloud p-8">
          <p className="eyebrow">Fixed forever at launch</p>
          <ul className="mt-5 space-y-4 text-[17px]">
            <li className="border-b border-mist pb-4">1,000,000,000 tokens on a built-in price curve. No presale, no team allocation.</li>
            <li className="border-b border-mist pb-4">30 minute protection window, then a flat 1% on every trade.</li>
            <li className="border-b border-mist pb-4">Tax capped at 25%. No function can raise it.</li>
            <li className="border-b border-mist pb-4">You earn 1% of every trade. Anything above that stays in the price curve.</li>
            <li>The policy you choose here, permanently.</li>
          </ul>
        </aside>
      </section>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm launch" onClick={() => !tx.busy && setConfirming(false)}>
          <div className="w-full max-w-md rounded-panel bg-white p-8" onClick={(e) => e.stopPropagation()}>
            <p className="eyebrow">Confirm launch</p>
            <h2 className="mt-3 text-[26px] leading-tight">{name.trim()} ({sym})</h2>
            <p className="mt-3 text-slate">Policy: circuit #{circuit} on <span className="mono">{processor.slice(0, 10)}…</span>. This can't be changed after launch. The 30 minute window starts the moment it lands.</p>
            <div className="mt-6 flex flex-col gap-3">
              <button className="btn-primary" disabled={tx.busy} onClick={doLaunch}>{tx.status.kind === "confirm" ? "Confirm in wallet" : tx.status.kind === "pending" ? "Waiting for block…" : "Confirm launch"}</button>
              <button className="btn-secondary" disabled={tx.busy} onClick={() => setConfirming(false)}>Go back</button>
            </div>
            <div className="mt-3"><TxStatusLine status={tx.status} /></div>
          </div>
        </div>
      )}
    </Layout>
  );
}
