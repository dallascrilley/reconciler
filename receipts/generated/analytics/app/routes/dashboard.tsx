import { TemplateShell } from "../components/template-shell";
import { createTemplateActionRegistry } from "../lib/template-actions";

type ChartPoint = { label: string; value: number };
type BreakdownPoint = { label: string; value: number; share: string };

export async function loader() {
  const registry = createTemplateActionRegistry();
  const result = await registry.invoke<{
    dashboardId: string;
    title: string;
    summary: string;
    totals: Array<{ label: string; value: string }>;
    chart: { title: string; seriesLabel: string; points: ChartPoint[] };
    breakdown: { title: string; points: BreakdownPoint[] };
    table: Array<{ segment: string; pipeline: string; booked: string; conversion: string }>; 
  }>("load-dashboard", {}, {});
  if (!result.ok) {
    throw new Response(result.error.message, { status: 500 });
  }
  return result.data;
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const registry = createTemplateActionRegistry();
  const result = await registry.invoke<{ dashboardId: string; refreshedAt: string; ok: true }>(
    "refresh-dashboard-query",
    { dashboardId: String(formData.get("dashboardId") ?? "") },
    {},
  );
  if (!result.ok) {
    throw new Response(result.error.message, { status: 400 });
  }
  return result.data;
}

function ChartBars({ points }: { points: ChartPoint[] }) {
  const max = Math.max(...points.map((point) => point.value), 1);
  return (
    <svg viewBox="0 0 320 180" className="w-full rounded border bg-muted/20" role="img" aria-label="Revenue chart">
      {points.map((point, index) => {
        const barWidth = 48;
        const gap = 20;
        const x = 24 + index * (barWidth + gap);
        const height = Math.round((point.value / max) * 110);
        const y = 132 - height;
        return (
          <g key={point.label}>
            <rect x={x} y={y} width={barWidth} height={height} rx="8" fill="currentColor" opacity="0.8" />
            <text x={x + barWidth / 2} y="152" textAnchor="middle" fontSize="11">{point.label}</text>
            <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize="11">{point.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

function BreakdownBars({ points }: { points: BreakdownPoint[] }) {
  return (
    <div className="space-y-2">
      {points.map((point) => (
        <div key={point.label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span>{point.label}</span>
            <span className="text-muted-foreground">{point.share}</span>
          </div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded bg-foreground/80" style={{ width: point.share }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function RoutePage({ loaderData, actionData }: {
  loaderData?: {
    dashboardId: string;
    title: string;
    summary: string;
    totals: Array<{ label: string; value: string }>;
    chart: { title: string; seriesLabel: string; points: ChartPoint[] };
    breakdown: { title: string; points: BreakdownPoint[] };
    table: Array<{ segment: string; pipeline: string; booked: string; conversion: string }>; 
  };
  actionData?: { dashboardId: string; refreshedAt: string; ok: true };
}) {
  const totals = loaderData?.totals ?? [];
  const chart = loaderData?.chart;
  const breakdown = loaderData?.breakdown;
  const table = loaderData?.table ?? [];
  return (
    <TemplateShell title="Analytics chart-rendering shadcn screen">
      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Chart proof</p>
          <h2 className="font-semibold">{loaderData?.title ?? "Revenue dashboard"}</h2>
          <p className="text-sm text-muted-foreground">{loaderData?.summary ?? "Chart summary."}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {totals.map((total) => (
            <article key={total.label} className="rounded border px-3 py-2">
              <p className="text-xs uppercase text-muted-foreground">{total.label}</p>
              <p className="text-lg font-semibold">{total.value}</p>
            </article>
          ))}
        </div>
        <article className="space-y-3 rounded border p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold">{chart?.title ?? "Revenue trend"}</h3>
              <p className="text-sm text-muted-foreground">{chart?.seriesLabel ?? "Quarterly revenue"}</p>
            </div>
            <form method="post">
              <input type="hidden" name="dashboardId" value={loaderData?.dashboardId ?? "revenue-overview"} />
              <button type="submit">Refresh chart</button>
            </form>
          </div>
          {chart ? <ChartBars points={chart.points} /> : null}
          {actionData?.ok ? (
            <p data-action-result={actionData.refreshedAt}>Refreshed at {actionData.refreshedAt}</p>
          ) : null}
        </article>
        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="space-y-3 rounded border p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Segment mix</p>
              <h3 className="font-semibold">{breakdown?.title ?? "Revenue by segment"}</h3>
            </div>
            {breakdown ? <BreakdownBars points={breakdown.points} /> : null}
          </article>
          <article className="space-y-3 rounded border p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Table drilldown</p>
              <h3 className="font-semibold">Segment rows</h3>
            </div>
            <div className="overflow-hidden rounded border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Segment</th>
                    <th className="px-3 py-2">Pipeline</th>
                    <th className="px-3 py-2">Booked</th>
                    <th className="px-3 py-2">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((row) => (
                    <tr key={row.segment} className="border-t">
                      <td className="px-3 py-2">{row.segment}</td>
                      <td className="px-3 py-2">{row.pipeline}</td>
                      <td className="px-3 py-2">{row.booked}</td>
                      <td className="px-3 py-2">{row.conversion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
        <p className="text-sm text-muted-foreground">
          This canary now proves a multi-chart dashboard surface over shared staged data; provider-specific live credentials remain outside the recreate path.
        </p>
      </section>
    </TemplateShell>
  );
}
