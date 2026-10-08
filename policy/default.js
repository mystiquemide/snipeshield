// SnipeShield default launch policy.
// Inputs (bit order): early, warm, big, crowded, recent, sell.
// Output tier = 4*o2 + 2*o1 + o0.
//   o2 = early OR (big AND crowded)
//   o1 = warm AND (big OR crowded OR (sell AND recent))
//   o0 = warm AND (recent OR sell)
const { Builder, simulate } = require("./compiler");

const INPUTS = ["early", "warm", "big", "crowded", "recent", "sell"];

function reference(bits) {
  const v = (i) => (bits >> i) & 1;
  const [early, warm, big, crowded, recent, sell] = INPUTS.map((_, i) => v(i));
  const o2 = early | (big & crowded);
  const o1 = warm & (big | crowded | (sell & recent));
  const o0 = warm & (recent | sell);
  return (o2 << 2) | (o1 << 1) | o0;
}

function build() {
  const b = new Builder(INPUTS);
  const [early, warm, big, crowded, recent, sell] = INPUTS.map((n) => b.input(n));

  // o0 = warm AND (recent OR sell) = NOT(NAND(warm, recent OR sell))
  const n0 = b.nand(warm, b.or(recent, sell));
  // o1 = warm AND (big OR crowded OR (sell AND recent))
  const x1 = b.or(b.or(big, crowded), b.and(sell, recent));
  const n1 = b.nand(warm, x1);
  // o2 = early OR (big AND crowded) = NAND(NOT early, NAND(big, crowded))
  const notEarly = b.not(early);
  const bc = b.nand(big, crowded);

  return b.finish([[n0, n0], [n1, n1], [notEarly, bc]]);
}

function verify(compiled) {
  for (let bits = 0; bits < 64; bits++) {
    const got = simulate(compiled.netlist, compiled.nIn, compiled.nOut, bits);
    if (got !== reference(bits)) throw new Error(`mismatch at ${bits}: ${got} != ${reference(bits)}`);
  }
}

module.exports = { INPUTS, reference, build, verify };

if (require.main === module) {
  const c = build();
  verify(c);
  console.log(JSON.stringify({ gates: c.gates, nIn: c.nIn, nOut: c.nOut, netlist: "0x" + Buffer.from(c.netlist).toString("hex") }));
}
