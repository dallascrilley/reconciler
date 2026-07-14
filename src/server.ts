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
import { generateBillingDataset } from "./seed/generator.js";

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
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

export async function createReconcilerServer(
  dataset: BillingDataset = generateBillingDataset(),
): Promise<Server> {
  const findings = detectDiscrepancies(dataset);
  const billingState = new BillingState(dataset, findings);
  const queue = await buildQueue(findings, { applyBillingAction: (action) => billingState.apply(action) });
  const proposalAction = createProposalAction(createProposalProvider());
  const reviewAction = createReviewAction(queue);
  const findingsByKind: Record<string, number> = {};
  for (const finding of findings) {
    findingsByKind[finding.kind] = (findingsByKind[finding.kind] ?? 0) + 1;
  }

  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "GET") {
      if (path === "/health") {
        sendJson(response, 200, { ok: true, service: "reconciler" });
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
        const parsed = proposalAction.schema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
          sendJson(response, 400, { error: "validation_error", details: parsed.error.issues });
          return;
        }
        const proposal = await proposalAction.run(parsed.data, {});
        sendJson(response, 201, queue.addProposal(proposal));
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
        sendJson(response, 200, await reviewAction.run(parsed.data, {}));
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
