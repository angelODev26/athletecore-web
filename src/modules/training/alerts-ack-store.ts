import { create } from "zustand";
import { persist } from "zustand/middleware";

/*
 * T7 (D3): "marcar como vista" de alertas es 100 % LOCAL. El endpoint
 * `POST /alerts/attendance/{id}/acknowledge` NO persiste nada (deuda del back, doc 05
 * §5), así que la UI nunca lo llama: este store guardado en localStorage guarda el par
 * `(athleteId, lastAbsenceDate)`. Una alerta queda oculta SOLO si su par coincide; si la
 * racha crece (nuevo `lastAbsenceDate`) reaparece sola. La UI nunca promete
 * persistencia en el servidor.
 */

interface AlertsAckState {
  /** `athleteId` → `lastAbsenceDate` reconocido. */
  acked: Record<string, string>;
  ackAlert: (athleteId: number, lastAbsenceDate: string) => void;
  reset: () => void;
}

export const useAlertsAckStore = create<AlertsAckState>()(
  persist(
    (set) => ({
      acked: {},
      ackAlert: (athleteId, lastAbsenceDate) =>
        set((state) => ({ acked: { ...state.acked, [String(athleteId)]: lastAbsenceDate } })),
      reset: () => set({ acked: {} }),
    }),
    { name: "athletecore.alerts.ack" },
  ),
);

/** La alerta está oculta solo si el par (athleteId, lastAbsenceDate) coincide exacto. */
export function isAlertDismissed(
  acked: Record<string, string>,
  athleteId: number,
  lastAbsenceDate: string,
): boolean {
  return acked[String(athleteId)] === lastAbsenceDate;
}
