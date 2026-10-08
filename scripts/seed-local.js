// Local fork only: launches tokens and trades from fresh wallets so the UI can be checked end to end.
const { ethers } = require("hardhat");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const cfg = require("../deployments/localhost.json");

async function wallet() {
  const w = ethers.Wallet.createRandom().connect(ethers.provider);
  await setBalance(w.address, ethers.parseEther("5"));
  return w;
}

(async () => {
  const l = await ethers.getContractAt("ShieldLauncher", cfg.launcher);
  const mineN = (n) => ethers.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
  const tokens = [];
  for (const [name, sym] of [["Local Check One", "LCA"], ["Local Check Two", "LCB"]]) {
    const creator = await wallet();
    const rc = await (await l.connect(creator).launch(name, sym, cfg.processor, cfg.circuitId)).wait();
    const ev = rc.logs.map((x) => { try { return l.interface.parseLog(x); } catch { return null; } }).find(Boolean);
    tokens.push(await ethers.getContractAt("ShieldToken", ev.args.token));
  }
  const t = tokens[1];
  const sniper = await wallet();
  await (await t.connect(sniper).buy(0, { value: ethers.parseEther("0.03") })).wait();
  await mineN(8);
  for (const v of ["0.002", "0.004", "0.001", "0.006"]) {
    const w = await wallet();
    await (await t.connect(w).buy(0, { value: ethers.parseEther(v) })).wait();
    await mineN(5);
  }
  const bal = await t.balanceOf(sniper.address);
  await (await t.connect(sniper).sell(bal / 2n, 0)).wait();
  await mineN(3);
  const w = await wallet();
  await (await t.connect(w).buy(0, { value: ethers.parseEther("0.003") })).wait();
  console.log("tokens", tokens.map((x) => x.target).join(" "));
})();
