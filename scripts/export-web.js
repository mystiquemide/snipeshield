// Writes the compiled default policy netlist into the web app (web/src/lib/policyData.ts) for the circuit diagram.
const fs = require("fs");
const p = require("../policy/default.js");
const c = p.build();
p.verify(c);
const data = { netlist: "0x" + Buffer.from(c.netlist).toString("hex"), gates: c.gates, nIn: c.nIn, nOut: c.nOut };
fs.writeFileSync("web/src/lib/policyData.ts", "// Generated from policy/default.js by scripts/export-web.js. Do not edit.\nexport const POLICY = " + JSON.stringify(data) + " as const;\n");
console.log("web/src/lib/policyData.ts written");
