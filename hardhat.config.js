require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const XLAYER_RPC = process.env.XLAYER_RPC || "https://rpc.xlayer.tech";
const accounts = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai" },
  },
  networks: {
    hardhat: {
      chainId: 196,
      hardfork: "shanghai",
      chains: { 196: { hardforkHistory: { shanghai: 0 } } },
      forking: process.env.NO_FORK ? undefined : { url: XLAYER_RPC },
    },
    xlayer: { url: XLAYER_RPC, chainId: 196, accounts },
  },
};
