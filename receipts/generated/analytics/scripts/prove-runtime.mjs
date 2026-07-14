import { handleRequest } from "../server/entry.ts";

async function main() {
  const getResponse = await handleRequest(new Request("http://analytics.local/dashboard"));
  const getHtml = await getResponse.text();
  if (!getResponse.ok || !getHtml.includes("Chart proof")) {
    throw new Error("Analytics chart SSR failed");
  }
  if (!getHtml.includes("Quarterly revenue") || !getHtml.includes("svg")) {
    throw new Error("Analytics chart surface did not render");
  }
  if (!getHtml.includes("Booked revenue aggregated from staged provider rows") || !getHtml.includes("$261K")) {
    throw new Error("Analytics staged-data aggregation surface failed");
  }
  if (!getHtml.includes("Revenue by segment") || !getHtml.includes("Enterprise") || !getHtml.includes("Segment rows")) {
    throw new Error("Analytics multi-chart surface failed");
  }
  const form = new FormData();
  form.set("dashboardId", "revenue-overview");
  const postResponse = await handleRequest(new Request("http://analytics.local/dashboard", { method: "POST", body: form }));
  const postHtml = await postResponse.text();
  if (!postResponse.ok || !postHtml.includes("Refreshed at 2026-07-01T11:15:00Z")) {
    throw new Error("Analytics refresh flow failed");
  }
  console.log("PASS: Analytics SSR rendered chart path, provider aggregation, and refresh flow");
}

await main();
