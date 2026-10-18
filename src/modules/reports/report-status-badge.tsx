import { Badge } from "@/components/ui/badge";

/*
 * C10: badge del `status` de un reporte persistido (Generado / Fallido / Pendiente).
 *
 * Vive en el módulo reports porque lo consumen el dashboard general (Fase 3) y la
 * biblioteca/detalle (Fase 5): una sola implementación del mapeo status→badge, sin
 * duplicarlo (C10 del design.md).
 *
 * Aunque la generación es SÍNCRONA (T3: la `201` ya trae el status final, así que
 * `PENDING` hoy no debería aparecer), el contrato incluye el valor y la UI MUST
 * renderizarlo.
 *
 * `status` se tipa como `string` para tolerar la extensión del enum (los enums
 * llegan como string, doc 06 §1): un valor desconocido cae a la variante neutra
 * mostrando el valor crudo, nunca una etiqueta inventada.
 *
 * Colores: tokens semánticos de status (`status.*-subtle` + `status.*-text`), igual
 * que `ClassificationBadge` de checkups. Cero literales.
 */

interface ReportStatusPresentation {
  label: string;
  className: string;
}

const REPORT_STATUS_PRESENTATION: Record<string, ReportStatusPresentation> = {
  GENERATED: { label: "Generado", className: "bg-success-subtle text-success border-transparent" },
  FAILED: { label: "Fallido", className: "bg-danger-subtle text-danger-text border-transparent" },
  PENDING: { label: "Pendiente", className: "bg-warning-subtle text-warning border-transparent" },
};

export interface ReportStatusBadgeProps {
  /** `ReportStatus` del contrato 07; `string` para tolerar valores nuevos. */
  status: string;
}

export function ReportStatusBadge({ status }: ReportStatusBadgeProps) {
  // `Object.hasOwn`: un status como "constructor" no debe resolver por prototipo.
  const presentation = Object.hasOwn(REPORT_STATUS_PRESENTATION, status)
    ? REPORT_STATUS_PRESENTATION[status]
    : undefined;

  return (
    <Badge
      variant={presentation ? "default" : "outline"}
      className={presentation?.className}
      data-testid="report-status-badge"
      data-status={status}
    >
      {presentation?.label ?? status}
    </Badge>
  );
}
