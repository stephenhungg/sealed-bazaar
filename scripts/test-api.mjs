import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base = process.env.BASE_URL || "http://localhost:5173";
async function call(body) {
  const r = await fetch(base + "/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { httpStatus: r.status, ...(await r.json()) };
}
const evidence = [];
for (const scenario of ["honest", "tampered"]) {
  const input = {
    secret: randomBytes(32).toString("hex"),
    scenario,
    listingId: 0,
    budget: 3,
    minSamples: 80,
  };
  const denied = await call({ ...input, action: "deliver" });
  assert.equal(denied.httpStatus, 400);
  assert(!denied.text);
  console.log("PASS unpaid report inaccessible");
  const declined = await call({ ...input, action: "purchase", budget: 1 });
  assert.equal(declined.httpStatus, 400);
  console.log("PASS budget policy declines before paying");
  for (const action of [
    "purchase",
    "deliver",
    ...(scenario === "honest" ? ["accept"] : ["dispute", "resolve"]),
  ]) {
    const result = await call({ ...input, action });
    if (result.httpStatus !== 200) throw Error(JSON.stringify(result));
    evidence.push({ scenario, action, tradeId: result.tradeId, tx: result.tx });
    console.log("PASS", scenario, action, result.tradeId, result.tx || "");
    if (action === "purchase") {
      const retry = await call({ ...input, action });
      assert.equal(retry.tradeId, result.tradeId);
      assert.equal(retry.resumed, true);
    }
  }
  const final = await call({ ...input, action: "status" });
  assert.equal(final.status, scenario === "honest" ? 4 : 5);
}
writeFileSync("work/testnet-evidence.json", JSON.stringify(evidence, null, 2));
