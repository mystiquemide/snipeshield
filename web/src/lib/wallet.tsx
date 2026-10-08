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
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  switchChain: () => Promise<void>;
  getSigner: () => Promise<JsonRpcSigner>;
  installOpen: boolean;
  setInstallOpen: (v: boolean) => void;
};

const Ctx = createContext<WalletState | null>(null);
const CHAIN_HEX = "0x" + CONFIG.chainId.toString(16);
const DISCONNECTED = "snipeshield-disconnected";
const wasDisconnected = () => { try { return localStorage.getItem(DISCONNECTED) === "1"; } catch { return false; } };
const setDisconnected = (v: boolean) => { try { if (v) localStorage.setItem(DISCONNECTED, "1"); else localStorage.removeItem(DISCONNECTED); } catch { /* storage unavailable */ } };
const injected = () => (typeof window === "undefined" ? undefined : window.okxwallet || window.ethereum);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const eth = injected();

  useEffect(() => {
    if (!eth) return;
    if (!wasDisconnected()) eth.request({ method: "eth_accounts" }).then((a) => setAccount(((a as string[]) || [])[0] ?? null)).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(String(c))).catch(() => {});
    const onAcc = (a: unknown) => { if (!wasDisconnected()) setAccount(((a as string[]) || [])[0] ?? null); };
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
    if (!eth) { setInstallOpen(true); return false; }
    setConnecting(true);
    try {
      const a = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setDisconnected(false);
      setAccount(a[0] ?? null);
      const c = String(await eth.request({ method: "eth_chainId" }));
      setChainId(c);
      if (parseInt(c, 16) !== CONFIG.chainId) await switchChain().catch(() => {});
      return Boolean(a[0]);
    } catch {
      return false;
    } finally {
      setConnecting(false);
    }
  }, [eth, switchChain]);

  const disconnect = useCallback(async () => {
    setDisconnected(true);
    setAccount(null);
    // Wallets that support it drop the site's permission too; others just stop being read by the app.
    await eth?.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
  }, [eth]);

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
    disconnect,
    switchChain,
    getSigner,
    installOpen,
    setInstallOpen,
  }), [eth, account, chainId, connecting, connect, disconnect, switchChain, getSigner, installOpen]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("WalletProvider missing");
  return v;
}
