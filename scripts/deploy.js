// Mainnet deploy: SHIELD processor -> mint NAND -> tape out default policy -> ShieldLauncher -> first token.
// Usage: DEPLOYER_KEY=... npx hardhat run scripts/deploy.js --network xlayer
const { ethers, network } = require("hardhat");
const fs = require("fs");
const policy = require("../policy/default");

const FACTORY = "0x1f09daefa827f02cbb40967cc91b259763760761";
const SUPPLY = 1_000_000n;
const PRICE = ethers.parseEther("0.00001");
const STORY =
  "SnipeShield: launch-tax policy processor. Circuits here decide anti-snipe tax tiers for ShieldTokens. " +
  "Transistor supply 1,000,000 (fixed cap), price 0.00001 OKB each.";

const parse = (c, rc, name) =>
  rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === name);

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("network", network.name, "deployer", deployer.address, "balance", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));
  const out = { network: network.name, chainId: 196, deployer: deployer.address, factory: FACTORY };

  const factory = new ethers.Contract(FACTORY, [
    "function createCPU(string,string,string,uint256,uint256) payable returns (address,address)",
    "function deployFee() view returns (uint256)",
    "event CPUCreated(address indexed circuits, address indexed transistors, address indexed creator, string name, uint256 supply, uint256 mintPrice)",
  ], deployer);
  let rc = await (await factory.createCPU("SnipeShield", "SHIELD", STORY, SUPPLY, PRICE, { value: await factory.deployFee() })).wait();
  const cpu = parse(factory, rc, "CPUCreated").args;
  Object.assign(out, { processor: cpu.circuits, transistors: cpu.transistors, createTx: rc.hash });
  console.log("processor", cpu.circuits, "transistors", cpu.transistors);

  const transistors = new ethers.Contract(cpu.transistors, [
    "function mint(uint256,uint256) payable", "function protocolFee() view returns (uint256)",
  ], deployer);
  const c = policy.build();
  policy.verify(c);
  rc = await (await transistors.mint(0, c.gates, { value: PRICE * BigInt(c.gates) + (await transistors.protocolFee()) })).wait();
  out.mintTx = rc.hash;

  const circuits = new ethers.Contract(cpu.circuits, [
    "function tapeout(bytes,uint32,uint32) payable returns (uint256)", "function TAPEOUT_FEE() view returns (uint256)",
    "event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState)",
  ], deployer);
  rc = await (await circuits.tapeout(c.netlist, c.nIn, c.nOut, { value: await circuits.TAPEOUT_FEE() })).wait();
  out.circuitId = parse(circuits, rc, "TapedOut").args.circuitId.toString();
  out.tapeoutTx = rc.hash;
  console.log("policy circuit", out.circuitId, rc.hash);

  const launcher = await (await ethers.getContractFactory("ShieldLauncher")).deploy(FACTORY);
  await launcher.waitForDeployment();
  out.launcher = await launcher.getAddress();
  console.log("launcher", out.launcher);

  const app = { rpc: process.env.APP_RPC || "https://rpc.xlayer.tech", factory: FACTORY, processor: out.processor,
    transistors: out.transistors, launcher: out.launcher, circuitId: out.circuitId };
  fs.writeFileSync("app/config.js", "export default " + JSON.stringify(app, null, 2) + ";\n");
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network.name}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
