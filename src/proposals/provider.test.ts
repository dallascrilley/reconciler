import { describe, expect, it } from "vitest";
import { generateBillingDataset } from "../seed/generator.js";
import { detectDiscrepancies } from "../findings/detectors.js";
import {
  LiveProposalProvider,
  createProposalProvider,
  proposeFinding,
} from "./provider.js";

describe("proposal provider", () => {
  it("uses a typed canned proposal when no provider key is configured", async () => {
    const dataset = generateBillingDataset({ seed: 20260713 });
    const finding = detectDiscrepancies(dataset).find((entry) => entry.kind === "missing_true_up");
    if (!finding) throw new Error("expected planted missing true-up finding");

    const result = await proposeFinding(finding, createProposalProvider({}));

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        id: `proposal-${finding.id}`,
        findingId: finding.id,
        actionName: "create_missing_true_up",
        provider: "canned",
        status: "pending",
        createdAt: dataset.generatedAt,
      }),
    });
  });

  it("selects the live provider only when a key is configured", () => {
    expect(createProposalProvider({}).id).toBe("canned");
    expect(createProposalProvider({ RECONCILER_PROVIDER_API_KEY: "configured" }).id).toBe("live");
  });

  it("validates the live provider response without exposing the API key", async () => {
    let requestBody = "";
    let requestAuthorization = "";
    const provider = new LiveProposalProvider("test-secret", {
      url: "https://provider.example.test/proposals",
      fetcher: async (_input, init) => {
        requestBody = String(init?.body);
        requestAuthorization = String(new Headers(init?.headers).get("authorization"));
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            actionName: "create_missing_true_up",
            payload: {
              findingId: "finding-missing_true_up-acct-004-2026-01",
              accountId: "acct-004",
              discrepancyKind: "missing_true_up",
              evidence: {
                agreementId: "agr-004",
                invoiceId: "inv-004-2026-01",
                usageRecordId: "usage-004-2026-01",
                month: "2026-01",
                excessSeats: 4,
                expectedChargeCents: 5960,
              },
              estimatedRecoveryCents: 5960,
            },
            rationale: "Apply the missing true-up charge.",
          }) } }],
        }), { status: 200 });
      },
    });
    const dataset = generateBillingDataset({ seed: 3 });
    const finding = detectDiscrepancies(dataset).find((entry) => entry.kind === "missing_true_up");
    if (!finding) throw new Error("expected planted missing true-up finding");

    const result = await proposeFinding(finding, provider);

    expect(result.ok).toBe(true);
    expect(requestAuthorization).toBe("Bearer test-secret");
    expect(requestBody).toContain(finding.id);
    expect(requestBody).not.toContain("test-secret");
    if (result.ok) {
      expect(result.data.provider).toBe("live");
      expect(result.data.actionName).toBe("create_missing_true_up");
    }
  });

});
