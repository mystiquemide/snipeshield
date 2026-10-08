import { short } from "../lib/chain";
import { useWallet } from "../lib/wallet";

export function WalletButton({ onDark = false }: { onDark?: boolean }) {
  const w = useWallet();
  if (w.account && w.chainOk)
    return <span className={`mono rounded-pill px-4 py-2 ${onDark ? "bg-white/15 text-white" : "bg-cloud text-ink"}`}>{short(w.account)}</span>;
  if (w.account && !w.chainOk)
    return <button className="btn-primary !py-2.5" onClick={() => w.switchChain()}>Switch to X Layer</button>;
  return (
    <button className={onDark ? "btn-light !py-2.5" : "btn-primary !py-2.5"} onClick={() => w.connect()} disabled={w.connecting}>
      {w.connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
