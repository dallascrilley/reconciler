import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ActionRegistry, type ActionContract } from "./action-contract.ts";

const readSchema = z.object({});
const writeSchema = z.object({
  formId: z.string().min(1),
  name: z.string().min(1),
  goals: z.string().min(1),
});

const publicFields = [
  {
    id: "name",
    label: "Your name",
    kind: "short-text",
    required: true,
    placeholder: "Jordan Rivera",
  },
  {
    id: "goals",
    label: "What should this form help you learn?",
    kind: "long-text",
    required: true,
    placeholder: "Share the product, onboarding, or campaign questions you want answered.",
  },
] as const;

const responseStorePath = path.join(process.cwd(), ".generated-responses", "forms.json");

async function readStoredResponses() {
  try {
    const raw = await fs.readFile(responseStorePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStoredResponses(rows: unknown[]) {
  await fs.mkdir(path.dirname(responseStorePath), { recursive: true });
  await fs.writeFile(responseStorePath, JSON.stringify(rows, null, 2));
}

export function createTemplateActionRegistry() {
  const registry = new ActionRegistry<Record<string, unknown>>();
  const readAction: ActionContract<typeof readSchema, {
    formId: string;
    title: string;
    intro: string;
    successMessage: string;
    fields: typeof publicFields;
    storedResponses: Array<{ id: string; name: string; goals: string; submittedAt: string }>;
  }, Record<string, unknown>> = {
    name: "get-public-form",
    description: "Load the public fill surface for the composed Forms screen.",
    readOnly: true,
    schema: readSchema,
    async run() {
      const storedResponses = await readStoredResponses();
      return {
        formId: "demo-feedback",
        title: "Product feedback request",
        intro: "This canary now proves a real public-fill surface instead of only the authoring screen.",
        successMessage: "Thanks for submitting the public fill proof.",
        fields: publicFields,
        storedResponses,
      };
    },
  };
  const writeAction: ActionContract<typeof writeSchema, { formId: string; submissionId: string; ok: true }, Record<string, unknown>> = {
    name: "submit-form-response",
    description: "Submit a public response for the composed Forms screen.",
    readOnly: false,
    schema: writeSchema,
    async run(input) {
      const storedResponses = await readStoredResponses();
      const next = [
        ...storedResponses,
        {
          id: `${input.formId}:${storedResponses.length + 1}`,
          name: input.name,
          goals: input.goals,
          submittedAt: "2026-07-01T14:40:00Z",
        },
      ];
      await writeStoredResponses(next);
      return {
        formId: input.formId,
        submissionId: `${input.formId}:submitted`,
        ok: true,
      };
    },
  };
  registry.register(readAction);
  registry.register(writeAction);
  return registry;
}
