import { describe, expect, it } from "vitest";
import { BillingState } from "./state.js";
import { detectDiscrepancies } from "../findings/detectors.js";
import { createProposalProvider, proposeFinding } from "../proposals/provider.js";
import { ReviewQueue } from "../review/queue.js";
import { generateBillingDataset } from "../seed/generator.js";

describe("BillingState", () => {
  it("mutates the invoice and resolves the finding only after approval", async () => {
    const dataset = generateBillingDataset({ seed: 20260713 });
    const findings = detectDiscrepancies(dataset);
    const finding = findings.find((entry) => entry.kind === "missing_true_up");
    if (!finding) throw new Error("expected planted finding");
    const proposalResult = await proposeFinding(finding, createProposalProvider({}));
    if (!proposalResult.ok) throw new Error(proposalResult.error.message);
    const invoice = dataset.invoices.find((entry) => entry.id === "inv-004-2026-01");
    if (!invoice) throw new Error("expected planted invoice");
    const beforeTotal = invoice.totalCents;
    const beforeLineCount = dataset.invoiceLines.filter((line) => line.invoiceId === invoice.id).length;
    const billingState = new BillingState(dataset, findings);
    const queue = new ReviewQueue([proposalResult.data], {
      now: () => "2026-01-02T00:00:00.000Z",
      applyBillingAction: (action) => billingState.apply(action),
    });

    queue.review({ proposalId: proposalResult.data.id, decision: "edit", editedPayload: proposalResult.data.payload, reviewer: "human" });
    expect(invoice.totalCents).toBe(beforeTotal);
    expect(finding.status).toBe("open");

    queue.review({ proposalId: proposalResult.data.id, decision: "approve", reviewer: "human" });

    expect(invoice.totalCents).toBe(beforeTotal + 5960);
    expect(dataset.invoiceLines.filter((line) => line.invoiceId === invoice.id)).toHaveLength(beforeLineCount + 1);
    expect(finding.status).toBe("resolved");
  });
});
