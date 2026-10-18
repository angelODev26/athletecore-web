import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AttendanceSummary } from "@/lib/api/types";

/*
 * C2/C11: resumen de asistencia del dashboard del atleta.
 *
 * Los 5 contadores se muestran TAL CUAL del servidor: `currentAbsenceStreak`
 * (racha de ausencias) viene calculada del back — el front nunca recalcula
 * rachas ni deriva totales de los otros contadores.
 * Patrón de KPI card de DESIGN.md §6: etiqueta en `text.muted` + número `metric`.
 */

interface AttendanceField {
  key: keyof AttendanceSummary;
  label: string;
  testid: string;
}

const ATTENDANCE_FIELDS: AttendanceField[] = [
  { key: "totalSessions", label: "Sesiones registradas", testid: "attendance-total-sessions" },
  { key: "presentCount", label: "Presentes", testid: "attendance-present-count" },
  { key: "absentCount", label: "Ausentes", testid: "attendance-absent-count" },
  { key: "justifiedCount", label: "Justificadas", testid: "attendance-justified-count" },
  { key: "currentAbsenceStreak", label: "Ausencias seguidas", testid: "attendance-absence-streak" },
];

export function AttendanceCard({ attendance }: { attendance: AttendanceSummary }) {
  return (
    <Card data-testid="attendance-card">
      <CardHeader className="border-b pb-4">
        <CardTitle>Asistencia</CardTitle>
        <CardDescription>Contadores del pase de lista calculados por el servidor.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {ATTENDANCE_FIELDS.map((field) => (
            <div key={field.key} className="grid gap-1" data-testid={field.testid}>
              <dt className="text-dim text-caption">{field.label}</dt>
              <dd className="text-strong text-metric font-bold">{attendance[field.key]}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
