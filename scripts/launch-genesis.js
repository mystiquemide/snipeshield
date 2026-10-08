// Launches SnipeShield Genesis on mainnet and runs two labelled team test buys from a second wallet:
// one in the first seconds (snipe tier) and one after a minute (base tier).
const { ethers } = require("hardhat");
const fs = require("fs");
const cfg = require("../deployments/xlayer.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tradeOf = (t, rc) => {
  const log = rc.logs.find((l) => l.address.toLowerCase() === t.target.toLowerCase() && l.topics[0] === t.interface.getEvent("Trade").topicHash);
  const a = t.interface.parseLog(log).args;
  return { tier: Number(a.tier), taxBps: Number(a.taxBps), inputs: Number(a.inputs), block: rc.blockNumber, tx: rc.hash };
};

(async () => {
  const [deployer] = await ethers.getSigners();
  const p = ethers.provider;
  const testKey = ethers.Wallet.createRandom();
  fs.writeFileSync(".env.testwallet", `TEST_WALLET_KEY=${testKey.privateKey}\nTEST_WALLET_ADDRESS=${testKey.address}\n`, { mode: 0o600 });
  const tester = testKey.connect(p);
  console.log("test wallet", tester.address);

  await (await deployer.sendTransaction({ to: tester.address, value: ethers.parseEther("0.004") })).wait();

  const l = await ethers.getContractAt("ShieldLauncher", cfg.launcher);
  const rc = await (await l.launch("SnipeShield Genesis", "SHIELD", cfg.processor, cfg.circuitId)).wait();
  const ev = rc.logs.map((x) => { try { return l.interface.parseLog(x); } catch { return null; } }).find((e) => e && e.name === "Launched");
  const token = await ethers.getContractAt("ShieldToken", ev.args.token);
  console.log("token", token.target, "launch block", rc.blockNumber, "tx", rc.hash);

  const r1 = await (await token.connect(tester).buy(0, { value: ethers.parseEther("0.0015") })).wait();
  const t1 = tradeOf(token, r1);
  console.log("early buy", JSON.stringify({ ...t1, blocksAfterLaunch: t1.block - rc.blockNumber }));

  console.log("waiting 75s so the second buy is outside the early and recent signals");
  await sleep(75000);
  const r2 = await (await token.connect(tester).buy(0, { value: ethers.parseEther("0.0015") })).wait();
  const t2 = tradeOf(token, r2);
  console.log("later buy", JSON.stringify({ ...t2, blocksAfterLaunch: t2.block - rc.blockNumber }));

  fs.writeFileSync("deployments/genesis.json", JSON.stringify({ token: token.target, launchTx: rc.hash, launchBlock: rc.blockNumber, testWallet: tester.address, earlyBuy: t1, laterBuy: t2 }, null, 2));
})();
