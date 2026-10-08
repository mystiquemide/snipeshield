import { Contract, Interface, JsonRpcProvider, formatEther, type InterfaceAbi } from "ethers";
import { CONFIG } from "./config";
import { CPU_ABI, LAUNCHER_ABI, MULTICALL_ABI, TOKEN_ABI } from "./abi";

export const provider = new JsonRpcProvider(CONFIG.rpc, CONFIG.chainId, { staticNetwork: true, batchMaxCount: 20 });

export const tokenIface = new Interface(TOKEN_ABI);
export const cpuIface = new Interface(CPU_ABI);
export const launcherIface = new Interface(LAUNCHER_ABI);

export const tokenAt = (a: string) => new Contract(a, TOKEN_ABI, provider);
export const cpuAt = (a: string) => new Contract(a, CPU_ABI, provider);
export const launcher = () => new Contract(CONFIG.launcher, LAUNCHER_ABI, provider);

type Call = { target: string; iface: Interface; fn: string; args?: unknown[] };

/** Batches view calls through Multicall3. Failed calls come back as null. */
export async function multicall(calls: Call[]): Promise<(unknown[] | null)[]> {
  if (!calls.length) return [];
  const mc = new Contract(CONFIG.multicall, MULTICALL_ABI as InterfaceAbi, provider);
  const out: (unknown[] | null)[] = [];
  for (let i = 0; i < calls.length; i += 150) {
    const chunk = calls.slice(i, i + 150);
    const res = await mc.aggregate3.staticCall(
      chunk.map((c) => ({ target: c.target, allowFailure: true, callData: c.iface.encodeFunctionData(c.fn, c.args ?? []) }))
    );
    res.forEach((r: { success: boolean; returnData: string }, j: number) => {
      if (!r.success) return out.push(null);
      try { out.push([...chunk[j].iface.decodeFunctionResult(chunk[j].fn, r.returnData)]); } catch { out.push(null); }
    });
  }
  return out;
}

export const TAX_TABLE = [100, 300, 500, 800, 1200, 1500, 2000, 2500];
export const SIGNALS = [
  { key: "early", label: "First 5 seconds", reason: "you're trading in the first 5 seconds" },
  { key: "warm", label: "Inside 30 minute window", reason: "the launch is still in its protection window" },
  { key: "big", label: "Over 0.5% of supply", reason: "the trade is over 0.5% of supply" },
  { key: "crowded", label: "2+ trades this block", reason: "2 or more trades already landed in this block" },
  { key: "recent", label: "Traded in the last minute", reason: "you traded in the last minute" },
  { key: "sell", label: "Selling", reason: "it's a sell" },
] as const;

export const bitOn = (bits: number, i: number) => ((bits >> i) & 1) === 1;

export function tierTone(tier: number) {
  if (tier <= 2) return "text-safe";
  if (tier <= 5) return "text-caution";
  return "text-dangertext";
}

export const pct = (bps: number | bigint) => `${Number(bps) / 100}%`;

export function fmtOkb(wei: bigint, max = 4) {
  const n = Number(formatEther(wei));
  if (n === 0) return "0";
  if (n < 0.0001) return n.toPrecision(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: max });
}

export function fmtTokens(wei: bigint) {
  const n = Number(formatEther(wei));
  if (n >= 1e6) return `${(n / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Price of one million tokens in OKB, readable without scientific notation. */
export function perMillion(okbPerToken: number) {
  const n = okbPerToken * 1e6;
  if (n === 0) return "0";
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
  const digits = Math.min(10, Math.max(4, -Math.floor(Math.log10(n)) + 2));
  return n.toFixed(digits);
}

export function fmtPrice(weiPerToken: bigint) {
  return perMillion(Number(formatEther(weiPerToken)));
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const addrUrl = (a: string) => `${CONFIG.explorer}/address/${a}`;
export const txUrl = (h: string) => `${CONFIG.explorer}/tx/${h}`;

export function remaining(blocks: number) {
  if (blocks <= 0) return "";
  const m = Math.floor(blocks / 60);
  const s = blocks % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Human error text for wallet and contract failures. */
export function errorText(e: unknown): string {
  const err = e as { code?: string | number; shortMessage?: string; message?: string; info?: { error?: { code?: number } }; revert?: { name?: string } };
  if (err?.code === "ACTION_REJECTED" || err?.code === 4001 || err?.info?.error?.code === 4001) return "You cancelled in your wallet.";
  const name = err?.revert?.name;
  if (name === "Slippage") return "The price moved before your trade landed, so it was cancelled to protect you. Try again.";
  if (name === "NotTapeOutProcessor") return "That address isn't a TapeOut processor.";
  if (name === "BadPolicyShape") return "That circuit isn't a policy. It needs 6 inputs, 3 outputs and no memory.";
  if (name === "NotCreator") return "Only the wallet that launched this token can withdraw its earnings.";
  if (name === "ZeroAmount") return "Enter an amount above zero.";
  const msg = err?.shortMessage || err?.message || "That didn't go through. Check your wallet for details and try again.";
  if (/insufficient funds/i.test(msg)) return "You don't have enough OKB for this amount plus gas. Lower the amount or add OKB on X Layer.";
  if (/user rejected|denied/i.test(msg)) return "You cancelled in your wallet.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
