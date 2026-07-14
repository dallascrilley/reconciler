import { z } from "zod";
import type { ActionContract } from "../../vendor/catalog/pattern-action-contract/src/action-contract.js";
import { ACTION_CHAT_UI_DATA_TABLE_RENDERER, normalizeActionChatUIConfig } from "../../vendor/catalog/primitive-action-ui/src/action-ui.js";
import type { ReviewDecision } from "../domain/types.js";
import { ReviewQueue, type ReviewResult } from "./queue.js";

const REVIEW_INPUT_SCHEMA = z.object({
  proposalId: z.string().min(1),
  decision: z.enum(["approve", "edit", "reject"]),
  editedPayload: z.record(z.string(), z.unknown()).nullable().optional(),
  reviewer: z.string().min(1),
});

export const REVIEW_ACTION_UI = normalizeActionChatUIConfig({
  renderer: ACTION_CHAT_UI_DATA_TABLE_RENDERER,
  title: "Reconciler review queue",
  description: "Approve, edit, or reject each proposal before billing state changes.",
});

export function createReviewAction(
  queue: ReviewQueue,
): ActionContract<typeof REVIEW_INPUT_SCHEMA, ReviewResult, Record<string, never>> {
  return {
    name: "review-remediation-proposal",
    description: "Record a human decision for a remediation proposal.",
    schema: REVIEW_INPUT_SCHEMA,
    readOnly: false,
    http: { method: "POST", path: "/api/reviews" },
    async run(input) {
      const reviewInput: {
        proposalId: string;
        decision: ReviewDecision;
        editedPayload?: Record<string, unknown> | null;
        reviewer: string;
      } = {
        proposalId: input.proposalId,
        decision: input.decision,
        reviewer: input.reviewer,
      };
      if (input.editedPayload !== undefined) reviewInput.editedPayload = input.editedPayload;
      return queue.review(reviewInput);
    },
  };
}
