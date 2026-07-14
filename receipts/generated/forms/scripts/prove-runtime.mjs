import { handleRequest } from "../server/entry.ts";

async function main() {
  const getResponse = await handleRequest(new Request("http://forms.local/f/demo-feedback"));
  const getHtml = await getResponse.text();
  if (!getResponse.ok || !getHtml.includes("Public fill proof")) {
    throw new Error("Forms public fill SSR failed");
  }
  if (!getHtml.includes("Your name") || !getHtml.includes("Submit response")) {
    throw new Error("Forms public fields did not render");
  }
  const form = new FormData();
  form.set("formId", "demo-feedback");
  form.set("name", "Jordan Rivera");
  form.set("goals", "Understand onboarding drop-off patterns.");
  const postResponse = await handleRequest(new Request("http://forms.local/f/demo-feedback", { method: "POST", body: form }));
  const postHtml = await postResponse.text();
  if (!postResponse.ok || !postHtml.includes("Thanks for submitting the public fill proof.")) {
    throw new Error("Forms public submit flow failed");
  }
  if (!postHtml.includes("Stored public responses") || !postHtml.includes("Jordan Rivera") || !postHtml.includes("2026-07-01T14:40:00Z")) {
    throw new Error("Forms durable response archive failed");
  }
  console.log("PASS: Forms SSR rendered public fill route, submission flow, and durable response archive");
}

await main();
