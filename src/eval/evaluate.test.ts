import { describe, expect, it } from "vitest";
import { detectDiscrepancies } from "../findings/detectors.js";
import { createProposalProvider, proposeFinding } from "../proposals/provider.js";
import { generateBillingDataset } from "../seed/generator.js";
import { evaluateProposals } from "./evaluate.js";

describe("evaluateProposals", () => {
  it("passes every planted case for deterministic canned proposals", async () => {
    const dataset = generateBillingDataset({ seed: 20260713 });
    const findings = detectDiscrepancies(dataset);
    const provider = createProposalProvider({});
    const proposals = [];
    for (const finding of findings) {
      const result = await proposeFinding(finding, provider);
      if (!result.ok) throw new Error(result.error.message);
      proposals.push(result.data);
    }

    expect(evaluateProposals(dataset, findings, proposals)).toEqual({
      passRate: 1,
      passed: 5,
      total: 5,
      failures: [],
    });
  });

  it("reports a failure when a proposal predicts the wrong class", async () => {
    const dataset = generateBillingDataset({ seed: 20260713 });
    const findings = detectDiscrepancies(dataset);
    const provider = createProposalProvider({});
    const proposals = [];
    for (const finding of findings) {
      const result = await proposeFinding(finding, provider);
      if (!result.ok) throw new Error(result.error.message);
      proposals.push(result.data);
    }
    const firstProposal = proposals[0];
    if (!firstProposal) throw new Error("expected a proposal");
    firstProposal.payload.discrepancyKind = "stale_rate";

    const summary = evaluateProposals(dataset, findings, proposals);

    expect(summary.passRate).toBe(0.8);
    expect(summary.passed).toBe(4);
    expect(summary.failures).toHaveLength(1);
  });
});
