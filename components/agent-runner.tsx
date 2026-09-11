"use client";
import { useEffect, useRef, useState } from "react";
import {
  Terminal,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Download,
  LoaderCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import deployment from "@/lib/deployment.json";

type ActionResult = {
  tradeId: string;
  price: number;
  status: number | string;
  deadline: number;
  text: string;
  digest: string;
  withheld?: boolean;
  tx?: string;
  error?: string;
};
type Log = { label: string; detail: string; tx?: string; tone?: string };
type Session = {
  secret: string;
  scenario: string;
  listingId: number;
  budget: number;
  minSamples: number;
};
type Report = {
  category: string;
  metric: string;
  samples: number;
  runs: {
    model: string;
    score: number;
    passed: number;
    total: number;
    cases: { passed: boolean; observation: string }[];
  }[];
};
export function AgentRunner({
  listingId,
  onComplete,
}: {
  listingId: number;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false),
    [budget, setBudget] = useState("3"),
    [minSamples, setMinSamples] = useState("80"),
    [scenario, setScenario] = useState("honest"),
    [logs, setLogs] = useState<Log[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [phase, setPhase] = useState("ready"),
    [tradeId, setTradeId] = useState(""),
    [report, setReport] = useState<Report | null>(null),
    [plaintext, setPlaintext] = useState(""),
    [deadline, setDeadline] = useState(0);
  const session = useRef<Session | null>(null),
    running = useRef(false);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("sealed-active-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (/^[a-f0-9]{64}$/.test(parsed.secret)) {
          session.current = parsed;
          setPhase("recover");
          setScenario(parsed.scenario);
          setBudget(String(parsed.budget));
          setMinSamples(String(parsed.minSamples));
        }
      }
    } catch {
      /* A blocked storage provider should not prevent a fresh demo. */
    }
  }, []);
  function log(label: string, detail: string, tx?: string, tone?: string) {
    setLogs((x) => [...x, { label, detail, tx, tone }]);
  }
  async function call(action: string) {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...session.current, action }),
    });
    const value = (await response.json()) as ActionResult;
    if (!response.ok) throw Error(value.error || "The request failed.");
    return value;
  }
  async function finish(action: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await call(action);
      log(
        action === "resolve"
          ? "Arbiter · refund confirmed"
          : "Timeout · settlement confirmed",
        action === "resolve"
          ? "Buyer receives principal plus the seller’s matching bond. The seller fault is recorded on-chain."
          : String(r.status),
        r.tx,
        action === "resolve" ? "warn" : "success",
      );
      setPhase("complete");
      sessionStorage.removeItem("sealed-active-session");
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to settle.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setLogs([]);
    setReport(null);
    setPlaintext("");
    try {
      if (!session.current) {
        const secret = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        session.current = {
          secret,
          scenario,
          listingId,
          budget: Number(budget),
          minSamples: Number(minSamples),
        };
        sessionStorage.setItem(
          "sealed-active-session",
          JSON.stringify(session.current),
        );
      }
      const s = session.current;
      log(
        "Buyer · evaluating public evidence",
        `Report SE–00${s.listingId + 1}. Budget ≤ ${s.budget} test AlphaUSD. Sample count ≥ ${s.minSamples}. Seller must have a fully funded matching bond.`,
      );
      const purchased = await call("purchase");
      setTradeId(purchased.tradeId);
      setPhase("purchased");
      log(
        "Buyer · escrow funded",
        `Trade #${purchased.tradeId}. ${purchased.price} test AlphaUSD paid into escrow. Seller has not been paid.`,
        purchased.tx,
      );
      const state = await call("status");
      if (state.status === 3) {
        setPhase("disputed");
        log(
          "Recovery · open dispute found",
          "The existing purchase is awaiting the arbiter.",
        );
        return;
      }
      if (state.status === 5) {
        setPhase("complete");
        log(
          "Recovery · refund already confirmed",
          "This purchase was already refunded.",
        );
        sessionStorage.removeItem("sealed-active-session");
        return;
      }
      const delivered = await call("deliver");
      if (delivered.withheld) {
        setDeadline(delivered.deadline);
        setPhase("missing");
        log(
          "Seller · no report delivered",
          `Delivery deadline: ${new Date(delivered.deadline * 1000).toLocaleTimeString()}. Anyone can finalize the refund after it expires.`,
          undefined,
          "warn",
        );
        return;
      }
      log(
        "Seller · private report delivered",
        "A paid trade was verified before decrypting the report. The plaintext was not placed on-chain.",
        delivered.tx,
      );
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(delivered.text),
      );
      const observed =
        "0x" +
        Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      if (observed !== purchased.digest) {
        log(
          "Buyer · hash mismatch detected",
          `Expected ${purchased.digest.slice(0, 14)}… Received ${observed.slice(0, 14)}… Payment stays in escrow.`,
          undefined,
          "warn",
        );
        const d = await call("dispute");
        log(
          "Buyer · dispute opened",
          "The observed hash is committed on-chain as evidence.",
          d.tx,
          "warn",
        );
        setPhase("disputed");
        return;
      }
      const parsed = JSON.parse(delivered.text);
      if (
        parsed.schemaVersion !== 1 ||
        parsed.fixture !== true ||
        parsed.samples < s.minSamples ||
        !Array.isArray(parsed.runs) ||
        !parsed.runs.length
      )
        throw Error("Buyer rejected the report schema.");
      for (const model of parsed.runs) {
        if (
          !Array.isArray(model.cases) ||
          model.cases.length !== parsed.samples ||
          model.total !== parsed.samples ||
          model.cases.some(
            (x: { passed: unknown }) => typeof x.passed !== "boolean",
          ) ||
          model.passed !==
            model.cases.filter((x: { passed: boolean }) => x.passed).length ||
          model.score !==
            Math.round((model.passed / parsed.samples) * 1000) / 10
        )
          throw Error("Buyer rejected inconsistent case counts or scores.");
      }
      setReport(parsed);
      setPlaintext(delivered.text);
      log(
        "Buyer · commitment and evidence verified",
        "SHA-256 matches. Sample counts and every model’s score agree with the per-case evidence.",
        undefined,
        "success",
      );
      const accepted = await call("accept");
      log(
        "Buyer · seller paid",
        `${purchased.price} test AlphaUSD released. Reserved seller collateral is available again.`,
        accepted.tx,
        "success",
      );
      setPhase("complete");
      sessionStorage.removeItem("sealed-active-session");
      onComplete();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The agent encountered an error.",
      );
      if (
        e instanceof Error &&
        /^(Policy declined:|Invalid buyer policy\.)/.test(e.message)
      ) {
        session.current = null;
        sessionStorage.removeItem("sealed-active-session");
        setPhase("ready");
      } else {
        setPhase("recover");
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  function reset() {
    session.current = null;
    sessionStorage.removeItem("sealed-active-session");
    setLogs([]);
    setPhase("ready");
    setTradeId("");
    setReport(null);
    setPlaintext("");
    setError("");
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([plaintext], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `sealed-evaluation-trade-${tradeId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Button className="buy-button" onClick={() => setOpen(true)}>
        <Terminal size={17} />
        {phase === "ready"
          ? "Configure buyer agent"
          : phase === "complete"
            ? "View agent result"
            : "Resume buyer agent"}
        <ArrowRight size={17} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="agent-dialog">
          <DialogTitle className="agent-title">
            <Terminal size={23} />
            Buyer agent{" "}
            <span>{tradeId ? `TRADE #${tradeId}` : "POLICY FIRST"}</span>
          </DialogTitle>
          <DialogDescription className="agent-description">
            Autonomous selection checks, testnet escrow, and private evidence
            delivery. No wallet setup needed.
          </DialogDescription>
          <div className="agent-network">
            <span>Tempo Moderato · test AlphaUSD</span>
            <a
              href={`${deployment.explorer}/address/${deployment.address}`}
              target="_blank"
              rel="noreferrer"
            >
              View contract <ExternalLink size={13} />
            </a>
          </div>
          {phase === "ready" && (
            <>
              <div className="policy-grid">
                <div>
                  <Label htmlFor="budget">Maximum spend</Label>
                  <div className="input-unit">
                    <Input
                      id="budget"
                      type="number"
                      min="0"
                      max="5"
                      step="0.5"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                    <span>test AlphaUSD</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="samples">Minimum test cases</Label>
                  <Input
                    id="samples"
                    type="number"
                    min="1"
                    max="1000"
                    value={minSamples}
                    onChange={(e) => setMinSamples(e.target.value)}
                  />
                </div>
              </div>
              <div className="scenario-select">
                <Label htmlFor="scenario">Delivery scenario</Label>
                <Select value={scenario} onValueChange={setScenario}>
                  <SelectTrigger id="scenario">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="honest">
                      Valid report → verify and pay
                    </SelectItem>
                    <SelectItem value="tampered">
                      Corrupted report → dispute and refund
                    </SelectItem>
                    <SelectItem value="missing">
                      Missing report → 5-minute timeout refund
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="demo-disclosure">
                This public demo uses operator-controlled buyer, seller, and
                arbiter wallets. Scenarios are deliberate fixtures; every escrow
                action is a real testnet transaction. Reputation is shared by
                the three demo seller personas.
              </p>
            </>
          )}
          {logs.length > 0 && (
            <div className="agent-log" aria-live="polite">
              {logs.map((x, i) => (
                <div className={"log-line " + (x.tone || "")} key={i}>
                  <span className="log-index">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{x.label}</strong>
                    <p>{x.detail}</p>
                    {x.tx && (
                      <a
                        href={`${deployment.explorer}/tx/${x.tx}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {x.tx.slice(0, 12)}…{x.tx.slice(-6)}
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {x.tone === "warn" ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </div>
              ))}
            </div>
          )}
          {busy && (
            <div role="status" className="working">
              <LoaderCircle className="spin" size={17} />
              Waiting for the next testnet confirmation…
            </div>
          )}
          {error && (
            <div role="alert" className="agent-error">
              {error}
              <p>
                Retry resumes this session; it does not intentionally create
                another purchase.
              </p>
            </div>
          )}
          {report && (
            <div className="unlocked-report">
              <div className="result-heading">
                <ShieldCheck size={19} />
                <h3>Evidence unlocked</h3>
                <span>SYNTHETIC FIXTURE</span>
              </div>
              <p>
                {report.metric} · {report.samples} cases per model
              </p>
              {report.runs.map((x) => (
                <div className="score-row" key={x.model}>
                  <span>{x.model}</span>
                  <div>
                    <i style={{ width: `${x.score}%` }} />
                  </div>
                  <strong>{x.score}%</strong>
                </div>
              ))}
              <p className="agent-recommendation">
                Agent recommendation:{" "}
                <strong>
                  {[...report.runs].sort((a, b) => b.score - a.score)[0].model}
                </strong>{" "}
                has the highest score within this fixture. This is not a
                recommendation about real models.
              </p>
              <details>
                <summary>Inspect one failure per model</summary>
                {report.runs.map((x) => (
                  <p key={x.model}>
                    <strong>{x.model}:</strong>{" "}
                    {x.cases.find((c) => !c.passed)?.observation ||
                      "No failures in this fixture."}
                  </p>
                ))}
              </details>
              <Button
                className="download-button"
                variant="outline"
                onClick={download}
              >
                <Download size={16} />
                Download full report
              </Button>
            </div>
          )}
          {phase === "disputed" && !busy && (
            <div className="resolution">
              <h3>Payment is still in escrow.</h3>
              <p>
                The demo arbiter independently reproduces the delivered bytes
                and compares the disputed hash. If it matches the fault, the
                buyer receives the price plus the seller’s matching bond.
              </p>
              <Button className="buy-button" onClick={() => finish("resolve")}>
                Run arbiter & refund
                <ShieldCheck size={17} />
              </Button>
            </div>
          )}
          {phase === "missing" && !busy && (
            <div className="resolution">
              <p>
                Refund becomes available after{" "}
                {new Date(deadline * 1000).toLocaleTimeString()}. This is an
                actual contract deadline, not a simulated timer.
              </p>
              <Button className="buy-button" onClick={() => finish("expire")}>
                Check timeout & claim refund
              </Button>
            </div>
          )}
          {(phase === "ready" || phase === "recover") && (
            <Button disabled={busy} className="buy-button" onClick={run}>
              {busy
                ? "Agent running…"
                : phase === "recover"
                  ? "Resume this purchase"
                  : "Run buyer agent"}
              <ArrowRight size={17} />
            </Button>
          )}
          {phase === "complete" && (
            <Button variant="outline" onClick={reset}>
              Configure another purchase
            </Button>
          )}
          <p className="agent-footnote">
            Matching bytes do not prove honest science. Buyers must monitor the
            10-minute review window; the arbiter has 5 minutes to respond. Demo
            allowance: 200 test AlphaUSD, at most 80 purchases.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
