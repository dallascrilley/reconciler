import type { AuditEvent, Proposal, Review, ReviewDecision } from "../domain/types.js";

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
};

export class ReviewQueue {
  private readonly proposals = new Map<string, Proposal>();
  private readonly reviews: Review[] = [];
  private readonly auditLog: AuditEvent[] = [];
  private readonly appliedBillingActions: AppliedBillingAction[] = [];
  private readonly now: () => string;

  constructor(proposals: Proposal[], options: ReviewQueueOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    for (const proposal of proposals) {
      if (this.proposals.has(proposal.id)) throw new Error(`Duplicate proposal ${proposal.id}`);
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
    }
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
    let editedPayload: Record<string, unknown> | null = null;
    if (input.decision === "edit") {
      if (input.editedPayload === undefined || input.editedPayload === null) {
        throw new Error("editedPayload is required when editing a proposal");
      }
      editedPayload = structuredClone(input.editedPayload);
    } else {
      for (let index = this.reviews.length - 1; index >= 0; index -= 1) {
        const previousReview = this.reviews[index];
        if (previousReview?.proposalId === proposal.id && previousReview.decision === "edit") {
          editedPayload = previousReview.editedPayload;
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
    this.reviews.push(review);

    if (input.decision === "edit") {
      proposal.status = "edited";
      this.appendAudit(proposal, "review_edited", input.reviewer, {
        editedPayload,
      });
      return {
        proposal: structuredClone(proposal),
        review: structuredClone(review),
        appliedBillingAction: null,
      };
    }

    if (input.decision === "reject") {
      proposal.status = "rejected";
      this.appendAudit(proposal, "review_rejected", input.reviewer, {
        payload: proposal.payload,
      });
      return {
        proposal: structuredClone(proposal),
        review: structuredClone(review),
        appliedBillingAction: null,
      };
    }

    const appliedBillingAction: AppliedBillingAction = {
      proposalId: proposal.id,
      findingId: proposal.findingId,
      actionName: proposal.actionName,
      payload: structuredClone(editedPayload ?? proposal.payload),
      appliedAt: review.createdAt,
      actor: input.reviewer,
    };
    proposal.status = "approved";
    this.appliedBillingActions.push(appliedBillingAction);
    this.appendAudit(proposal, "review_approved", input.reviewer, {
      payload: appliedBillingAction.payload,
    });
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
