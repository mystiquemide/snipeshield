// Writes the launcher bytecode and default policy netlist into the web app (web/src/lib/deployData.ts).
const fs = require("fs");
const a = require("../artifacts/contracts/ShieldLauncher.sol/ShieldLauncher.json");
const p = require("../policy/default.js");
const c = p.build();
p.verify(c);
const data = { launcherBytecode: a.bytecode, netlist: "0x" + Buffer.from(c.netlist).toString("hex"), gates: c.gates, nIn: c.nIn, nOut: c.nOut };
fs.writeFileSync("web/src/lib/deployData.ts", "// Generated from artifacts and policy/default.js by scripts/export-web.js. Do not edit.\nexport const DEPLOY = " + JSON.stringify(data) + " as const;\n");
console.log("web/src/lib/deployData.ts written");
