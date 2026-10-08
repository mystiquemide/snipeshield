// Deployed addresses. Filled by scripts/deploy.js (root) through VITE_* env vars at build time.
export const CONFIG = {
  rpc: import.meta.env.VITE_RPC || "https://rpc.xlayer.tech",
  chainId: 196,
  explorer: "https://www.oklink.com/xlayer",
  factory: "0x1f09daefa827f02cbb40967cc91b259763760761",
  multicall: "0xcA11bde05977b3631167028862bE2a173976CA11",
  processor: import.meta.env.VITE_PROCESSOR || "",
  transistors: import.meta.env.VITE_TRANSISTORS || "",
  launcher: import.meta.env.VITE_LAUNCHER || "",
  circuitId: Number(import.meta.env.VITE_CIRCUIT_ID || 0),
  repo: "https://github.com/mystiquemide/tape-out-",
};

export const isDeployed = () => Boolean(CONFIG.launcher && CONFIG.processor);
