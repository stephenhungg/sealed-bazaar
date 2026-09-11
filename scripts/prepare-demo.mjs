import { createCipheriv, randomBytes, createHash } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
if (existsSync("lib/sealed-reports.json"))
  throw Error("Reports already exist; do not change a committed payload.");
const key = randomBytes(32);
const settings = [
  {
    category: "Tool use",
    samples: 120,
    models: ["Model Atlas", "Model Cedar", "Model Finch"],
    task: "Choose the correct tool and valid arguments",
    metric: "Valid tool execution",
    price: 2,
  },
  {
    category: "Retrieval",
    samples: 80,
    models: ["Model Atlas", "Model Cedar"],
    task: "Answer using only a cited passage in a frozen document",
    metric: "Grounded answer with correct citation",
    price: 3,
  },
  {
    category: "Structured output",
    samples: 160,
    models: ["Model Cedar", "Model Finch"],
    task: "Return valid JSON matching a nested schema",
    metric: "Schema-valid response",
    price: 1,
  },
];
const sealed = settings.map((spec, index) => {
  const runs = spec.models.map((model, j) => {
    const cases = Array.from({ length: spec.samples }, (_, i) => {
      const b = randomBytes(1)[0];
      const pass = b < 220 - j * 18;
      return {
        id: `${index + 1}-${i + 1}`,
        input:
          index === 0
            ? {
                prompt: `Find record ${i + 1} and return its status`,
                tools: ["lookup_record", "send_message", "delete_record"],
                expected: { tool: "lookup_record", arguments: { id: i + 1 } },
              }
            : index === 1
              ? {
                  prompt: `What is item ${i + 1}'s reference value?`,
                  document: `[p1] Item ${i + 1}: value ${i * 7}.`,
                  expected: { answer: i * 7, citation: "p1" },
                }
              : {
                  prompt: `Create record ${i + 1}`,
                  schema: { type: "object", required: ["id", "meta"] },
                  expected: { id: i + 1, meta: { tags: [], note: null } },
                },
        passed: pass,
        observation: pass
          ? "Synthetic fixture response matched expected result"
          : index === 0
            ? "Incorrect tool or missing id argument"
            : index === 1
              ? "Unsupported answer or missing citation"
              : "Missing required meta field",
        latencyMs: 180 + randomBytes(1)[0] * 3,
      };
    });
    return {
      model,
      passed: cases.filter((x) => x.passed).length,
      total: spec.samples,
      score:
        Math.round(
          (cases.filter((x) => x.passed).length / spec.samples) * 1000,
        ) / 10,
      cases,
    };
  });
  const report = {
    schemaVersion: 1,
    fixture: true,
    category: spec.category,
    samples: spec.samples,
    metric: spec.metric,
    methodology: {
      description: spec.task,
      source:
        "Synthetic fixtures generated locally, not real model measurements.",
      grading: "Exact fixture outcome comparison; per-case outcomes included.",
      reproduction:
        "Recompute each score from the included passed booleans. Fixture generation is randomized, so rerunning the generator produces a different report.",
      limitations: [
        "Synthetic models; not evidence about any commercial model.",
        "Single workload fixture; cannot establish general performance.",
        "Published methodology does not independently attest honesty.",
      ],
    },
    runs,
    nonce: randomBytes(32).toString("hex"),
  };
  const plaintext = JSON.stringify(report);
  const digest = "0x" + createHash("sha256").update(plaintext).digest("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    id: index,
    digest,
    price: spec.price,
    samples: spec.samples,
    category: spec.category,
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
  };
});
writeFileSync("lib/sealed-reports.json", JSON.stringify(sealed));
const wallets = JSON.parse(readFileSync("work/testnet-wallets.json", "utf8"));
writeFileSync(
  ".env.local",
  `DELIVERY_KEY=${key.toString("hex")}\nSELLER_PRIVATE_KEY=${wallets.seller}\nBUYER_PRIVATE_KEY=${wallets.buyer}\nARBITER_PRIVATE_KEY=${wallets.arbiter}\n`,
  { mode: 0o600 },
);
console.log(
  "Encrypted three private fixture reports. Plaintext and keys are not in source.",
);
