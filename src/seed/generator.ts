import type {
  Account,
  Agreement,
  BillingDataset,
  GroundTruthCase,
  Invoice,
  InvoiceLine,
  SeedOptions,
  UsageRecord,
} from "../domain/types.js";

export const DEFAULT_SEED = 20260713;
export const DEFAULT_ACCOUNT_COUNT = 202;
export const DEFAULT_MONTHS = ["2026-01", "2026-02", "2026-03"] as const;

const PLANTED_KINDS = [
  "unbilled_seats",
  "stale_rate",
  "duplicate_line_item",
  "missing_true_up",
  "agreement_invoice_drift",
] as const;

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}


function assertSeedOptions(options: Required<SeedOptions>): void {
  if (!Number.isInteger(options.seed) || options.seed < 0) {
    throw new Error("seed must be a non-negative integer");
  }
  if (!Number.isInteger(options.accountCount) || options.accountCount < PLANTED_KINDS.length) {
    throw new Error(`accountCount must be at least ${PLANTED_KINDS.length}`);
  }
  if (options.months.length === 0 || options.months.some((month) => !/^\d{4}-\d{2}$/.test(month))) {
    throw new Error("months must contain at least one YYYY-MM value");
  }
}


/**
 * Build the complete synthetic billing corpus used by the public Reconciler demo.
 * The output is pure for a given seed and options; no wall-clock values or I/O
 * participate in generation.
 */
export function generateBillingDataset(input: SeedOptions = {}): BillingDataset {
  const options: Required<SeedOptions> = {
    seed: input.seed ?? DEFAULT_SEED,
    accountCount: input.accountCount ?? DEFAULT_ACCOUNT_COUNT,
    months: [...(input.months ?? DEFAULT_MONTHS)],
  };
  assertSeedOptions(options);

  const random = new SeededRandom(options.seed);
  const generatedAt = "2026-01-01T00:00:00.000Z";
  const accounts: Account[] = [];
  const agreements: Agreement[] = [];
  const usageRecords: UsageRecord[] = [];
  const invoices: Invoice[] = [];
  const invoiceLines: InvoiceLine[] = [];
  const groundTruth: GroundTruthCase[] = [];
  const primaryMonth = options.months[0];

  for (let index = 0; index < options.accountCount; index += 1) {
    const sequence = String(index + 1).padStart(3, "0");
    const accountId = `acct-${sequence}`;
    const plantedKind = PLANTED_KINDS[index] ?? null;
    const plan = ["core", "growth", "scale"][index % 3] ?? "core";
    const monthlyRateCents = 9000 + random.integer(0, 9000);
    const includedSeats = 5 + random.integer(0, 10);
    const trueUpRequired = plantedKind === "unbilled_seats"
      ? false
      : plantedKind === "missing_true_up"
        ? true
        : index % 2 === 0;
    const agreement: Agreement = {
      id: `agr-${sequence}`,
      accountId,
      includedSeats,
      rateCents: monthlyRateCents,
      trueUpRequired,
      trueUpRateCents: 1200 + random.integer(0, 800),
      startsOn: "2025-01-01",
      endsOn: "2026-12-31",
    };
    const account: Account = {
      id: accountId,
      name: `Synthetic Account ${sequence}`,
      plan,
      monthlyRateCents,
      createdAt: "2025-01-01T00:00:00.000Z",
    };

    accounts.push(account);
    agreements.push(agreement);

    for (const month of options.months) {
      const invoiceId = `inv-${sequence}-${month}`;
      const usageId = `usage-${sequence}-${month}`;
      const isPrimaryMonth = month === primaryMonth;
      const baselineSeats = Math.max(1, includedSeats - random.integer(0, 2));
      const seatsUsed = isPrimaryMonth && plantedKind === "unbilled_seats"
        ? includedSeats + 3
        : isPrimaryMonth && plantedKind === "missing_true_up"
          ? includedSeats + 4
          : baselineSeats;
      const usage: UsageRecord = { id: usageId, accountId, month, seatsUsed };
      usageRecords.push(usage);

      const baseQuantity = isPrimaryMonth && plantedKind === "agreement_invoice_drift"
        ? Math.max(1, includedSeats - 1)
        : includedSeats;
      const baseUnitRateCents = isPrimaryMonth && plantedKind === "stale_rate"
        ? Math.max(1, agreement.rateCents - 500)
        : agreement.rateCents;
      const lines: InvoiceLine[] = [
        {
          id: `line-${sequence}-${month}-base`,
          invoiceId,
          description: "Contracted seats",
          quantity: baseQuantity,
          unitRateCents: baseUnitRateCents,
          amountCents: Math.round(baseQuantity * baseUnitRateCents),
        },
      ];

      if (seatsUsed > includedSeats && agreement.trueUpRequired && plantedKind !== "missing_true_up") {
        const quantity = seatsUsed - includedSeats;
        lines.push({
          id: `line-${sequence}-${month}-true-up`,
          invoiceId,
          description: "True-up seats",
          quantity,
          unitRateCents: agreement.trueUpRateCents,
          amountCents: Math.round(quantity * agreement.trueUpRateCents),
        });
      }
      if (isPrimaryMonth && plantedKind === "duplicate_line_item") {
        lines.push({
          id: `line-${sequence}-${month}-duplicate`,
          invoiceId,
          description: "Contracted seats",
          quantity: includedSeats,
          unitRateCents: agreement.rateCents,
          amountCents: Math.round(includedSeats * agreement.rateCents),
        });
      }

      invoiceLines.push(...lines);
      const invoice: Invoice = {
        id: invoiceId,
        accountId,
        month,
        totalCents: lines.reduce((total, line) => total + line.amountCents, 0),
      };
      invoices.push(invoice);

      if (isPrimaryMonth && plantedKind) {
        const caseDetails: Record<string, unknown> = {
          month,
          agreementId: agreement.id,
          usageRecordId: usage.id,
          invoiceId,
        };
        if (plantedKind === "unbilled_seats" || plantedKind === "missing_true_up") {
          caseDetails.excessSeats = seatsUsed - includedSeats;
          caseDetails.expectedChargeCents = (seatsUsed - includedSeats) * agreement.trueUpRateCents;
        }
        if (plantedKind === "stale_rate") {
          caseDetails.expectedRateCents = agreement.rateCents;
          caseDetails.invoicedRateCents = baseUnitRateCents;
        }
        if (plantedKind === "duplicate_line_item") {
          caseDetails.duplicateLineIds = lines
            .filter((line) => line.description === "Contracted seats")
            .map((line) => line.id);
        }
        if (plantedKind === "agreement_invoice_drift") {
          caseDetails.agreementQuantity = includedSeats;
          caseDetails.invoicedQuantity = baseQuantity;
        }
        const groundTruthCase: GroundTruthCase = {
          id: `truth-${sequence}-${plantedKind}`,
          accountId,
          kind: plantedKind,
          details: caseDetails,
        };
        groundTruth.push(groundTruthCase);
      }
    }
  }

  return {
    seed: options.seed,
    generatedAt,
    months: options.months,
    accounts,
    agreements,
    usageRecords,
    invoices,
    invoiceLines,
    groundTruth,
  };
}

export function generateGroundTruthManifest(input: SeedOptions = {}): {
  seed: number;
  generatedAt: string;
  accountCount: number;
  months: string[];
  cases: GroundTruthCase[];
} {
  const dataset = generateBillingDataset(input);
  return {
    seed: dataset.seed,
    generatedAt: dataset.generatedAt,
    accountCount: dataset.accounts.length,
    months: dataset.months,
    cases: dataset.groundTruth,
  };
}
