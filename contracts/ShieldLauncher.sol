// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ShieldToken} from "./ShieldToken.sol";
import {ICPU, ICircuitFactory} from "./ITapeOut.sol";

/// @title ShieldLauncher
/// @notice Launches ShieldTokens bound to a TapeOut policy circuit. The circuit must live on a processor
///         registered with the TapeOut factory and must be a stateless 6-input, 3-output circuit.
contract ShieldLauncher {
    ICircuitFactory public immutable tapeoutFactory;
    address[] public tokens;

    event Launched(
        address indexed token, address indexed creator, address indexed processor, uint256 circuitId, string name, string symbol
    );

    error NotTapeOutProcessor();
    error BadPolicyShape();

    constructor(address tapeoutFactory_) {
        tapeoutFactory = ICircuitFactory(tapeoutFactory_);
    }

    function launch(string calldata name, string calldata symbol, address processor, uint256 circuitId)
        external
        returns (address token)
    {
        if (!tapeoutFactory.isCPU(processor)) revert NotTapeOutProcessor();
        (uint32 nIn, uint32 nOut, uint32 nState,) = ICPU(processor).circuitInfo(circuitId);
        if (nIn != 6 || nOut != 3 || nState != 0) revert BadPolicyShape();

        token = address(new ShieldToken(name, symbol, processor, circuitId, msg.sender));
        tokens.push(token);
        emit Launched(token, msg.sender, processor, circuitId, name, symbol);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }
}
