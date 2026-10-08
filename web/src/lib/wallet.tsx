import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import { CONFIG } from "./config";

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, f: (...a: unknown[]) => void) => void;
  removeListener?: (e: string, f: (...a: unknown[]) => void) => void;
};

declare global {
  interface Window { ethereum?: Eip1193; okxwallet?: Eip1193 }
}

type WalletState = {
  hasWallet: boolean;
  account: string | null;
  chainOk: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  getSigner: () => Promise<JsonRpcSigner>;
  installOpen: boolean;
  setInstallOpen: (v: boolean) => void;
};

const Ctx = createContext<WalletState | null>(null);
const CHAIN_HEX = "0x" + CONFIG.chainId.toString(16);
const injected = () => (typeof window === "undefined" ? undefined : window.okxwallet || window.ethereum);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const eth = injected();

  useEffect(() => {
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((a) => setAccount(((a as string[]) || [])[0] ?? null)).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(String(c))).catch(() => {});
    const onAcc = (a: unknown) => setAccount(((a as string[]) || [])[0] ?? null);
    const onChain = (c: unknown) => setChainId(String(c));
    eth.on?.("accountsChanged", onAcc);
    eth.on?.("chainChanged", onChain);
    return () => { eth.removeListener?.("accountsChanged", onAcc); eth.removeListener?.("chainChanged", onChain); };
  }, [eth]);

  const switchChain = useCallback(async () => {
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: CHAIN_HEX, chainName: "X Layer", rpcUrls: ["https://rpc.xlayer.tech"], nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: [CONFIG.explorer] }],
      });
    }
    setChainId(String(await eth.request({ method: "eth_chainId" })));
  }, [eth]);

  const connect = useCallback(async () => {
    if (!eth) { setInstallOpen(true); return; }
    setConnecting(true);
    try {
      const a = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAccount(a[0] ?? null);
      const c = String(await eth.request({ method: "eth_chainId" }));
      setChainId(c);
      if (parseInt(c, 16) !== CONFIG.chainId) await switchChain().catch(() => {});
    } finally {
      setConnecting(false);
    }
  }, [eth, switchChain]);

  const getSigner = useCallback(async () => {
    if (!eth) throw new Error("No wallet found");
    return new BrowserProvider(eth as never).getSigner();
  }, [eth]);

  const value = useMemo<WalletState>(() => ({
    hasWallet: Boolean(eth),
    account,
    chainOk: chainId !== null && parseInt(chainId, 16) === CONFIG.chainId,
    connecting,
    connect,
    switchChain,
    getSigner,
    installOpen,
    setInstallOpen,
  }), [eth, account, chainId, connecting, connect, switchChain, getSigner, installOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("WalletProvider missing");
  return v;
}
