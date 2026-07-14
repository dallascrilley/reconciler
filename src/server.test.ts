import { afterEach, describe, expect, it } from "vitest";
import { createReconcilerServer } from "./server.js";
import { createReconcilerDatabase, resetDemoDatabase } from "./storage/database.js";

const clients: ReturnType<typeof createReconcilerDatabase>[] = [];
const servers: Array<Awaited<ReturnType<typeof createReconcilerServer>>> = [];

async function listen(server: Awaited<ReturnType<typeof createReconcilerServer>>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not expose a TCP address");
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const client of clients.splice(0)) client.close();
});

describe("Reconciler HTTP surface", () => {
  it("renders the eval gate and persists approval across server restarts", async () => {
    const client = createReconcilerDatabase({ url: "file::memory:?cache=shared" });
    clients.push(client);
    const server = await createReconcilerServer({ database: client, persist: true });
    servers.push(server);
    const baseUrl = await listen(server);

    const page = await fetch(`${baseUrl}/`).then((response) => {
      expect(response.status).toBe(200);
      return response.text();
    });
    expect(page).toContain("Proposal eval gate");

    const dashboard = await fetch(`${baseUrl}/api/dashboard`).then((response) => response.json());
    expect(dashboard.eval).toMatchObject({ passed: 5, total: 5, passRate: 1 });
    const proposals = await fetch(`${baseUrl}/api/proposals`).then((response) => response.json());
    const firstProposal = proposals[0];
    expect(firstProposal?.status).toBe("pending");

    const review = await fetch(`${baseUrl}/api/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: firstProposal.id, decision: "approve", reviewer: "test-reviewer" }),
    }).then((response) => response.json());
    expect(review.proposal.status).toBe("approved");
    expect(review.appliedBillingAction).not.toBeNull();

    await new Promise<void>((resolve) => server.close(() => resolve()));
    const closedIndex = servers.indexOf(server);
    if (closedIndex >= 0) servers.splice(closedIndex, 1);
    const restarted = await createReconcilerServer({ database: client, persist: true });
    servers.push(restarted);
    const restartedSummary = await fetch(`${await listen(restarted)}/api/summary`).then((response) => response.json());
    expect(restartedSummary.appliedBillingActionCount).toBe(1);
    expect(restartedSummary.pendingProposalCount).toBe(4);
  });

  it("refreshes in-memory state after the scheduled reset writes the database", async () => {
    const client = createReconcilerDatabase({ url: "file::memory:?cache=shared" });
    clients.push(client);
    const server = await createReconcilerServer({ database: client, persist: true });
    servers.push(server);
    const baseUrl = await listen(server);
    const proposals = await fetch(`${baseUrl}/api/proposals`).then((response) => response.json());
    await fetch(`${baseUrl}/api/reviews`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: proposals[0].id, decision: "approve", reviewer: "test-reviewer" }),
    });

    await resetDemoDatabase(client);
    const resetSummary = await fetch(`${baseUrl}/api/summary`).then((response) => response.json());
    expect(resetSummary.appliedBillingActionCount).toBe(0);
    expect(resetSummary.pendingProposalCount).toBe(5);
  });
});
