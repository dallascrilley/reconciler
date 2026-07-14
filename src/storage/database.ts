import { createClient, type Client } from "@libsql/client";
import type {
  Account,
  Agreement,
  AuditEvent,
  BillingDataset,
  Finding,
  GroundTruthCase,
  Invoice,
  InvoiceLine,
  Proposal,
  Review,
  UsageRecord,
} from "../domain/types.js";
import type { AppliedBillingAction } from "../review/queue.js";
import { DEFAULT_SEED, generateBillingDataset } from "../seed/generator.js";

export type ReconcilerDatabaseConfig = {
  url?: string;
  authToken?: string;
};

export type PersistedReconcilerState = {
  revision: string;
  dataset: BillingDataset;
  findings: Finding[];
  proposals: Proposal[];
  reviews: Review[];
  auditEvents: AuditEvent[];
  billingActions: AppliedBillingAction[];
};

async function readCollection<T>(client: Client, collection: string): Promise<T[]> {
  const result = await client.execute(`SELECT data FROM reconciler_${collection} ORDER BY id`);
  return result.rows.map((row) => JSON.parse(String(row.data)) as T);
}


const COLLECTIONS = [
  "accounts",
  "agreements",
  "usage_records",
  "invoices",
  "invoice_lines",
  "findings",
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

export async function loadReconcilerState(client: Client): Promise<PersistedReconcilerState | null> {
  await ensureReconcilerSchema(client);
  const meta = await readDemoMeta(client);
  if (!meta.seed || !meta.generatedAt || !meta.months) return null;
  const [
    accounts,
    agreements,
    usageRecords,
    invoices,
    invoiceLines,
    findings,
    groundTruth,
    proposals,
    reviews,
    auditEvents,
    billingActions,
  ] = await Promise.all([
    readCollection<Account>(client, "accounts"),
    readCollection<Agreement>(client, "agreements"),
    readCollection<UsageRecord>(client, "usage_records"),
    readCollection<Invoice>(client, "invoices"),
    readCollection<InvoiceLine>(client, "invoice_lines"),
    readCollection<Finding>(client, "findings"),
    readCollection<GroundTruthCase>(client, "ground_truth"),
    readCollection<Proposal>(client, "proposals"),
    readCollection<Review>(client, "reviews"),
    readCollection<AuditEvent>(client, "audit_events"),
    readCollection<AppliedBillingAction & { id: string }>(client, "billing_actions"),
  ]);
  return {
    revision: meta.updatedAt ?? meta.generatedAt,
    dataset: {
      seed: Number(meta.seed),
      generatedAt: meta.generatedAt,
      months: JSON.parse(meta.months) as string[],
      accounts,
      agreements,
      usageRecords,
      invoices,
      invoiceLines,
      groundTruth,
    },
    findings,
    proposals,
    reviews,
    auditEvents,
    billingActions: billingActions.map(({ id: _id, ...action }) => action),
  };
}

export async function saveReconcilerState(
  client: Client,
  state: PersistedReconcilerState,
): Promise<string> {
  await ensureReconcilerSchema(client);
  const revision = new Date().toISOString();
  const insertRows = (collection: string, values: Array<{ id: string }>): Array<{ sql: string; args: string[] }> =>
    values.map((value) => ({
      sql: `INSERT INTO reconciler_${collection}(id, data) VALUES (?, ?)`,
      args: [value.id, JSON.stringify(value)],
    }));
  const billingActions = state.billingActions.map((action) => ({ id: action.proposalId, ...action }));
  await client.batch([
    { sql: "DELETE FROM reconciler_meta", args: [] },
    ...COLLECTIONS.map((collection) => ({ sql: `DELETE FROM reconciler_${collection}`, args: [] })),
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["seed", String(state.dataset.seed)] },
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["generatedAt", state.dataset.generatedAt] },
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["updatedAt", revision] },
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["months", JSON.stringify(state.dataset.months)] },
    ...insertRows("accounts", state.dataset.accounts),
    ...insertRows("agreements", state.dataset.agreements),
    ...insertRows("usage_records", state.dataset.usageRecords),
    ...insertRows("invoices", state.dataset.invoices),
    ...insertRows("invoice_lines", state.dataset.invoiceLines),
    ...insertRows("findings", state.findings),
    ...insertRows("ground_truth", state.dataset.groundTruth),
    ...insertRows("proposals", state.proposals),
    ...insertRows("reviews", state.reviews),
    ...insertRows("audit_events", state.auditEvents),
    ...insertRows("billing_actions", billingActions),
  ], "write");
  return revision;
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
    { sql: "INSERT INTO reconciler_meta(key, value) VALUES (?, ?)", args: ["updatedAt", new Date().toISOString()] },
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
