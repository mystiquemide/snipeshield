import { useMemo } from "react";
import { POLICY as DEPLOY } from "../lib/policyData";

const INPUTS = ["early", "warm", "big", "crowded", "recent", "sell"];
const OUTPUTS = ["C", "B", "A"]; // bit order: o0, o1, o2

type Gate = { id: number; a: number; b: number; depth: number };

/** Draws the default policy straight from its netlist bytes: inputs on the left, NAND gates by depth, outputs on the right. */
export function CircuitDiagram() {
  const { gates, maxDepth, outStart } = useMemo(() => {
    const hex = DEPLOY.netlist.slice(2);
    const bytes = hex.match(/../g)!.map((h) => parseInt(h, 16));
    const nIn = DEPLOY.nIn;
    const depth: Record<number, number> = {};
    for (let i = 0; i < 2 + nIn; i++) depth[i] = 0;
    const gs: Gate[] = [];
    for (let p = 0, id = 2 + nIn; p < bytes.length; p += 7, id++) {
      const a = (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
      const b = (bytes[p + 4] << 16) | (bytes[p + 5] << 8) | bytes[p + 6];
      depth[id] = Math.max(depth[a], depth[b]) + 1;
      gs.push({ id, a, b, depth: depth[id] });
    }
    return { gates: gs, maxDepth: Math.max(...gs.map((g) => g.depth)), outStart: 2 + nIn + gs.length - DEPLOY.nOut };
  }, []);

  const W = 760, H = 460, padX = 92, padY = 34;
  const colW = (W - padX * 2) / (maxDepth + 1);
  const pos: Record<number, { x: number; y: number }> = {};
  INPUTS.forEach((_, i) => { pos[2 + i] = { x: padX - 10, y: padY + (i * (H - padY * 2)) / (INPUTS.length - 1) }; });
  const byDepth: Record<number, Gate[]> = {};
  gates.forEach((g) => (byDepth[g.depth] ||= []).push(g));
  Object.entries(byDepth).forEach(([d, list]) => {
    list.forEach((g, i) => {
      const isOut = g.id >= outStart;
      const x = isOut ? padX + (maxDepth + 1) * colW - 20 : padX + Number(d) * colW;
      const y = list.length === 1 ? H / 2 : padY + ((i + 0.5) * (H - padY * 2)) / list.length;
      pos[g.id] = { x, y };
    });
  });
  // Spread the three outputs evenly on the right edge.
  gates.filter((g) => g.id >= outStart).forEach((g, i) => { pos[g.id] = { x: W - padX + 18, y: padY + 60 + i * ((H - padY * 2 - 120) / 2) }; });

  const wire = (from: number, to: number) => {
    const s = pos[from], t = pos[to];
    if (!s || !t) return null;
    const mx = (s.x + t.x) / 2;
    return `M${s.x + 8},${s.y} C${mx},${s.y} ${mx},${t.y} ${t.x - 13},${t.y}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
      aria-label={`The default SnipeShield policy: ${gates.length} NAND gates turning 6 trade signals into 3 output bits`}>
      <rect width={W} height={H} rx="28" fill="#0B1533" />
      <g fill="none" stroke="#3E6BFF" strokeOpacity="0.55" strokeWidth="1.4">
        {gates.flatMap((g) => [wire(g.a, g.id), wire(g.b, g.id)]).map((d, i) => d && <path key={i} d={d} />)}
      </g>
      {INPUTS.map((n, i) => (
        <g key={n}>
          <text x={padX - 22} y={pos[2 + i].y + 4} textAnchor="end" fill="#C9D5FF" fontFamily="JetBrains Mono, monospace" fontSize="13">{n}</text>
          <circle cx={pos[2 + i].x} cy={pos[2 + i].y} r="5" fill="#1F5BFF" stroke="#C9D5FF" strokeWidth="1.5" />
        </g>
      ))}
      {gates.map((g) => {
        const out = g.id >= outStart;
        return (
          <g key={g.id}>
            <rect x={pos[g.id].x - 13} y={pos[g.id].y - 10} width="26" height="20" rx="6" fill={out ? "#1F5BFF" : "#13204A"} stroke="#5D83FF" strokeWidth="1.2" />
            {out && (
              <text x={pos[g.id].x + 22} y={pos[g.id].y + 5} fill="#FFFFFF" fontFamily="Inter Tight, sans-serif" fontSize="15" fontWeight="600">
                {OUTPUTS[g.id - outStart]}
              </text>
            )}
          </g>
        );
      })}
      <text x={W / 2} y={H - 12} textAnchor="middle" fill="#8EA6E8" fontFamily="JetBrains Mono, monospace" fontSize="11">
        {gates.length} NAND gates · read from the same bytes taped out on TapeOut
      </text>
    </svg>
  );
}
