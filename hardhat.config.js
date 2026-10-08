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
  sourcify: { enabled: true },
  etherscan: {
    apiKey: { xlayer: process.env.OKLINK_API_KEY || "oklink" },
    customChains: [{
      network: "xlayer",
      chainId: 196,
      urls: {
        apiURL: "https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER",
        browserURL: "https://www.oklink.com/xlayer",
      },
    }],
  },
  networks: {
    hardhat: {
      chainId: 196,
      hardfork: "shanghai",
      chains: { 196: { hardforkHistory: { shanghai: 0 } } },
      accounts: process.env.DRY_KEY ? [{ privateKey: process.env.DRY_KEY, balance: "10000000000000000000" }] : undefined,
      forking: process.env.NO_FORK ? undefined : { url: XLAYER_RPC },
    },
    localhost: { url: "http://127.0.0.1:8545", chainId: 196 },
    xlayer: { url: XLAYER_RPC, chainId: 196, accounts },
  },
};
