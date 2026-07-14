import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEFAULT_ACCOUNT_COUNT,
  DEFAULT_SEED,
  generateBillingDataset,
  generateGroundTruthManifest,
} from "./generator.js";

const root = resolve(import.meta.dirname, "../..");
const dataDirectory = resolve(root, "data");

function readIntegerFlag(name: string): number | undefined {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

const seed = readIntegerFlag("seed") ?? DEFAULT_SEED;
const accountCount = readIntegerFlag("accounts") ?? DEFAULT_ACCOUNT_COUNT;
const reset = process.argv.includes("--reset");
const dataset = generateBillingDataset({ seed, accountCount });
const manifest = generateGroundTruthManifest({ seed, accountCount });

if (reset) {
  await rm(dataDirectory, { recursive: true, force: true });
}
await mkdir(dataDirectory, { recursive: true });
await writeFile(resolve(dataDirectory, "seeded-dataset.json"), `${JSON.stringify(dataset, null, 2)}\n`);
await writeFile(resolve(dataDirectory, "ground-truth.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `Seeded ${dataset.accounts.length} accounts across ${dataset.months.length} months ` +
    `with ${dataset.groundTruth.length} planted discrepancy cases (seed=${dataset.seed}).`,
);
