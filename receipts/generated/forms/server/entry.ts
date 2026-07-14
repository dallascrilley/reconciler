import { renderToStaticMarkup } from "react-dom/server";
import routeModule, { action as routeAction, loader as routeLoader } from "../app/routes/f.$.tsx";

let currentLoaderData:
  | {
      formId: string;
      title: string;
      intro: string;
      successMessage: string;
      fields: Array<{
        id: string;
        label: string;
        kind: "short-text" | "long-text";
        required: boolean;
        placeholder: string;
      }>;
      storedResponses: Array<{ id: string; name: string; goals: string; submittedAt: string }>;
    }
  | undefined;
let currentActionData: { formId: string; submissionId: string; ok: true } | undefined;

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
}

function renderRouteHtml() {
  const title = "Forms Recreation Canary";
  const body = renderToStaticMarkup(routeModule({ loaderData: currentLoaderData, actionData: currentActionData }));
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/") {
    return Response.redirect(new URL("/f/demo-feedback", request.url), 302);
  }
  if (url.pathname !== "/f/demo-feedback") {
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
