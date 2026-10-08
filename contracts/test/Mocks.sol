// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract RevertingProcessor {
    function eval(uint256, bytes calldata) external pure returns (bytes memory) {
        revert("broken");
    }
}

interface IShield {
    function sell(uint256, uint256) external returns (uint256);
    function buy(uint256) external payable returns (uint256);
}

contract ReentrantSeller {
    IShield public token;
    bool internal entered;

    constructor(address t) { token = IShield(t); }

    function buyIn() external payable { token.buy{value: msg.value}(0); }

    function attack(uint256 amt) external { token.sell(amt, 0); }

    receive() external payable {
        if (!entered) {
            entered = true;
            token.sell(1 ether, 0);
        }
    }
}
