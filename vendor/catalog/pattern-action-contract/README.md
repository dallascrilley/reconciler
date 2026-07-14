# Action Contract

## What it does

Framework-free action contract pattern for defining reusable, typed actions with schema-validated inputs and structured error handling.

## Core types

- **ActionContract** — name, description, zod schema, readOnly flag, optional HTTP metadata, run function
- **ActionResult** — `{ ok: true, data } | { ok: false, error }` discriminated union
- **ActionError** — `{ code, message, details? }`
- **ActionRegistry** — register, list, get, validate, invoke with injected context

## Dependencies

- **zod** (v4.x) — only core dependency

## Copy/adapt notes

Copy `src/` directory. The only required dependency is `zod`. For action-runner adapters, see `adapters/ai-sdk` or `adapters/h3` or `adapters/cli`.

## Migration proof note

This package now includes a Phase 3.5 low-risk read-only migration proof in `tests/migrated-action-example.test.ts`. It mirrors the shape of `dispatch/actions/list-dispatch-usage-metrics.ts` by registering a standalone read-only action with the same schema and HTTP metadata, then invoking it through `ActionRegistry` with injected context. This proves the reusable action seam without claiming the live Dispatch route has been migrated yet.

## Verification

- `pnpm --dir catalog/patterns/action-contract test`
- `pnpm --dir catalog/patterns/action-contract typecheck`
