import type { BillingDataset, Finding, Invoice, InvoiceLine } from "../domain/types.js";
import { validateActionPayload, type ProposalPayload } from "../proposals/provider.js";
import type { AppliedBillingAction } from "../review/queue.js";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Action evidence is missing ${field}`);
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`Action evidence has invalid ${field}`);
  return value as number;
}

function requiredStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 2 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`Action evidence has invalid ${field}`);
  }
  return value as string[];
}

const IMMUTABLE_EVIDENCE_FIELDS = [
  "month",
  "agreementId",
  "invoiceId",
  "usageRecordId",
  "invoiceLineId",
  "invoiceLineIds",
] as const;

function assertEvidenceBound(
  actionEvidence: Record<string, unknown>,
  canonicalEvidence: Record<string, unknown>,
): void {
  for (const field of IMMUTABLE_EVIDENCE_FIELDS) {
    if (canonicalEvidence[field] !== undefined && JSON.stringify(actionEvidence[field]) !== JSON.stringify(canonicalEvidence[field])) {
      throw new Error(`Action evidence ${field} does not match the detected finding`);
    }
  }
}

export class BillingState {
  constructor(
    private readonly dataset: BillingDataset,
    private readonly findings: Finding[],
  ) {}

  apply(action: AppliedBillingAction): void {
    const finding = this.findings.find((candidate) => candidate.id === action.findingId);
    if (!finding) throw new Error(`Cannot apply action for unknown finding ${action.findingId}`);
    const originalPayload = validateActionPayload(action.actionName, action.payload, {
      findingId: finding.id,
      accountId: finding.accountId,
      kind: finding.kind,
    });
    assertEvidenceBound(originalPayload.evidence, finding.evidence);
    const canonicalPayload: ProposalPayload = {
      ...originalPayload,
      evidence: finding.evidence,
    };
    const invoiceId = requiredString(canonicalPayload.evidence.invoiceId, "invoiceId");
    const invoice = this.dataset.invoices.find((candidate) => candidate.id === invoiceId);
    if (!invoice) throw new Error(`Cannot apply action to unknown invoice ${invoiceId}`);
    if (invoice.accountId !== finding.accountId) {
      throw new Error(`Invoice ${invoice.id} does not belong to finding account ${finding.accountId}`);
    }

    switch (action.actionName) {
      case "create_unbilled_seat_adjustment":
      case "create_missing_true_up":
        this.createTrueUpLine(invoice, canonicalPayload);
        break;
      case "correct_invoice_rate":
        this.correctInvoiceRate(invoice, canonicalPayload);
        break;
      case "remove_duplicate_line_item":
        this.removeDuplicateLine(invoice, canonicalPayload);
        break;
      case "reconcile_agreement_invoice_quantity":
        this.reconcileInvoiceQuantity(invoice, canonicalPayload);
        break;
      default:
        throw new Error(`Unsupported remediation action ${action.actionName}`);
    }
    finding.status = "resolved";
  }

  private createTrueUpLine(invoice: Invoice, payload: ProposalPayload): void {
    const agreementId = requiredString(payload.evidence.agreementId, "agreementId");
    const agreement = this.dataset.agreements.find((candidate) => candidate.id === agreementId);
    if (!agreement) throw new Error(`Cannot apply action to unknown agreement ${agreementId}`);
    if (agreement.accountId !== invoice.accountId) {
      throw new Error(`Agreement ${agreement.id} does not belong to invoice account ${invoice.accountId}`);
    }
    const quantity = requiredPositiveInteger(payload.evidence.excessSeats, "excessSeats");
    if (this.dataset.invoiceLines.some((line) => line.invoiceId === invoice.id && line.description === "True-up seats")) {
      throw new Error(`Invoice ${invoice.id} already has a true-up line`);
    }
    const line: InvoiceLine = {
      id: `line-${invoice.id}-approved-true-up`,
      invoiceId: invoice.id,
      description: "True-up seats",
      quantity,
      unitRateCents: agreement.trueUpRateCents,
      amountCents: quantity * agreement.trueUpRateCents,
    };
    this.dataset.invoiceLines.push(line);
    this.recomputeInvoice(invoice);
  }

  private correctInvoiceRate(invoice: Invoice, payload: ProposalPayload): void {
    const lineId = requiredString(payload.evidence.invoiceLineId, "invoiceLineId");
    const expectedRateCents = requiredPositiveInteger(payload.evidence.expectedRateCents, "expectedRateCents");
    const line = this.findInvoiceLine(invoice, lineId);
    line.unitRateCents = expectedRateCents;
    line.amountCents = line.quantity * line.unitRateCents;
    this.recomputeInvoice(invoice);
  }

  private removeDuplicateLine(invoice: Invoice, payload: ProposalPayload): void {
    const lineIds = requiredStringArray(payload.evidence.invoiceLineIds, "invoiceLineIds");
    const keepId = lineIds[0];
    const lines = this.dataset.invoiceLines.filter((line) => line.invoiceId === invoice.id && lineIds.includes(line.id));
    if (lines.length !== lineIds.length || !keepId) throw new Error(`Invoice ${invoice.id} is missing duplicate lines`);
    this.dataset.invoiceLines.splice(
      0,
      this.dataset.invoiceLines.length,
      ...this.dataset.invoiceLines.filter((line) => !lineIds.includes(line.id) || line.id === keepId),
    );
    this.recomputeInvoice(invoice);
  }

  private reconcileInvoiceQuantity(invoice: Invoice, payload: ProposalPayload): void {
    const lineId = requiredString(payload.evidence.invoiceLineId, "invoiceLineId");
    const agreementQuantity = requiredPositiveInteger(payload.evidence.agreementQuantity, "agreementQuantity");
    const line = this.findInvoiceLine(invoice, lineId);
    line.quantity = agreementQuantity;
    line.amountCents = line.quantity * line.unitRateCents;
    this.recomputeInvoice(invoice);
  }

  private findInvoiceLine(invoice: Invoice, lineId: string): InvoiceLine {
    const line = this.dataset.invoiceLines.find((candidate) => candidate.id === lineId && candidate.invoiceId === invoice.id);
    if (!line) throw new Error(`Invoice ${invoice.id} is missing line ${lineId}`);
    return line;
  }

  private recomputeInvoice(invoice: Invoice): void {
    invoice.totalCents = this.dataset.invoiceLines
      .filter((line) => line.invoiceId === invoice.id)
      .reduce((total, line) => total + line.amountCents, 0);
  }
}
