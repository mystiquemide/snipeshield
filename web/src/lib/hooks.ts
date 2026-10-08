import { useCallback, useEffect, useRef, useState } from "react";
import { CONFIG, isDeployed } from "./config";
import { launcher, multicall, provider, tokenAt, tokenIface } from "./chain";

/** Polls `fn` every `ms`. Keeps last good data on transient errors and exposes the error. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => {
    try {
      const v = await fnRef.current();
      setData(v);
      setError(null);
    } catch (e) {
      setError((e as Error)?.message || "error");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setLoading(true);
    setData(null);
    run();
    const t = setInterval(run, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, refresh: run };
}

export function useBlock() {
  return usePoll(() => provider.getBlockNumber(), 3000);
}

export type Launch = {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  processor: string;
  circuitId: number;
  launchBlock: number;
  windowEnd: number;
  trades: number;
  penaltyKept: bigint;
  volume: bigint;
  price: bigint;
};

const FIELDS = ["name", "symbol", "creator", "processor", "circuitId", "launchBlock", "windowEndBlock", "tradeCount", "penaltyKept", "volumeOkb", "spotPrice"] as const;

export async function readLaunches(addresses: string[]): Promise<Launch[]> {
  const calls = addresses.flatMap((a) => FIELDS.map((fn) => ({ target: a, iface: tokenIface, fn })));
  const res = await multicall(calls);
  return addresses.map((address, i) => {
    const r = (k: number) => res[i * FIELDS.length + k]?.[0];
    return {
      address,
      name: String(r(0) ?? ""),
      symbol: String(r(1) ?? ""),
      creator: String(r(2) ?? ""),
      processor: String(r(3) ?? ""),
      circuitId: Number(r(4) ?? 0),
      launchBlock: Number(r(5) ?? 0),
      windowEnd: Number(r(6) ?? 0),
      trades: Number(r(7) ?? 0),
      penaltyKept: BigInt((r(8) as bigint) ?? 0n),
      volume: BigInt((r(9) as bigint) ?? 0n),
      price: BigInt((r(10) as bigint) ?? 0n),
    };
  });
}

export function useLaunches() {
  return usePoll(async () => {
    if (!isDeployed()) return [] as Launch[];
    const l = launcher();
    const n = Number(await l.tokenCount());
    const addrs = (await multicall([...Array(n).keys()].map((i) => ({ target: CONFIG.launcher, iface: l.interface, fn: "tokens", args: [i] }))))
      .map((r) => String(r?.[0] ?? ""))
      .filter(Boolean);
    const list = await readLaunches(addrs);
    return list.reverse();
  }, 10000);
}

export type TradeRow = {
  index: number;
  trader: string;
  blockNumber: number;
  timestamp: number;
  isBuy: boolean;
  inputs: number;
  tier: number;
  taxBps: number;
  okbAmount: bigint;
  tokenAmount: bigint;
};

export async function readTrades(token: string, total: number, count: number): Promise<TradeRow[]> {
  const start = Math.max(0, total - count);
  const rows = (await tokenAt(token).tradesSlice(start, count)) as unknown[];
  return rows.map((r, i) => {
    const t = r as { trader: string; blockNumber: bigint; timestamp: bigint; isBuy: boolean; inputs: bigint; tier: bigint; taxBps: bigint; okbAmount: bigint; tokenAmount: bigint };
    return {
      index: start + i,
      trader: t.trader,
      blockNumber: Number(t.blockNumber),
      timestamp: Number(t.timestamp),
      isBuy: t.isBuy,
      inputs: Number(t.inputs),
      tier: Number(t.tier),
      taxBps: Number(t.taxBps),
      okbAmount: t.okbAmount,
      tokenAmount: t.tokenAmount,
    };
  });
}

/** Finds the tx hash of a recorded trade by reading that single block's Trade logs. */
export async function findTradeTx(token: string, row: TradeRow): Promise<string | null> {
  const logs = await provider.getLogs({ address: token, fromBlock: row.blockNumber, toBlock: row.blockNumber, topics: [tokenIface.getEvent("Trade")!.topicHash] });
  const hit = logs.find((l) => {
    const p = tokenIface.parseLog(l);
    return p && String(p.args.trader).toLowerCase() === row.trader.toLowerCase() && p.args.isBuy === row.isBuy;
  });
  return hit?.transactionHash ?? null;
}
