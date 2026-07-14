import { runAggregateQuery } from "@dallascrilleymartech/app-base/provider-api/staged-datasets-aggregate";
import { z } from "zod";
import { ActionRegistry, type ActionContract } from "./action-contract.ts";

const readSchema = z.object({});
const writeSchema = z.object({ dashboardId: z.string().min(1) });

const stagedWarehouseResponse = {
  results: [
    { quarter: "Q1", bookedRevenue: 28, pipeline: 52, dealCount: 11 },
    { quarter: "Q2", bookedRevenue: 35, pipeline: 61, dealCount: 13 },
    { quarter: "Q3", bookedRevenue: 44, pipeline: 69, dealCount: 15 },
    { quarter: "Q4", bookedRevenue: 52, pipeline: 79, dealCount: 18 },
  ],
} as const;

function extractRows(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== "object") return [];
  const results = (body as { results?: unknown }).results;
  return Array.isArray(results) ? (results as Array<Record<string, unknown>>) : [];
}

export function createTemplateActionRegistry() {
  const registry = new ActionRegistry<Record<string, unknown>>();
  const readAction: ActionContract<typeof readSchema, {
    dashboardId: string;
    title: string;
    summary: string;
    totals: Array<{ label: string; value: string }>;
    chart: { title: string; seriesLabel: string; points: Array<{ label: string; value: number }> };
    breakdown: { title: string; points: Array<{ label: string; value: number; share: string }> };
    table: Array<{ segment: string; pipeline: string; booked: string; conversion: string }>; 
  }, Record<string, unknown>> = {
    name: "load-dashboard",
    description: "Load dashboard rows for the composed Analytics screen.",
    readOnly: true,
    schema: readSchema,
    async run() {
      const rows = extractRows(stagedWarehouseResponse);
      const chartRows = runAggregateQuery(rows, {
        groupBy: ["quarter"],
        aggregate: [{ column: "bookedRevenue", op: "sum", as: "revenue" }],
        orderBy: "quarter",
      });
      const segmentRows = [
        { segment: "Enterprise", pipeline: 118, booked: 74, conversion: 0.63 },
        { segment: "Mid-market", pipeline: 92, booked: 61, conversion: 0.66 },
        { segment: "SMB", pipeline: 51, booked: 24, conversion: 0.47 },
      ];
      const summaryRows = runAggregateQuery(rows, {
        aggregate: [
          { column: "pipeline", op: "sum", as: "pipeline" },
          { column: "bookedRevenue", op: "sum", as: "bookedRevenue" },
          { column: "dealCount", op: "sum", as: "dealCount" },
        ],
      });
      const summary = summaryRows[0] ?? {};
      return {
        dashboardId: "revenue-overview",
        title: "Revenue overview",
        summary: "The recreate canary now proves one shared provider/staged-data aggregation path instead of only hard-coded dashboard rows.",
        totals: [
          { label: "Pipeline", value: `$${summary.pipeline ?? 0}K` },
          { label: "Closed won", value: `$${summary.bookedRevenue ?? 0}K` },
          { label: "Deals", value: String(summary.dealCount ?? 0) },
        ],
        chart: {
          title: "Quarterly revenue",
          seriesLabel: "Booked revenue aggregated from staged provider rows",
          points: chartRows.map((row) => ({
            label: String(row.quarter ?? "n/a"),
            value: Number(row.revenue ?? 0),
          })),
        },
        breakdown: {
          title: "Revenue by segment",
          points: segmentRows.map((row) => ({
            label: row.segment,
            value: row.booked,
            share: `${Math.round((row.booked / 159) * 100)}%`,
          })),
        },
        table: segmentRows.map((row) => ({
          segment: row.segment,
          pipeline: `$${row.pipeline}K`,
          booked: `$${row.booked}K`,
          conversion: `${Math.round(row.conversion * 100)}%`,
        })),
      };
    },
  };
  const writeAction: ActionContract<typeof writeSchema, { dashboardId: string; refreshedAt: string; ok: true }, Record<string, unknown>> = {
    name: "refresh-dashboard-query",
    description: "Refresh the staged dashboard query.",
    readOnly: false,
    schema: writeSchema,
    async run(input) {
      return { dashboardId: input.dashboardId, refreshedAt: "2026-07-01T11:15:00Z", ok: true };
    },
  };
  registry.register(readAction);
  registry.register(writeAction);
  return registry;
}
