// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal views of the TapeOut contracts used by SnipeShield.
interface ICPU {
    function eval(uint256 circuitId, bytes calldata inputs) external view returns (bytes memory outputs);
    function circuitInfo(uint256 circuitId)
        external
        view
        returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
}

interface ICircuitFactory {
    function isCPU(address cpu) external view returns (bool);
}
