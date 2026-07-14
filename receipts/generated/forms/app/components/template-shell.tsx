import type { ReactNode } from "react";

export function TemplateShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="space-y-2 border-b pb-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Forms
        </p>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </header>
      {children}
    </main>
  );
}
