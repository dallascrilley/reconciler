import type { Client } from "@libsql/client";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BillingDataset, Finding, Proposal } from "./domain/types.js";
import { BillingState } from "./billing/state.js";
import { buildDashboardState } from "./analytics/dashboard.js";
import { detectDiscrepancies } from "./findings/detectors.js";
import { proposeFinding, createProposalAction, createProposalProvider } from "./proposals/provider.js";
import { createReviewAction } from "./review/actions.js";
import { ReviewQueue, type ReviewQueueOptions } from "./review/queue.js";
import {
  createReconcilerDatabase,
  loadReconcilerState,
  saveReconcilerState,
} from "./storage/database.js";
import { generateBillingDataset } from "./seed/generator.js";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  response.end(body);
}

function renderIndex(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reconciler — Synthetic Billing Workbench</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #10131a; color: #eef2ff; }
    body { margin: 0; max-width: 1120px; padding: 32px 20px 64px; margin-inline: auto; }
    header { display: flex; justify-content: space-between; gap: 20px; align-items: end; border-bottom: 1px solid #30384a; padding-bottom: 22px; }
    h1 { margin: 0; letter-spacing: -0.04em; } h2 { margin-top: 34px; }
    .muted { color: #9ca8c2; } .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 22px; }
    .card { background: #171d29; border: 1px solid #30384a; border-radius: 12px; padding: 16px; }
    .value { font-size: 1.8rem; font-weight: 700; margin-top: 8px; } .pass { color: #69e6a1; } .warn { color: #ffcf70; }
    table { border-collapse: collapse; width: 100%; } th, td { border-bottom: 1px solid #30384a; text-align: left; padding: 10px 8px; vertical-align: top; }
    button { border: 0; border-radius: 8px; padding: 8px 12px; background: #8aa4ff; color: #0e1220; font-weight: 700; cursor: pointer; }
    button[disabled] { opacity: .45; cursor: wait; } code { color: #b8c7ff; } ul { padding-left: 20px; }
  </style>
</head>
<body>
  <header>
    <div><p class="muted">PUBLIC SYNTHETIC WORKBENCH</p><h1>Reconciler</h1><p class="muted">Detect discrepancies. Propose typed fixes. Require a human decision.</p></div>
    <p class="muted">No production billing data</p>
  </header>
  <section class="grid" id="metrics"></section>
  <section class="card"><h2>Proposal eval gate</h2><p id="eval-summary">Loading…</p><ul id="eval-failures"></ul></section>
  <section><h2>Human review queue</h2><div class="card"><table><thead><tr><th>Account</th><th>Discrepancy</th><th>Recovery</th><th>Proposal</th><th>Decision</th></tr></thead><tbody id="findings"></tbody></table></div></section>
  <section><h2>Audit log</h2><div class="card"><ul id="audit"></ul></div></section>
  <script>
    const money = (cents) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
    const text = (value) => document.createTextNode(String(value));
    const el = (tag, attrs = {}, children = []) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) node[key] = value;
      for (const child of children) node.append(child);
      return node;
    };
    async function review(proposalId, decision, button) {
      button.disabled = true;
      const response = await fetch("/api/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalId, decision, reviewer: "public-demo-reviewer" }) });
      if (!response.ok) alert("Review failed: " + (await response.text()));
      await refresh();
    }
    async function refresh() {
      const dashboard = await fetch("/api/dashboard").then((response) => response.json());
      const metrics = [
        ["Accounts", dashboard.accountCount],
        ["Open findings", dashboard.openFindingCount],
        ["Pending proposals", dashboard.pendingProposalCount],
        ["Recovered revenue", money(dashboard.recoveredRevenueCents)]
      ];
      document.querySelector("#metrics").replaceChildren(...metrics.map(([label, value]) => el("div", { className: "card" }, [el("div", { className: "muted" }, [text(label)]), el("div", { className: "value" }, [text(value)])])));
      const passed = dashboard.eval.passed === dashboard.eval.total;
      document.querySelector("#eval-summary").replaceChildren(text((passed ? "PASS" : "FAIL") + " · " + dashboard.eval.passed + "/" + dashboard.eval.total + " cases · " + Math.round(dashboard.eval.passRate * 100) + "%"));
      document.querySelector("#eval-summary").className = passed ? "pass" : "warn";
      document.querySelector("#eval-failures").replaceChildren(...dashboard.eval.failures.map((failure) => el("li", {}, [text(failure.caseId + ": expected " + failure.expectedKind + ", predicted " + (failure.predictedKind || "none") + " — " + failure.reason)])));
      document.querySelector("#findings").replaceChildren(...dashboard.findings.map((finding) => {
        const proposal = finding.proposal;
        const action = proposal && (proposal.status === "pending" || proposal.status === "edited")
          ? el("span", {}, [el("button", { textContent: "Approve", onclick: (event) => review(proposal.id, "approve", event.currentTarget) })])
          : text(proposal ? proposal.status : "not proposed");
        return el("tr", {}, [
          el("td", {}, [text(finding.accountName)]),
          el("td", {}, [code(finding.kind)]),
          el("td", {}, [text(money(finding.estimatedRecoveryCents))]),
          el("td", {}, [text(proposal ? proposal.actionName : "—")]),
          el("td", {}, [action]),
        ]);
      }));
      document.querySelector("#audit").replaceChildren(...dashboard.audit.slice().reverse().map((event) => el("li", {}, [text(event.event + " · " + event.actor + " · " + event.createdAt)])));
    }
    const code = (value) => el("code", {}, [text(value)]);
    refresh().catch((error) => { document.body.append(el("p", { className: "warn" }, [text("Dashboard unavailable: " + error.message)])); });
  </script>
</body>
</html>`;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("request body must be valid JSON");
  }
}

async function buildQueue(findings: Finding[], options: ReviewQueueOptions = {}): Promise<ReviewQueue> {
  const provider = createProposalProvider();
  const results = await Promise.all(findings.map((finding) => proposeFinding(finding, provider)));
  const proposals: Proposal[] = [];
  for (const result of results) {
    if (!result.ok) throw new Error(result.error.message);
    proposals.push(result.data);
  }
  return new ReviewQueue(proposals, options);
}

export type ReconcilerServerOptions = {
  dataset?: BillingDataset;
  database?: Client;
  persist?: boolean;
};
export async function createReconcilerServer(
  input: BillingDataset | ReconcilerServerOptions = {},
): Promise<Server> {
  const hasDatasetShape = "accounts" in input;
  const options: ReconcilerServerOptions = hasDatasetShape
    ? { dataset: input as BillingDataset, persist: false }
    : input;
  const persist = options.persist ?? true;
  const client = persist ? options.database ?? createReconcilerDatabase() : null;
  let persisted = client && !options.dataset ? await loadReconcilerState(client) : null;
  let dataset = options.dataset ?? persisted?.dataset ?? generateBillingDataset();
  let findings = persisted?.findings.length ? persisted.findings : detectDiscrepancies(dataset);
  let billingState = new BillingState(dataset, findings);
  let queue = persisted?.proposals.length
    ? new ReviewQueue(persisted.proposals, {
      applyBillingAction: (action) => billingState.apply(action),
      initialState: {
        proposals: persisted.proposals,
        reviews: persisted.reviews,
        auditLog: persisted.auditEvents,
        appliedBillingActions: persisted.billingActions,
      },
    })
    : await buildQueue(findings, { applyBillingAction: (action) => billingState.apply(action) });
  let revision = persisted?.revision ?? "";
  let reviewAction = createReviewAction(queue);
  const proposalAction = createProposalAction(createProposalProvider());
  let findingsByKind: Record<string, number> = {};
  let findingById = new Map<string, Finding>();

  const rebuildIndexes = (): void => {
    findingsByKind = {};
    for (const finding of findings) {
      findingsByKind[finding.kind] = (findingsByKind[finding.kind] ?? 0) + 1;
    }
    findingById = new Map(findings.map((finding) => [finding.id, finding]));
  };
  rebuildIndexes();

  const persistCurrent = async (): Promise<void> => {
    if (!client) return;
    revision = await saveReconcilerState(client, {
      revision,
      dataset,
      findings,
      proposals: queue.listProposals(),
      reviews: queue.listReviews(),
      auditEvents: queue.getAuditLog(),
      billingActions: queue.getAppliedBillingActions(),
    });
  };

  if (client && (!persisted || persisted.proposals.length === 0)) await persistCurrent();

  const refreshFromDatabase = async (): Promise<void> => {
    if (!client) return;
    const next = await loadReconcilerState(client);
    if (!next || next.revision === revision) return;
    persisted = next;
    dataset = next.dataset;
    findings = next.findings.length ? next.findings : detectDiscrepancies(dataset);
    billingState = new BillingState(dataset, findings);
    if (next.proposals.length > 0) {
      queue = new ReviewQueue(next.proposals, {
        applyBillingAction: (action) => billingState.apply(action),
        initialState: {
          proposals: next.proposals,
          reviews: next.reviews,
          auditLog: next.auditEvents,
          appliedBillingActions: next.billingActions,
        },
      });
    } else {
      queue = await buildQueue(findings, { applyBillingAction: (action) => billingState.apply(action) });
    }
    reviewAction = createReviewAction(queue);
    revision = next.revision;
    rebuildIndexes();
    if (next.proposals.length === 0) await persistCurrent();
  };

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      await refreshFromDatabase();
    } catch (error) {
      sendJson(response, 503, { error: error instanceof Error ? error.message : "persistence_unavailable" });
      return;
    }
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET") {
      if (path === "/") {
        sendHtml(response, 200, renderIndex());
        return;
      }
      if (path === "/health") {
        sendJson(response, 200, { ok: true, service: "reconciler", persistent: Boolean(client) });
        return;
      }
      if (path === "/api/dashboard") {
        sendJson(response, 200, buildDashboardState(dataset, findings, queue));
        return;
      }
      if (path === "/api/summary") {
        const proposals = queue.listProposals();
        sendJson(response, 200, {
          seed: dataset.seed,
          accountCount: dataset.accounts.length,
          invoiceCount: dataset.invoices.length,
          findingCount: findings.length,
          findingsByKind,
          pendingProposalCount: proposals.filter((proposal) => proposal.status === "pending" || proposal.status === "edited").length,
          appliedBillingActionCount: queue.getAppliedBillingActions().length,
        });
        return;
      }
      if (path === "/api/findings") {
        sendJson(response, 200, findings);
        return;
      }
      if (path === "/api/invoices") {
        sendJson(response, 200, dataset.invoices);
        return;
      }
      if (path === "/api/proposals") {
        sendJson(response, 200, queue.listProposals());
        return;
      }
      if (path === "/api/reviews") {
        sendJson(response, 200, queue.listReviews());
        return;
      }
      if (path === "/api/audit") {
        sendJson(response, 200, queue.getAuditLog());
        return;
      }
      if (path === "/api/billing-actions") {
        sendJson(response, 200, queue.getAppliedBillingActions());
        return;
      }
    }
    if (request.method === "POST" && path === "/api/proposals") {
      try {
        const body = await readJsonBody(request);
        const requestedFindingId = body && typeof body === "object" && "findingId" in body
          && typeof (body as Record<string, unknown>).findingId === "string"
          ? (body as Record<string, string>).findingId
          : null;
        if (!requestedFindingId) {
          sendJson(response, 400, { error: "findingId is required" });
          return;
        }
        const finding = findingById.get(requestedFindingId);
        if (!finding) {
          sendJson(response, 404, { error: "unknown_finding" });
          return;
        }
        const existing = queue.listProposals().find((proposal) => proposal.findingId === finding.id);
        if (existing) {
          sendJson(response, 200, existing);
          return;
        }
        const proposal = await proposalAction.run({
          findingId: finding.id,
          accountId: finding.accountId,
          kind: finding.kind,
          evidence: finding.evidence,
          estimatedRecoveryCents: finding.estimatedRecoveryCents,
          detectedAt: finding.detectedAt,
        }, {});
        const created = queue.addProposal(proposal);
        await persistCurrent();
        sendJson(response, 201, created);
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "proposal_failed" });
      }
      return;
    }
    if (request.method === "POST" && path === "/api/reviews") {
      try {
        const parsed = reviewAction.schema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
          sendJson(response, 400, { error: "validation_error", details: parsed.error.issues });
          return;
        }
        const result = await reviewAction.run(parsed.data, {});
        await persistCurrent();
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, { error: error instanceof Error ? error.message : "review_failed" });
      }
      return;
    }
    if (request.method !== "GET" && request.method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });
  if (client && !options.database) {
    server.on("close", () => client.close());
  }
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 3000);
  createReconcilerServer()
    .then((server) => server.listen(port, "0.0.0.0", () => {
      console.log(`Reconciler listening on http://localhost:${port}`);
    }))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Reconciler failed to start");
      process.exitCode = 1;
    });
}
