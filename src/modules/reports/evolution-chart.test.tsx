// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ChartOptions } from "chart.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimeEvolutionEntry } from "@/lib/api/types";

import { resetChartTokenCache } from "./chart-theme";
import { EvolutionChart } from "./evolution-chart";
import type { LineChartProps } from "./test-utils";

/*
 * C2: en jsdom no existe `<canvas>`, así que se mockea `react-chartjs-2` y se
 * aseveran las props (data/options) que recibe el `<Line/>`. Es el patrón
 * habitual para probar la configuración de una gráfica.
 */

const chartSpy = vi.hoisted(() => ({ latest: null as LineChartProps | null }));

vi.mock("react-chartjs-2", () => ({
  Line: (props: LineChartProps) => {
    chartSpy.latest = props;
    return null;
  },
}));

/** Tokens simulados (no cromáticos: la fuente de color real es el tema). */
function stubComputedStyle() {
  const values: Record<string, string> = {
    "--color-data-series-1": "serie-uno",
    "--color-data-series-2": "serie-dos",
    "--color-data-series-3": "serie-tres",
    "--color-data-series-4": "serie-cuatro",
    "--color-border-default": "linea-base",
    "--color-text-subtle": "texto-tenue",
  };
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () =>
      ({
        getPropertyValue: (name: string) => values[name] ?? "",
      }) as unknown as CSSStyleDeclaration,
  );
}

function tooltipLabel(options: ChartOptions<"line">, item: { datasetIndex: number; dataIndex: number }) {
  const callback = options.plugins?.tooltip?.callbacks?.label;
  if (!callback) {
    throw new Error("la gráfica no define el callback `label` del tooltip");
  }
  return String((callback as unknown as (item: unknown) => string)(item));
}

function tooltipTitle(options: ChartOptions<"line">, item: { dataIndex: number }) {
  const callback = options.plugins?.tooltip?.callbacks?.title;
  if (!callback) {
    throw new Error("la gráfica no define el callback `title` del tooltip");
  }
  return String((callback as unknown as (items: unknown) => string)([item]));
}

const entries: TimeEvolutionEntry[] = [
  {
    year: 2026,
    month: 1,
    style: "LIBRE",
    distance: 100,
    timeSeconds: 65.25,
    timeFormatted: "01:05.250",
  },
  {
    year: 2026,
    month: 3,
    style: "LIBRE",
    distance: 100,
    timeSeconds: 64.1,
    timeFormatted: "01:04.100",
  },
  {
    year: 2026,
    month: 2,
    style: "ESPALDA",
    distance: 200,
    timeSeconds: 150.4,
    timeFormatted: "02:30.400",
  },
  {
    year: 2026,
    month: 1,
    style: "ESPALDA",
    distance: 200,
    timeSeconds: 152,
    timeFormatted: "02:32.000",
  },
];

describe("EvolutionChart (C2)", () => {
  beforeEach(() => {
    chartSpy.latest = null;
    resetChartTokenCache();
    stubComputedStyle();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetChartTokenCache();
  });

  it("una serie por (style, distance) con puntos ordenados por (year, month)", () => {
    render(<EvolutionChart entries={entries} />);

    expect(screen.getByTestId("evolution-chart")).toBeInTheDocument();
    const data = chartSpy.latest?.data;
    expect(data?.labels).toEqual(["ene/2026", "feb/2026", "mar/2026"]);
    expect(data?.datasets.map((dataset) => dataset.label)).toEqual(["LIBRE 100m", "ESPALDA 200m"]);
    expect(data?.datasets[0]?.data).toEqual([65.25, null, 64.1]);
    expect(data?.datasets[1]?.data).toEqual([152, 150.4, null]);
  });

  it("eje Y invertido (menor tiempo = mejor), leyenda arriba y series en tokens", () => {
    render(<EvolutionChart entries={entries} />);

    const options = chartSpy.latest?.options as ChartOptions<"line">;
    expect(options.scales?.y?.reverse).toBe(true);
    expect(options.plugins?.legend?.position).toBe("top");
    expect(chartSpy.latest?.data.datasets.map((dataset) => dataset.borderColor)).toEqual([
      "serie-uno",
      "serie-dos",
    ]);
  });

  it("con más de 4 series los colores se reciclan con i % 4", () => {
    const manyStyles: TimeEvolutionEntry[] = [
      { year: 2026, month: 1, style: "LIBRE", distance: 100, timeSeconds: 65.25, timeFormatted: "01:05.250" },
      { year: 2026, month: 1, style: "ESPALDA", distance: 100, timeSeconds: 70.5, timeFormatted: "01:10.500" },
      { year: 2026, month: 1, style: "BRAZA", distance: 100, timeSeconds: 80.5, timeFormatted: "01:20.500" },
      { year: 2026, month: 1, style: "ESPALDA", distance: 200, timeSeconds: 150.4, timeFormatted: "02:30.400" },
      { year: 2026, month: 1, style: "LIBRE", distance: 200, timeSeconds: 140.4, timeFormatted: "02:20.400" },
    ];

    render(<EvolutionChart entries={manyStyles} />);

    const datasets = chartSpy.latest?.data.datasets ?? [];
    expect(datasets.map((dataset) => dataset.label)).toEqual([
      "BRAZA 100m",
      "ESPALDA 100m",
      "LIBRE 100m",
      "ESPALDA 200m",
      "LIBRE 200m",
    ]);
    expect(datasets.map((dataset) => dataset.borderColor)).toEqual([
      "serie-uno",
      "serie-dos",
      "serie-tres",
      "serie-cuatro",
      "serie-uno",
    ]);
  });

  it("el tooltip muestra el timeFormatted del SERVIDOR (lookup del entry, nunca los segundos)", () => {
    render(<EvolutionChart entries={entries} />);

    const options = chartSpy.latest?.options as ChartOptions<"line">;
    const text = tooltipLabel(options, { datasetIndex: 0, dataIndex: 0 });

    expect(text).toContain("01:05.250");
    expect(text).toContain("LIBRE 100m");
    expect(text).not.toContain("65.25");
    expect(tooltipTitle(options, { dataIndex: 0 })).toBe("ene/2026");
  });

  it("sin entradas renderiza el estado vacío y NO monta el canvas", () => {
    render(<EvolutionChart entries={[]} />);

    expect(screen.getByTestId("evolution-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("evolution-chart")).not.toBeInTheDocument();
    expect(chartSpy.latest).toBeNull();
  });

  it("un (style, distance) repetido en el mismo mes conserva la última entrada del servidor", () => {
    // Dos chequeos del mismo mes en categorías distintas pueden repetir la prueba.
    const duplicated: TimeEvolutionEntry[] = [
      { year: 2026, month: 1, style: "LIBRE", distance: 100, timeSeconds: 65.25, timeFormatted: "01:05.250" },
      { year: 2026, month: 1, style: "LIBRE", distance: 100, timeSeconds: 63.9, timeFormatted: "01:03.900" },
    ];

    render(<EvolutionChart entries={duplicated} />);

    expect(chartSpy.latest?.data.labels).toEqual(["ene/2026"]);
    expect(chartSpy.latest?.data.datasets[0]?.data).toEqual([63.9]);
    expect(chartSpy.latest?.data.datasets).toHaveLength(1);
  });
});
