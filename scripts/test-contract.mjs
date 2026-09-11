import ganache from "ganache";
import solc from "solc";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  custom,
  parseAbi,
  keccak256,
  toHex,
  erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import assert from "node:assert/strict";
const provider = ganache.provider({
  logging: { quiet: true },
  chain: { hardfork: "shanghai" },
});
const transport = custom(provider);
const chain = {
  id: 1337,
  name: "local tests",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://unused"] } },
};
const pub = createPublicClient({ transport, chain });
const [seller, buyer, arbiter, other] = Object.values(
  provider.getInitialAccounts(),
)
  .slice(0, 4)
  .map((x) =>
    createWalletClient({
      transport,
      chain,
      account: privateKeyToAccount(x.secretKey),
    }),
  );
const artifact = JSON.parse(readFileSync("lib/contract.json", "utf8"));
const mock =
  "pragma solidity ^0.8.24; contract Token { mapping(address=>uint) public balanceOf; mapping(address=>mapping(address=>uint)) public allowance; function mint(address a,uint n) external {balanceOf[a]+=n;} function approve(address a,uint n) external returns(bool){allowance[msg.sender][a]=n;return true;} function transfer(address a,uint n) external returns(bool){require(balanceOf[msg.sender]>=n);balanceOf[msg.sender]-=n;balanceOf[a]+=n;return true;} function transferFrom(address a,address b,uint n) external returns(bool){require(balanceOf[a]>=n&&allowance[a][msg.sender]>=n);balanceOf[a]-=n;allowance[a][msg.sender]-=n;balanceOf[b]+=n;return true;}}";
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Token.sol": { content: mock } },
      settings: {
        evmVersion: "paris",
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
).contracts["Token.sol"].Token;
async function confirm(hash) {
  const r = await pub.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success");
  return r;
}
const token = (
  await confirm(
    await seller.deployContract({
      abi: out.abi,
      bytecode: "0x" + out.evm.bytecode.object,
    }),
  )
).contractAddress;
const address = (
  await confirm(
    await seller.deployContract({
      ...artifact,
      args: [token, arbiter.account.address, 100, 100, 100],
    }),
  )
).contractAddress;
const read = (fn, args = []) =>
  pub.readContract({ address, abi: artifact.abi, functionName: fn, args });
const send = (who, fn, args = []) =>
  who
    .writeContract({ address, abi: artifact.abi, functionName: fn, args })
    .then(confirm);
const bal = (a) =>
  pub.readContract({
    address: token,
    abi: out.abi,
    functionName: "balanceOf",
    args: [a],
  });
for (const who of [seller, buyer, other]) {
  await confirm(
    await seller.writeContract({
      address: token,
      abi: out.abi,
      functionName: "mint",
      args: [who.account.address, 10000n],
    }),
  );
  await confirm(
    await who.writeContract({
      address: token,
      abi: out.abi,
      functionName: "approve",
      args: [address, 10000n],
    }),
  );
}
const digest = keccak256(toHex("fixture"));
await send(seller, "list", [digest, 10n, 100n, "sealed://fixture"]);
let n = 0;
async function buy() {
  await send(buyer, "buy", [0n, keccak256(toHex("request" + ++n))]);
  return BigInt(n);
}
async function reject(who, fn, args) {
  await assert.rejects(
    pub.simulateContract({
      address,
      abi: artifact.abi,
      functionName: fn,
      args,
      account: who.account,
    }),
  );
}
async function expire(id) {
  const t = await read("trades", [id]);
  const b = await pub.getBlock();
  await provider.request({
    method: "evm_increaseTime",
    params: [Number(t[3] - b.timestamp) + 1],
  });
  await provider.request({ method: "evm_mine", params: [] });
}
let id = await buy();
assert.equal((await read("listings", [0n]))[3], 90n);
await reject(other, "markDelivered", [id]);
await reject(seller, "accept", [id]);
await reject(buyer, "buy", [0n, keccak256(toHex("request1"))]);
await send(seller, "markDelivered", [id]);
const before = await bal(seller.account.address);
await send(buyer, "accept", [id]);
assert.equal(await bal(seller.account.address), before + 10n);
assert.equal((await read("listings", [0n]))[3], 100n);
await reject(buyer, "accept", [id]);
await reject(other, "finalizeExpired", [999n]);
console.log("PASS happy path, authorization, replay, terminal safety");
id = await buy();
let bb = await bal(buyer.account.address);
await expire(id);
await send(other, "finalizeExpired", [id]);
assert.equal(await bal(buyer.account.address), bb + 20n);
assert.equal(await read("sellerFaults", [seller.account.address]), 1n);
console.log("PASS delivery timeout refunds and slashes bond");
id = await buy();
await send(seller, "markDelivered", [id]);
bb = await bal(seller.account.address);
await expire(id);
await send(other, "finalizeExpired", [id]);
assert.equal(await bal(seller.account.address), bb + 10n);
console.log("PASS silent buyer settlement");
id = await buy();
await send(seller, "markDelivered", [id]);
await send(buyer, "dispute", [id, digest]);
await reject(other, "resolve", [id, true]);
bb = await bal(buyer.account.address);
await send(arbiter, "resolve", [id, true]);
assert.equal(await bal(buyer.account.address), bb + 20n);
console.log("PASS adjudicated refund and seller slash");
id = await buy();
await send(seller, "markDelivered", [id]);
await send(buyer, "dispute", [id, digest]);
bb = await bal(seller.account.address);
await send(arbiter, "resolve", [id, false]);
assert.equal(await bal(seller.account.address), bb + 10n);
console.log("PASS adjudicated seller victory");
id = await buy();
await send(seller, "markDelivered", [id]);
await send(buyer, "dispute", [id, digest]);
const faults = await read("sellerFaults", [seller.account.address]);
bb = await bal(buyer.account.address);
await expire(id);
await send(other, "finalizeExpired", [id]);
assert.equal(await bal(buyer.account.address), bb + 10n);
assert.equal(await read("sellerFaults", [seller.account.address]), faults);
console.log(
  "PASS arbiter timeout returns principal without attributing seller fault",
);
id = await buy();
const free = (await read("listings", [0n]))[3];
await reject(other, "withdrawBond", [0n, 1n]);
await reject(seller, "withdrawBond", [0n, free + 1n]);
await send(seller, "withdrawBond", [0n, free]);
assert.equal(await bal(address), 20n);
await reject(buyer, "buy", [0n, keccak256(toHex("no collateral"))]);
await expire(id);
await send(other, "finalizeExpired", [id]);
assert.equal(await bal(address), 0n);
console.log(
  "PASS free bond withdrawal preserves active escrow; undercollateralized purchase rejected",
);
await send(seller, "topUpBond", [0n, 10n]);
await confirm(
  await other.writeContract({
    address: token,
    abi: out.abi,
    functionName: "approve",
    args: [address, 0n],
  }),
);
const count = await read("tradeCount");
await reject(other, "buy", [0n, digest]);
assert.equal(await read("tradeCount"), count);
assert.equal((await read("listings", [0n]))[3], 10n);
console.log("PASS failed payment leaves state unchanged");
await provider.disconnect();
