import { describe, expect, it } from "vitest";

import {
  buildCronFromPreset,
  cronToHumanText,
  isScheduleActive,
  parseCronToPreset,
  SCHEDULE_MONTH_DAY_MAX,
  SCHEDULE_MONTH_DAY_MIN,
  SCHEDULE_WEEKDAYS,
} from "./format";
import type { SchedulePreset, ScheduleWeekday } from "./format";

/*
 * Fase 6 de `integrar-reportes` (C7): el cron que la UI envía al back y su vuelta a
 * texto legible. Los patrones se verifican LITERALMENTE contra el spec
 * ("Mensual, día 1, 06:00" → `0 0 6 1 * *`) y contra la forma de 6 campos que valida
 * Spring (`ReportScheduleService.validateCron`), NO el cron de 5 de Unix.
 */

/** Los tres patrones del spec, con sus valores esperados de ida y vuelta. */
const PRESETS: ReadonlyArray<{ preset: SchedulePreset; cron: string; human: string }> = [
  {
    preset: { frequency: "DAILY", hour: 6, minute: 0 },
    cron: "0 0 6 * * *",
    human: "Diario a las 06:00",
  },
  {
    preset: { frequency: "DAILY", hour: 23, minute: 55 },
    cron: "0 55 23 * * *",
    human: "Diario a las 23:55",
  },
  {
    preset: { frequency: "WEEKLY", hour: 7, minute: 30, weekday: "MON" },
    cron: "0 30 7 * * MON",
    human: "Cada lunes a las 07:30",
  },
  {
    preset: { frequency: "WEEKLY", hour: 5, minute: 5, weekday: "SUN" },
    cron: "0 5 5 * * SUN",
    human: "Cada domingo a las 05:05",
  },
  {
    // Escenario literal del spec: "Mensual, día 1, 06:00" → `0 0 6 1 * *`.
    preset: { frequency: "MONTHLY", hour: 6, minute: 0, dayOfMonth: 1 },
    cron: "0 0 6 1 * *",
    human: "Mensual el día 1 a las 06:00",
  },
  {
    preset: { frequency: "MONTHLY", hour: 0, minute: 0, dayOfMonth: 28 },
    cron: "0 0 0 28 * *",
    human: "Mensual el día 28 a las 00:00",
  },
];

describe("buildCronFromPreset — cron Spring de 6 campos (C7)", () => {
  it("genera el patrón exacto de cada frecuencia", () => {
    for (const { preset, cron } of PRESETS) {
      expect(buildCronFromPreset(preset)).toBe(cron);
    }
  });

  it("siempre emite 6 campos con el segundo 0 (no el cron de 5 de Unix)", () => {
    for (const { preset } of PRESETS) {
      const fields = buildCronFromPreset(preset).split(" ");
      expect(fields).toHaveLength(6);
      expect(fields[0]).toBe("0");
    }
  });

  it("cubre los 7 días de la semana del registro Spring", () => {
    for (const weekday of SCHEDULE_WEEKDAYS) {
      expect(
        buildCronFromPreset({ frequency: "WEEKLY", hour: 1, minute: 5, weekday }),
      ).toBe(`0 5 1 * * ${weekday}`);
    }
  });
});

describe("parseCronToPreset — vuelta atrás estricta", () => {
  it("`buildCronFromPreset` → `parseCronToPreset` devuelve el preset original", () => {
    for (const { preset } of PRESETS) {
      expect(parseCronToPreset(buildCronFromPreset(preset))).toEqual(preset);
    }
  });

  it("el cron real del back encaja en un preset", () => {
    expect(parseCronToPreset("0 0 6 1 * *")).toEqual({
      frequency: "MONTHLY",
      hour: 6,
      minute: 0,
      dayOfMonth: 1,
    });
  });

  it("devuelve null ante patrones fuera del preset (la UI no los inventa)", () => {
    const unknown = [
      "0 0 6 31 * *", // día del mes fuera de 1–28
      "0 0 6 * 1 MON", // mes restringido
      "0 0 6 * * 1", // día de la semana numérico
      "0 0/5 * * * *", // pasos
      "0 0 6 * * MON,TUE", // lista de días
      "0 0 6 L * *", // sintaxis especial
      "0 0 24 * * *", // hora fuera de rango
      "0 0 6 * * * *", // 7 campos
      "*/5 * * * *", // 5 campos (cron de Unix)
      "",
    ];

    for (const cron of unknown) {
      expect(parseCronToPreset(cron)).toBeNull();
    }
  });
});

describe("cronToHumanText — frecuencia legible (C7)", () => {
  it("describe los tres patrones generados", () => {
    for (const { cron, human } of PRESETS) {
      expect(cronToHumanText(cron)).toBe(human);
    }
  });

  it("ida y vuelta: preset → cron → texto legible", () => {
    for (const { preset, human } of PRESETS) {
      expect(cronToHumanText(buildCronFromPreset(preset))).toBe(human);
    }
  });

  it("un patrón desconocido se muestra CRUDO, nunca descrito", () => {
    expect(cronToHumanText("0 0 6 * * 1")).toBe("0 0 6 * * 1");
    expect(cronToHumanText("*/5 * * * *")).toBe("*/5 * * * *");
  });

  it("tolera espacios sobrantes del servidor", () => {
    expect(cronToHumanText("  0 0 6 * * MON  ")).toBe("Cada lunes a las 06:00");
  });

  it("los límites del preset mensual son 1 y 28", () => {
    expect(SCHEDULE_MONTH_DAY_MIN).toBe(1);
    expect(SCHEDULE_MONTH_DAY_MAX).toBe(28);
    expect(parseCronToPreset(`0 0 6 ${SCHEDULE_MONTH_DAY_MAX} * *`)).not.toBeNull();
    expect(parseCronToPreset(`0 0 6 ${SCHEDULE_MONTH_DAY_MAX + 1} * *`)).toBeNull();
  });

  it("acepta el día de la semana en minúsculas (normaliza a mayúsculas)", () => {
    const expected: ScheduleWeekday = "WED";
    expect(parseCronToPreset("0 0 6 * * wed")).toEqual({
      frequency: "WEEKLY",
      hour: 6,
      minute: 0,
      weekday: expected,
    });
  });
});

describe("isScheduleActive — `active` nullable del DTO (C7)", () => {
  /*
   * `ReportScheduleResponse.java` declara `Boolean active` (no primitivo) y el scheduler
   * (`ReportScheduleRepository.findDueActiveSchedules`) solo ejecuta las filas con
   * `active = TRUE`: `null` NO es activa y la UI nunca debe presentarlo como tal.
   */
  it("solo `active === true` es activa", () => {
    expect(isScheduleActive({ active: true })).toBe(true);
    expect(isScheduleActive({ active: false })).toBe(false);
    expect(isScheduleActive({ active: null })).toBe(false);
  });
});
