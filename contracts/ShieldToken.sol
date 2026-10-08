// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICPU} from "./ITapeOut.sol";

/// @title ShieldToken
/// @notice A launch token traded on a built-in bonding curve. During the protection window the
///         trade tax is decided by a TapeOut circuit chosen at launch. The circuit only picks a tier;
///         the tier-to-tax table is a constant capped at 25%, and nobody can change the policy.
contract ShieldToken is ERC20, ReentrancyGuard {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant VIRTUAL_OKB = 1 ether;

    uint256 public constant BASE_TAX_BPS = 100;
    uint256 public constant MAX_TAX_BPS = 2500;
    uint256 public constant EARLY_BLOCKS = 5; // ~5s on X Layer (1s blocks)
    uint256 public constant WINDOW_BLOCKS = 1800; // ~30 min
    uint256 public constant RECENT_BLOCKS = 60; // ~1 min
    uint256 public constant CROWD_LIMIT = 2;
    uint256 public constant BIG_BPS = 50; // 0.5% of supply
    uint256 public constant EVAL_GAS = 400_000;

    ICPU public immutable processor;
    uint256 public immutable circuitId;
    address public immutable creator;
    uint256 public immutable launchBlock;

    uint256 public okbReserve; // real OKB backing the curve
    uint256 public taxOwed;

    mapping(address => uint256) public lastTradeBlock;
    mapping(uint256 => uint256) public tradesInBlock;

    event Trade(
        address indexed trader,
        bool isBuy,
        uint256 okbAmount,
        uint256 tokenAmount,
        uint8 inputs,
        uint8 tier,
        uint256 taxBps,
        uint256 taxOkb
    );
    event TaxWithdrawn(address indexed to, uint256 amount);

    error Slippage();
    error ZeroAmount();
    error NotCreator();

    constructor(string memory name_, string memory symbol_, address processor_, uint256 circuitId_, address creator_)
        ERC20(name_, symbol_)
    {
        processor = ICPU(processor_);
        circuitId = circuitId_;
        creator = creator_;
        launchBlock = block.number;
        _mint(address(this), TOTAL_SUPPLY);
    }

    // ------------------------------------------------------------------ tax policy

    function taxTable(uint8 tier) public pure returns (uint256) {
        if (tier == 0) return 100;
        if (tier == 1) return 300;
        if (tier == 2) return 500;
        if (tier == 3) return 800;
        if (tier == 4) return 1200;
        if (tier == 5) return 1500;
        if (tier == 6) return 2000;
        return MAX_TAX_BPS;
    }

    function inWindow() public view returns (bool) {
        return block.number < launchBlock + WINDOW_BLOCKS;
    }

    /// @notice Packs the six launch signals in the circuit's input bit order.
    function packInputs(address trader, bool isBuy, uint256 tokenAmount) public view returns (uint8 bits) {
        uint256 age = block.number - launchBlock;
        if (age < EARLY_BLOCKS) bits |= 1; // early
        if (age < WINDOW_BLOCKS) bits |= 2; // warm
        if (tokenAmount > (TOTAL_SUPPLY * BIG_BPS) / 10_000) bits |= 4; // big
        if (tradesInBlock[block.number] >= CROWD_LIMIT) bits |= 8; // crowded
        uint256 last = lastTradeBlock[trader];
        if (last != 0 && block.number - last <= RECENT_BLOCKS) bits |= 16; // recent
        if (!isBuy) bits |= 32; // sell
    }

    /// @notice Runs the circuit. Any failure (revert, out of gas, bad output) fails closed to the top tier,
    ///         which is still capped by the constant table.
    function tierFor(uint8 bits) public view returns (uint8 tier) {
        (bool ok, bytes memory ret) = address(processor).staticcall{gas: EVAL_GAS}(
            abi.encodeCall(ICPU.eval, (circuitId, abi.encodePacked(bits)))
        );
        if (!ok || ret.length < 64) return 7;
        bytes memory out = abi.decode(ret, (bytes));
        if (out.length == 0) return 7;
        return uint8(out[0]) & 7;
    }

    function _tax(address trader, bool isBuy, uint256 tokenAmount)
        internal
        view
        returns (uint8 bits, uint8 tier, uint256 bps)
    {
        if (!inWindow()) return (0, 0, BASE_TAX_BPS);
        bits = packInputs(trader, isBuy, tokenAmount);
        tier = tierFor(bits);
        bps = taxTable(tier);
    }

    // ------------------------------------------------------------------ curve math

    function _curveOkb() internal view returns (uint256) {
        return VIRTUAL_OKB + okbReserve;
    }

    function _curveTokens() internal view returns (uint256) {
        return balanceOf(address(this));
    }

    function _buyOut(uint256 okbIn) internal view returns (uint256) {
        uint256 x = _curveOkb();
        uint256 y = _curveTokens();
        return y - (x * y) / (x + okbIn);
    }

    function _sellOut(uint256 tokensIn) internal view returns (uint256) {
        uint256 x = _curveOkb();
        uint256 y = _curveTokens();
        uint256 out = x - (x * y) / (y + tokensIn);
        return out > okbReserve ? okbReserve : out;
    }

    /// @notice Quote a buy for `trader` with `okbIn` gross. Returns tokens out, tier and tax.
    function quoteBuy(address trader, uint256 okbIn)
        external
        view
        returns (uint256 tokensOut, uint8 bits, uint8 tier, uint256 bps)
    {
        uint256 gross = _buyOut(okbIn);
        (bits, tier, bps) = _tax(trader, true, gross);
        tokensOut = _buyOut(okbIn - (okbIn * bps) / 10_000);
    }

    /// @notice Quote a sell for `trader`. Returns OKB out after tax, tier and tax.
    function quoteSell(address trader, uint256 tokensIn)
        external
        view
        returns (uint256 okbOut, uint8 bits, uint8 tier, uint256 bps)
    {
        (bits, tier, bps) = _tax(trader, false, tokensIn);
        uint256 gross = _sellOut(tokensIn);
        okbOut = gross - (gross * bps) / 10_000;
    }

    // ------------------------------------------------------------------ trading

    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        if (msg.value == 0) revert ZeroAmount();
        (uint8 bits, uint8 tier, uint256 bps) = _tax(msg.sender, true, _buyOut(msg.value));
        uint256 taxOkb = (msg.value * bps) / 10_000;
        uint256 net = msg.value - taxOkb;

        tokensOut = _buyOut(net);
        if (tokensOut < minTokensOut || tokensOut == 0) revert Slippage();

        okbReserve += net;
        taxOwed += taxOkb;
        _record(msg.sender);
        _transfer(address(this), msg.sender, tokensOut);
        emit Trade(msg.sender, true, msg.value, tokensOut, bits, tier, bps, taxOkb);
    }

    function sell(uint256 tokensIn, uint256 minOkbOut) external nonReentrant returns (uint256 okbOut) {
        if (tokensIn == 0) revert ZeroAmount();
        (uint8 bits, uint8 tier, uint256 bps) = _tax(msg.sender, false, tokensIn);
        uint256 gross = _sellOut(tokensIn);
        uint256 taxOkb = (gross * bps) / 10_000;
        okbOut = gross - taxOkb;
        if (okbOut < minOkbOut || okbOut == 0) revert Slippage();

        okbReserve -= gross;
        taxOwed += taxOkb;
        _record(msg.sender);
        _transfer(msg.sender, address(this), tokensIn);
        emit Trade(msg.sender, false, okbOut, tokensIn, bits, tier, bps, taxOkb);

        (bool ok,) = msg.sender.call{value: okbOut}("");
        require(ok, "send failed");
    }

    function _record(address trader) internal {
        lastTradeBlock[trader] = block.number;
        tradesInBlock[block.number] += 1;
    }

    function withdrawTax() external nonReentrant {
        if (msg.sender != creator) revert NotCreator();
        uint256 amt = taxOwed;
        taxOwed = 0;
        (bool ok,) = creator.call{value: amt}("");
        require(ok, "send failed");
        emit TaxWithdrawn(creator, amt);
    }
}
