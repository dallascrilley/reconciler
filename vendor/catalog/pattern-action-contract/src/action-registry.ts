/**
 * Action registry — register, list, get, validate, and invoke actions.
 *
 * Context is explicit and typed. The registry has no framework dependencies
 * beyond zod (used for input validation).
 */

import { z } from "zod";

import type {
  ActionContract,
  ActionSchema,
  ActionResult,
} from "./action-contract.js";
import { serializeError, success, failure } from "./action-contract.js";

export class ActionRegistry<TContext = Record<string, unknown>> {
  private actions = new Map<string, ActionContract<ActionSchema, unknown, TContext>>();

  /**
   * Register an action. Throws on duplicate names.
   */
  register(action: ActionContract<ActionSchema, unknown, TContext>): void {
    if (this.actions.has(action.name)) {
      throw new Error(`Action "${action.name}" is already registered.`);
    }
    this.actions.set(action.name, action);
  }

  /**
   * List all registered action names with descriptions.
   */
  list(): Array<{ name: string; description: string; readOnly: boolean }> {
    return Array.from(this.actions.values()).map((a) => ({
      name: a.name,
      description: a.description,
      readOnly: a.readOnly ?? false,
    }));
  }

  /**
   * Get an action by name. Returns undefined if not found.
   */
  get(name: string): ActionContract<ActionSchema, unknown, TContext> | undefined {
    return this.actions.get(name);
  }

  /**
   * Validate input against an action's schema.
   * Returns the parsed value or throws with Zod issues.
   */
  validate<T>(name: string, input: unknown): T {
    const action = this.actions.get(name);
    if (!action) {
      throw new Error(`Action "${name}" not found.`);
    }
    return action.schema.parse(input) as T;
  }

  /**
   * Safely validate input. Returns result instead of throwing.
   */
  validateSafe<T>(name: string, input: unknown): ActionResult<T> {
    try {
      const parsed = this.validate<T>(name, input);
      return success(parsed);
    } catch (err) {
      return failure(serializeError(err));
    }
  }

  /**
   * Invoke an action with validated input and context.
   * Validates input, invokes run, wraps result in ActionResult.
   */
  async invoke<T = unknown>(
    name: string,
    input: unknown,
    context: TContext,
  ): Promise<ActionResult<T>> {
    const action = this.actions.get(name);
    if (!action) {
      return failure({ code: "NOT_FOUND", message: `Action "${name}" not found.` });
    }
    try {
      const validated = action.schema.parse(input);
      const data = await action.run(validated, context);
      return success(data as T);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return failure(serializeError(err));
      }
      return failure(serializeError(err));
    }
  }
}
