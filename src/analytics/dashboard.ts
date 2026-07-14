import type { BillingDataset, DashboardState, Finding } from "../domain/types.js";
import { evaluateProposals } from "../eval/evaluate.js";
import { executeQuery, type QueryResult } from "../../vendor/catalog/primitive-staged-dataset-query/src/staged-dataset-query.js";
import type { ReviewQueue } from "../review/queue.js";

function aggregateValue(result: QueryResult, field: string): number {
  const value = result.rows[0]?.[field];
  return typeof value === "number" ? value : 0;
}

export function buildDashboardState(dataset: BillingDataset, findings: Finding[], queue: ReviewQueue): DashboardState {
  const proposals = queue.listProposals();
  const proposalsByFinding = new Map(proposals.map((proposal) => [proposal.findingId, proposal]));
  const appliedFindingIds = new Set(queue.getAppliedBillingActions().map((action) => action.findingId));
  const accountsById = new Map(dataset.accounts.map((account) => [account.id, account]));
  const findingRows = findings.map((finding) => ({
    ...finding,
    recovered: appliedFindingIds.has(finding.id),
  }));

  const recoveredRevenueCents = aggregateValue(
    executeQuery(findingRows, {
      filters: [{ column: "recovered", op: "equals", value: true }],
      aggregates: [{ column: "estimatedRecoveryCents", op: "sum", as: "recoveredRevenueCents" }],
    }),
    "recoveredRevenueCents",
  );
  const estimatedRecoveryCents = aggregateValue(
    executeQuery(findingRows, {
      aggregates: [{ column: "estimatedRecoveryCents", op: "sum", as: "estimatedRecoveryCents" }],
    }),
    "estimatedRecoveryCents",
  );
  const findingsByKindRows = executeQuery(findingRows, {
    groupBy: ["kind"],
    aggregates: [
      { column: "kind", op: "count", as: "count" },
      { column: "estimatedRecoveryCents", op: "sum", as: "estimatedRecoveryCents" },
    ],
    orderBy: [{ column: "kind" }],
  }).rows;
  const queueRows = executeQuery(proposals, {
    groupBy: ["status"],
    aggregates: [{ column: "status", op: "count", as: "count" }],
    orderBy: [{ column: "status" }],
  }).rows;
  const pendingProposalCount = proposals.filter((proposal) =>
    proposal.status === "pending" || proposal.status === "edited",
  ).length;

  return {
    generatedAt: dataset.generatedAt,
    accountCount: dataset.accounts.length,
    invoiceCount: dataset.invoices.length,
    openFindingCount: findings.filter((finding) => !appliedFindingIds.has(finding.id)).length,
    pendingProposalCount,
    recoveredRevenueCents,
    estimatedRecoveryCents,
    findingsByKind: findingsByKindRows.map((row) => ({
      kind: row.kind as DashboardState["findingsByKind"][number]["kind"],
      count: typeof row.count === "number" ? row.count : 0,
      open: findings.filter((finding) => finding.kind === row.kind && !appliedFindingIds.has(finding.id)).length,
      recoveredCents: findings
        .filter((finding) => finding.kind === row.kind && appliedFindingIds.has(finding.id))
        .reduce((total, finding) => total + finding.estimatedRecoveryCents, 0),
    })),
    queueBurndown: queueRows.map((row) => ({
      status: String(row.status),
      count: typeof row.count === "number" ? row.count : 0,
    })),
    eval: evaluateProposals(dataset, findings, proposals),
    findings: findings.map((finding) => ({
      ...finding,
      status: appliedFindingIds.has(finding.id) ? "resolved" : finding.status,
      accountName: accountsById.get(finding.accountId)?.name ?? finding.accountId,
      proposal: proposalsByFinding.get(finding.id) ?? null,
    })),
    audit: queue.getAuditLog(),
  };
}
