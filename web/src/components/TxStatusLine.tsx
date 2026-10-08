import { txUrl } from "../lib/chain";
import type { TxStatus } from "../lib/useTx";

export function TxStatusLine({ status, doneText }: { status: TxStatus; doneText?: string }) {
  if (status.kind === "idle") return null;
  if (status.kind === "confirm") return <p className="text-[15px] text-slate" role="status">Confirm in your wallet.</p>;
  if (status.kind === "pending")
    return (
      <p className="text-[15px] text-slate" role="status">
        Waiting for the block. <a className="link" href={txUrl(status.hash)} target="_blank" rel="noreferrer">View transaction</a>
      </p>
    );
  if (status.kind === "done")
    return (
      <p className="text-[15px] text-safe" role="status">
        {doneText ?? "Done"} in block {status.block.toLocaleString()}. <a className="link" href={txUrl(status.hash)} target="_blank" rel="noreferrer">View transaction</a>
      </p>
    );
  return <p className="text-[15px] text-dangertext" role="alert">{status.message}</p>;
}
