import { useState } from "react";
import { Contract, ContractFactory, parseEther } from "ethers";
import { Layout } from "../components/Layout";
import { CONFIG } from "../lib/config";
import { FACTORY_ABI } from "../lib/abi";
import { errorText, txUrl } from "../lib/chain";
import { DEPLOY } from "../lib/deployData";
import { useWallet } from "../lib/wallet";

const KEY = "snipeshield-deploy";
const PRICE = parseEther("0.00001");
const STORY = "SnipeShield: launch-tax policy processor. Circuits here decide anti-snipe tax tiers for ShieldTokens. Transistor supply 1,000,000 (fixed cap), price 0.00001 OKB each.";
const STEPS = [
  ["cpuTx", "Create the SHIELD processor through the TapeOut factory"],
  ["mintTx", `Mint ${DEPLOY.gates} NAND transistors`],
  ["tapeoutTx", "Tape out the default policy circuit"],
  ["launcherTx", "Deploy the ShieldLauncher"],
] as const;

type State = Record<string, string>;

function load(): State { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }

export default function Deploy() {
  const w = useWallet();
  const [s, setS] = useState<State>(load);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = (n: State) => { setS(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* storage unavailable */ } };

  async function run() {
    setErr(null);
    try {
      if (!w.account) return await w.connect();
      if (!w.chainOk) return await w.switchChain();
      const signer = await w.getSigner();
      let st: State = { ...s, deployer: await signer.getAddress() };
      if (!st.processor) {
        setBusy("cpuTx");
        const f = new Contract(CONFIG.factory, FACTORY_ABI, signer);
        const rc = await (await f.createCPU("SnipeShield", "SHIELD", STORY, 1_000_000n, PRICE, { value: await f.deployFee() })).wait();
        const ev = rc!.logs.map((l: never) => { try { return f.interface.parseLog(l); } catch { return null; } }).find((e: { name?: string } | null) => e?.name === "CPUCreated");
        st = { ...st, processor: ev.args.circuits, transistors: ev.args.transistors, cpuTx: rc!.hash };
        save(st);
      }
      if (!st.mintTx) {
        setBusy("mintTx");
        const t = new Contract(st.transistors, ["function mint(uint256,uint256) payable", "function protocolFee() view returns (uint256)"], signer);
        const rc = await (await t.mint(0, DEPLOY.gates, { value: PRICE * BigInt(DEPLOY.gates) + (await t.protocolFee()) })).wait();
        st = { ...st, mintTx: rc!.hash }; save(st);
      }
      if (!st.tapeoutTx) {
        setBusy("tapeoutTx");
        const c = new Contract(st.processor, ["function tapeout(bytes,uint32,uint32) payable returns (uint256)", "function TAPEOUT_FEE() view returns (uint256)", "event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState)"], signer);
        const rc = await (await c.tapeout(DEPLOY.netlist, DEPLOY.nIn, DEPLOY.nOut, { value: await c.TAPEOUT_FEE() })).wait();
        const ev = rc!.logs.map((l: never) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e: { name?: string } | null) => e?.name === "TapedOut");
        st = { ...st, circuitId: String(ev.args.circuitId), tapeoutTx: rc!.hash }; save(st);
      }
      if (!st.launcherTx) {
        setBusy("launcherTx");
        const d = await new ContractFactory(["constructor(address)"], DEPLOY.launcherBytecode, signer).deploy(CONFIG.factory);
        const rc = await d.deploymentTransaction()!.wait();
        st = { ...st, launcher: await d.getAddress(), launcherTx: rc!.hash }; save(st);
      }
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const done = Boolean(s.launcherTx);
  return (
    <Layout title="Deploy">
      <section className="wrap max-w-[760px] py-14">
        <p className="eyebrow">Operator</p>
        <h1 className="mt-3 text-[40px] leading-[1.05]">Deploy SnipeShield to X Layer</h1>
        <p className="mt-4 text-slate">Four transactions from your wallet, about 0.009 OKB plus gas. Finished steps are remembered in this browser and skipped if you run it again.</p>
        <ol className="mt-8 border-t border-mist">
          {STEPS.map(([k, t], i) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 border-b border-mist py-4">
              <span><span className="mono mr-3 text-smoke">0{i + 1}</span>{t}</span>
              {s[k] ? <a className="link mono" href={txUrl(s[k])} target="_blank" rel="noreferrer">{s[k].slice(0, 10)}…</a>
                : busy === k ? <span className="text-accent">Confirm in wallet…</span> : <span className="text-smoke">Waiting</span>}
            </li>
          ))}
        </ol>
        {err && <p className="mt-4 text-dangertext" role="alert">{err}</p>}
        <button className="btn-primary mt-6" disabled={Boolean(busy) || done} onClick={run}>
          {done ? "Deployed" : !w.account ? "Connect wallet" : !w.chainOk ? "Switch to X Layer" : busy ? "Working…" : "Deploy"}
        </button>
        {done && (
          <pre className="mt-6 overflow-auto rounded-media bg-cloud p-5 font-mono text-[13px]">{JSON.stringify({ factory: CONFIG.factory, ...s }, null, 2)}</pre>
        )}
      </section>
    </Layout>
  );
}
