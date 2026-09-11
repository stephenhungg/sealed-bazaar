import { createPublicClient, createWalletClient, http, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { readFileSync, writeFileSync } from "node:fs";
const keys = JSON.parse(readFileSync("work/testnet-wallets.json", "utf8"));
const artifact = JSON.parse(readFileSync("lib/contract.json", "utf8"));
const reports = JSON.parse(readFileSync("lib/sealed-reports.json", "utf8"));
const chain = tempoModerato,
  transport = http(),
  token = "0x20c0000000000000000000000000000000000001";
const pub = createPublicClient({ chain, transport });
const seller = createWalletClient({
  account: privateKeyToAccount(keys.seller),
  chain,
  transport,
});
const buyer = createWalletClient({
  account: privateKeyToAccount(keys.buyer),
  chain,
  transport,
});
if ((await pub.getChainId()) !== 42431) throw Error("Wrong chain");
async function receipt(hash) {
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw Error("Reverted " + hash);
  return r;
}
const hash = await seller.deployContract({
  ...artifact,
  args: [token, privateKeyToAccount(keys.arbiter).address, 300, 600, 300],
});
const r = await receipt(hash);
const address = r.contractAddress;
console.log("Deployed", address, hash);
const deployment = {
  chainId: 42431,
  chainName: chain.name,
  rpcUrl: chain.rpcUrls.default.http[0],
  explorer: chain.blockExplorers.default.url,
  address,
  token,
  tokenSymbol: "test AlphaUSD",
  tokenDecimals: 6,
  deployTx: hash,
  seller: seller.account.address,
  buyer: buyer.account.address,
  arbiter: privateKeyToAccount(keys.arbiter).address,
  windows: { delivery: 300, review: 600, arbitration: 300 },
  listingTxs: [],
};
writeFileSync("lib/deployment.json", JSON.stringify(deployment, null, 2));
await receipt(
  await seller.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [address, 300000000n],
  }),
);
for (const report of reports) {
  const tx = await seller.writeContract({
    address,
    abi: artifact.abi,
    functionName: "list",
    args: [
      report.digest,
      BigInt(report.price) * 1000000n,
      100000000n,
      `sealed://evaluation/${report.id}/v1`,
    ],
  });
  await receipt(tx);
  deployment.listingTxs.push(tx);
  console.log("Listed", report.id, tx);
  writeFileSync("lib/deployment.json", JSON.stringify(deployment, null, 2));
}
await receipt(
  await buyer.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [address, 200000000n],
  }),
);
console.log("Approved bounded buyer budget: 200 test AlphaUSD.");
