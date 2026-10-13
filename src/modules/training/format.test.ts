import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_STATUS_LABELS,
  CYCLE_TYPE_LABELS,
  SESSION_STATUS_LABELS,
  formatDateEs,
  formatDateRangeEs,
  formatTimeHm,
} from "./format";

describe("formatDateEs (T10 — presentación por string, sin Date)", () => {
  it("convierte ISO YYYY-MM-DD a DD/MM/YYYY sin desfase de zona horaria", () => {
    // Caso límite del spec: 2026-01-06 → 06/01/2026 (new Date() lo desfasaría un día
    // en zonas horarias negativas).
    expect(formatDateEs("2026-01-06")).toBe("06/01/2026");
    expect(formatDateEs("2026-12-31")).toBe("31/12/2026");
    expect(formatDateEs("2026-02-01")).toBe("01/02/2026");
  });

  it("devuelve el valor original si el formato no es ISO completo", () => {
    expect(formatDateEs("")).toBe("");
    expect(formatDateEs("indefinido")).toBe("indefinido");
  });
});

describe("formatTimeHm (T10)", () => {
  it("recorta HH:mm:ss a HH:mm por string slice", () => {
    expect(formatTimeHm("07:30:00")).toBe("07:30");
    expect(formatTimeHm("23:59:59")).toBe("23:59");
  });

  it("devuelve null si no hay hora", () => {
    expect(formatTimeHm(null)).toBeNull();
  });
});

describe("formatDateRangeEs", () => {
  it("une dos fechas ISO con separador visual", () => {
    expect(formatDateRangeEs("2026-01-01", "2026-12-31")).toBe("01/01/2026 – 31/12/2026");
  });
});

describe("etiquetas ES de enums (T10: valores exactos solo al enviar)", () => {
  it("cubre todos los valores de SessionStatus", () => {
    expect(SESSION_STATUS_LABELS.PROGRAMADA).toBe("Programada");
    expect(SESSION_STATUS_LABELS.EJECUTADA).toBe("Ejecutada");
    expect(SESSION_STATUS_LABELS.CANCELADA).toBe("Cancelada");
  });

  it("cubre todos los valores de AttendanceStatus y CycleType", () => {
    expect(ATTENDANCE_STATUS_LABELS).toEqual({
      PRESENTE: "Presente",
      AUSENTE: "Ausente",
      JUSTIFICADO: "Justificado",
    });
    expect(CYCLE_TYPE_LABELS).toEqual({ MESOCICLO: "Mesociclo", MICROCICLO: "Microciclo" });
  });
});
