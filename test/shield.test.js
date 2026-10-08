const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { mine, setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const policy = require("../policy/default");

const FACTORY = "0x1f09daefa827f02cbb40967cc91b259763760761";
const FACTORY_ABI = [
  "function createCPU(string,string,string,uint256,uint256) payable returns (address,address)",
  "function deployFee() view returns (uint256)",
  "event CPUCreated(address indexed circuits, address indexed transistors, address indexed creator, string name, uint256 supply, uint256 mintPrice)",
];
const CIRCUITS_ABI = [
  "function tapeout(bytes,uint32,uint32) payable returns (uint256)",
  "function eval(uint256,bytes) view returns (bytes)",
  "function circuitInfo(uint256) view returns (uint32,uint32,uint32,uint32)",
  "function TAPEOUT_FEE() view returns (uint256)",
  "event TapedOut(uint256 indexed circuitId, address indexed author, uint32 gateCount, uint32 nState)",
];
const TRANSISTORS_ABI = [
  "function mint(uint256,uint256) payable",
  "function mintPrice() view returns (uint256)",
  "function protocolFee() view returns (uint256)",
];

async function deployProcessor(signer) {
  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, signer);
  const fee = await factory.deployFee();
  const tx = await factory.createCPU("SnipeShield", "SHIELD", "test", 1_000_000, ethers.parseEther("0.00001"), { value: fee });
  const rc = await tx.wait();
  const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "CPUCreated");
  return {
    circuits: new ethers.Contract(ev.args.circuits, CIRCUITS_ABI, signer),
    transistors: new ethers.Contract(ev.args.transistors, TRANSISTORS_ABI, signer),
  };
}

async function tapeout(cpu, nl, nIn, nOut) {
  const gates = nl.length / 7;
  const price = await cpu.transistors.mintPrice();
  const pfee = await cpu.transistors.protocolFee();
  await (await cpu.transistors.mint(0, gates, { value: price * BigInt(gates) + pfee })).wait();
  const rc = await (await cpu.circuits.tapeout(nl, nIn, nOut, { value: await cpu.circuits.TAPEOUT_FEE() })).wait();
  const ev = rc.logs.map((l) => { try { return cpu.circuits.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "TapedOut");
  return ev.args.circuitId;
}

describe("SnipeShield on forked X Layer", function () {
  this.timeout(600_000);
  let creator, alice, bob, sniper, cpu, circuitId, launcher, token;

  before(async () => {
    // Fresh EOAs: the default Hardhat accounts carry code on X Layer mainnet and cannot receive ERC-1155.
    [creator, alice, bob, sniper] = await Promise.all(
      [0, 1, 2, 3].map(async () => {
        const w = ethers.Wallet.createRandom().connect(ethers.provider);
        await setBalance(w.address, ethers.parseEther("100"));
        return w;
      })
    );
    cpu = await deployProcessor(creator);
    const c = policy.build();
    policy.verify(c);
    circuitId = await tapeout(cpu, c.netlist, c.nIn, c.nOut);
    launcher = await (await ethers.getContractFactory("ShieldLauncher", creator)).deploy(FACTORY);
  });

  async function launch() {
    const rc = await (await launcher.launch("Demo", "DEMO", await cpu.circuits.getAddress(), circuitId)).wait();
    const ev = rc.logs.map((l) => { try { return launcher.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "Launched");
    return ethers.getContractAt("ShieldToken", ev.args.token);
  }

  it("taped-out policy matches the reference truth table on all 64 rows (real TapeOut eval)", async () => {
    const info = await cpu.circuits.circuitInfo(circuitId);
    expect(info[0]).to.equal(6n);
    expect(info[1]).to.equal(3n);
    expect(info[2]).to.equal(0n);
    for (let bits = 0; bits < 64; bits++) {
      const out = await cpu.circuits.eval(circuitId, ethers.toBeHex(bits, 1));
      expect(Number(out) & 7, `row ${bits}`).to.equal(policy.reference(bits));
    }
  });

  it("launcher rejects a processor not registered with TapeOut", async () => {
    const fake = await (await ethers.getContractFactory("RevertingProcessor", creator)).deploy();
    await expect(launcher.launch("X", "X", await fake.getAddress(), 1)).to.be.revertedWithCustomError(launcher, "NotTapeOutProcessor");
  });

  it("launcher rejects a circuit with the wrong shape", async () => {
    const one = Uint8Array.from([0, 0, 0, 2, 0, 0, 3]); // single NAND, 2 in, 1 out
    const id = await tapeout(cpu, one, 2, 1);
    await expect(launcher.launch("X", "X", await cpu.circuits.getAddress(), id)).to.be.revertedWithCustomError(launcher, "BadPolicyShape");
  });

  it("an early big buy pays a high tier and a later small buy pays 1%", async () => {
    token = await launch();
    const snipe = await (await token.connect(sniper).buy(0, { value: ethers.parseEther("0.01") })).wait();
    const t1 = token.interface.parseLog(snipe.logs.find((l) => l.address === token.target && l.topics[0] === token.interface.getEvent("Trade").topicHash));
    // early + warm + big -> o2=1, o1=1, o0=0 -> tier 6 -> 20%
    expect(t1.args.tier).to.equal(6n);
    expect(t1.args.taxBps).to.equal(2000n);

    await mine(10);
    const normal = await (await token.connect(alice).buy(0, { value: ethers.parseEther("0.001") })).wait();
    const t2 = token.interface.parseLog(normal.logs.find((l) => l.address === token.target && l.topics[0] === token.interface.getEvent("Trade").topicHash));
    expect(t2.args.tier).to.equal(0n);
    expect(t2.args.taxBps).to.equal(100n);
  });

  it("a crowded block pushes later buyers into the top tier", async () => {
    const t = await launch();
    await network.provider.send("evm_setAutomine", [false]);
    const txs = [];
    for (const s of [alice, bob, sniper]) txs.push(await t.connect(s).buy(0, { value: ethers.parseEther("0.01") }));
    await network.provider.send("evm_mine");
    await network.provider.send("evm_setAutomine", [true]);
    const tiers = [];
    for (const tx of txs) {
      const rc = await tx.wait();
      const log = rc.logs.find((l) => l.address === t.target && l.topics[0] === t.interface.getEvent("Trade").topicHash);
      tiers.push(t.interface.parseLog(log).args.tier);
    }
    // third buyer sees crowded + big + early -> o2=1, o1=1 -> tier >= 6
    expect(tiers[2]).to.be.gte(6n);
  });

  it("after the protection window the tax is a flat 1% and the circuit is not consulted", async () => {
    const t = await launch();
    await mine(1800);
    const rc = await (await t.connect(alice).buy(0, { value: ethers.parseEther("0.05") })).wait();
    const log = t.interface.parseLog(rc.logs.find((l) => l.address === t.target && l.topics[0] === t.interface.getEvent("Trade").topicHash));
    expect(log.args.taxBps).to.equal(100n);
    expect(log.args.inputs).to.equal(0n);
  });

  it("quoteBuy matches the executed trade", async () => {
    const t = await launch();
    await mine(20);
    const [out, , tier] = await t.quoteBuy(bob.address, ethers.parseEther("0.002"));
    const rc = await (await t.connect(bob).buy(out, { value: ethers.parseEther("0.002") })).wait();
    const log = t.interface.parseLog(rc.logs.find((l) => l.address === t.target && l.topics[0] === t.interface.getEvent("Trade").topicHash));
    expect(log.args.tokenAmount).to.equal(out);
    expect(log.args.tier).to.equal(tier);
  });

  it("selling soon after buying is taxed higher than a fresh sell, and sells pay out OKB", async () => {
    const t = await launch();
    await mine(5);
    await (await t.connect(bob).buy(0, { value: ethers.parseEther("0.003") })).wait();
    const bal = await t.balanceOf(bob.address);
    const [, , tier] = await t.quoteSell(bob.address, bal);
    expect(tier).to.equal(3n); // warm + recent + sell -> o1, o0
    const before = await ethers.provider.getBalance(bob.address);
    await (await t.connect(bob).sell(bal, 1)).wait();
    expect(await ethers.provider.getBalance(bob.address)).to.be.gt(before - ethers.parseEther("0.001"));
    expect(await t.balanceOf(bob.address)).to.equal(0n);
  });

  it("slippage protection reverts", async () => {
    const t = await launch();
    await expect(t.connect(alice).buy(ethers.MaxUint256, { value: ethers.parseEther("0.001") })).to.be.revertedWithCustomError(t, "Slippage");
  });

  it("a broken policy fails closed at the 25% cap", async () => {
    const bad = await (await ethers.getContractFactory("RevertingProcessor", creator)).deploy();
    const t = await (await ethers.getContractFactory("ShieldToken", creator)).deploy("B", "B", await bad.getAddress(), 1, creator.address);
    const rc = await (await t.connect(alice).buy(0, { value: ethers.parseEther("0.001") })).wait();
    const log = t.interface.parseLog(rc.logs.find((l) => l.address === t.target && l.topics[0] === t.interface.getEvent("Trade").topicHash));
    expect(log.args.tier).to.equal(7n);
    expect(log.args.taxBps).to.equal(2500n);
  });

  it("tax never exceeds 25% for any tier", async () => {
    const t = await launch();
    for (let i = 0; i < 8; i++) expect(await t.taxTable(i)).to.be.lte(2500n);
  });

  it("only the creator can withdraw tax", async () => {
    await expect(token.connect(alice).withdrawTax()).to.be.revertedWithCustomError(token, "NotCreator");
    const owed = await token.taxOwed();
    expect(owed).to.be.gt(0n);
    await expect(token.connect(creator).withdrawTax()).to.changeEtherBalance(creator, owed);
  });

  it("reentrant sell is blocked", async () => {
    const t = await launch();
    await mine(30);
    const atk = await (await ethers.getContractFactory("ReentrantSeller", creator)).deploy(t.target);
    await (await atk.buyIn({ value: ethers.parseEther("0.002") })).wait();
    const bal = await t.balanceOf(atk.target);
    await expect(atk.attack(bal / 2n)).to.be.reverted;
  });

  it("has no function that can change the policy or the tax", async () => {
    const t = await launch();
    const writes = t.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    expect(writes).to.deep.equal(["approve", "buy", "sell", "transfer", "transferFrom", "withdrawTax"]);
  });
});
