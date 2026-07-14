import type { AuditEvent, DiscrepancyKind, Proposal, Review, ReviewDecision } from "../domain/types.js";
import { validateActionPayload } from "../proposals/provider.js";

export type AppliedBillingAction = {
  proposalId: string;
  findingId: string;
  actionName: string;
  payload: Record<string, unknown>;
  appliedAt: string;
  actor: string;
};

export type ReviewInput = {
  proposalId: string;
  decision: ReviewDecision;
  editedPayload?: Record<string, unknown> | null;
  reviewer: string;
};

export type ReviewResult = {
  proposal: Proposal;
  review: Review;
  appliedBillingAction: AppliedBillingAction | null;
};

export type ReviewQueueOptions = {
  now?: () => string;
  applyBillingAction?: (action: AppliedBillingAction) => void;
};

export class ReviewQueue {
  private readonly proposals = new Map<string, Proposal>();
  private readonly reviews: Review[] = [];
  private readonly auditLog: AuditEvent[] = [];
  private readonly appliedBillingActions: AppliedBillingAction[] = [];
  private readonly now: () => string;
  private readonly applyBillingAction?: (action: AppliedBillingAction) => void;

  constructor(proposals: Proposal[], options: ReviewQueueOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.applyBillingAction = options.applyBillingAction;
    for (const proposal of proposals) this.addProposal(proposal);
  }

  addProposal(proposal: Proposal): Proposal {
    if (this.proposals.has(proposal.id)) throw new Error(`Duplicate proposal ${proposal.id}`);
    validateActionPayload(proposal.actionName, proposal.payload, {
      findingId: proposal.findingId,
      accountId: String(proposal.payload.accountId),
      kind: proposal.payload.discrepancyKind as DiscrepancyKind,
    });
    this.proposals.set(proposal.id, structuredClone(proposal));
    this.auditLog.push({
      id: `audit-proposal-${proposal.id}`,
      findingId: proposal.findingId,
      proposalId: proposal.id,
      event: "proposal_created",
      payload: { actionName: proposal.actionName, provider: proposal.provider },
      actor: "proposal-provider",
      createdAt: proposal.createdAt,
    });
    return structuredClone(proposal);
  }

  getProposal(proposalId: string): Proposal {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Unknown proposal ${proposalId}`);
    return structuredClone(proposal);
  }

  listProposals(): Proposal[] {
    return structuredClone([...this.proposals.values()]);
  }

  listReviews(): Review[] {
    return structuredClone(this.reviews);
  }

  getAuditLog(): AuditEvent[] {
    return structuredClone(this.auditLog);
  }

  getAppliedBillingActions(): AppliedBillingAction[] {
    return structuredClone(this.appliedBillingActions);
  }

  review(input: ReviewInput): ReviewResult {
    if (!input.reviewer.trim()) throw new Error("reviewer is required");
    const proposal = this.proposals.get(input.proposalId);
    if (!proposal) throw new Error(`Unknown proposal ${input.proposalId}`);
    if (proposal.status === "approved" || proposal.status === "rejected") {
      throw new Error(`Proposal ${proposal.id} has already been ${proposal.status}`);
    }

    const originalPayload = validateActionPayload(proposal.actionName, proposal.payload, {
      findingId: proposal.findingId,
      accountId: String(proposal.payload.accountId),
      kind: proposal.payload.discrepancyKind as DiscrepancyKind,
    });
    let editedPayload: Record<string, unknown> | null = null;
    let effectivePayload: Record<string, unknown> = originalPayload;
    if (input.decision === "edit") {
      if (input.editedPayload === undefined || input.editedPayload === null) {
        throw new Error("editedPayload is required when editing a proposal");
      }
      editedPayload = validateActionPayload(proposal.actionName, input.editedPayload, {
        findingId: proposal.findingId,
        accountId: originalPayload.accountId,
        kind: originalPayload.discrepancyKind,
      });
      effectivePayload = editedPayload;
    } else {
      for (let index = this.reviews.length - 1; index >= 0; index -= 1) {
        const previousReview = this.reviews[index];
        if (previousReview?.proposalId === proposal.id && previousReview.decision === "edit") {
          editedPayload = previousReview.editedPayload;
          effectivePayload = editedPayload
            ? validateActionPayload(proposal.actionName, editedPayload, {
              findingId: proposal.findingId,
              accountId: originalPayload.accountId,
              kind: originalPayload.discrepancyKind,
            })
            : originalPayload;
          break;
        }
      }
    }

    const review: Review = {
      id: `review-${proposal.id}-${this.reviews.length + 1}`,
      proposalId: proposal.id,
      decision: input.decision,
      editedPayload,
      reviewer: input.reviewer,
      createdAt: this.now(),
    };

    if (input.decision === "edit") {
      this.reviews.push(review);
      proposal.status = "edited";
      this.appendAudit(proposal, "review_edited", input.reviewer, { editedPayload });
      return { proposal: structuredClone(proposal), review: structuredClone(review), appliedBillingAction: null };
    }

    if (input.decision === "reject") {
      this.reviews.push(review);
      proposal.status = "rejected";
      this.appendAudit(proposal, "review_rejected", input.reviewer, { payload: effectivePayload });
      return { proposal: structuredClone(proposal), review: structuredClone(review), appliedBillingAction: null };
    }

    const appliedBillingAction: AppliedBillingAction = {
      proposalId: proposal.id,
      findingId: proposal.findingId,
      actionName: proposal.actionName,
      payload: structuredClone(effectivePayload),
      appliedAt: review.createdAt,
      actor: input.reviewer,
    };
    this.applyBillingAction?.(appliedBillingAction);
    this.reviews.push(review);
    proposal.status = "approved";
    this.appliedBillingActions.push(appliedBillingAction);
    this.appendAudit(proposal, "review_approved", input.reviewer, { payload: appliedBillingAction.payload });
    return {
      proposal: structuredClone(proposal),
      review: structuredClone(review),
      appliedBillingAction: structuredClone(appliedBillingAction),
    };
  }

  private appendAudit(
    proposal: Proposal,
    event: AuditEvent["event"],
    actor: string,
    payload: Record<string, unknown>,
  ): void {
    this.auditLog.push({
      id: `audit-${proposal.id}-${this.auditLog.length + 1}`,
      findingId: proposal.findingId,
      proposalId: proposal.id,
      event,
      payload: structuredClone(payload),
      actor,
      createdAt: this.reviews[this.reviews.length - 1]?.createdAt ?? this.now(),
    });
  }
}
