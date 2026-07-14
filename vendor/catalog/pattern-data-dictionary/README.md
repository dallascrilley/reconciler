# Data Dictionary and Receipts

## What it does

Data dictionary context renderer with trust tiers (approved, unreviewed, AI suggestion) and analytics answer receipt schema.

## Dictionary context

`renderDictionaryContext()` renders entries as compact `<data-dictionary>` context for agent prompts. Supports trust tiers:
- ✅ approved/canonical — use verbatim
- ⚠️ unreviewed/human — verify for high-stakes numbers
- 🤖 ai-suggestion — suggestions only, not canonical

## Receipt schema

`AnalyticsReceipt` tracks source, timestamp, filters, row count, columns, caveats.
`formatReceipt()` renders as markdown.
`validateReceipt()` validates required fields.

## Dependencies

No runtime dependencies.

## Verification

- `pnpm --dir catalog/patterns/data-dictionary test`
- `pnpm --dir catalog/patterns/data-dictionary typecheck`
