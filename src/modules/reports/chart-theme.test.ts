// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHART_TOKEN_NAMES,
  chartBaseOptions,
  getChartTokenColors,
  getSeriesColors,
  resetChartTokenCache,
  seriesColorAt,
} from "./chart-theme";

/*
 * C2: la única fuente de color de las gráficas son los tokens semánticos del CSS
 * generado. jsdom no carga `src/styles/tokens.css`, así que se simula
 * `getComputedStyle().getPropertyValue()` con valores NO cromáticos: lo que se
 * verifica es que se leen los NOMBRES exactos de los tokens (y que no hay ningún
 * literal de color en el módulo, cosa que además comprueba `design:check`).
 */

const EXPECTED_TOKEN_NAMES = [
  "--color-data-series-1",
  "--color-data-series-2",
  "--color-data-series-3",
  "--color-data-series-4",
  "--color-border-default",
  "--color-text-subtle",
];

let tokenValues: Record<string, string> = {};

let readNames: string[] = [];

function stubComputedStyle() {
  return vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => {
          readNames.push(name);
          return tokenValues[name] ?? "";
        },
      }) as unknown as CSSStyleDeclaration,
  );
}

describe("chart-theme (C2)", () => {
  beforeEach(() => {
    resetChartTokenCache();
    readNames = [];
    tokenValues = {
      "--color-data-series-1": "serie-uno",
      "--color-data-series-2": "serie-dos",
      "--color-data-series-3": "serie-tres",
      "--color-data-series-4": "serie-cuatro",
      "--color-border-default": "linea-base",
      "--color-text-subtle": "texto-tenue",
    };
    stubComputedStyle();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetChartTokenCache();
  });

  it("lee los tokens semánticos EXACTOS y los expone en orden", () => {
    expect(getChartTokenColors()).toEqual({
      series: ["serie-uno", "serie-dos", "serie-tres", "serie-cuatro"],
      borderDefault: "linea-base",
      textSubtle: "texto-tenue",
    });
    expect([...new Set(readNames)].sort()).toEqual([...EXPECTED_TOKEN_NAMES].sort());
    expect(CHART_TOKEN_NAMES.series).toEqual(EXPECTED_TOKEN_NAMES.slice(0, 4));
    expect(getSeriesColors()).toEqual(["serie-uno", "serie-dos", "serie-tres", "serie-cuatro"]);
  });

  it("cachea la lectura: la segunda llamada no vuelve a consultar el CSS", () => {
    getChartTokenColors();
    const readsAfterFirst = readNames.length;

    getChartTokenColors();
    getSeriesColors();

    expect(readsAfterFirst).toBe(EXPECTED_TOKEN_NAMES.length);
    expect(readNames.length).toBe(readsAfterFirst);
  });

  it("resetChartTokenCache() fuerza releer los tokens (cambio de tema)", () => {
    expect(getChartTokenColors().series[0]).toBe("serie-uno");

    tokenValues["--color-data-series-1"] = "serie-uno-nueva";
    expect(getChartTokenColors().series[0]).toBe("serie-uno");

    resetChartTokenCache();
    expect(getChartTokenColors().series[0]).toBe("serie-uno-nueva");
  });

  it("token ausente → cadena vacía (nunca un valor inventado)", () => {
    tokenValues = {};

    expect(getChartTokenColors()).toEqual({
      series: ["", "", "", ""],
      borderDefault: "",
      textSubtle: "",
    });
  });

  it("seriesColorAt cicla data.series-1..4 con i % 4", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(seriesColorAt)).toEqual([
      "serie-uno",
      "serie-dos",
      "serie-tres",
      "serie-cuatro",
      "serie-uno",
      "serie-dos",
      "serie-dos",
    ]);
    // Índice negativo (defensivo): nunca `undefined`.
    expect(seriesColorAt(-1)).toBe("serie-cuatro");
  });

  it("chartBaseOptions usa tokens en gridlines, ejes y leyenda, y deja el tooltip NATIVO", () => {
    const options = chartBaseOptions<"line">();

    expect(options.plugins?.legend?.position).toBe("top");
    expect(options.plugins?.legend?.labels?.color).toBe("texto-tenue");
    expect(options.plugins?.tooltip).toBeUndefined();
    expect(options.scales?.x?.grid?.color).toBe("linea-base");
    expect(options.scales?.x?.ticks?.color).toBe("texto-tenue");
    expect(options.scales?.y?.grid?.color).toBe("linea-base");
    expect(options.scales?.y?.ticks?.color).toBe("texto-tenue");
    expect(options.responsive).toBe(true);
    expect(options.maintainAspectRatio).toBe(false);
  });
});
