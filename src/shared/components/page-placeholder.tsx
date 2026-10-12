import { EmptyState } from "./states";

interface PlaceholderPageProps {
  title: string;
  description: string;
  testId: string;
}

export function PlaceholderPage({ title, description, testId }: PlaceholderPageProps) {
  return (
    <section className="grid gap-4" data-testid={testId}>
      <header>
        <h1 className="text-strong text-heading font-semibold">{title}</h1>
        <p className="text-dim mt-1 text-body">{description}</p>
      </header>
      <EmptyState title="Módulo en preparación" description="Esta pantalla quedará implementada por el agente especializado correspondiente." />
    </section>
  );
}
