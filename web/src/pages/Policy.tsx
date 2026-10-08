import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getBytes, isAddress } from "ethers";
import { Layout, RpcError } from "../components/Layout";
import { SIGNALS, TAX_TABLE, addrUrl, cpuAt, multicall, cpuIface, pct, short, tierTone } from "../lib/chain";

// Netlist of the SnipeShield default policy (policy/default.js), used to recognise it on any processor.
const DEFAULT_NETLIST = "0x0000000600000600000007000007000000080000090000000300000a00000004000004000000050000050000000c00000d000000070000060000000f00000f0000000e00000e00000010000010000000110000120000000300001300000002000002000000040000050000000b00000b0000001400001400000015000016";
const NAMES = ["early", "warm", "big", "crowded", "recent", "sell"];

type Data = { nIn: number; nOut: number; nState: number; gates: number; owner: string; netlist: string; rows: number[] | null };

export default function Policy() {
  const { processor = "", id = "" } = useParams();
  const circuit = Number(id);
  const valid = isAddress(processor) && Number.isInteger(circuit) && circuit > 0;
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<"missing" | "rpc" | null>(null);
  const [tab, setTab] = useState<"rules" | "table" | "gates">("rules");
  const [tierFilter, setTierFilter] = useState<number | "all">("all");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    setErr(null);
    (async () => {
      const cpu = cpuAt(processor);
      let info;
      try { info = await cpu.circuitInfo(circuit); } catch { return alive && setErr("missing"); }
      const [netlist, owner] = await Promise.all([cpu.netlist(circuit) as Promise<string>, (cpu.ownerOf(circuit) as Promise<string>).catch(() => "")]);
      const base = { nIn: Number(info[0]), nOut: Number(info[1]), nState: Number(info[2]), gates: Number(info[3]), owner, netlist };
      if (alive) setData({ ...base, rows: null });
      if (base.nIn !== 6 || base.nOut !== 3 || base.nState !== 0) return;
      const res = await multicall([...Array(64).keys()].map((b) => ({ target: processor, iface: cpuIface, fn: "eval", args: [circuit, "0x" + b.toString(16).padStart(2, "0")] })));
      const rows = res.map((r) => (r ? Number(r[0]) & 7 : -1));
      if (alive) setData({ ...base, rows });
    })().catch(() => alive && setErr("rpc"));
    return () => { alive = false; };
  }, [processor, circuit, valid, attempt]);

  if (!valid || err === "missing")
    return (
      <Layout title={`Policy #${id}`}>
        <div className="wrap py-24">
          <h1 className="text-[36px] leading-tight">{valid ? `There's no circuit #${circuit} on this processor.` : "That isn't a valid policy link."}</h1>
          <Link className="btn-primary mt-6" to="/launches">See launches</Link>
        </div>
      </Layout>
    );

  const isDefault = data?.netlist.toLowerCase() === DEFAULT_NETLIST;
  const isPolicy = data && data.nIn === 6 && data.nOut === 3 && data.nState === 0;

  const gates: string[] = [];
  if (data) {
    const b = getBytes(data.netlist);
    const label = (s: number) => (s === 0 ? "0" : s === 1 ? "1" : s < 2 + data.nIn ? (data.nIn === 6 ? NAMES[s - 2] : `in${s - 2}`) : `g${s}`);
    let g = 2 + data.nIn;
    const total = 2 + data.nIn + b.length / 7;
    for (let p = 0; p + 6 < b.length; p += 7, g++) {
      if (b[p] !== 0) { gates.push(`g${g} = op ${b[p]} (not a NAND, shown raw)`); continue; }
      const a = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
      const c = (b[p + 4] << 16) | (b[p + 5] << 8) | b[p + 6];
      const out = g - (total - data.nOut);
      gates.push(`g${g} = NAND(${label(a)}, ${label(c)})${out >= 0 ? `   → output o${out}` : ""}`);
    }
  }

  return (
    <Layout title={`Policy #${id}`}>
      <section className="wrap py-14">
        <p className="eyebrow">Policy</p>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Circuit #{circuit}{isDefault ? ", SnipeShield default" : ""}</h1>
        {err === "rpc" && <div className="mt-6"><RpcError onRetry={() => setAttempt(attempt + 1)} /></div>}
        {!data ? !err && <p className="mt-6 text-slate">Reading the circuit from X Layer…</p> : (
          <>
            <p className="mt-4 text-[17px] text-slate">
              {data.nIn} inputs · {data.nOut} outputs · {data.gates} gates · on processor{" "}
              <a className="mono hover:text-ink" href={addrUrl(processor)} target="_blank" rel="noreferrer">{short(processor)}</a>
              {data.owner && <> · held by <a className="mono hover:text-ink" href={addrUrl(data.owner)} target="_blank" rel="noreferrer">{short(data.owner)}</a></>}
            </p>
            {!isPolicy && <p className="mt-4 text-dangertext">This circuit can't be used as a launch policy. A policy needs 6 inputs, 3 outputs and no memory.</p>}

            <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
              <div className="inline-flex rounded-pill bg-cloud p-1" role="tablist">
                {([["rules", "Rules"], ["table", "Truth table"], ["gates", "Gates"]] as const).map(([k, t]) => (
                  <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`rounded-pill px-5 py-2 text-[15px] font-medium transition-colors ${tab === k ? "bg-accent text-white" : "text-slate hover:text-ink"}`}>{t}</button>
                ))}
              </div>
              {isPolicy && <Link className="btn-primary" to={`/launch?processor=${processor}&circuit=${circuit}`}>Launch with this policy</Link>}
            </div>

            <div className="mt-8">
              {tab === "rules" && (isDefault ? (
                <div className="grid gap-10 md:grid-cols-2">
                  <div>
                    <p className="text-slate">The circuit reads six yes or no signals about each trade and returns a tier from 0 to 7:</p>
                    <ul className="mt-4">
                      {SIGNALS.map((s, i) => <li key={s.key} className="flex justify-between border-b border-mist py-3 text-[15px]"><span>{s.label}</span><span className="mono text-smoke">input {i}</span></li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="text-slate">Three outputs build the tier (tier = 4 × A + 2 × B + C):</p>
                    <ul className="mt-4 space-y-4 text-[17px]">
                      <li className="border-b border-mist pb-4"><span className="mono text-accent">A</span> First 5 seconds, or a large trade in a busy block.</li>
                      <li className="border-b border-mist pb-4"><span className="mono text-accent">B</span> Inside the window, and large, busy, or a sell right after trading.</li>
                      <li className="border-b border-mist pb-4"><span className="mono text-accent">C</span> Inside the window, and selling or trading again within a minute.</li>
                    </ul>
                  </div>
                </div>
              ) : <p className="text-slate">This is a custom policy, so there's no plain-language summary. The truth table shows exactly what it charges for every combination.</p>)}

              {tab === "table" && (isPolicy ? (data.rows ? (
                <div>
                  <label className="mb-4 flex items-center gap-2 text-[15px] text-slate">Show
                    <select className="rounded-pill border border-mist bg-white px-4 py-2 text-ink" value={tierFilter} onChange={(e) => setTierFilter(e.target.value === "all" ? "all" : Number(e.target.value))}>
                      <option value="all">All 64 rows</option>
                      {TAX_TABLE.map((b, t) => <option key={t} value={t}>Tier {t} ({pct(b)})</option>)}
                    </select>
                  </label>
                  <div className="overflow-x-auto rounded-media border border-mist">
                    <table className="w-full min-w-[620px] text-center text-[14px]">
                      <thead><tr className="border-b border-mist bg-cloud text-smoke">{NAMES.map((n) => <th key={n} className="py-3 font-medium">{n}</th>)}<th className="py-3 font-medium">Tier</th><th className="py-3 font-medium">Tax</th></tr></thead>
                      <tbody>
                        {data.rows.map((t, b) => (tierFilter === "all" || tierFilter === t) && (
                          <tr key={b} className="border-b border-mist last:border-0">
                            {NAMES.map((_, i) => <td key={i} className={`mono py-2 ${(b >> i) & 1 ? "text-ink" : "text-ash"}`}>{(b >> i) & 1}</td>)}
                            <td className={`mono py-2 ${t >= 0 ? tierTone(t) : ""}`}>{t >= 0 ? t : "failed"}</td>
                            <td className={`py-2 font-medium ${t >= 0 ? tierTone(t) : ""}`}>{t >= 0 ? pct(TAX_TABLE[t]) : "25% (fail closed)"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-[14px] text-smoke">Every row is read live from the processor with eval(). Nothing here is computed in your browser.</p>
                </div>
              ) : <p className="text-slate">Reading 64 rows from X Layer…</p>) : <p className="text-slate">No truth table: this circuit doesn't have the policy shape.</p>)}

              {tab === "gates" && <pre className="max-h-[520px] overflow-auto rounded-media border border-mist bg-cloud p-5 font-mono text-[13px] leading-relaxed text-graphite">{gates.join("\n")}</pre>}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
