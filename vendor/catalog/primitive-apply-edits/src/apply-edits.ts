/**
 * Surgical search/replace engine for string documents.
 *
 * Two matching strategies, tried in order, both requiring a UNIQUE match so an
 * edit can never silently hit the wrong place:
 *   1. exact substring
 *   2. whitespace-flexible (any run of whitespace in `search` matches any run
 *      of whitespace in the file)
 *
 * Pure + dependency-free so it is trivially unit-testable.
 */

export interface TextEdit {
  /** Exact text to find, with enough surrounding context to be unique. */
  search: string;
  /** Replacement text. Inserted verbatim — `$`/`$1` are NOT interpreted. */
  replace: string;
}

export interface ApplyEditsResult {
  content: string;
  applied: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + 1);
  }
  return count;
}

export function applyOneEdit(
  content: string,
  edit: TextEdit,
  index = 0,
): string {
  const { search, replace } = edit;
  if (typeof search !== "string" || search.length === 0) {
    throw new Error(`Edit ${index + 1}: "search" must be a non-empty string.`);
  }
  if (typeof replace !== "string") {
    throw new Error(`Edit ${index + 1}: "replace" must be a string.`);
  }

  const exact = countOccurrences(content, search);
  if (exact === 1) return content.split(search).join(replace);
  if (exact > 1) {
    throw new Error(
      `Edit ${index + 1}: "search" matched ${exact} places — add more surrounding context so it matches exactly one location.`,
    );
  }

  const pattern = escapeRegExp(search).replace(/\s+/g, "\\s+");
  const re = new RegExp(pattern, "g");
  const matches = content.match(re);
  const flexible = matches ? matches.length : 0;
  if (flexible === 1) {
    return content.replace(re, () => replace);
  }
  if (flexible > 1) {
    throw new Error(
      `Edit ${index + 1}: "search" matched ${flexible} places (whitespace-insensitive) — add more surrounding context.`,
    );
  }

  throw new Error(
    `Edit ${index + 1}: "search" text was not found in the file. Read the latest document snapshot and copy the exact text you want to change.`,
  );
}

export function applyEdits(
  content: string,
  edits: TextEdit[],
): ApplyEditsResult {
  let next = content;
  edits.forEach((edit, i) => {
    next = applyOneEdit(next, edit, i);
  });
  return { content: next, applied: edits.length };
}
