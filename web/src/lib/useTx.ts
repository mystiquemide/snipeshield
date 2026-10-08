import { useState } from "react";
import type { ContractTransactionResponse, TransactionReceipt } from "ethers";
import { errorText } from "./chain";

export type TxStatus =
  | { kind: "idle" }
  | { kind: "confirm" }
  | { kind: "pending"; hash: string }
  | { kind: "done"; hash: string; block: number }
  | { kind: "error"; message: string };

export function useTx() {
  const [status, setStatus] = useState<TxStatus>({ kind: "idle" });
  async function run(send: () => Promise<ContractTransactionResponse>): Promise<TransactionReceipt | null> {
    try {
      setStatus({ kind: "confirm" });
      const tx = await send();
      setStatus({ kind: "pending", hash: tx.hash });
      const rc = await tx.wait();
      if (!rc) throw new Error("Transaction dropped");
      setStatus({ kind: "done", hash: tx.hash, block: rc.blockNumber });
      return rc;
    } catch (e) {
      setStatus({ kind: "error", message: errorText(e) });
      return null;
    }
  }
  const busy = status.kind === "confirm" || status.kind === "pending";
  return { status, run, busy, reset: () => setStatus({ kind: "idle" }) };
}
