import { createClient, type Client } from "@libsql/client";
import type { BillingDataset } from "../domain/types.js";
import { DEFAULT_SEED, generateBillingDataset } from "../seed/generator.js";

export type ReconcilerDatabaseConfig = {
  url?: string;
  authToken?: string;
};

const COLLECTIONS = [
  "accounts",
  "agreements",
  "usage_records",
  "invoices",
  "invoice_lines",
  "ground_truth",
  "proposals",
  "reviews",
  "audit_events",
  "billing_actions",
] as const;

export function createReconcilerDatabase(config: ReconcilerDatabaseConfig = {}): Client {
  const url = config.url ?? process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? "file:data/reconciler.db";
  const authToken = config.authToken ?? process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN;
  return createClient(authToken ? { url, authToken } : { url });
}

export async function ensureReconcilerSchema(client: Client): Promise<void> {
  await client.batch([
    `CREATE TABLE IF NOT EXISTS reconciler_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    ...COLLECTIONS.map((collection) =>
      `CREATE TABLE IF NOT EXISTS reconciler_${collection} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`,
    ),
  ], "write");
}

export async function resetDemoDatabase(
  client: Client,
  dataset: BillingDataset = generateBillingDataset({ seed: DEFAULT_SEED }),
): Promise<void> {
  await ensureReconcilerSchema(client);
  const rows = [
    ["accounts", dataset.accounts],
    ["agreements", dataset.agreements],
    ["usage_records", dataset.usageRecords],
    ["invoices", dataset.invoices],
    ["invoice_lines", dataset.invoiceLines],
    ["findings", []],
    ["proposals", []],
    ["reviews", []],
    ["audit_events", []],
    ["billing_actions", []],
    ["ground_truth", dataset.groundTruth],
  ] as const;
  const statements = [
    { sql: "DELETE FROM reconciler_meta", args: [] },
    ...COLLECTIONS.map((collection) => ({ sql: `DELETE FROM reconciler_${collection}`, args: [] })),
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["seed", String(dataset.seed)] },
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["generatedAt", dataset.generatedAt] },
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["months", JSON.stringify(dataset.months)] },
    ...rows.flatMap(([collection, values]) => values.map((value) => ({
      sql: `INSERT INTO reconciler_${collection}(id, data) VALUES (?, ?)`,
      args: [String(value.id), JSON.stringify(value)],
    }))),
  ];
  await client.batch(statements, "write");
}

export async function readDemoMeta(client: Client): Promise<Record<string, string>> {
  await ensureReconcilerSchema(client);
  const result = await client.execute("SELECT key, value FROM reconciler_meta ORDER BY key");
  return Object.fromEntries(result.rows.map((row) => [String(row.key), String(row.value)]));
}
