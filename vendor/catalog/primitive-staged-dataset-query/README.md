# Staged Dataset Query

## What it does

In-process query engine for staged API data. Filter, project, group, aggregate, order, and limit in-memory row data without SQL.

## Inputs and outputs

Input: `Record<string, unknown>[]` rows plus a `Query` object with optional filters, select, groupBy, aggregates, orderBy, limit, offset.
Output: `QueryResult` with `rows`, `totalRowCount`, `returnedRowCount`.

## Dependencies

No runtime dependencies.

## Storage

Use `InMemoryStorage` for testing. Implement `StagedDatasetStorage` interface for production (Drizzle, libSQL, etc.).

## Verification

- `pnpm --dir catalog/primitives/staged-dataset-query test`
- `pnpm --dir catalog/primitives/staged-dataset-query typecheck`
