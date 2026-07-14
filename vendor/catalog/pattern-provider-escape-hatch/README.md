# Provider Escape Hatch

## What it does

Framework-free provider contract for external API calls. It describes provider capabilities, validates outbound URLs, and redacts sensitive response data without binding to a specific app runtime or secret store.

## Use it when

- A template needs a typed escape hatch for provider APIs.
- URL safety and response redaction should be copied into the host project.
- Credential lookup remains app-local behind an interface.

## Do not use it when

- A narrow typed SDK already covers the integration.
- The integration requires browser-only APIs or streaming bodies outside this contract.

## Files

- `src/provider-contract.ts`
- `examples/basic.ts`

## Verification

```bash
pnpm --dir catalog/patterns/provider-escape-hatch test
pnpm --dir catalog/patterns/provider-escape-hatch typecheck
```
