export const DISCREPANCY_KINDS = [
  "unbilled_seats",
  "stale_rate",
  "duplicate_line_item",
  "missing_true_up",
  "agreement_invoice_drift",
] as const;

export type DiscrepancyKind = (typeof DISCREPANCY_KINDS)[number];
export type FindingStatus = "open" | "resolved" | "rejected";
export type ProposalStatus = "pending" | "approved" | "edited" | "rejected";
export type ReviewDecision = "approve" | "edit" | "reject";

export type Account = {
  id: string;
  name: string;
  plan: string;
  monthlyRateCents: number;
  createdAt: string;
};

export type Agreement = {
  id: string;
  accountId: string;
  includedSeats: number;
  rateCents: number;
  trueUpRequired: boolean;
  trueUpRateCents: number;
  startsOn: string;
  endsOn: string;
};

export type UsageRecord = {
  id: string;
  accountId: string;
  month: string;
  seatsUsed: number;
};

export type Invoice = {
  id: string;
  accountId: string;
  month: string;
  totalCents: number;
};

export type InvoiceLine = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitRateCents: number;
  amountCents: number;
};
export type BillingDataset = {
  seed: number;
  generatedAt: string;
  months: string[];
  accounts: Account[];
  agreements: Agreement[];
  usageRecords: UsageRecord[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  groundTruth: GroundTruthCase[];
};

export type SeedOptions = {
  seed?: number;
  accountCount?: number;
  months?: string[];
};


export type Finding = {
  id: string;
  accountId: string;
  kind: DiscrepancyKind;
  severity: "high" | "medium";
  status: FindingStatus;
  evidence: Record<string, unknown>;
  estimatedRecoveryCents: number;
  detectedAt: string;
};

export type Proposal = {
  id: string;
  findingId: string;
  actionName: string;
  payload: Record<string, unknown>;
  rationale: string;
  provider: "canned" | "live";
  status: ProposalStatus;
  createdAt: string;
};

export type Review = {
  id: string;
  proposalId: string;
  decision: ReviewDecision;
  editedPayload: Record<string, unknown> | null;
  reviewer: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  findingId: string;
  proposalId: string;
  event: "proposal_created" | "review_approved" | "review_edited" | "review_rejected";
  payload: Record<string, unknown>;
  actor: string;
  createdAt: string;
};

export type GroundTruthCase = {
  id: string;
  accountId: string;
  kind: DiscrepancyKind;
  details: Record<string, unknown>;
};

export type DashboardState = {
  generatedAt: string;
  accountCount: number;
  invoiceCount: number;
  openFindingCount: number;
  pendingProposalCount: number;
  recoveredRevenueCents: number;
  estimatedRecoveryCents: number;
  findingsByKind: Array<{ kind: DiscrepancyKind; count: number; open: number; recoveredCents: number }>;
  queueBurndown: Array<{ status: string; count: number }>;
  eval: EvalSummary;
  findings: Array<Finding & { accountName: string; proposal: Proposal | null }>;
  audit: AuditEvent[];
};

export type EvalCaseResult = {
  caseId: string;
  expectedKind: DiscrepancyKind;
  predictedKind: DiscrepancyKind | null;
  passed: boolean;
  reason: string;
};

export type EvalSummary = {
  passRate: number;
  passed: number;
  total: number;
  failures: EvalCaseResult[];
};
