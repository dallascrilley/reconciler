import { DISCREPANCY_KINDS, type BillingDataset, type DiscrepancyKind, type EvalCaseResult, type EvalSummary, type Finding, type Proposal } from "../domain/types.js";

function readPredictedKind(proposal: Proposal | undefined): DiscrepancyKind | null {
  const value = proposal?.payload.discrepancyKind;
  return typeof value === "string" && (DISCREPANCY_KINDS as readonly string[]).includes(value)
    ? value as DiscrepancyKind
    : null;
}

export function evaluateProposals(
  dataset: BillingDataset,
  findings: Finding[],
  proposals: Proposal[],
): EvalSummary {
  const proposalByFinding = new Map(proposals.map((proposal) => [proposal.findingId, proposal]));
  const results: EvalCaseResult[] = dataset.groundTruth.map((expected) => {
    const finding = findings.find((candidate) =>
      candidate.accountId === expected.accountId && candidate.kind === expected.kind,
    );
    const proposal = finding ? proposalByFinding.get(finding.id) : undefined;
    const predictedKind = readPredictedKind(proposal);
    const passed = predictedKind === expected.kind;
    return {
      caseId: expected.id,
      expectedKind: expected.kind,
      predictedKind,
      passed,
      reason: passed
        ? "Proposal targets the detected ground-truth discrepancy class."
        : predictedKind
          ? `Proposal predicted ${predictedKind}; expected ${expected.kind}.`
          : "Proposal did not include a recognized discrepancy kind.",
    };
  });
  const passed = results.filter((result) => result.passed).length;
  return {
    passRate: results.length === 0 ? 1 : passed / results.length,
    passed,
    total: results.length,
    failures: results.filter((result) => !result.passed),
  };
}
