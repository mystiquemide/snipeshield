// Local preview only: launch one token and place a few trades on the fork so the UI has data.
const { ethers } = require("hardhat");
const { setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const cfg = require("../deployments/localhost.json");
(async () => {
  const [d] = await ethers.getSigners();
  const l = await ethers.getContractAt("ShieldLauncher", cfg.launcher);
  const rc = await (await l.launch("Preview Token", "PRVW", cfg.processor, cfg.circuitId)).wait();
  const tok = await ethers.getContractAt("ShieldToken", rc.logs.map((x) => { try { return l.interface.parseLog(x); } catch { return null; } }).find(Boolean).args.token);
  for (const v of ["0.02", "0.001", "0.003"]) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    await setBalance(w.address, ethers.parseEther("1"));
    await (await tok.connect(w).buy(0, { value: ethers.parseEther(v) })).wait();
    await ethers.provider.send("hardhat_mine", ["0x8"]);
  }
  console.log("token", tok.target);
})();
