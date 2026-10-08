// Withdraws pending creator earnings and sends every remaining OKB from the session wallets to the owner's wallet.
const { ethers } = require("hardhat");
const fs = require("fs");
const TO = process.env.SWEEP_TO;

async function sweep(w, label) {
  const p = ethers.provider;
  const fee = await p.getFeeData();
  const gasPrice = fee.gasPrice * 2n;
  const bal = await p.getBalance(w.address);
  const cost = gasPrice * 21000n;
  if (bal <= cost) return console.log(label, "nothing to send", ethers.formatEther(bal));
  const rc = await (await w.sendTransaction({ to: TO, value: bal - cost, gasLimit: 21000n, gasPrice })).wait();
  console.log(label, "sent", ethers.formatEther(bal - cost), "tx", rc.hash);
}

(async () => {
  if (!ethers.isAddress(TO)) throw new Error("SWEEP_TO missing");
  const [deployer] = await ethers.getSigners();
  const cfg = require("../deployments/xlayer.json");
  const g = require("../deployments/genesis.json");
  const tr = new ethers.Contract(cfg.transistors, ["function owed(address) view returns (uint256)", "function withdraw()"], deployer);
  if ((await tr.owed(deployer.address)) > 0n) console.log("transistor revenue withdrawn", (await (await tr.withdraw()).wait()).hash);
  const tok = await ethers.getContractAt("ShieldToken", g.token, deployer);
  if ((await tok.taxOwed()) > 0n) console.log("creator tax withdrawn", (await (await tok.withdrawTax()).wait()).hash);
  const tk = Object.fromEntries(fs.readFileSync(".env.testwallet", "utf8").trim().split("\n").map((l) => l.split("=")));
  await sweep(new ethers.Wallet(tk.TEST_WALLET_KEY, ethers.provider), "test wallet");
  await sweep(deployer, "deployer");
})();
