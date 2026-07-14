import { z } from "zod";

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
      message: issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      details: issues,
    };
  }
  if (error instanceof Error) {
    return { code: "INTERNAL_ERROR", message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: String(error) };
}

export type ActionSchema = z.ZodTypeAny;

export interface ActionContract<
  TSchema extends ActionSchema = ActionSchema,
  TResult = unknown,
  TContext = Record<string, unknown>,
> {
  name: string;
  description: string;
  schema: TSchema;
  readOnly?: boolean;
  http?: {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
  };
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

export async function runSafe<TResult>(run: () => Promise<TResult>): Promise<ActionResult<TResult>> {
  try {
    return success(await run());
  } catch (error) {
    return failure(serializeError(error));
  }
}

export class ActionRegistry<TContext = Record<string, unknown>> {
  private actions = new Map<string, ActionContract<ActionSchema, unknown, TContext>>();

  register<TSchema extends ActionSchema, TResult>(action: ActionContract<TSchema, TResult, TContext>): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action "${action.name}" is already registered.`);
    }
    this.actions.set(action.name, action as ActionContract<ActionSchema, unknown, TContext>);
  }

  list(): Array<{ name: string; description: string; readOnly: boolean }> {
    return Array.from(this.actions.values()).map((action) => ({
      name: action.name,
      description: action.description,
      readOnly: action.readOnly ?? false,
    }));
  }

  async invoke<T = unknown>(name: string, input: unknown, context: TContext): Promise<ActionResult<T>> {
    const action = this.actions.get(name);
    if (!action) {
      return failure({ code: "NOT_FOUND", message: `Action "${name}" not found.` });
    }
    try {
      const validated = action.schema.parse(input);
      return success((await action.run(validated, context)) as T);
    } catch (error) {
      return failure(serializeError(error));
    }
  }
}
