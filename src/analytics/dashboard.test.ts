import { describe, expect, it } from "vitest";
import { buildDashboardState } from "./dashboard.js";
import { detectDiscrepancies } from "../findings/detectors.js";
import { createProposalProvider, proposeFinding } from "../proposals/provider.js";
import { ReviewQueue } from "../review/queue.js";
import { generateBillingDataset } from "../seed/generator.js";

describe("buildDashboardState", () => {
  it("renders eval, recovered revenue, class breakdown, and queue burndown", async () => {
    const dataset = generateBillingDataset({ seed: 20260713 });
    const findings = detectDiscrepancies(dataset);
    const proposals = [];
    for (const finding of findings) {
      const result = await proposeFinding(finding, createProposalProvider({}));
      if (!result.ok) throw new Error(result.error.message);
      proposals.push(result.data);
    }
    const queue = new ReviewQueue(proposals, { now: () => "2026-01-02T00:00:00.000Z" });

    const initial = buildDashboardState(dataset, findings, queue);
    expect(initial.eval).toMatchObject({ passRate: 1, passed: 5, total: 5 });
    expect(initial.recoveredRevenueCents).toBe(0);
    expect(initial.findingsByKind).toHaveLength(5);
    expect(initial.queueBurndown).toEqual([{ status: "pending", count: 5 }]);

    const firstProposal = proposals[0];
    if (!firstProposal) throw new Error("expected a proposal");
    queue.review({
      proposalId: firstProposal.id,
      decision: "approve",
      reviewer: "reviewer@example.com",
    });

    const afterApproval = buildDashboardState(dataset, findings, queue);
    expect(afterApproval.recoveredRevenueCents).toBeGreaterThan(0);
    expect(afterApproval.pendingProposalCount).toBe(4);
    expect(afterApproval.queueBurndown).toEqual([
      { status: "approved", count: 1 },
      { status: "pending", count: 4 },
    ]);
    expect(afterApproval.findings.find((finding) => finding.id === firstProposal.findingId)?.status).toBe("resolved");
  });
});
