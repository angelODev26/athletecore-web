interface StateProps {
  title?: string;
  description?: string;
}

export function LoadingState({ title = "Cargando", description = "Preparando la información…" }: StateProps) {
  return (
    <div className="border-line bg-surface grid place-items-center border border-dashed p-10 text-center" data-testid="loading-state" role="status">
      <div>
        <p className="text-ink text-base font-semibold">{title}</p>
        <p className="text-ink-soft mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}

export function EmptyState({ title = "Sin datos", description = "Cuando haya información disponible la verás aquí." }: StateProps) {
  return (
    <div className="border-line bg-surface grid place-items-center border border-dashed p-10 text-center" data-testid="empty-state">
      <div>
        <p className="text-ink text-base font-semibold">{title}</p>
        <p className="text-ink-soft mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}

export function ErrorState({ title = "Algo salió mal", description = "Intenta de nuevo en unos segundos." }: StateProps) {
  return (
    <div className="border-line bg-surface grid place-items-center border p-10 text-center" data-testid="error-state" role="alert">
      <div>
        <p className="text-ink text-base font-semibold">{title}</p>
        <p className="text-ink-soft mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}

export function ForbiddenState({ title = "Sin acceso", description = "Tu usuario no tiene permisos para ver esta sección." }: StateProps) {
  return (
    <div className="border-line bg-surface grid place-items-center border p-10 text-center" data-testid="forbidden-state" role="alert">
      <div>
        <p className="text-ink text-base font-semibold">{title}</p>
        <p className="text-ink-soft mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}
