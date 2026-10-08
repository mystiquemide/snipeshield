export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function creator() view returns (address)",
  "function processor() view returns (address)",
  "function circuitId() view returns (uint256)",
  "function launchBlock() view returns (uint256)",
  "function windowEndBlock() view returns (uint256)",
  "function tradeCount() view returns (uint256)",
  "function penaltyKept() view returns (uint256)",
  "function volumeOkb() view returns (uint256)",
  "function taxOwed() view returns (uint256)",
  "function spotPrice() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function quoteBuy(address,uint256) view returns (uint256 tokensOut, uint8 bits, uint8 tier, uint256 bps)",
  "function quoteSell(address,uint256) view returns (uint256 okbOut, uint8 bits, uint8 tier, uint256 bps)",
  "function tradesSlice(uint256,uint256) view returns (tuple(address trader, uint40 blockNumber, uint40 timestamp, bool isBuy, uint8 inputs, uint8 tier, uint16 taxBps, uint128 okbAmount, uint128 tokenAmount)[])",
  "function buy(uint256) payable returns (uint256)",
  "function sell(uint256,uint256) returns (uint256)",
  "function withdrawTax()",
  "event Trade(address indexed trader, bool isBuy, uint256 okbAmount, uint256 tokenAmount, uint8 inputs, uint8 tier, uint256 taxBps, uint256 taxOkb)",
  "error Slippage()",
  "error ZeroAmount()",
  "error NotCreator()",
];

export const LAUNCHER_ABI = [
  "function tokenCount() view returns (uint256)",
  "function tokens(uint256) view returns (address)",
  "function launch(string,string,address,uint256) returns (address)",
  "event Launched(address indexed token, address indexed creator, address indexed processor, uint256 circuitId, string name, string symbol)",
  "error NotTapeOutProcessor()",
  "error BadPolicyShape()",
];

export const CPU_ABI = [
  "function eval(uint256,bytes) view returns (bytes)",
  "function circuitInfo(uint256) view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)",
  "function netlist(uint256) view returns (bytes)",
  "function ownerOf(uint256) view returns (address)",
  "function nextId() view returns (uint256)",
];

export const FACTORY_ABI = [
  "function isCPU(address) view returns (bool)",
  "function createCPU(string,string,string,uint256,uint256) payable returns (address,address)",
  "function deployFee() view returns (uint256)",
  "event CPUCreated(address indexed circuits, address indexed transistors, address indexed creator, string name, uint256 supply, uint256 mintPrice)",
];

export const MULTICALL_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
];
