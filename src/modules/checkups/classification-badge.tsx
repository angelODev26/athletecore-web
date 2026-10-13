import { Badge } from "@/components/ui/badge";
import type { Classification } from "@/lib/api/types";
import { classificationLabel } from "@/modules/checkups/format";

/*
 * C6: badge semántico por `classification` según DESIGN.md (tokens de status,
 * nunca colores literales). FUERA_DE_RANGO usa la variante neutra (sin relleno
 * de status). El valor de clasificación SIEMPRE viene del servidor.
 */

const CLASSIFICATION_BADGE_CLASS: Partial<Record<Classification, string>> = {
  POR_ENCIMA_DEL_PODIO: "bg-success-subtle text-success border-transparent",
  CERCANO_A_MEDALLERIA: "bg-warning-subtle text-warning border-transparent",
};

export function ClassificationBadge({ classification }: { classification: string }) {
  const known = classification in CLASSIFICATION_BADGE_CLASS
    ? (classification as Classification)
    : null;

  return (
    <Badge variant={known ? "default" : "outline"} className={known ? CLASSIFICATION_BADGE_CLASS[known] : undefined}>
      {classificationLabel(classification)}
    </Badge>
  );
}
