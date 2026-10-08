// Compiles a policy written with and/or/not helpers into a TapeOut NAND netlist.
// Netlist format matches TapeOut NetlistVM: signal 0 = const 0, 1 = const 1,
// 2..2+nIn-1 = inputs, each NAND appends one signal. Outputs are the last nOut signals.

class Builder {
  constructor(inputNames) {
    this.inputs = inputNames;
    this.gates = [];
    this.memo = new Map();
  }
  input(name) {
    const i = this.inputs.indexOf(name);
    if (i < 0) throw new Error(`unknown input ${name}`);
    return 2 + i;
  }
  nand(a, b) {
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    if (this.memo.has(key)) return this.memo.get(key);
    const id = 2 + this.inputs.length + this.gates.length;
    this.gates.push([a, b]);
    this.memo.set(key, id);
    return id;
  }
  not(a) { return this.nand(a, a); }
  and(a, b) { return this.not(this.nand(a, b)); }
  or(a, b) { return this.nand(this.not(a), this.not(b)); }
  // Appends a fresh gate that is guaranteed to be emitted at this position (no memo).
  rawNand(a, b) {
    const id = 2 + this.inputs.length + this.gates.length;
    this.gates.push([a, b]);
    return id;
  }
  // Each output is given as a final [a, b] NAND pair so the last nOut gates are the outputs in order.
  finish(outputPairs) {
    for (const [a, b] of outputPairs) this.rawNand(a, b);
    const bytes = [];
    for (const [a, b] of this.gates) {
      bytes.push(0x00, (a >> 16) & 255, (a >> 8) & 255, a & 255, (b >> 16) & 255, (b >> 8) & 255, b & 255);
    }
    return { netlist: Uint8Array.from(bytes), nIn: this.inputs.length, nOut: outputPairs.length, gates: this.gates.length };
  }
}

// Reference simulator, bit-for-bit with NetlistVM.run for NAND-only netlists.
function simulate(netlist, nIn, nOut, inputBits) {
  const sig = [0, 1];
  for (let i = 0; i < nIn; i++) sig.push((inputBits >> i) & 1);
  for (let p = 0; p < netlist.length; p += 7) {
    if (netlist[p] !== 0) throw new Error("only NAND supported");
    const a = (netlist[p + 1] << 16) | (netlist[p + 2] << 8) | netlist[p + 3];
    const b = (netlist[p + 4] << 16) | (netlist[p + 5] << 8) | netlist[p + 6];
    if (a >= sig.length || b >= sig.length) throw new Error("future signal");
    sig.push(sig[a] & sig[b] ? 0 : 1);
  }
  let out = 0;
  for (let i = 0; i < nOut; i++) out |= sig[sig.length - nOut + i] << i;
  return out;
}

module.exports = { Builder, simulate };
