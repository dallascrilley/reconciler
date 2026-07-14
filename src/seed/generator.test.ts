import { describe, expect, it } from "vitest";
import { DISCREPANCY_KINDS } from "../domain/types.js";
import {
  DEFAULT_ACCOUNT_COUNT,
  DEFAULT_SEED,
  generateBillingDataset,
  generateGroundTruthManifest,
} from "./generator.js";

describe("generateBillingDataset", () => {
  it("repeats the exact dataset and manifest for the same seed", () => {
    const first = generateBillingDataset({ seed: DEFAULT_SEED });
    const second = generateBillingDataset({ seed: DEFAULT_SEED });

    expect(first).toEqual(second);
    const firstManifest = generateGroundTruthManifest({ seed: DEFAULT_SEED });
    const secondManifest = generateGroundTruthManifest({ seed: DEFAULT_SEED });
    expect(firstManifest).toEqual(secondManifest);
  });

  it("generates the portfolio-sized corpus and one case per planted class", () => {
    const dataset = generateBillingDataset({ seed: DEFAULT_SEED });

    expect(dataset.accounts).toHaveLength(DEFAULT_ACCOUNT_COUNT);
    expect(dataset.agreements).toHaveLength(DEFAULT_ACCOUNT_COUNT);
    expect(dataset.usageRecords).toHaveLength(DEFAULT_ACCOUNT_COUNT * dataset.months.length);
    expect(dataset.invoices).toHaveLength(DEFAULT_ACCOUNT_COUNT * dataset.months.length);
    expect(dataset.groundTruth.map((entry) => entry.kind)).toEqual([...DISCREPANCY_KINDS]);
    expect(dataset.groundTruth.map((entry) => entry.accountId)).toEqual([
      "acct-001",
      "acct-002",
      "acct-003",
      "acct-004",
      "acct-005",
    ]);
    const missingTrueUp = dataset.groundTruth.find((entry) => entry.kind === "missing_true_up");
    const missingAgreement = dataset.agreements.find((agreement) => agreement.id === missingTrueUp?.details.agreementId);
    expect(missingAgreement?.trueUpRequired).toBe(true);
  });

  it("keeps invoice totals equal to their generated lines", () => {
    const dataset = generateBillingDataset({ seed: 77, accountCount: 12 });
    const linesByInvoice = new Map<string, number>();
    for (const line of dataset.invoiceLines) {
      linesByInvoice.set(line.invoiceId, (linesByInvoice.get(line.invoiceId) ?? 0) + line.amountCents);
    }

    for (const invoice of dataset.invoices) {
      expect(invoice.totalCents).toBe(linesByInvoice.get(invoice.id));
    }
  });

  it("changes seeded values when the seed changes", () => {
    const first = generateBillingDataset({ seed: 1, accountCount: 8 });
    const second = generateBillingDataset({ seed: 2, accountCount: 8 });

    expect(first.accounts[0]?.monthlyRateCents).not.toBe(second.accounts[0]?.monthlyRateCents);
    expect(JSON.stringify(first.groundTruth)).not.toBe(JSON.stringify(second.groundTruth));
  });
  it("rejects duplicate and impossible calendar months", () => {
    expect(() => generateBillingDataset({ months: ["2026-01", "2026-01"] })).toThrow(
      "months must contain unique YYYY-MM values",
    );
    expect(() => generateBillingDataset({ months: ["2026-13"] })).toThrow(
      "months must contain unique YYYY-MM values",
    );
  });
});
