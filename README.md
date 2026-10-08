# SnipeShield

**Live app:** https://snipeshield.vercel.app

Fair token launches on X Layer. Bots that buy in the first seconds pay up to 25%, everyone else pays 1%, and nobody can raise it, not even the creator. The tax rule is a public NAND circuit taped out on [TapeOut](https://www.tapeout.net).

## The problem

New launches get sniped in their first blocks. The usual defense is a high launch tax, but an adjustable tax is also the classic rug: the creator raises the sell tax and buyers are trapped. A buyer can't tell a protective tax from a predatory one.

## How it works

```
trade -> 6 signals packed into bits -> eval() on the TapeOut circuit -> tier 0-7 -> fixed tax table (max 25%)
```

For the first 30 minutes after launch, every buy and sell is scored on chain:

| Bit | Signal |
|---|---|
| 0 | First 5 seconds after launch |
| 1 | Inside the 30 minute window |
| 2 | Trade over 0.5% of supply |
| 3 | 2 or more trades already in this block |
| 4 | Trader traded in the last minute |
| 5 | Sell |

The circuit returns a tier. The contract maps it to `1, 3, 5, 8, 12, 15, 20, 25%`. After the window, the circuit is skipped and every trade pays 1%.

The default policy is 18 NAND gates:

```
A = early OR (big AND crowded)
B = warm AND (big OR crowded OR (sell AND recent))
C = warm AND (recent OR sell)
tier = 4A + 2B + C
```

## What the contracts guarantee

- **The policy is fixed per token.** `ShieldToken` has no setter for the processor, the circuit, the tax table or the cap. A test asserts the full list of state-changing functions.
- **25% is a ceiling in code.** Even a malicious circuit can only pick a tier, and tier 7 is 25%.
- **Fail closed.** If `eval` reverts or runs out of gas, the trade is charged 25%, never more.
- **The creator earns only the base 1%.** Everything charged above that stays in the token's price curve, so a creator sniping their own launch pays the penalty like anyone else.
- **Launches only accept real TapeOut policies.** `ShieldLauncher` checks `factory.isCPU(processor)` and requires a stateless 6-in, 3-out circuit.
- **Trade history, volume and the penalty kept are stored on chain.** Public X Layer RPCs cap log queries at 100 blocks, so the app reads state instead of logs.

## Limits, stated plainly

- Per-block and size rules stop crowded early buys. A bot farm spreading tiny buys across fresh wallets and blocks pays less. That's by design: it's buying like a normal user.
- Wallet age isn't used. It can't be read on chain without an indexer.
- The TapeOut factory (`0x1f09…0761`) is not sealed yet, so its owner can still upgrade how circuits are evaluated. The netlist bytes and SnipeShield's own contracts can't be changed.
- No third-party audit.

## Repository

```
contracts/        ShieldToken (curve, circuit-driven tax), ShieldLauncher, TapeOut interfaces
policy/           NAND netlist compiler and the default policy, verified against a reference on all 64 inputs
test/             Hardhat tests against a fork of X Layer mainnet using the real TapeOut factory
scripts/          Deploy, local seeding, web export
web/              Vite + React app: home, launches, launch page, create flow, policy inspector
```

## Run it

```bash
npm install
npx hardhat test                 # 16 tests on a fork of X Layer mainnet
node policy/default.js           # print the compiled policy netlist

cd web && npm install && npm run dev
```

Point the app at deployed contracts with `web/.env.local`:

```
VITE_PROCESSOR=0x...
VITE_TRANSISTORS=0x...
VITE_LAUNCHER=0x...
VITE_CIRCUIT_ID=1
```

## Built on

[X Layer](https://web3.okx.com/xlayer) · [TapeOut](https://www.tapeout.net) · [IGNIX](https://ignix.bot) · [Metagents](https://metagents.ai)

Built for the IGNIX TapeOut Genesis Transistor Hackathon.

## License

MIT
