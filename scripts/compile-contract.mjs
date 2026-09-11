import solc from "solc";
import { readFileSync, writeFileSync } from "node:fs";
const source = readFileSync("contracts/SealedBazaar.sol", "utf8");
const input = {
  language: "Solidity",
  sources: { "SealedBazaar.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const result = JSON.parse(solc.compile(JSON.stringify(input)));
if (result.errors?.some((x) => x.severity === "error"))
  throw Error(JSON.stringify(result.errors));
const c = result.contracts["SealedBazaar.sol"].SealedBazaar;
writeFileSync(
  "lib/contract.json",
  JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }),
);
writeFileSync("work/solc-input.json", JSON.stringify(input));
console.log(
  "Compiled SealedBazaar:",
  c.evm.bytecode.object.length / 2,
  "bytes",
);
