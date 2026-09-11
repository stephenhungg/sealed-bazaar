# Sealed — The Black Box Bazaar

A marketplace where agents purchase **sealed model evaluations** using bonded escrow on **Tempo Moderato**, a public testnet. Public listings show method, sample count, price, and collateral. Scores and per-case failures remain encrypted until a paid purchase is authenticated.

- **Live app:** [sealed-evals-bazaar.stephenhung.chatgpt.site](https://sealed-evals-bazaar.stephenhung.chatgpt.site)
- **Demo video:** [Download the walkthrough](https://github.com/stephenhungg/sealed-bazaar/releases/download/v0.1.0/sealed-demo.mp4)
- **Contract:** [`0x0193a37a1d2f7754a01169cd772020870200494d`](https://explore.testnet.tempo.xyz/address/0x0193a37a1d2f7754a01169cd772020870200494d)
- **Network:** Tempo Moderato, chain `42431`; payments in **test AlphaUSD**.
- **[Deployment transaction](https://explore.testnet.tempo.xyz/tx/0x81b9d3c45533af4307be28eb484f7f5d9050b778158cbad0e67dc39f156b01fa)**

## Vertical

Model-routing agents need evidence for a specific workload, not a generic leaderboard. Evaluation labs sell tool-use reliability, grounded retrieval, and structured-output reports. Buyer agents enforce a budget and minimum sample size, verify the delivered hash, recompute scores from case evidence, and recommend the highest-scoring model within that evaluation.

**All current model names and results are synthetic fixtures**, clearly labeled in the UI. They demonstrate the mechanism, not actual commercial-model performance. The buyer is a deterministic policy agent; no LLM key is required.

## Biggest design decision

Separate **verifiable delivery** from **subjective quality**. A SHA-256 commitment proves which bytes arrived, not whether the research is honest. A seller reserves collateral equal to the price for each purchase. The buyer's payment stays in the contract until acceptance, timeout, or arbitration.

- Valid delivery: buyer checks the hash and per-case evidence, then pays the seller.
- Corrupted delivery: buyer commits evidence; the named arbiter reproduces the mismatch, refunds price plus seller bond, and records a seller fault.
- No delivery: refund plus bond after 5 minutes. Buyer review lasts 10 minutes; arbitration lasts 5 minutes. Arbiter silence refunds principal without slashing. Buyer silence after declared delivery pays the seller.

## Trust and limitation

This is a **custodial demo**: the operator controls the shared buyer wallet, seller wallet (three personas), arbiter, and delivery key. Buyers must monitor the review window; subjective quality disputes need manual arbitration. Seller transaction counts are not Sybil-resistant quality ratings. The automatic arbiter only handles the intentionally corrupted fixture.

The important unresolved limitation is **information leakage**: a buyer can redistribute a report after purchase. Arbiter silence can also reward false disputes. Real deployment needs independent evaluators, reliable arbitration, authenticated seller identities, and information licensing.

## Try it

Select a report → configure a budget → run the valid delivery flow → inspect transactions and download the report. Then configure another purchase using **Corrupted report** and run the arbiter to see the refund. A too-small budget declines before paying. The optional missing-delivery path uses the real five-minute timeout.

## Run locally

```sh
npm ci
npm run dev
npm run typecheck
npm run test:contract
```

The catalogue reads the deployed contract without secrets. To run your own agents, generate new test wallets, faucet funds, and encrypted reports, then deploy your own instance:

```sh
node scripts/setup-demo.mjs
npm run deploy:contract
npm run dev
# In another terminal; spends test tokens:
npm run test:api
```

Never publish `.env.local` or `work/`. Existing ciphertext requires the original delivery key; setup generates new reports and commitments instead. Hosted deployments need the four `.env.example` runtime secrets.

Built with React/Vinext, viem, and Solidity. Escrow, commitments, disputes, and reputation are on-chain; no database. Contract and live testnet tests cover successful payment, corruption/refund, policy rejection, unpaid delivery denial, replay protection, and timeout accounting. [Full mechanism, trust model, and setup notes](docs/MECHANISM.md).
