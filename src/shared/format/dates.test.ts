import { describe, expect, it } from "vitest";

import { formatInstantDate, formatInstantDateTime, humanFileSize } from "./dates";

/*
 * Assert deterministas: el locale se fija a es-ES en el helper y la zona horaria
 * se pasa explícita en cada caso (el default es la zona del navegador).
 * Los instantes son los `Instant` ISO-8601 UTC que envía el servidor.
 */

describe("formatInstantDate", () => {
  it("formatea un Instant ISO-8601 UTC como dd/mm/aaaa", () => {
    expect(formatInstantDate("2026-09-01T10:00:00Z", "UTC")).toBe("01/09/2026");
  });

  it("respeta la zona horaria indicada (cambia el día si cruza medianoche)", () => {
    expect(formatInstantDate("2026-09-01T02:30:00Z", "America/Bogota")).toBe("31/08/2026");
  });

  it("devuelve el marcador de valor ausente si el timestamp es inválido", () => {
    expect(formatInstantDate("no-es-una-fecha")).toBe("—");
  });
});

describe("formatInstantDateTime", () => {
  it("formatea un Instant con fecha y hora (h23)", () => {
    expect(formatInstantDateTime("2026-09-01T10:00:00Z", "UTC")).toBe("01/09/2026, 10:00");
  });

  it("convierte a la zona horaria indicada (nextRunAt de una programación)", () => {
    expect(formatInstantDateTime("2026-10-01T06:00:00Z", "America/Bogota")).toBe(
      "01/10/2026, 01:00",
    );
  });

  it("usa h23 para la medianoche (nunca 24:00)", () => {
    expect(formatInstantDateTime("2026-09-01T00:00:00Z", "UTC")).toBe("01/09/2026, 00:00");
  });

  it("devuelve el marcador de valor ausente si el timestamp es inválido", () => {
    expect(formatInstantDateTime("no-es-una-fecha")).toBe("—");
  });
});

describe("humanFileSize", () => {
  it("expresa kilobytes con separador decimal es-ES", () => {
    expect(humanFileSize(48_213)).toBe("47,1 KB");
  });

  it("expresa megabytes a partir de 1 MB", () => {
    expect(humanFileSize(1_572_864)).toBe("1,5 MB");
  });

  it("no añade decimales innecesarios", () => {
    expect(humanFileSize(2_097_152)).toBe("2 MB");
    expect(humanFileSize(0)).toBe("0 KB");
  });

  it("devuelve el marcador de valor ausente ante entradas no válidas", () => {
    expect(humanFileSize(Number.NaN)).toBe("—");
    expect(humanFileSize(-1)).toBe("—");
  });
});
