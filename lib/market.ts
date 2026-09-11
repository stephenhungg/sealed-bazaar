import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import contract from "./contract.json";
import deployment from "./deployment.json";
import sealedReports from "./sealed-reports.json";

export const config = deployment;
export const publicClient = createPublicClient({
  chain: tempoModerato,
  transport: http(deployment.rpcUrl, { timeout: 15000, retryCount: 1 }),
  pollingInterval: 600,
});
const contractAddress = deployment.address as Address;
const base = { address: contractAddress, abi: contract.abi };
export type Trade = readonly [bigint, Address, number, bigint, Hex, Hex];
export type Listing = readonly [Address, Hex, bigint, bigint, string];
export type Scenario = "honest" | "tampered" | "missing";
export function keyFor(secret: string, scenario: Scenario): Hex {
  return keccak256(toHex(`sealed:v1:${scenario}:${secret}`));
}
export function validateSecret(secret: unknown): asserts secret is string {
  if (typeof secret !== "string" || !/^[a-f0-9]{64}$/.test(secret))
    throw Error("A 32-byte session secret is required.");
}
function wallet(role: "buyer" | "seller" | "arbiter") {
  const key = process.env[`${role.toUpperCase()}_PRIVATE_KEY`];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw Error("The testnet agent is not configured.");
  const account = privateKeyToAccount(key as Hex);
  if (account.address.toLowerCase() !== deployment[role].toLowerCase())
    throw Error("Agent wallet does not match this deployment.");
  return createWalletClient({
    account,
    chain: tempoModerato,
    transport: http(deployment.rpcUrl, { timeout: 15000, retryCount: 0 }),
  });
}
export async function transact(
  role: "buyer" | "seller" | "arbiter",
  functionName: string,
  args: unknown[],
): Promise<Hex> {
  const w = wallet(role);
  const { request } = await publicClient.simulateContract({
    ...base,
    functionName,
    args,
    account: w.account,
  });
  const hash = await w.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: 30000,
  });
  if (receipt.status !== "success")
    throw Error(
      "The transaction reverted. No successful settlement was recorded.",
    );
  return hash;
}
export async function listing(id: number): Promise<Listing> {
  return (await publicClient.readContract({
    ...base,
    functionName: "listings",
    args: [BigInt(id)],
  })) as Listing;
}
export async function tradeBySecret(secret: string, scenario: Scenario) {
  const id = (await publicClient.readContract({
    ...base,
    functionName: "requestTrade",
    args: [deployment.buyer, keyFor(secret, scenario)],
  })) as bigint;
  if (!id) throw Error("No paid purchase exists for this session.");
  const trade = (await publicClient.readContract({
    ...base,
    functionName: "trades",
    args: [id],
  })) as Trade;
  if (trade[1].toLowerCase() !== deployment.buyer.toLowerCase())
    throw Error("Invalid buyer.");
  return { id, trade };
}
export async function digest(text: string): Promise<Hex> {
  const d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return ("0x" +
    Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join(
      "",
    )) as Hex;
}
function bytes(hex: string) {
  return new Uint8Array(hex.match(/.{2}/g)!.map((x) => parseInt(x, 16)));
}
function base64(text: string) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
export async function reportBytes(id: number, scenario: Scenario) {
  const sealed = sealedReports[id];
  const key = process.env.DELIVERY_KEY;
  if (!key || !/^[0-9a-f]{64}$/.test(key))
    throw Error("Private report delivery is not configured.");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytes(key),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64(sealed.iv) },
    cryptoKey,
    base64(sealed.ciphertext),
  );
  const text = new TextDecoder().decode(decrypted);
  if ((await digest(text)) !== sealed.digest)
    throw Error("Stored report does not match its published commitment.");
  return scenario === "tampered"
    ? text.replace('"schemaVersion":1', '"schemaVersion":999')
    : text;
}
export function verifyEvaluation(text: string, expectedSamples: number) {
  const report = JSON.parse(text);
  if (
    report.schemaVersion !== 1 ||
    report.fixture !== true ||
    report.samples !== expectedSamples ||
    !Array.isArray(report.runs) ||
    !report.runs.length
  )
    throw Error("Evaluation schema does not satisfy the purchase policy.");
  for (const run of report.runs) {
    if (
      !Array.isArray(run.cases) ||
      run.cases.length !== expectedSamples ||
      run.total !== expectedSamples
    )
      throw Error("Report sample count is inconsistent.");
    if (
      run.cases.some((x: { passed: unknown }) => typeof x.passed !== "boolean")
    )
      throw Error("Invalid per-case evidence.");
    const passed = run.cases.filter(
      (x: { passed: boolean }) => x.passed,
    ).length;
    if (
      run.passed !== passed ||
      run.score !== Math.round((passed / expectedSamples) * 1000) / 10
    )
      throw Error("Reported scores do not match per-case evidence.");
  }
  return report;
}
export async function marketSnapshot() {
  const [listings, accepted, refunded, faults, trades] = await Promise.all([
    Promise.all(
      sealedReports.map(async (x) => {
        const l = await listing(x.id);
        return {
          id: x.id,
          digest: l[1],
          price: Number(l[2]) / 1e6,
          bond: Number(l[3]) / 1e6,
          seller: l[0],
          samples: x.samples,
          category: x.category,
        };
      }),
    ),
    publicClient.readContract({
      ...base,
      functionName: "acceptedSales",
      args: [deployment.seller],
    }),
    publicClient.readContract({
      ...base,
      functionName: "refundedSales",
      args: [deployment.seller],
    }),
    publicClient.readContract({
      ...base,
      functionName: "sellerFaults",
      args: [deployment.seller],
    }),
    publicClient.readContract({ ...base, functionName: "tradeCount" }),
  ]);
  return {
    config,
    listings,
    reputation: {
      accepted: Number(accepted),
      refunded: Number(refunded),
      faults: Number(faults),
    },
    tradeCount: Number(trades),
  };
}
export async function runAction(input: Record<string, unknown>) {
  const { secret } = input;
  validateSecret(secret);
  const scenario: Scenario =
    input.scenario === "tampered"
      ? "tampered"
      : input.scenario === "missing"
        ? "missing"
        : "honest";
  const action = input.action;
  if (action === "purchase") {
    const id = Number(input.listingId),
      budget = Number(input.budget),
      minSamples = Number(input.minSamples);
    if (
      !Number.isInteger(id) ||
      id < 0 ||
      id >= sealedReports.length ||
      !Number.isFinite(budget) ||
      budget < 0 ||
      budget > 5 ||
      !Number.isInteger(minSamples) ||
      minSamples < 1 ||
      minSamples > 1000
    )
      throw Error("Invalid buyer policy. Maximum budget is 5 test AlphaUSD.");
    const l = await listing(id);
    if (l[2] > BigInt(Math.floor(budget * 1e6)))
      throw Error("Policy declined: this report exceeds your budget.");
    if (sealedReports[id].samples < minSamples)
      throw Error("Policy declined: insufficient evaluation samples.");
    const existing = (await publicClient.readContract({
      ...base,
      functionName: "requestTrade",
      args: [deployment.buyer, keyFor(secret, scenario)],
    })) as bigint;
    if (existing) {
      const found = await tradeBySecret(secret, scenario);
      if (Number(found.trade[0]) !== id)
        throw Error("This session belongs to a different listing.");
      return {
        tradeId: String(existing),
        digest: l[1],
        price: Number(l[2]) / 1e6,
        resumed: true,
      };
    }
    if (l[3] < l[2])
      throw Error("Policy declined: seller has insufficient free collateral.");
    const total = (await publicClient.readContract({
      ...base,
      functionName: "tradeCount",
    })) as bigint;
    if (total >= 80n)
      throw Error(
        "The public demo has reached its 80-purchase cap. Existing purchases can still settle.",
      );
    const tx = await transact("buyer", "buy", [
      BigInt(id),
      keyFor(secret, scenario),
    ]);
    const found = await tradeBySecret(secret, scenario);
    return {
      tradeId: String(found.id),
      tx,
      digest: l[1],
      price: Number(l[2]) / 1e6,
    };
  }
  const { id, trade } = await tradeBySecret(secret, scenario);
  const listingId = Number(trade[0]);
  if (action === "status")
    return {
      tradeId: String(id),
      listingId,
      status: trade[2],
      deadline: Number(trade[3]),
    };
  if (action === "deliver") {
    if (scenario === "missing")
      return {
        tradeId: String(id),
        withheld: true,
        deadline: Number(trade[3]),
      };
    if (trade[2] !== 1 && trade[2] !== 2 && trade[2] !== 4)
      throw Error("This purchase is not eligible for report delivery.");
    // Authenticate the paid trade before decrypting any report. Never accept an arbitrary report ID.
    const text = await reportBytes(listingId, scenario);
    const tx =
      trade[2] === 1
        ? await transact("seller", "markDelivered", [id])
        : undefined;
    return {
      tradeId: String(id),
      tx,
      text,
      digest: (await listing(listingId))[1],
    };
  }
  if (action === "accept") {
    if (trade[2] === 4)
      return { tradeId: String(id), status: "Accepted", resumed: true };
    if (trade[2] !== 2) throw Error("The trade is not ready for acceptance.");
    const text = await reportBytes(listingId, scenario);
    if ((await digest(text)) !== (await listing(listingId))[1])
      throw Error(
        "Buyer policy rejected the delivered hash. Payment will not be released.",
      );
    verifyEvaluation(text, sealedReports[listingId].samples);
    return {
      tradeId: String(id),
      tx: await transact("buyer", "accept", [id]),
      status: "Accepted",
    };
  }
  if (action === "dispute") {
    if (trade[2] === 3)
      return { tradeId: String(id), status: "Disputed", resumed: true };
    if (trade[2] !== 2) throw Error("This purchase cannot be disputed.");
    const observed = await digest(await reportBytes(listingId, scenario));
    if (observed === (await listing(listingId))[1])
      throw Error(
        "No objective delivery mismatch. Subjective quality claims need manual arbitration.",
      );
    return {
      tradeId: String(id),
      tx: await transact("buyer", "dispute", [id, observed]),
      status: "Disputed",
      evidence: observed,
    };
  }
  if (action === "resolve") {
    if (trade[2] === 5)
      return { tradeId: String(id), status: "Refunded", resumed: true };
    if (trade[2] !== 3) throw Error("No open dispute.");
    const observed = await digest(await reportBytes(listingId, scenario));
    if (observed === (await listing(listingId))[1] || observed !== trade[5])
      throw Error("Arbiter could not reproduce the claimed delivery mismatch.");
    return {
      tradeId: String(id),
      tx: await transact("arbiter", "resolve", [id, true]),
      status: "Refunded",
    };
  }
  if (action === "expire") {
    if (trade[2] === 4 || trade[2] === 5)
      return {
        tradeId: String(id),
        status: trade[2] === 4 ? "Accepted" : "Refunded",
        resumed: true,
      };
    return {
      tradeId: String(id),
      tx: await transact("buyer", "finalizeExpired", [id]),
      status: trade[2] === 2 ? "Accepted" : "Refunded",
    };
  }
  throw Error("Unknown agent action.");
}
