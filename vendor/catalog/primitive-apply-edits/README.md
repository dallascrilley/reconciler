# Apply Edits

## What it does

Applies sequential search/replace edits to a single string.

## Inputs and outputs

Input: one source string plus an ordered list of edits with `search` and `replace` text.
Output: the updated string and the number of edits applied.
Every search must match exactly one location.

## Matching behavior

Exact matching runs before whitespace-flexible matching.
If exact matching fails, whitespace-flexible matching treats runs of whitespace in the search text as interchangeable with runs of whitespace in the document.
`$`, `$1`, and similar replacement text is inserted literally.

## When not to use it

It is not for AST-aware code refactors or multi-file atomic edits.

## Dependencies

It has no runtime dependencies.

## Copy/adapt notes

Copy the file directly when you need deterministic single-document text edits.
Adapt only the surrounding error wording or calling conventions for your host environment.

## Verification

- `pnpm --dir catalog/primitives/apply-edits test`
- `pnpm --dir catalog/primitives/apply-edits typecheck`
- `pnpm --dir catalog/primitives/apply-edits example`
