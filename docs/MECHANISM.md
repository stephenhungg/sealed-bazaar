# Sealed — The Black Box Bazaar

Agents buy sealed, workload-specific model evaluations using bonded escrow on **Tempo Moderato**, a public testnet. Results cannot be read from the public catalogue, client bundle, or repository before purchase: reports are AES-GCM encrypted, and the delivery key stays on the server.

**Contract:** [`0x0193a37a1d2f7754a01169cd772020870200494d`](https://explore.testnet.tempo.xyz/address/0x0193a37a1d2f7754a01169cd772020870200494d) · **Chain ID:** `42431` · **Payment:** test AlphaUSD, 6 decimals.

[Deployment transaction](https://explore.testnet.tempo.xyz/tx/0x81b9d3c45533af4307be28eb484f7f5d9050b778158cbad0e67dc39f156b01fa)

## Why model evaluations?

A model-routing agent needs evidence for its particular workload, not a general leaderboard. Independent evaluation labs sell tool-use reliability, grounded retrieval, and structured-output reports. The public listing exposes sample count, task, model aliases, grading method, price, and collateral. Scores and per-case failures are the paid information. Buyers enforce a budget and minimum sample count, verify report integrity, recompute scores, then select the highest-scoring model within the purchased fixture.

**All current reports and model names are synthetic fixtures.** They demonstrate the market mechanism and its failure paths, not real benchmark performance. Each report contains the advertised number of cases per model; the downloadable evidence explains exactly how to recompute its score.

## Biggest design decision

Separate **verifiable delivery** from **subjective information quality**. A matching SHA-256 commitment proves byte identity, not truthful research. We do not pretend a smart contract can judge a benchmark. Payment and collateral are on-chain; delivery is private; quality disputes require a named arbiter.

| Event | Outcome |
| --- | --- |
| Buyer purchases | Price held in escrow; an equal amount of seller collateral is reserved |
| Seller declares delivery | 10-minute buyer review window begins |
| Buyer verifies and accepts | Seller receives price; collateral becomes available again |
| No delivery within 5 minutes | Anyone can return buyer price **plus the matching seller bond** |
| Buyer disputes within review window | Payment stays locked; evidence hash recorded |
| Arbiter upholds dispute within 5 minutes | Buyer receives price plus bond; seller fault count increments |
| Arbiter rejects dispute | Seller receives payment and recovers available collateral |
| Arbiter does not respond | Buyer gets principal; seller bond restored, no seller fault recorded |
| Buyer stays silent after declared delivery | Anyone can finalize payment to seller |

Free seller collateral can be withdrawn without touching active trades. Replayed purchase requests cannot create another trade for the same buyer and request key.

## Trust assumptions and important limitation

The delivery service must protect its AES key and release the report to the correct session. The demo uses a 256-bit browser session secret; its scenario-bound hash identifies the paid trade. **The operator controls the buyer wallet, the three seller personas (one seller wallet), and arbiter wallet.** These are bounded custodial agents, not decentralized participants. An honest arbiter and an online buyer are required: a seller can falsely declare delivery, so the buyer must monitor the review window. The automatic demo arbiter handles reproducible byte corruption only; subjective quality claims require manual contract arbitration.

Seller history counts accepted sales, refunds, and attributable faults separately. Counts are **not** Sybil-resistant quality ratings. The biggest unresolved market limitation is information leakage: after buying, a buyer can redistribute the report. Arbiter silence also lets a dishonest buyer receive information and recover payment. Real deployment needs independent evaluators, reliable arbitration, authenticated seller identities, and an explicit information licensing strategy.

## Demo

1. Select a report and configure the buyer's maximum spend and minimum sample count. A failed policy pays nothing.
2. Run **Valid report**. Follow purchase → private delivery → hash and score verification → seller payout. Inspect explorer links and download the report.
3. Configure another purchase with **Corrupted report**. The buyer catches the mismatch and opens a dispute; run the arbiter to refund and slash the seller bond.
4. Optional: **Missing report** exercises the actual five-minute contract timeout.

The buyer is a deterministic policy agent, not an LLM. Both browser and server verify report integrity. The seller service reacts to paid purchases and delivers committed reports. The arbiter independently reproduces the corrupted fixture before ruling. No real-money keys are used. The API limits the shared demo to 80 purchases and its token allowance to 200 test AlphaUSD. These are demo controls, not production rate limiting; concurrent public callers can cause nonce contention and should retry the same session.

## Run and verify

Node.js 22.13+.

```sh
npm ci
npm run dev
npm run typecheck
npm run test:contract
```

Without server secrets, the public catalogue still reads the live contract; purchase and delivery report that agents are unconfigured. Existing ciphertext cannot be decrypted from a fresh checkout. To create your own complete instance:

```sh
node scripts/setup-demo.mjs
npm run deploy:contract
npm run dev
# With the server running; spends test tokens:
npm run test:api
```

Setup generates new test-only wallets, requests official Tempo faucet funds, creates fresh encrypted fixture reports, and writes ignored `.env.local`. It intentionally refuses to replace existing local keys. Deployment writes a new `lib/deployment.json` and approves a bounded buyer allowance. Never regenerate the report payload after deploying its commitment; generate and deploy a new instance instead. Production requires the four `.env.example` keys as runtime secrets.

## Implementation and validation

React + Vinext, viem, Solidity, Cloudflare-compatible server routes. No database: commitments, collateral, trades, evidence hashes, and reputation live on-chain. Encrypted fixture bytes are stored with source; private keys and plaintext are not.

Contract tests exercise purchase/replay authorization, collateral accounting, seller payout, delivery timeout, buyer silence, both arbitration outcomes, arbitration timeout, and withdrawal safety. Testnet API checks cover unpaid delivery denial, policy refusal, idempotent retry, accepted delivery, and corruption/refund. The interface supports responsive layouts, accessible dialogs, a resumable tab-local purchase, and explorer links. A small optional WebMCP tool selects public listings; it never purchases silently.

References: [Tempo network](https://docs.tempo.xyz/quickstart/connection-details), [Tempo faucet](https://docs.tempo.xyz/quickstart/faucet), [viem contract writes](https://viem.sh/docs/contract/writeContract).
