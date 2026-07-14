import { TemplateShell } from "../components/template-shell";
import { createTemplateActionRegistry } from "../lib/template-actions";

type PublicField = {
  id: string;
  label: string;
  kind: "short-text" | "long-text";
  required: boolean;
  placeholder: string;
};

export async function loader() {
  const registry = createTemplateActionRegistry();
  const result = await registry.invoke<{
    formId: string;
    title: string;
    intro: string;
    successMessage: string;
    fields: PublicField[];
    storedResponses: Array<{ id: string; name: string; goals: string; submittedAt: string }>; 
  }>("get-public-form", {}, {});
  if (!result.ok) {
    throw new Response(result.error.message, { status: 500 });
  }
  return result.data;
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const registry = createTemplateActionRegistry();
  const result = await registry.invoke<{ formId: string; submissionId: string; ok: true }>(
    "submit-form-response",
    {
      formId: String(formData.get("formId") ?? ""),
      name: String(formData.get("name") ?? ""),
      goals: String(formData.get("goals") ?? ""),
    },
    {},
  );
  if (!result.ok) {
    throw new Response(result.error.message, { status: 400 });
  }
  return result.data;
}

export default function RoutePage({ loaderData, actionData }: {
  loaderData?: {
    formId: string;
    title: string;
    intro: string;
    successMessage: string;
    fields: PublicField[];
    storedResponses: Array<{ id: string; name: string; goals: string; submittedAt: string }>; 
  };
  actionData?: { formId: string; submissionId: string; ok: true };
}) {
  const fields = loaderData?.fields ?? [];
  const storedResponses = loaderData?.storedResponses ?? [];
  return (
    <TemplateShell title="Forms public fill shadcn screen">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <article className="space-y-4 rounded border p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Public fill proof
            </p>
            <h2 className="font-semibold">{loaderData?.title ?? "Feedback form"}</h2>
            <p className="text-sm text-muted-foreground">{loaderData?.intro ?? "Public form intro."}</p>
          </div>
          <form method="post" className="space-y-3">
            <input type="hidden" name="formId" value={loaderData?.formId ?? "demo-feedback"} />
            {fields.map((field) => (
              <label key={field.id} className="grid gap-1 text-sm">
                <span className="font-medium">{field.label}</span>
                {field.kind === "long-text" ? (
                  <textarea
                    name={field.id}
                    required={field.required}
                    placeholder={field.placeholder}
                    className="min-h-24 rounded border px-3 py-2"
                  />
                ) : (
                  <input
                    name={field.id}
                    required={field.required}
                    placeholder={field.placeholder}
                    className="rounded border px-3 py-2"
                  />
                )}
              </label>
            ))}
            <button type="submit">Submit response</button>
          </form>
          {actionData?.ok ? (
            <p data-action-result={actionData.submissionId}>{loaderData?.successMessage ?? "Thanks for your response."}</p>
          ) : null}
        </article>
        <article className="space-y-3 rounded border p-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Response archive
            </p>
            <h2 className="font-semibold">Stored public responses</h2>
          </div>
          <div className="grid gap-3">
            {storedResponses.map((response) => (
              <article key={response.id} className="rounded border px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{response.name}</h3>
                  <span className="text-xs text-muted-foreground">{response.submittedAt}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{response.goals}</p>
              </article>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Public fill now proves a durable stored-response path while authoring, integrations, and broader analytics stay outside this canary.
          </p>
        </article>
      </section>
    </TemplateShell>
  );
}
