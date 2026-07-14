import { createReconcilerDatabase, readDemoMeta, resetDemoDatabase } from "./database.js";

const client = createReconcilerDatabase();
try {
  await resetDemoDatabase(client);
  const meta = await readDemoMeta(client);
  console.log(`Reset Reconciler demo database (seed=${meta.seed}, generatedAt=${meta.generatedAt}).`);
} finally {
  client.close();
}
