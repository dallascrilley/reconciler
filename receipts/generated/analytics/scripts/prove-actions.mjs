import { createTemplateActionRegistry } from "../app/lib/template-actions.ts";

async function main() {
  const registry = createTemplateActionRegistry();
  const loaded = await registry.invoke("load-dashboard", {}, {});
  if (!loaded.ok || !Array.isArray(loaded.data.chart.points) || loaded.data.chart.points.length !== 4) {
    throw new Error("Analytics dashboard load failed");
  }
  const refreshed = await registry.invoke("refresh-dashboard-query", { dashboardId: loaded.data.dashboardId }, {});
  if (!refreshed.ok || refreshed.data.dashboardId !== loaded.data.dashboardId) {
    throw new Error("Analytics refresh action failed");
  }
  console.log("PASS: Analytics chart actions executed through copy-first action registry and shared provider aggregation helpers");
}

await main();
