# Forms Recreation Canary

Generated project (forms type).

## Assets installed

- **Action Kernel** (`pattern:action`) — action-contract, schema-validated-actions
- **Action UI Metadata** (`primitive:action-ui`) — action-ui, action-chat-ui-config
- **Apply Edits** (`primitive:apply-edits`) — safe-text-editing, agentic-artifact-refinement
- **Request Context** (`pattern:request-context`) — request-context, credential-context, request-run-context
- **API Path Helpers** (`pattern:api-path`) — app-path, app-api-path, agent-native-path

- Frontend: react-router
- Server: h3
- Storage: sqlite

## Install locations

- `pattern:action` → `vendor/pattern-action/`
  - `vendor/pattern-action/src/action.ts`
- `primitive:action-ui` → `vendor/primitive-action-ui/`
  - `vendor/primitive-action-ui/src/action-ui.ts`
- `primitive:apply-edits` → `vendor/primitive-apply-edits/`
  - `vendor/primitive-apply-edits/src/apply-edits.ts`
- `pattern:request-context` → `vendor/pattern-request-context/`
  - `vendor/pattern-request-context/src/request-context.ts`
- `pattern:api-path` → `vendor/pattern-api-path/`
  - `vendor/pattern-api-path/src/api-path.ts`

## Verification

```bash
pnpm typecheck
```
