import { Badge } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/api/types";
import { SESSION_STATUS_LABELS } from "@/modules/training/format";

/** Badge de estado de sesión: etiqueta ES en presentación, valor exacto en el dato. */
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge
      variant={status === "CANCELADA" ? "destructive" : status === "EJECUTADA" ? "default" : "outline"}
    >
      {SESSION_STATUS_LABELS[status]}
    </Badge>
  );
}
