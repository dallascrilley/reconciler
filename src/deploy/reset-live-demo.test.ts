import { describe, expect, it, vi } from "vitest";
import { resetLiveDemo } from "./reset-live-demo.js";

const deploymentEnvironment = {
  COOLIFY_API_TOKEN: "test-token",
  COOLIFY_APPLICATION_UUID: "app-uuid",
  RECONCILER_PUBLIC_URL: "https://reconciler.example",
};

describe("resetLiveDemo", () => {
  it("redeploys the Coolify app and verifies the freshly seeded public state", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://app.coolify.io/api/v1/deploy") {
        expect(init).toMatchObject({
          method: "POST",
          headers: {
            authorization: "Bearer test-token",
            "content-type": "application/json",
          },
        });
        expect(JSON.parse(String(init?.body))).toEqual({ force: true, uuid: "app-uuid" });
        return Response.json({ deployments: [{ deployment_uuid: "deployment-uuid" }] });
      }
      if (url === "https://app.coolify.io/api/v1/deployments/deployment-uuid") {
        return Response.json({ status: "finished" });
      }
      if (url === "https://reconciler.example/") {
        return new Response("<h1>Reconciler</h1><p>Proposal eval gate</p>");
      }
      if (url === "https://reconciler.example/api/summary") {
        return Response.json({ appliedBillingActionCount: 0, pendingProposalCount: 5 });
      }
      if (url === "https://reconciler.example/api/dashboard") {
        return Response.json({ eval: { passed: 5, total: 5, passRate: 1 } });
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(
      resetLiveDemo({
        env: deploymentEnvironment,
        fetchImpl: fetchMock,
        sleep: async () => {},
      }),
    ).resolves.toEqual({
      deploymentUuid: "deployment-uuid",
      evalPassed: 5,
      evalTotal: 5,
    });
  });

  it("fails before deployment when the Coolify token is missing", async () => {
    const fetchMock = vi.fn();

    await expect(
      resetLiveDemo({
        env: {
          COOLIFY_APPLICATION_UUID: "app-uuid",
          RECONCILER_PUBLIC_URL: "https://reconciler.example",
        },
        fetchImpl: fetchMock,
        sleep: async () => {},
      }),
    ).rejects.toThrow("COOLIFY_API_TOKEN is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
