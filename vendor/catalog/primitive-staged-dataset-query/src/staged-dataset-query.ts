/**
 * Staged dataset query engine.
 *
 * Perform in-process filter/project/group/aggregate/order/limit operations
 * on in-memory row data staged from an API response.
 *
 * Extracted from the staged-datasets-aggregate pattern. Pure, dependency-free,
 * with a storage adapter interface for pluggable persistence.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilterOp =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "not_exists";

export interface Filter {
  column: string;
  op: FilterOp;
  value?: unknown;
}

export type AggregateOp =
  | "sum"
  | "avg"
  | "count"
  | "min"
  | "max"
  | "count_distinct";

export interface AggregateField {
  column: string;
  op: AggregateOp;
  as?: string;
}

export interface Query {
  filters?: Filter[];
  select?: string[];
  groupBy?: string[];
  aggregates?: AggregateField[];
  orderBy?: Array<{ column: string; desc?: boolean }>;
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  totalRowCount: number;
  returnedRowCount: number;
}

// ---------------------------------------------------------------------------
// Storage adapter interface
// ---------------------------------------------------------------------------

export interface StagedDatasetStorage {
  getRows(datasetKey: string): Promise<Record<string, unknown>[]>;
  setRows(datasetKey: string, rows: Record<string, unknown>[]): Promise<void>;
  appendRows(datasetKey: string, rows: Record<string, unknown>[]): Promise<void>;
  deleteRows(datasetKey: string): Promise<void>;
}

export class InMemoryStorage implements StagedDatasetStorage {
  private store = new Map<string, Record<string, unknown>[]>();

  async getRows(datasetKey: string): Promise<Record<string, unknown>[]> {
    return this.store.get(datasetKey) ?? [];
  }

  async setRows(datasetKey: string, rows: Record<string, unknown>[]): Promise<void> {
    this.store.set(datasetKey, rows);
  }

  async appendRows(datasetKey: string, rows: Record<string, unknown>[]): Promise<void> {
    const existing = this.store.get(datasetKey) ?? [];
    this.store.set(datasetKey, [...existing, ...rows]);
  }

  async deleteRows(datasetKey: string): Promise<void> {
    this.store.delete(datasetKey);
  }
}

// ---------------------------------------------------------------------------
// Query engine
// ---------------------------------------------------------------------------

function matchesFilter(row: Record<string, unknown>, filter: Filter): boolean {
  const val = row[filter.column];
  switch (filter.op) {
    case "equals": return val === filter.value;
    case "not_equals": return val !== filter.value;
    case "contains":
      return typeof val === "string" && typeof filter.value === "string"
        ? val.includes(filter.value)
        : false;
    case "not_contains":
      return typeof val === "string" && typeof filter.value === "string"
        ? !val.includes(filter.value)
        : true;
    case "gt": return typeof val === "number" && typeof filter.value === "number" && val > filter.value;
    case "gte": return typeof val === "number" && typeof filter.value === "number" && val >= filter.value;
    case "lt": return typeof val === "number" && typeof filter.value === "number" && val < filter.value;
    case "lte": return typeof val === "number" && typeof filter.value === "number" && val <= filter.value;
    case "exists": return val !== undefined && val !== null;
    case "not_exists": return val === undefined || val === null;
  }
}

function computeAggregate(
  rows: Record<string, unknown>[],
  field: AggregateField,
): number | null {
  const values = rows.map((r) => r[field.column]).filter((v) => v != null) as number[];
  if (values.length === 0) return null;
  switch (field.op) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "avg": return values.reduce((a, b) => a + b, 0) / values.length;
    case "count": return rows.length;
    case "count_distinct": return new Set(values).size;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
  }
}

/**
 * Execute a query against a set of rows.
 */
export function executeQuery(
  rows: Record<string, unknown>[],
  query: Query,
): QueryResult {
  let filtered = rows;

  // Apply filters
  if (query.filters && query.filters.length > 0) {
    filtered = filtered.filter((row) =>
      query.filters!.every((f) => matchesFilter(row, f)),
    );
  }

  const totalRowCount = filtered.length;

  // Group and aggregate
  let result: Record<string, unknown>[];

  if (query.groupBy && query.groupBy.length > 0) {
    // Group rows by groupBy columns
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of filtered) {
      const key = query.groupBy.map((col) => String(row[col] ?? "")).join("|");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    result = Array.from(groups.entries()).map(([key, groupRows]) => {
      const keys = key.split("|");
      const row: Record<string, unknown> = {};
      query.groupBy!.forEach((col, i) => {
        row[col] = groupRows[0][col];
      });
      if (query.aggregates) {
        for (const agg of query.aggregates) {
          row[agg.as ?? `${agg.op}_${agg.column}`] = computeAggregate(groupRows, agg);
        }
      }
      return row;
    });
  } else if (query.aggregates && query.aggregates.length > 0) {
    // Aggregate across all rows
    const row: Record<string, unknown> = {};
    for (const agg of query.aggregates) {
      row[agg.as ?? `${agg.op}_${agg.column}`] = computeAggregate(filtered, agg);
    }
    result = [row];
  } else {
    result = filtered;
  }

  // Select specific columns
  if (query.select && query.select.length > 0) {
    result = result.map((row) => {
      const projected: Record<string, unknown> = {};
      for (const col of query.select!) {
        projected[col] = row[col];
      }
      return projected;
    });
  }

  // Order
  if (query.orderBy && query.orderBy.length > 0) {
    result.sort((a, b) => {
      for (const order of query.orderBy!) {
        const aVal = a[order.column];
        const bVal = b[order.column];
        if (aVal == null && bVal == null) continue;
        if (aVal == null) return order.desc ? -1 : 1;
        if (bVal == null) return order.desc ? 1 : -1;
        if (aVal < bVal) return order.desc ? 1 : -1;
        if (aVal > bVal) return order.desc ? -1 : 1;
      }
      return 0;
    });
  }

  // Skip + limit
  const offset = query.offset ?? 0;
  const limit = query.limit ?? result.length;
  const sliced = result.slice(offset, offset + limit);

  return {
    rows: sliced,
    totalRowCount,
    returnedRowCount: sliced.length,
  };
}
