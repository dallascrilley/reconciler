/**
 * Framework-free action contract.
 *
 * Defines a reusable action pattern with schema validation, explicit inputs/outputs,
 * error serialization, and no framework dependency other than `zod`.
 *
 * Extracted from the `defineAction` pattern in design/analytics/dispatch apps.
 * The core has no H3, React Query, app-state, or agent-native imports.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

export interface ActionError {
  code: string;
  message: string;
  details?: unknown;
}

export function serializeError(error: unknown): ActionError {
  if (error instanceof z.ZodError) {
    const issues = (error as unknown as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    return {
      code: "VALIDATION_ERROR",
      message: issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join("; "),
      details: issues,
    };
  }
  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: String(error) };
}

// ---------------------------------------------------------------------------
// Action contract
// ---------------------------------------------------------------------------

/**
 * Schema for declaring action inputs.
 * Must be a Zod schema that produces a typed output.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionSchema = z.ZodType<any>;

export interface ActionContract<
  TSchema extends ActionSchema = ActionSchema,
  TResult = unknown,
  TContext = Record<string, unknown>,
> {
  /** Unique action identifier. */
  name: string;

  /** Human-readable description for discovery. */
  description: string;

  /** Zod schema for input validation. */
  schema: TSchema;

  /** If true, this action does not mutate state and is safe to retry. */
  readOnly?: boolean;

  /** Optional HTTP metadata for HTTP adapter. */
  http?: {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
  };

  /**
   * Run the action with validated input and injected context.
   * Should throw on errors; the registry catches and serializes them.
   */
  run: (input: z.infer<TSchema>, context: TContext) => Promise<TResult>;
}

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function success<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function failure(error: ActionError): ActionResult<never> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap a plain run function so errors are caught and serialized.
 */
export async function runSafe<TResult>(
  run: () => Promise<TResult>,
): Promise<ActionResult<TResult>> {
  try {
    const data = await run();
    return success(data);
  } catch (err) {
    return failure(serializeError(err));
  }
}
