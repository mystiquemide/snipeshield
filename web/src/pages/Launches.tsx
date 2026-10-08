import { useState } from "react";
import { Layout, NotDeployed, RpcError } from "../components/Layout";
import { isDeployed } from "../lib/config";
import { useBlock, useLaunches } from "../lib/hooks";
import { EmptyLaunches, LaunchRows } from "./Home";

type Filter = "all" | "on" | "closed";

export default function Launches() {
  const launches = useLaunches();
  const block = useBlock();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"new" | "trades">("new");
  if (!isDeployed()) return <Layout title="Launches"><NotDeployed /></Layout>;

  const all = launches.data ?? [];
  const b = block.data ?? 0;
  let list = all.filter((l) => (filter === "all" ? true : filter === "on" ? l.windowEnd > b : l.windowEnd <= b));
  if (sort === "trades") list = [...list].sort((x, y) => y.trades - x.trades);

  return (
    <Layout title="Launches">
      <section className="wrap py-14">
        <p className="eyebrow">Launches</p>
        <h1 className="mt-3 text-[40px] leading-[1.05] md:text-[56px]">Every shielded launch on X Layer.</h1>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-pill bg-cloud p-1" role="tablist" aria-label="Filter launches">
            {([["all", "All"], ["on", "Shield on"], ["closed", "Window closed"]] as const).map(([k, t]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                className={`rounded-pill px-5 py-2 text-[15px] font-medium transition-colors ${filter === k ? "bg-accent text-white" : "text-slate hover:text-ink"}`}>{t}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[15px] text-slate">
            Sort
            <select className="rounded-pill border border-mist bg-white px-4 py-2 text-ink" value={sort} onChange={(e) => setSort(e.target.value as "new" | "trades")}>
              <option value="new">Newest</option>
              <option value="trades">Most trades</option>
            </select>
          </label>
        </div>
        <div className="mt-8 border-t border-mist">
          {launches.data === null ? (
            launches.error ? <div className="py-6"><RpcError onRetry={launches.refresh} /></div> : <p className="py-6 text-slate">Reading launches from X Layer…</p>
          ) : all.length === 0 ? <EmptyLaunches /> : list.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-mist py-8">
              <p className="text-[20px]">{filter === "on" ? "No launches have the shield on right now." : "No launches have closed their window yet."}</p>
              <button className="btn-secondary" onClick={() => setFilter("all")}>Show all launches</button>
            </div>
          ) : <LaunchRows launches={list} block={block.data} />}
        </div>
      </section>
    </Layout>
  );
}
