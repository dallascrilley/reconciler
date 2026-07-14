import { describe, expect, it } from "vitest";
import type { BillingDataset } from "../domain/types.js";
import { generateBillingDataset } from "../seed/generator.js";
import { detectDiscrepancies } from "./detectors.js";

describe("detectDiscrepancies", () => {
  it("recovers exactly the planted ground-truth cases", () => {
    const dataset = generateBillingDataset({ seed: 20260713 });
    const findings = detectDiscrepancies(dataset);

    expect(findings).toHaveLength(dataset.groundTruth.length);
    expect(findings.map((finding) => finding.kind).sort()).toEqual(
      dataset.groundTruth.map((entry) => entry.kind).sort(),
    );
    expect(findings.map((finding) => finding.accountId).sort()).toEqual([
      "acct-001",
      "acct-002",
      "acct-003",
      "acct-004",
      "acct-005",
    ]);
    expect(findings.every((finding) => finding.status === "open")).toBe(true);
    expect(findings.every((finding) => finding.detectedAt === dataset.generatedAt)).toBe(true);
  });

  it("does not report clean accounts", () => {
    const dataset = generateBillingDataset({ seed: 8, accountCount: 10 });
    const cleanAccountIds = new Set(dataset.accounts.slice(5).map((account) => account.id));
    const cleanDataset: BillingDataset = {
      ...dataset,
      accounts: dataset.accounts.filter((account) => cleanAccountIds.has(account.id)),
      agreements: dataset.agreements.filter((agreement) => cleanAccountIds.has(agreement.accountId)),
      usageRecords: dataset.usageRecords.filter((usage) => cleanAccountIds.has(usage.accountId)),
      invoices: dataset.invoices.filter((invoice) => cleanAccountIds.has(invoice.accountId)),
      invoiceLines: dataset.invoiceLines.filter((line) =>
        cleanDatasetInvoiceIds(dataset, cleanAccountIds).has(line.invoiceId),
      ),
      groundTruth: [],
    };

    expect(detectDiscrepancies(cleanDataset)).toEqual([]);
  });

  it("includes linked evidence and recovery estimates", () => {
    const dataset = generateBillingDataset({ seed: 44 });
    const findings = detectDiscrepancies(dataset);
    const missingTrueUp = findings.find((finding) => finding.kind === "missing_true_up");

    expect(missingTrueUp?.evidence).toMatchObject({
      agreementId: "agr-004",
      invoiceId: "inv-004-2026-01",
      usageRecordId: "usage-004-2026-01",
      excessSeats: 4,
    });
    expect(missingTrueUp?.estimatedRecoveryCents).toBeGreaterThan(0);
  });
});

function cleanDatasetInvoiceIds(dataset: BillingDataset, accountIds: Set<string>): Set<string> {
  return new Set(dataset.invoices
    .filter((invoice) => accountIds.has(invoice.accountId))
    .map((invoice) => invoice.id));
}
