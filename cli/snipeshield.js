#!/usr/bin/env node
// SnipeShield CLI: read-only checks and quotes against X Layer mainnet, for people, CI and AI agents.
// Every check reads chain or HTTP state directly. Nothing here signs or sends a transaction.
"use strict";

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const policy = require("../policy/default");

const DEFAULTS = {
  rpc: process.env.XLAYER_RPC || "https://rpc.xlayer.tech",
  site: process.env.SNIPESHIELD_SITE || "https://snipeshield.midelabs.xyz",
  chainId: 196,
  factory: "0x1f09daefa827f02cbb40967cc91b259763760761",
  processor: "0x1EB66F2b96F8E861b20B2F93b66c99F0ea86276E",
  transistors: "0x6733a381b6120d9cB73E1b9B03198DD1407edb33",
  launcher: "0x213149A7120F2d417DB5626607257b72687bf812",
  circuitId: 1,
};

const ABI = {
  factory: ["function isCPU(address) view returns (bool)"],
  cpu: [
    "function eval(uint256,bytes) view returns (bytes)",
    "function circuitInfo(uint256) view returns (uint32,uint32,uint32,uint32)",
    "function netlist(uint256) view returns (bytes)",
    "function transistors() view returns (address)",
  ],
  transistors: [
    "function supplyCap() view returns (uint256)",
    "function mintPrice() view returns (uint256)",
    "function minted() view returns (uint256)",
    "function circuits() view returns (address)",
  ],
  launcher: ["function tapeoutFactory() view returns (address)", "function tokenCount() view returns (uint256)", "function tokens(uint256) view returns (address)"],
  token: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function creator() view returns (address)",
    "function processor() view returns (address)",
    "function circuitId() view returns (uint256)",
    "function launchBlock() view returns (uint256)",
    "function windowEndBlock() view returns (uint256)",
    "function tradeCount() view returns (uint256)",
    "function penaltyKept() view returns (uint256)",
    "function volumeOkb() view returns (uint256)",
    "function spotPrice() view returns (uint256)",
    "function taxTable(uint8) pure returns (uint256)",
    "function quoteBuy(address,uint256) view returns (uint256,uint8,uint8,uint256)",
    "function quoteSell(address,uint256) view returns (uint256,uint8,uint8,uint256)",
  ],
};

const SIGNALS = ["early", "warm", "big", "crowded", "recent", "sell"];

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && ["timeout", "trader", "rpc", "site", "side"].includes(key)) {
        out.flags[key] = next;
        i++;
      } else out.flags[key] = true;
    } else out._.push(a);
  }
  return out;
}

// ---------------------------------------------------------------- check runner

function withTimeout(promise, ms, label) {
  let t;
  return Promise.race([promise, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms); })]).finally(() => clearTimeout(t));
}

async function runCheck(id, name, fn, timeoutMs) {
  const started = Date.now();
  try {
    const r = (await withTimeout(Promise.resolve().then(fn), timeoutMs, name)) || {};
    return { id, name, status: r.status || "pass", durationMs: Date.now() - started, evidence: r.evidence || [], error: r.error || null, suggestedFix: r.fix || null };
  } catch (e) {
    return { id, name, status: "fail", durationMs: Date.now() - started, evidence: [], error: e.shortMessage || e.message, suggestedFix: e.fix || null };
  }
}

function fail(message, fix) {
  const e = new Error(message);
  e.fix = fix;
  throw e;
}

// ---------------------------------------------------------------- checks

function makeContext(flags) {
  const cfg = { ...DEFAULTS, rpc: flags.rpc || DEFAULTS.rpc, site: flags.site || DEFAULTS.site };
  const provider = new ethers.JsonRpcProvider(cfg.rpc, cfg.chainId, { staticNetwork: true, batchMaxCount: 8 });
  return { cfg, provider, c: (addr, abi) => new ethers.Contract(addr, abi, provider) };
}

const CHECKS = {
  "config.addresses": ["Configured addresses are valid", async ({ cfg }) => {
    const bad = ["factory", "processor", "transistors", "launcher"].filter((k) => !ethers.isAddress(cfg[k]));
    if (bad.length) fail(`Invalid address for ${bad.join(", ")}`, "Fix the addresses in cli/snipeshield.js DEFAULTS.");
    if (!/^https?:\/\//.test(cfg.rpc)) fail("RPC URL is not http(s)", "Set XLAYER_RPC to an https URL.");
    return { evidence: [`rpc ${new URL(cfg.rpc).host}`, `site ${new URL(cfg.site).host}`] };
  }],

  "rpc.health": ["X Layer RPC reachable and fresh", async ({ provider, cfg }) => {
    const net = await provider.send("eth_chainId", []);
    if (Number(net) !== cfg.chainId) fail(`RPC chain id ${Number(net)}, expected ${cfg.chainId}`, "Point XLAYER_RPC at X Layer mainnet.");
    const block = await provider.getBlock("latest");
    const age = Math.floor(Date.now() / 1000) - block.timestamp;
    if (age > 60) return { status: "warn", evidence: [`block ${block.number}`, `head is ${age}s old`], fix: "The RPC may be lagging. Try another X Layer RPC." };
    return { evidence: [`chain 196`, `block ${block.number}`, `head age ${age}s`] };
  }],

  "contracts.code": ["All contracts have code on chain", async ({ provider, cfg }) => {
    const ev = [];
    for (const k of ["factory", "processor", "transistors", "launcher"]) {
      const code = await provider.getCode(cfg[k]);
      if (code === "0x") fail(`${k} ${cfg[k]} has no code`, "Check the address or the network.");
      ev.push(`${k} ${(code.length - 2) / 2} bytes`);
    }
    return { evidence: ev };
  }],

  "tapeout.registration": ["Processor is registered with the TapeOut factory", async ({ c, cfg }) => {
    if (!(await c(cfg.factory, ABI.factory).isCPU(cfg.processor))) fail("Factory does not list the processor as a CPU", "Redeploy the processor through the TapeOut factory.");
    const linked = await c(cfg.processor, ABI.cpu).transistors();
    if (linked.toLowerCase() !== cfg.transistors.toLowerCase()) fail(`Processor points to transistors ${linked}`, "Update the transistors address.");
    return { evidence: ["isCPU true", `transistors ${linked}`] };
  }],

  "tapeout.issuance": ["Transistor issuance matches the disclosed terms", async ({ c, cfg }) => {
    const t = c(cfg.transistors, ABI.transistors);
    const [cap, price, minted] = await Promise.all([t.supplyCap(), t.mintPrice(), t.minted()]);
    if (cap !== 1_000_000n) fail(`Supply cap is ${cap}, disclosed 1,000,000`, "Update the README disclosure or the deployment.");
    if (price !== ethers.parseEther("0.00001")) fail(`Mint price is ${ethers.formatEther(price)} OKB, disclosed 0.00001`, "Update the README disclosure.");
    return { evidence: [`supply ${cap}`, `price ${ethers.formatEther(price)} OKB`, `minted ${minted}`] };
  }],

  "policy.shape": ["Default policy is a stateless 6-in 3-out circuit", async ({ c, cfg }) => {
    const [nIn, nOut, nState, gates] = await c(cfg.processor, ABI.cpu).circuitInfo(cfg.circuitId);
    if (Number(nIn) !== 6 || Number(nOut) !== 3 || Number(nState) !== 0) fail(`Circuit is ${nIn}/${nOut}/${nState}`, "Launches require 6 inputs, 3 outputs and no latches.");
    return { evidence: [`6 in, 3 out, 0 latches, ${gates} gates`] };
  }],

  "policy.netlist": ["On-chain netlist matches policy/default.js", async ({ c, cfg }) => {
    const onchain = (await c(cfg.processor, ABI.cpu).netlist(cfg.circuitId)).toLowerCase();
    const local = "0x" + Buffer.from(policy.build().netlist).toString("hex");
    if (onchain !== local) fail("Netlist bytes differ from the compiled policy", "The deployed circuit is not the policy in this repo.");
    return { evidence: [`${(onchain.length - 2) / 2} bytes identical`] };
  }],

  "policy.truthTable": ["Live eval() matches the reference on all 64 inputs", async ({ c, cfg }) => {
    const cpu = c(cfg.processor, ABI.cpu);
    const rows = [];
    for (let b = 0; b < 64; b += 8) rows.push(...(await Promise.all([...Array(8).keys()].map((k) => cpu.eval(cfg.circuitId, ethers.toBeHex(b + k, 1))))));
    const bad = rows.map((r, b) => [b, Number(r) & 7]).filter(([b, t]) => t !== policy.reference(b));
    if (bad.length) fail(`${bad.length} rows differ, first at input ${bad[0][0]}`, "The circuit does not implement the documented policy.");
    return { evidence: ["64/64 rows match"] };
  }],

  "launcher.wiring": ["Launcher points at the TapeOut factory", async ({ c, cfg }) => {
    const l = c(cfg.launcher, ABI.launcher);
    const f = await l.tapeoutFactory();
    if (f.toLowerCase() !== cfg.factory.toLowerCase()) fail(`Launcher factory is ${f}`, "Redeploy the launcher with the TapeOut factory address.");
    return { evidence: [`factory ${f}`, `${await l.tokenCount()} launches`] };
  }],

  "launches.integrity": ["Every launch is capped at 25% and bound to a valid policy", async ({ c, cfg }) => {
    const l = c(cfg.launcher, ABI.launcher);
    const n = Number(await l.tokenCount());
    if (n === 0) return { status: "warn", evidence: ["no launches yet"], fix: "Launch a token from the site or the launcher." };
    const ev = [];
    for (let i = 0; i < n; i++) {
      const t = c(await l.tokens(i), ABI.token);
      const table = await Promise.all([...Array(8).keys()].map((k) => t.taxTable(k)));
      if (table.some((v) => v > 2500n)) fail(`${t.target} has a tier above 25%`, "This should be impossible: the table is a constant.");
      const [sym, trades] = await Promise.all([t.symbol(), t.tradeCount()]);
      ev.push(`${sym} ${t.target.slice(0, 10)}… ${trades} trades, max tax ${Number(table[7]) / 100}%`);
    }
    return { evidence: ev };
  }],

  "site.routes": ["Live site routes respond", async ({ cfg }) => {
    const ev = [];
    for (const r of ["/", "/how", "/launches", "/launch", `/policy/${cfg.processor}/${cfg.circuitId}`, "/agent.json", "/og.png"]) {
      const res = await fetch(cfg.site + r, { redirect: "follow" });
      if (res.status !== 200) fail(`${r} returned ${res.status}`, "Check the Vercel deployment and rewrites.");
      ev.push(`${r} 200`);
    }
    return { evidence: ev };
  }],

  "site.config": ["Live site is built against these contracts", async ({ cfg }) => {
    const html = await (await fetch(cfg.site + "/")).text();
    const js = html.match(/\/assets\/index-[^"]+\.js/);
    if (!js) fail("No app bundle found in the page", "Rebuild and redeploy the site.");
    const bundle = await (await fetch(cfg.site + js[0])).text();
    const missing = ["launcher", "processor"].filter((k) => !bundle.includes(cfg[k]));
    if (missing.length) fail(`Bundle does not contain the ${missing.join(" and ")} address`, "Set VITE_LAUNCHER and VITE_PROCESSOR on Vercel and redeploy.");
    const og = html.match(/og:image" content="([^"]+)"/);
    return { evidence: [`bundle ${js[0]}`, "addresses present", og ? `og:image ${og[1]}` : "no og:image"] };
  }],

  "site.headers": ["Live site sends security headers", async ({ cfg }) => {
    const res = await fetch(cfg.site + "/");
    const want = ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security"];
    const missing = want.filter((h) => !res.headers.get(h));
    if (missing.length) return { status: "warn", evidence: [`missing ${missing.join(", ")}`], fix: "Add them in web/vercel.json." };
    return { evidence: want.map((h) => `${h} set`) };
  }],
};

const SUITES = {
  health: ["config.addresses", "rpc.health", "contracts.code"],
  contracts: ["contracts.code", "tapeout.registration", "tapeout.issuance", "launcher.wiring", "launches.integrity"],
  policy: ["policy.shape", "policy.netlist", "policy.truthTable"],
  site: ["site.routes", "site.config", "site.headers"],
};
SUITES.qa = [...new Set([...SUITES.health, ...SUITES.contracts, ...SUITES.policy, ...SUITES.site])];

// ---------------------------------------------------------------- output

function writeArtifacts(result) {
  const dir = path.join(process.cwd(), "artifacts", "qa");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.json"), JSON.stringify(result, null, 2));
  const md = [
    `# SnipeShield QA: ${result.status.toUpperCase()}`,
    "",
    `${result.command} · ${result.completedAt} · ${result.durationMs}ms`,
    "",
    "| Status | Check | Time | Evidence |",
    "|---|---|---|---|",
    ...result.checks.map((c) => `| ${c.status.toUpperCase()} | ${c.name} | ${c.durationMs}ms | ${(c.error ? [c.error] : c.evidence).join("; ").replace(/\|/g, "/")} |`),
  ].join("\n");
  fs.writeFileSync(path.join(dir, "summary.md"), md + "\n");
  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuite name="snipeshield-${result.command}" tests="${result.checks.length}" failures="${result.summary.failed}" skipped="${result.summary.skipped}" time="${result.durationMs / 1000}">`,
    ...result.checks.map((c) => `  <testcase classname="${c.id.split(".")[0]}" name="${c.name.replace(/[<&"]/g, "")}" time="${c.durationMs / 1000}">${c.status === "fail" ? `<failure message="${String(c.error).replace(/[<&"]/g, "")}"/>` : c.status === "skip" ? "<skipped/>" : ""}</testcase>`),
    `</testsuite>`,
  ].join("\n");
  fs.writeFileSync(path.join(dir, "junit.xml"), xml + "\n");
  return ["artifacts/qa/summary.json", "artifacts/qa/summary.md", "artifacts/qa/junit.xml"];
}

function printHuman(result, flags) {
  if (flags.quiet) return console.log(`${result.status.toUpperCase()} ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings`);
  console.log(`SnipeShield ${result.command}\n`);
  for (const c of result.checks) {
    console.log(`${c.status.toUpperCase().padEnd(5)} ${c.name.padEnd(58)} ${String(c.durationMs).padStart(5)}ms`);
    if (c.status !== "pass" || flags.verbose) {
      for (const e of c.error ? [c.error] : c.evidence) console.log(`      ${e}`);
      if (c.suggestedFix && c.status !== "pass") console.log(`      fix: ${c.suggestedFix}`);
    }
  }
  console.log(`\nResult: ${result.status.toUpperCase()} (${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings)`);
  if (result.artifacts.length) console.log(`Report: ${result.artifacts.join(", ")}`);
}

async function runSuite(name, ids, flags) {
  const ctx = makeContext(flags);
  const timeout = Number(flags.timeout || 30000);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const checks = [];
  for (const id of ids) checks.push(await runCheck(id, CHECKS[id][0], () => CHECKS[id][1](ctx), timeout));
  const summary = {
    passed: checks.filter((c) => c.status === "pass").length,
    failed: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    skipped: checks.filter((c) => c.status === "skip").length,
  };
  const result = { command: name, status: summary.failed ? "failed" : "passed", startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - t0, environment: "xlayer-mainnet", summary, checks, artifacts: [] };
  if (name === "qa" || flags.ci) result.artifacts = writeArtifacts(result);
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result, flags);
  return summary.failed ? 1 : 0;
}

// ---------------------------------------------------------------- read commands

async function tokenInspect(addr, flags) {
  if (!ethers.isAddress(addr)) return usageError("token inspect needs a token address");
  const { c, provider, cfg } = makeContext(flags);
  const t = c(addr, ABI.token);
  const [name, symbol, creator, processor, circuitId, launchBlock, windowEnd, trades, penalty, volume, price, head] = await Promise.all([
    t.name(), t.symbol(), t.creator(), t.processor(), t.circuitId(), t.launchBlock(), t.windowEndBlock(), t.tradeCount(), t.penaltyKept(), t.volumeOkb(), t.spotPrice(), provider.getBlockNumber(),
  ]).catch(() => { throw Object.assign(new Error(`${addr} is not a SnipeShield launch`), { exit: 2 }); });
  const out = {
    address: addr, name, symbol, creator, policy: { processor, circuitId: Number(circuitId) },
    launchBlock: Number(launchBlock), windowEndBlock: Number(windowEnd), shieldOn: head < Number(windowEnd), blocksLeft: Math.max(0, Number(windowEnd) - head),
    trades: Number(trades), volumeOkb: ethers.formatEther(volume), penaltyKeptOkb: ethers.formatEther(penalty),
    okbPerMillionTokens: ethers.formatEther(price * 1_000_000n), url: `${cfg.site}/token/${addr}`,
  };
  if (flags.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${name} (${symbol})  ${addr}`);
    console.log(`policy      circuit #${out.policy.circuitId} on ${processor}`);
    console.log(`shield      ${out.shieldOn ? `on, ${out.blocksLeft} blocks (~${out.blocksLeft}s) left` : "window closed, flat 1%"}`);
    console.log(`trades      ${out.trades}   volume ${out.volumeOkb} OKB   kept from snipers ${out.penaltyKeptOkb} OKB`);
    console.log(`price       ${out.okbPerMillionTokens} OKB per 1M tokens`);
    console.log(`page        ${out.url}`);
  }
  return 0;
}

async function quote(addr, amount, flags) {
  if (!ethers.isAddress(addr) || !amount) return usageError("quote needs <token> <amount>");
  const side = flags.side === "sell" ? "sell" : "buy";
  const trader = flags.trader && ethers.isAddress(flags.trader) ? flags.trader : ethers.ZeroAddress;
  const { c } = makeContext(flags);
  const t = c(addr, ABI.token);
  let wei;
  try { wei = ethers.parseEther(String(amount)); } catch { return usageError("amount must be a number, in OKB for buys or tokens for sells"); }
  const [out, bits, tier, bps] = side === "buy" ? await t.quoteBuy(trader, wei) : await t.quoteSell(trader, wei);
  const signals = SIGNALS.filter((_, i) => (Number(bits) >> i) & 1);
  const res = { token: addr, side, amount: String(amount), trader, signals, tier: Number(tier), taxBps: Number(bps), taxPercent: Number(bps) / 100, receive: ethers.formatEther(out), receiveUnit: side === "buy" ? "tokens" : "OKB" };
  if (flags.json) console.log(JSON.stringify(res, null, 2));
  else console.log(`${side} ${amount} ${side === "buy" ? "OKB" : "tokens"}: tier ${res.tier}, tax ${res.taxPercent}%, signals [${signals.join(", ") || "none"}], receive ${res.receive} ${res.receiveUnit}`);
  return 0;
}

async function launches(flags) {
  const { c, cfg, provider } = makeContext(flags);
  const l = c(cfg.launcher, ABI.launcher);
  const n = Number(await l.tokenCount());
  const head = await provider.getBlockNumber();
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = c(await l.tokens(i), ABI.token);
    const [symbol, name, trades, end] = await Promise.all([t.symbol(), t.name(), t.tradeCount(), t.windowEndBlock()]);
    list.push({ address: t.target, symbol, name, trades: Number(trades), shieldOn: head < Number(end) });
  }
  if (flags.json) console.log(JSON.stringify(list, null, 2));
  else if (!list.length) console.log("No launches yet.");
  else for (const x of list) console.log(`${x.symbol.padEnd(8)} ${x.address}  ${String(x.trades).padStart(4)} trades  ${x.shieldOn ? "shield on" : "window closed"}  ${x.name}`);
  return 0;
}

// ---------------------------------------------------------------- main

const HELP = `snipeshield: read-only checks and quotes for SnipeShield on X Layer

Usage
  snipeshield health                     RPC, config and contract code
  snipeshield contracts check            TapeOut registration, issuance terms, launcher wiring, launch caps
  snipeshield policy verify              circuit shape, netlist bytes and all 64 truth-table rows
  snipeshield site check                 live routes, deployed addresses, security headers
  snipeshield qa                         everything above, writes artifacts/qa/
  snipeshield launches                   list launches
  snipeshield token inspect <address>    window, trades, volume and penalty for one launch
  snipeshield quote <token> <amount>     tax tier and signals for a trade before you sign it
                                         --side buy|sell  --trader <address>

Flags
  --json      machine-readable output       --verbose   show evidence for passing checks
  --quiet     one-line result               --ci        also write artifacts/qa/
  --timeout   per-check timeout in ms       --rpc --site override endpoints

Exit codes
  0 all checks passed   1 a check failed   2 bad input or not a launch`;

function usageError(msg) {
  console.error(`${msg}\n\n${HELP}`);
  return 2;
}

async function main() {
  const { _: args, flags } = parseArgs(process.argv.slice(2));
  const [cmd, sub, a, b] = args;
  if (!cmd || flags.help || cmd === "help") { console.log(HELP); return 0; }
  if (cmd === "health") return runSuite("health", SUITES.health, flags);
  if (cmd === "contracts" && (sub === "check" || !sub)) return runSuite("contracts check", SUITES.contracts, flags);
  if (cmd === "policy" && (sub === "verify" || !sub)) return runSuite("policy verify", SUITES.policy, flags);
  if (cmd === "site" && (sub === "check" || !sub)) return runSuite("site check", SUITES.site, flags);
  if (cmd === "qa") return runSuite("qa", SUITES.qa, flags);
  if (cmd === "launches") return launches(flags);
  if (cmd === "token" && sub === "inspect") return tokenInspect(a, flags);
  if (cmd === "quote") return quote(sub, a ?? b, flags);
  return usageError(`Unknown command: ${args.join(" ")}`);
}

process.on("SIGINT", () => { console.error("Interrupted"); process.exit(130); });
main().then((code) => process.exit(code)).catch((e) => { console.error(e.shortMessage || e.message); process.exit(e.exit || 1); });
