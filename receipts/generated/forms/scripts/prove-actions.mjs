import { createTemplateActionRegistry } from "../app/lib/template-actions.ts";

async function main() {
  const registry = createTemplateActionRegistry();
  const loaded = await registry.invoke("get-public-form", {}, {});
  if (!loaded.ok || !Array.isArray(loaded.data.fields) || loaded.data.fields.length !== 2) {
    throw new Error("Forms public form load failed");
  }
  if (!Array.isArray(loaded.data.storedResponses) || loaded.data.storedResponses.length !== 0) {
    throw new Error("Forms response archive should start empty");
  }
  const submitted = await registry.invoke("submit-form-response", {
    formId: loaded.data.formId,
    name: "Jordan Rivera",
    goals: "Understand onboarding drop-off patterns.",
  }, {});
  if (!submitted.ok || submitted.data.submissionId !== `${loaded.data.formId}:submitted`) {
    throw new Error("Forms public submit action failed");
  }
  const reloaded = await registry.invoke("get-public-form", {}, {});
  if (!reloaded.ok || reloaded.data.storedResponses.length !== 1) {
    throw new Error("Forms durable response storage proof failed");
  }
  console.log("PASS: Forms public-fill actions and durable response storage executed through copy-first action registry");
}

await main();
