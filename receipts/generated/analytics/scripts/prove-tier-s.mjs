import { getRequestUserEmail, runWithRequestContext } from "@dallascrilleymartech/app-base/request-context";
import { isProviderApiId, listProviderApiCatalog } from "@dallascrilleymartech/app-base/provider-api";

await runWithRequestContext({ userEmail: "template@example.com", orgId: null }, async () => {
  if (getRequestUserEmail() !== "template@example.com") throw new Error("request context email mismatch");
  const catalog = listProviderApiCatalog();
  if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("provider catalog empty");
  if (!isProviderApiId("github")) throw new Error("isProviderApiId github failed");
});
console.log("PASS: Analytics Tier-S request-context and provider-api surface exercised");
