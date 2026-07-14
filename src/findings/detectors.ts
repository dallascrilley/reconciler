import type {
  Agreement,
  BillingDataset,
  Finding,
  Invoice,
  InvoiceLine,
  UsageRecord,
} from "../domain/types.js";

function indexBy<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function lineMapByInvoice(lines: InvoiceLine[]): Map<string, InvoiceLine[]> {
  const result = new Map<string, InvoiceLine[]>();
  for (const line of lines) {
    const invoiceLines = result.get(line.invoiceId) ?? [];
    invoiceLines.push(line);
    result.set(line.invoiceId, invoiceLines);
  }
  return result;
}

function usageMapByAccountMonth(rows: UsageRecord[]): Map<string, UsageRecord> {
  return new Map(rows.map((row) => [`${row.accountId}:${row.month}`, row]));
}

function findingBase(
  dataset: BillingDataset,
  invoice: Invoice,
  agreement: Agreement,
  usage: UsageRecord,
  kind: Finding["kind"],
  evidence: Record<string, unknown>,
  estimatedRecoveryCents: number,
): Finding {
  return {
    id: `finding-${kind}-${invoice.accountId}-${invoice.month}`,
    accountId: invoice.accountId,
    kind,
    severity: kind === "stale_rate" ? "medium" : "high",
    status: "open",
    evidence: {
      agreementId: agreement.id,
      invoiceId: invoice.id,
      usageRecordId: usage.id,
      month: invoice.month,
      ...evidence,
    },
    estimatedRecoveryCents: Math.max(0, estimatedRecoveryCents),
    detectedAt: dataset.generatedAt,
  };
}

function findDuplicateContractedLines(lines: InvoiceLine[]): InvoiceLine[] {
  const contracted = lines.filter((line) => line.description === "Contracted seats");
  const duplicateGroups = new Map<string, InvoiceLine[]>();
  for (const line of contracted) {
    const key = `${line.quantity}:${line.unitRateCents}:${line.amountCents}`;
    const group = duplicateGroups.get(key) ?? [];
    group.push(line);
    duplicateGroups.set(key, group);
  }
  return [...duplicateGroups.values()].find((group) => group.length > 1) ?? [];
}

/**
 * Detect every known discrepancy class from the synthetic billing corpus.
 * Detection is deterministic and does not consult providers or mutate input.
 */
export function detectDiscrepancies(dataset: BillingDataset): Finding[] {
  const agreements = new Map(dataset.agreements.map((agreement) => [agreement.accountId, agreement]));
  const linesByInvoice = lineMapByInvoice(dataset.invoiceLines);
  const usageByAccountMonth = usageMapByAccountMonth(dataset.usageRecords);
  const findings: Finding[] = [];

  for (const invoice of dataset.invoices) {
    const agreement = agreements.get(invoice.accountId);
    const usage = usageByAccountMonth.get(`${invoice.accountId}:${invoice.month}`);
    const lines = linesByInvoice.get(invoice.id) ?? [];
    if (!agreement || !usage) continue;

    const contractedLines = lines.filter((line) => line.description === "Contracted seats");
    const baseLine = contractedLines[0];
    const trueUpLines = lines.filter((line) => line.description === "True-up seats");
    if (!baseLine) continue;

    const duplicateLines = findDuplicateContractedLines(lines);
    if (duplicateLines.length > 1) {
      findings.push(
        findingBase(
          dataset,
          invoice,
          agreement,
          usage,
          "duplicate_line_item",
          { invoiceLineIds: duplicateLines.map((line) => line.id) },
          duplicateLines.slice(1).reduce((total, line) => total + line.amountCents, 0),
        ),
      );
    }

    if (baseLine.unitRateCents !== agreement.rateCents) {
      findings.push(
        findingBase(
          dataset,
          invoice,
          agreement,
          usage,
          "stale_rate",
          {
            invoiceLineId: baseLine.id,
            expectedRateCents: agreement.rateCents,
            invoicedRateCents: baseLine.unitRateCents,
          },
          (agreement.rateCents - baseLine.unitRateCents) * baseLine.quantity,
        ),
      );
    }

    if (baseLine.quantity !== agreement.includedSeats) {
      findings.push(
        findingBase(
          dataset,
          invoice,
          agreement,
          usage,
          "agreement_invoice_drift",
          {
            invoiceLineId: baseLine.id,
            agreementQuantity: agreement.includedSeats,
            invoicedQuantity: baseLine.quantity,
          },
          (agreement.includedSeats - baseLine.quantity) * agreement.rateCents,
        ),
      );
    }

    const excessSeats = usage.seatsUsed - agreement.includedSeats;
    if (excessSeats > 0 && trueUpLines.length === 0) {
      const kind = agreement.trueUpRequired ? "missing_true_up" : "unbilled_seats";
      findings.push(
        findingBase(
          dataset,
          invoice,
          agreement,
          usage,
          kind,
          {
            excessSeats,
            expectedChargeCents: excessSeats * agreement.trueUpRateCents,
          },
          excessSeats * agreement.trueUpRateCents,
        ),
      );
    }
  }

  return findings.sort((left, right) => left.id.localeCompare(right.id));
}

export function findInvoiceForFinding(dataset: BillingDataset, finding: Finding): Invoice | undefined {
  return dataset.invoices.find((invoice) => invoice.id === finding.evidence.invoiceId);
}
