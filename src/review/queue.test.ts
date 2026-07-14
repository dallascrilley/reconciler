import { describe, expect, it } from "vitest";
import type { Proposal } from "../domain/types.js";
import { createReviewAction, REVIEW_ACTION_UI } from "./actions.js";
import { ReviewQueue } from "./queue.js";

const proposal: Proposal = {
  id: "proposal-finding-1",
  findingId: "finding-missing_true_up-acct-004-2026-01",
  actionName: "create_missing_true_up",
  payload: { adjustmentCents: 5960 },
  rationale: "Create the missing true-up charge.",
  provider: "canned",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function createQueue(): ReviewQueue {
  return new ReviewQueue([proposal], { now: () => "2026-01-02T00:00:00.000Z" });
}

describe("ReviewQueue", () => {
  it("records an edit without mutating billing state, then applies the edited payload on approval", () => {
    const queue = createQueue();

    const edit = queue.review({
      proposalId: proposal.id,
      decision: "edit",
      editedPayload: { adjustmentCents: 5900, note: "Human correction" },
      reviewer: "reviewer@example.com",
    });
    expect(edit.proposal.status).toBe("edited");
    expect(edit.appliedBillingAction).toBeNull();
    expect(queue.getAppliedBillingActions()).toEqual([]);

    const approval = queue.review({
      proposalId: proposal.id,
      decision: "approve",
      reviewer: "reviewer@example.com",
    });
    expect(approval.proposal.status).toBe("approved");
    expect(approval.appliedBillingAction?.payload).toEqual({
      adjustmentCents: 5900,
      note: "Human correction",
    });
    expect(queue.getAppliedBillingActions()).toHaveLength(1);
    expect(queue.getAuditLog().map((event) => event.event)).toEqual([
      "proposal_created",
      "review_edited",
      "review_approved",
    ]);
  });

  it("rejects a proposal without applying a billing mutation", () => {
    const queue = createQueue();

    const result = queue.review({
      proposalId: proposal.id,
      decision: "reject",
      reviewer: "reviewer@example.com",
    });

    expect(result.proposal.status).toBe("rejected");
    expect(result.appliedBillingAction).toBeNull();
    expect(queue.getAppliedBillingActions()).toEqual([]);
    expect(queue.getAuditLog().at(-1)?.event).toBe("review_rejected");
  });

  it("returns audit snapshots that cannot mutate the append-only log", () => {
    const queue = createQueue();
    const snapshot = queue.getAuditLog();
    snapshot.splice(0, snapshot.length);
    snapshot.push({
      id: "fake",
      findingId: "fake",
      proposalId: "fake",
      event: "review_rejected",
      payload: {},
      actor: "fake",
      createdAt: "fake",
    });

    expect(queue.getAuditLog()).toHaveLength(1);
    expect(queue.getAuditLog()[0]?.event).toBe("proposal_created");
  });

  it("exposes the queue through the action contract and UI metadata", async () => {
    const queue = createQueue();
    const action = createReviewAction(queue);

    const result = await action.run({
      proposalId: proposal.id,
      decision: "approve",
      reviewer: "reviewer@example.com",
    }, {});

    expect(result.proposal.status).toBe("approved");
    expect(action.http).toEqual({ method: "POST", path: "/api/reviews" });
    expect(action.readOnly).toBe(false);
    expect(REVIEW_ACTION_UI?.renderer).toBe("core.data-table");
  });
});
