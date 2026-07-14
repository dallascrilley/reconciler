import { renderToStaticMarkup } from "react-dom/server";
import routeModule, { action as routeAction, loader as routeLoader } from "../app/routes/dashboard.tsx";

let currentLoaderData:
  | {
      dashboardId: string;
      title: string;
      summary: string;
      totals: Array<{ label: string; value: string }>;
      chart: { title: string; seriesLabel: string; points: Array<{ label: string; value: number }> };
      breakdown: { title: string; points: Array<{ label: string; value: number; share: string }> };
      table: Array<{ segment: string; pipeline: string; booked: string; conversion: string }>;
    }
  | undefined;
let currentActionData: { dashboardId: string; refreshedAt: string; ok: true } | undefined;

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function renderRouteHtml() {
  const title = "Analytics Recreation Canary";
  const body = renderToStaticMarkup(routeModule({ loaderData: currentLoaderData, actionData: currentActionData }));
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/") {
    return Response.redirect(new URL("/dashboard", request.url), 302);
  }
  if (url.pathname !== "/dashboard") {
    return new Response("Not found", { status: 404 });
  }
  if (request.method === "POST") {
    currentActionData = await routeAction({ request });
    currentLoaderData = await routeLoader();
    return htmlResponse(renderRouteHtml());
  }
  currentActionData = undefined;
  currentLoaderData = await routeLoader();
  return htmlResponse(renderRouteHtml());
}
