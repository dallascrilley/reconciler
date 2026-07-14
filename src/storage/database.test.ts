import { describe, expect, it } from "vitest";
import { createReconcilerDatabase, readDemoMeta, resetDemoDatabase } from "./database.js";
import { generateBillingDataset } from "../seed/generator.js";

describe("LibSQL demo persistence", () => {
  it("resets a deterministic dataset and records seed metadata", async () => {
    const client = createReconcilerDatabase({ url: "file::memory:?cache=shared" });
    try {
      const dataset = generateBillingDataset({ seed: 91, accountCount: 8 });
      await resetDemoDatabase(client, dataset);
      const meta = await readDemoMeta(client);
      const accounts = await client.execute("SELECT count(*) AS count FROM reconciler_accounts");
      const groundTruth = await client.execute("SELECT count(*) AS count FROM reconciler_ground_truth");

      expect(meta).toMatchObject({
        generatedAt: dataset.generatedAt,
        months: JSON.stringify(dataset.months),
        seed: "91",
      });
      expect(meta.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(Number(accounts.rows[0]?.count)).toBe(8);
      expect(Number(groundTruth.rows[0]?.count)).toBe(5);
    } finally {
      client.close();
    }
  });
});
