/**
 * Data dictionary context renderer and analytics answer receipt schema.
 *
 * Extracted from Analytics data-dictionary-context server lib.
 * Core has no agent-native, app-state, or server imports.
 */

// ---------------------------------------------------------------------------
// Dictionary context renderer
// ---------------------------------------------------------------------------

export type TrustTier = "approved" | "unreviewed" | "ai-suggestion";

export interface DictionaryEntry {
  metric: string;
  definition?: string;
  table?: string;
  columnsUsed?: string;
  cuts?: string;
  queryTemplate?: string;
  joinPattern?: string;
  updateFrequency?: string;
  dataLag?: string;
  dependencies?: string;
  validDateRange?: string;
  owner?: string;
  commonQuestions?: string;
  knownGotchas?: string;
  approved?: boolean;
  aiGenerated?: boolean;
}

function compact(value: unknown, max = 240): string {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function resolveTrustTier(entry: DictionaryEntry): TrustTier {
  if (entry.approved) return "approved";
  if (entry.aiGenerated) return "ai-suggestion";
  return "unreviewed";
}

function trustLabel(tier: TrustTier): string {
  switch (tier) {
    case "approved": return "✅ approved/canonical";
    case "unreviewed": return "⚠️ unreviewed/human";
    case "ai-suggestion": return "🤖 ai-suggestion";
  }
}

/**
 * Render data-dictionary entries as compact prompt context.
 * Trust tiers: approved entries are canonical; unreviewed are usable but
 * should be verified for high-stakes numbers; AI suggestions are not canonical.
 */
export function renderDictionaryContext(entries: DictionaryEntry[]): string {
  const usable = entries.filter((entry) => compact(entry.metric, 120));
  if (!usable.length) return "";

  const lines: string[] = [
    "<data-dictionary>",
    "Canonical metric/table/column definitions.",
    "Trust tiers: approved entries are canonical; unreviewed entries are usable but should be verified; AI suggestions are suggestions only.",
    "",
  ];

  const sorted = [...usable].sort((a, b) =>
    String(a.metric ?? "").localeCompare(String(b.metric ?? "")),
  );

  for (const entry of sorted) {
    const tier = resolveTrustTier(entry);
    const metric = compact(entry.metric, 120);
    const definition = compact(entry.definition, 360);
    const lines_entry = [
      `- **${metric}** (${trustLabel(tier)})${definition ? ` - ${definition}` : ""}`,
    ];

    if (tier === "unreviewed" && entry.approved === false) {
      lines_entry.push("  - ⚠️ flagged for review");
    }
    if (tier === "ai-suggestion") {
      lines_entry.push("  - ⚠️ not reviewed by a human");
    }

    const table = compact(entry.table, 240);
    if (table) lines_entry.push(`  - table: ${table}`);
    const columns = compact(entry.columnsUsed, 360);
    if (columns) lines_entry.push(`  - columns: ${columns}`);
    const cuts = compact(entry.cuts, 240);
    if (cuts) lines_entry.push(`  - standard cuts: ${cuts}`);
    const freshness = compact(
      [entry.updateFrequency, entry.dataLag].filter(Boolean).join("; "),
      240,
    );
    if (freshness) lines_entry.push(`  - freshness: ${freshness}`);
    const owner = compact(entry.owner, 160);
    if (owner) lines_entry.push(`  - owner: ${owner}`);

    lines.push(...lines_entry);
  }

  lines.push("", "</data-dictionary>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Receipt schema
// ---------------------------------------------------------------------------

export interface AnalyticsReceipt {
  source: string;
  queriedAt: string;
  filters?: Array<{ column: string; op: string; value?: unknown }>;
  rowCount: number;
  columns?: string[];
  caveats?: string[];
  /** Optional human-readable summary. */
  summary?: string;
}

export function formatReceipt(receipt: AnalyticsReceipt): string {
  const lines = [
    "## Analytics query receipt",
    "",
    `Source: ${receipt.source}`,
    `Queried: ${receipt.queriedAt}`,
    `Rows returned: ${receipt.rowCount}`,
  ];

  if (receipt.columns && receipt.columns.length > 0) {
    lines.push(`Columns: ${receipt.columns.join(", ")}`);
  }

  if (receipt.filters && receipt.filters.length > 0) {
    lines.push(
      "Filters:",
      ...receipt.filters.map(
        (f) => `  - ${f.column} ${f.op} ${f.value ?? ""}`,
      ),
    );
  }

  if (receipt.caveats && receipt.caveats.length > 0) {
    lines.push(
      "Caveats:",
      ...receipt.caveats.map((c) => `  - ${c}`),
    );
  }

  if (receipt.summary) {
    lines.push("", receipt.summary);
  }

  return lines.join("\n");
}

export function validateReceipt(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== "object") return "Receipt must be an object.";
  const r = receipt as Record<string, unknown>;
  if (typeof r.source !== "string" || !r.source) return "Receipt must have a source.";
  if (typeof r.queriedAt !== "string" || !r.queriedAt) return "Receipt must have a queriedAt timestamp.";
  if (typeof r.rowCount !== "number") return "Receipt must have a numeric rowCount.";
  return null;
}
