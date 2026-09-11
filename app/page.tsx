"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  LockKeyhole,
  ShieldCheck,
  FlaskConical,
  Terminal,
  Check,
  Fingerprint,
  Box,
  ChevronRight,
} from "lucide-react";
import { AgentRunner } from "@/components/agent-runner";
import deployment from "@/lib/deployment.json";
import { Button } from "@/components/ui/button";
const reports = [
  {
    id: 0,
    title: "Which model can actually use your tools?",
    category: "Tool use",
    seller: "Toolsmith Research",
    initials: "TR",
    samples: 120,
    price: "2.00",
    desc: "Multi-step tool selection, argument validity, and recovery from failed calls. Frozen synthetic cases with inspectable grading evidence.",
    models: ["Model Atlas", "Model Cedar", "Model Finch"],
    method: "Fixture outcome audit",
    color: "blue",
  },
  {
    id: 1,
    title: "Long documents. Short answers. Real citations?",
    category: "Retrieval",
    seller: "Context Lab",
    initials: "CL",
    samples: 80,
    price: "3.00",
    desc: "Citation accuracy and answer grounding across long-context document retrieval tasks, with per-case evidence.",
    models: ["Model Atlas", "Model Cedar"],
    method: "Citation fixture audit",
    color: "purple",
  },
  {
    id: 2,
    title: "Does structured output survive the edge cases?",
    category: "Structured output",
    seller: "Schema Works",
    initials: "SW",
    samples: 160,
    price: "1.00",
    desc: "Schema adherence under nested objects, nullable fields, and contradictory instructions. Per-case evidence is included.",
    models: ["Model Cedar", "Model Finch"],
    method: "Schema fixture audit",
    color: "orange",
  },
];
export default function Home() {
  const [selected, setSelected] = useState(0),
    [filter, setFilter] = useState("All evaluations"),
    [view, setView] = useState("market");
  const report = reports[selected];
  const [chainData, setChainData] = useState<{
    reputation: { accepted: number; refunded: number; faults: number };
    listings: { id: number; digest: string; bond: number }[];
  } | null>(null);
  const [chainError, setChainError] = useState(false);
  function refresh() {
    fetch("/api/market")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => {
        setChainData(d as NonNullable<typeof chainData>);
        setChainError(false);
      })
      .catch(() => setChainError(true));
  }
  useEffect(() => {
    refresh();
  }, []);
  const live = chainData?.listings.find((x) => x.id === selected);
  useEffect(() => {
    type ToolContext = {
      registerTool: (
        tool: {
          name: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void;
    };
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    context.registerTool(
      {
        name: "select_evaluation",
        description:
          "Select a sealed evaluation and show its public methodology. Does not purchase or reveal findings.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "integer", minimum: 0, maximum: 2 } },
          required: ["id"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input) {
          const id = (input as { id?: unknown })?.id;
          if (
            typeof id !== "number" ||
            !Number.isInteger(id) ||
            id < 0 ||
            id > 2
          )
            throw Error("Evaluation id must be 0, 1, or 2.");
          setSelected(id);
          setFilter("All evaluations");
          setView("market");
          return {
            id,
            title: reports[id].title,
            category: reports[id].category,
            sealed: true,
          };
        },
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Box size={22} />
          </span>
          sealed<span className="brand-dot">.</span>
        </a>
        <nav>
          <button
            className={view === "market" ? "active" : ""}
            onClick={() => setView("market")}
          >
            Marketplace
          </button>
          <button
            className={view === "trust" ? "active" : ""}
            onClick={() => setView("trust")}
          >
            How trust works
          </button>
        </nav>
        <span className="network">
          <span />
          Tempo testnet
        </span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="workspace-label">
            BLACK BOX BAZAAR <span>01</span>
          </div>
          <button
            className={"side-link " + (view === "market" ? "selected" : "")}
            onClick={() => setView("market")}
          >
            <FlaskConical size={18} />
            Evaluations <span>3</span>
          </button>
          <button
            className={"side-link " + (view === "trust" ? "selected" : "")}
            onClick={() => setView("trust")}
          >
            <ShieldCheck size={18} />
            Trust & settlement
          </button>
          <div className="sidebar-note">
            <LockKeyhole size={19} />
            <h3>Evidence has value.</h3>
            <p>
              Buy the evaluation.
              <br />
              Then see the evidence.
            </p>
            <span>MODEL EVALUATIONS MARKET</span>
          </div>
          <div className="sidebar-bottom">
            Test tokens only
            <br />
            <strong>Built for agent-to-agent trade</strong>
          </div>
        </aside>
        <main>
          <div className="eyebrow">RESEARCH, BEFORE THE NEXT API CALL</div>
          <div className="page-heading">
            <div>
              <h1>
                {view === "market"
                  ? "Better decisions. Sealed evidence."
                  : "Trust what you can verify."}
              </h1>
              <p>
                {view === "market"
                  ? "Independent model evaluations, bought by agents. Results stay sealed until payment."
                  : "A commitment proves delivery. It does not prove that an evaluation is good."}
              </p>
            </div>
            <span className="edition">BAZAAR / 001</span>
          </div>
          {view === "market" ? (
            <>
              {chainError && (
                <div role="alert" className="chain-error">
                  The testnet RPC is unavailable. Live commitments and purchases
                  may be delayed. <button onClick={refresh}>Retry</button>
                </div>
              )}
              <div className="market-banner">
                <div className="banner-icon">
                  <Fingerprint size={28} />
                </div>
                <div>
                  <strong>Know the method. Unlock the findings.</strong>
                  <p>
                    Public methodology · Committed report hash · Escrowed
                    payment
                  </p>
                </div>
                <span className="fixture-label">DEMO DATA</span>
              </div>
              <div className="market-layout">
                <section className="listings">
                  <div className="section-top">
                    <h2>
                      Available evaluations <span>03</span>
                    </h2>
                    <span>Fixed-price reports</span>
                  </div>
                  <div className="filters">
                    {[
                      "All evaluations",
                      "Tool use",
                      "Retrieval",
                      "Structured output",
                    ].map((x) => (
                      <button
                        key={x}
                        onClick={() => setFilter(x)}
                        className={filter === x ? "chosen" : ""}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                  <div className="report-list">
                    {reports
                      .filter(
                        (x) =>
                          filter === "All evaluations" || x.category === filter,
                      )
                      .map((x) => (
                        <button
                          className={
                            "report-card " + (selected === x.id ? "picked" : "")
                          }
                          key={x.id}
                          onClick={() => {
                            setSelected(x.id);
                            if (window.innerWidth < 701)
                              requestAnimationFrame(() =>
                                document
                                  .getElementById("report-detail")
                                  ?.scrollIntoView({ behavior: "smooth" }),
                              );
                          }}
                        >
                          <div className="card-top">
                            <span className={"category " + x.color}>
                              {x.category}
                            </span>
                            <span className="sealed">
                              <LockKeyhole size={12} />
                              Results sealed
                            </span>
                          </div>
                          <h3>{x.title}</h3>
                          <p>{x.desc}</p>
                          <div className="model-tags">
                            {x.models.map((m) => (
                              <span key={m}>{m}</span>
                            ))}
                          </div>
                          <div className="card-bottom">
                            <span className={"avatar " + x.color}>
                              {x.initials}
                            </span>
                            <span className="seller">
                              {x.seller}
                              <small>
                                {x.samples} cases · Synthetic fixture
                              </small>
                            </span>
                            <span className="price">
                              {x.price}
                              <small>test AlphaUSD</small>
                            </span>
                            <ChevronRight size={17} />
                          </div>
                        </button>
                      ))}
                  </div>
                  <p className="data-note">
                    All reports use synthetic models and fixture results. No
                    real-model performance claims.
                  </p>
                </section>
                <aside className="detail-panel" id="report-detail">
                  <div className="detail-head">
                    <span>REPORT PREVIEW</span>
                    <span className="mono">SE–00{report.id + 1}</span>
                  </div>
                  <div className="detail-content">
                    <span className={"category " + report.color}>
                      {report.category}
                    </span>
                    <h2>{report.title}</h2>
                    <div className="purchase-price">
                      <span>Report price</span>
                      <strong>
                        {report.price}
                        <small> test AlphaUSD</small>
                      </strong>
                    </div>
                    <AgentRunner listingId={selected} onComplete={refresh} />
                    <p className="purchase-note">
                      Budget-limited demo agents · Real testnet transactions
                      <br />
                      Test AlphaUSD has no monetary value.
                    </p>
                    <dl>
                      <div>
                        <dt>Sample size</dt>
                        <dd>{report.samples} test cases</dd>
                      </div>
                      <div>
                        <dt>Verification</dt>
                        <dd>{report.method}</dd>
                      </div>
                      <div>
                        <dt>Version</dt>
                        <dd>Frozen fixture · v1</dd>
                      </div>
                      <div>
                        <dt>Seller reputation</dt>
                        <dd>
                          {chainData
                            ? `${chainData.reputation.accepted} accepted · ${chainData.reputation.faults} faults`
                            : "Reading chain…"}
                        </dd>
                      </div>
                    </dl>
                    <div className="commitment">
                      <span>ON-CHAIN COMMITMENT</span>
                      <code>
                        {live
                          ? `${live.digest.slice(0, 18)}…${live.digest.slice(-8)}`
                          : "Loading commitment…"}
                      </code>
                      <a
                        href={`${deployment.explorer}/address/${deployment.address}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {live
                          ? `${live.bond} test AlphaUSD free seller bond`
                          : "View escrow contract"}{" "}
                        <ArrowUpRight size={12} />
                      </a>
                    </div>
                    <div className="sealed-preview">
                      <LockKeyhole size={25} />
                      <strong>The findings are sealed.</strong>
                      <p>
                        Scores, failure cases, and the full report
                        <br />
                        are delivered after escrow funding.
                      </p>
                      <div className="redacted">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                    <div className="includes">
                      <h4>YOUR PURCHASE INCLUDES</h4>
                      <p>
                        <Check size={15} />
                        Per-model scores and failure examples
                      </p>
                      <p>
                        <Check size={15} />
                        Methodology and reproduction notes
                      </p>
                      <p>
                        <Check size={15} />
                        SHA-256 delivery verification
                      </p>
                    </div>
                  </div>
                  <div className="protection">
                    <ShieldCheck size={18} />
                    <p>
                      <strong>Delivery protection, on-chain.</strong>
                      <br />
                      Timeout refunds and explicit arbitration.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          ) : (
            <section className="trust-content">
              {[
                [
                  "01",
                  "Commit before selling",
                  "A seller posts a SHA-256 report commitment and matching collateral. Public metadata includes the task, sample size, model aliases, grading method, and price. Reports are AES-GCM encrypted; the server holds the delivery key.",
                ],
                [
                  "02",
                  "Pay into escrow",
                  "The buyer agent evaluates public metadata against a fixed budget. Payment is held by the contract, not released immediately to the seller.",
                ],
                [
                  "03",
                  "Verify, then accept",
                  "The delivery server authenticates a session secret against a paid on-chain trade before decrypting. Both the browser and buyer service independently recompute the hash, sample counts, and scores from per-case evidence.",
                ],
                [
                  "04",
                  "Challenge with evidence",
                  "Buyers must monitor a 10-minute review window after the seller declares delivery. Missing delivery refunds price plus bond after 5 minutes. The arbiter has 5 minutes to resolve disputes; silence refunds principal without slashing. Subjective quality claims require manual arbitration.",
                ],
              ].map(([n, t, d]) => (
                <article key={n}>
                  <span>{n}</span>
                  <div>
                    <h2>{t}</h2>
                    <p>{d}</p>
                  </div>
                </article>
              ))}
              <div className="trust-addresses">
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${deployment.explorer}/address/${deployment.address}`}
                >
                  Escrow contract: {deployment.address}
                </a>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`${deployment.explorer}/address/${deployment.arbiter}`}
                >
                  Named arbiter: {deployment.arbiter}
                </a>
                <p>
                  Public agent API: POST /api/agent · Contract: Solidity ·
                  Settlement: test AlphaUSD
                </p>
              </div>
              <div className="trust-warning">
                <strong>The important limitation</strong>
                <p>
                  A matching hash proves byte identity, not honest science. The
                  demo operator controls all three seller personas, the shared
                  buyer wallet, the arbiter, and the delivery key. Transaction
                  counts are not quality ratings or Sybil-resistant reputation.
                  Buyers can resell revealed information, and arbiter silence
                  can reward false disputes. Independent evaluators and reliable
                  arbitration are required before using real money.
                </p>
              </div>
              <Button className="buy-button" onClick={() => setView("market")}>
                Explore evaluations
                <ArrowUpRight size={18} />
              </Button>
            </section>
          )}
          <footer>
            <span>
              sealed. / Evidence before commitment. Findings after payment.
            </span>
            <a
              href="https://github.com/stephenhungg/sealed-bazaar"
              target="_blank"
              rel="noreferrer"
            >
              Source & mechanism
              <ArrowUpRight size={13} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
