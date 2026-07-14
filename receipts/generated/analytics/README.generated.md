# Analytics Recreation Canary

Generated project (analytics type).

## Assets installed

- **Action Kernel** (`pattern:action`) — action-contract, schema-validated-actions
- **Dashboard Config** (`pattern:dashboard-config`) — dashboard-config-model, dashboard-catalog-template
- **Data Dictionary** (`pattern:data-dictionary`) — data-dictionary-context, analytics-receipt
- **Staged Dataset Query** (`primitive:staged-dataset-query`) — staged-data-query, in-memory-aggregation
- **Provider Escape Hatch** (`pattern:provider-escape-hatch`) — provider-contract, ssrf-guard, credential-resolver
- **Request Context** (`pattern:request-context`) — request-context, credential-context, request-run-context

- Frontend: react-router
- Server: h3
- Storage: sqlite

## Install locations

- `pattern:action` → `vendor/pattern-action/`
  - `vendor/pattern-action/src/action.ts`
- `pattern:dashboard-config` → `vendor/pattern-dashboard-config/`
  - `vendor/pattern-dashboard-config/src/dashboard-config.ts`
- `pattern:data-dictionary` → `vendor/pattern-data-dictionary/`
  - `vendor/pattern-data-dictionary/src/data-dictionary.ts`
- `primitive:staged-dataset-query` → `vendor/primitive-staged-dataset-query/`
  - `vendor/primitive-staged-dataset-query/src/staged-dataset-query.ts`
- `pattern:provider-escape-hatch` → `vendor/pattern-provider-escape-hatch/`
  - `vendor/pattern-provider-escape-hatch/src/provider-contract.ts`
- `pattern:request-context` → `vendor/pattern-request-context/`
  - `vendor/pattern-request-context/src/request-context.ts`

## Verification

```bash
pnpm typecheck
```
