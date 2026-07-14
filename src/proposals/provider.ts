import { z } from "zod";
import type { ActionContract, ActionResult } from "../../vendor/catalog/pattern-action-contract/src/action-contract.js";
import { runSafe } from "../../vendor/catalog/pattern-action-contract/src/action-contract.js";
import type { ProviderCatalogEntry } from "../../vendor/catalog/pattern-provider-escape-hatch/src/provider-contract.js";
import type { DiscrepancyKind, Finding, Proposal } from "../domain/types.js";

export const ACTION_BY_KIND: Record<DiscrepancyKind, string> = {
  unbilled_seats: "create_unbilled_seat_adjustment",
  stale_rate: "correct_invoice_rate",
  duplicate_line_item: "remove_duplicate_line_item",
  missing_true_up: "create_missing_true_up",
  agreement_invoice_drift: "reconcile_agreement_invoice_quantity",
};

const PROPOSAL_INPUT_SCHEMA = z.object({
  findingId: z.string().min(1),
  accountId: z.string().min(1),
  kind: z.enum([
    "unbilled_seats",
    "stale_rate",
    "duplicate_line_item",
    "missing_true_up",
    "agreement_invoice_drift",
  ]),
  evidence: z.record(z.string(), z.unknown()),
  estimatedRecoveryCents: z.number().int().nonnegative(),
  detectedAt: z.string().datetime(),
});

type ProposalInput = z.infer<typeof PROPOSAL_INPUT_SCHEMA>;

export type ProposalPayload = {
  findingId: string;
  accountId: string;
  discrepancyKind: DiscrepancyKind;
  evidence: Record<string, unknown>;
  estimatedRecoveryCents: number;
};

const PROPOSAL_PAYLOAD_SCHEMA = z.object({
  findingId: z.string().min(1),
  accountId: z.string().min(1),
  discrepancyKind: z.enum([
    "unbilled_seats",
    "stale_rate",
    "duplicate_line_item",
    "missing_true_up",
    "agreement_invoice_drift",
  ]),
  evidence: z.record(z.string(), z.unknown()),
  estimatedRecoveryCents: z.number().int().nonnegative(),
});

const COMMON_EVIDENCE_SCHEMA = {
  month: z.string().regex(/^\d{4}-\d{2}$/),
  agreementId: z.string().min(1),
  invoiceId: z.string().min(1),
  usageRecordId: z.string().min(1),
};

const EVIDENCE_SCHEMAS = {
  create_unbilled_seat_adjustment: z.object({
    ...COMMON_EVIDENCE_SCHEMA,
    excessSeats: z.number().int().positive(),
    expectedChargeCents: z.number().int().nonnegative(),
  }),
  create_missing_true_up: z.object({
    ...COMMON_EVIDENCE_SCHEMA,
    excessSeats: z.number().int().positive(),
    expectedChargeCents: z.number().int().nonnegative(),
  }),
  correct_invoice_rate: z.object({
    ...COMMON_EVIDENCE_SCHEMA,
    invoiceLineId: z.string().min(1),
    expectedRateCents: z.number().int().positive(),
    invoicedRateCents: z.number().int().positive(),
  }),
  remove_duplicate_line_item: z.object({
    ...COMMON_EVIDENCE_SCHEMA,
    invoiceLineIds: z.array(z.string().min(1)).min(2),
  }),
  reconcile_agreement_invoice_quantity: z.object({
    ...COMMON_EVIDENCE_SCHEMA,
    invoiceLineId: z.string().min(1),
    agreementQuantity: z.number().int().positive(),
    invoicedQuantity: z.number().int().positive(),
  }),
} as const;

export type ProposalDraft = {
  actionName: string;
  payload: Record<string, unknown>;
  rationale: string;
  provider: Proposal["provider"];
};

export interface ProposalProvider {
  readonly id: Proposal["provider"];
  propose(input: ProposalInput): Promise<ProposalDraft>;
}

export function validateActionPayload(
  actionName: string,
  payload: unknown,
  expected?: { findingId: string; accountId: string; kind: DiscrepancyKind },
): ProposalPayload {
  const expectedKind = (Object.entries(ACTION_BY_KIND).find(([, name]) => name === actionName)?.[0] ?? null) as DiscrepancyKind | null;
  if (!expectedKind) throw new Error(`Unknown remediation action ${actionName}`);
  const parsed = PROPOSAL_PAYLOAD_SCHEMA.parse(payload);
  if (parsed.discrepancyKind !== expectedKind) {
    throw new Error(`Action ${actionName} does not match discrepancy kind ${parsed.discrepancyKind}`);
  }
  if (expected && (
    parsed.findingId !== expected.findingId ||
    parsed.accountId !== expected.accountId ||
    parsed.discrepancyKind !== expected.kind
  )) {
    throw new Error("Proposal payload does not match its finding");
  }
  const evidenceSchema = Object.entries(EVIDENCE_SCHEMAS).find(([name]) => name === actionName)?.[1];
  if (!evidenceSchema) throw new Error(`No evidence schema is registered for ${actionName}`);
  const evidence = evidenceSchema.parse(parsed.evidence) as Record<string, unknown>;
  return { ...parsed, evidence };
}

function validateDraft(input: ProposalInput, draft: ProposalDraft): ProposalDraft {
  const expectedActionName = ACTION_BY_KIND[input.kind];
  if (draft.actionName !== expectedActionName) {
    throw new Error(`Proposal action ${draft.actionName} does not match ${expectedActionName}`);
  }
  const payload = validateActionPayload(draft.actionName, draft.payload, {
    findingId: input.findingId,
    accountId: input.accountId,
    kind: input.kind,
  });
  return { ...draft, payload };
}

const PROVIDER_CATALOG: ProviderCatalogEntry = {
  id: "reconciler-proposal-provider",
  name: "Reconciler proposal provider",
  baseUrl: "https://api.openai.com",
  allowedHosts: ["api.openai.com"],
  auth: {
    type: "api-key",
    headerTemplate: { Authorization: "Bearer {RECONCILER_PROVIDER_API_KEY}" },
    notes: "Only used when a provider key is explicitly configured.",
  },
  endpoints: [
    {
      path: "/v1/chat/completions",
      method: "POST",
      summary: "Generate a remediation proposal for a detected finding.",
    },
  ],
};

export class CannedProposalProvider implements ProposalProvider {
  readonly id = "canned" as const;

  async propose(input: ProposalInput): Promise<ProposalDraft> {
    return validateDraft(input, {
      actionName: ACTION_BY_KIND[input.kind],
      payload: {
        findingId: input.findingId,
        accountId: input.accountId,
        discrepancyKind: input.kind,
        evidence: input.evidence,
        estimatedRecoveryCents: input.estimatedRecoveryCents,
      },
      rationale: `Canned remediation for ${input.kind}; verify the linked evidence before approval.`,
      provider: this.id,
    });
  }
}

export class LiveProposalProvider implements ProposalProvider {
  readonly id = "live" as const;
  private readonly apiKey: string;
  private readonly url: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(apiKey: string, options: { url?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}) {
    if (!apiKey.trim()) throw new Error("A non-empty provider API key is required");
    this.apiKey = apiKey;
    this.url = options.url ?? `${PROVIDER_CATALOG.baseUrl}${PROVIDER_CATALOG.endpoints[0]?.path ?? "/v1/chat/completions"}`;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) throw new Error("Provider timeout must be a positive integer");
  }

  async propose(input: ProposalInput): Promise<ProposalDraft> {
    const response = await this.fetcher(this.url, {
      method: "POST",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return only JSON with actionName, payload, and rationale. " +
              "Propose a remediation for the supplied deterministic billing finding; never claim it was applied.",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`Proposal provider request failed with status ${response.status}`);
    }
    const responseBody = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = responseBody.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Proposal provider returned no JSON content");
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("Proposal provider returned invalid JSON");
    }
    const result = z.object({
      actionName: z.string().min(1),
      payload: z.record(z.string(), z.unknown()),
      rationale: z.string().min(1),
    }).parse(parsed);
    return validateDraft(input, { ...result, provider: this.id });
  }
}

export function createProposalProvider(
  environment: Record<string, string | undefined> = process.env,
): ProposalProvider {
  const apiKey = environment.RECONCILER_PROVIDER_API_KEY;
  if (apiKey?.trim()) {
    return new LiveProposalProvider(apiKey, { url: environment.RECONCILER_PROVIDER_URL });
  }
  return new CannedProposalProvider();
}

export function createProposalAction(
  provider: ProposalProvider,
): ActionContract<typeof PROPOSAL_INPUT_SCHEMA, Proposal, Record<string, never>> {
  return {
    name: "propose-remediation",
    description: "Propose a typed remediation for a deterministic billing finding.",
    schema: PROPOSAL_INPUT_SCHEMA,
    readOnly: true,
    http: { method: "POST", path: "/api/proposals" },
    async run(input) {
      const draft = validateDraft(input, await provider.propose(input));
      return {
        id: `proposal-${input.findingId}`,
        findingId: input.findingId,
        actionName: draft.actionName,
        payload: draft.payload,
        rationale: draft.rationale,
        provider: draft.provider,
        status: "pending",
        createdAt: input.detectedAt,
      };
    },
  };
}

export async function proposeFinding(
  finding: Finding,
  provider: ProposalProvider = createProposalProvider(),
): Promise<ActionResult<Proposal>> {
  const action = createProposalAction(provider);
  return runSafe(() => action.run({
    findingId: finding.id,
    accountId: finding.accountId,
    kind: finding.kind,
    evidence: finding.evidence,
    estimatedRecoveryCents: finding.estimatedRecoveryCents,
    detectedAt: finding.detectedAt,
  }, {}));
}
