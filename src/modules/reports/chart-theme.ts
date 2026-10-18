import type { ChartOptions, ChartType } from "chart.js";

/*
 * Infra de gráficas del módulo reportes (C2 de `integrar-reportes`).
 *
 * Este archivo NO importa Chart.js en runtime (solo tipos, que se borran al compilar): aquí
 * viven los TOKENS y las opciones base, y cualquier consumidor de ellos —incluidas páginas
 * sin gráfica, como el dashboard— no debe arrastrar el paquete al bundle. El registro de los
 * componentes de Chart.js vive aparte, en `chart-registry.ts`, que importan (por efecto
 * lateral) los componentes que sí pintan gráficas; así Chart.js queda en un chunk diferido.
 *
 * Dos reglas duras:
 * 1. El registro es MANUAL y tree-shaken (ver `chart-registry.ts`): un
 *    `import "chart.js/auto"` arrastraría todo el bundle.
 * 2. El `<canvas>` NO entiende `var(--token)`: los colores se leen RESUELTOS desde
 *    las CSS variables generadas (`src/styles/tokens.css`) con
 *    `getComputedStyle(document.documentElement).getPropertyValue(...)` y se
 *    cachean (la lectura del tema no cambia entre renders; si el tema cambiara en
 *    caliente, `resetChartTokenCache()` fuerza releer al siguiente montaje).
 *    Cero literales de color: `npm run design:check` lo verifica.
 */

/** Nombres EXACTOS de los tokens semánticos (verificados en src/styles/tokens.css). */
export const CHART_TOKEN_NAMES = {
  series: [
    "--color-data-series-1",
    "--color-data-series-2",
    "--color-data-series-3",
    "--color-data-series-4",
  ],
  borderDefault: "--color-border-default",
  textSubtle: "--color-text-subtle",
} as const;

export interface ChartTokenColors {
  /** `data.series-1..4` en orden (C2: asignación cíclica `i % 4`). */
  series: [string, string, string, string];
  /** `border.default` — gridlines de ambos ejes. */
  borderDefault: string;
  /** `text.subtle` — texto de ejes y de la leyenda. */
  textSubtle: string;
}

let cachedColors: ChartTokenColors | null = null;

/** Token resuelto del `:root`; cadena vacía si no está definido (nunca inventar). */
function readToken(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Colores del tema para las gráficas (lectura cacheada de los tokens). */
export function getChartTokenColors(): ChartTokenColors {
  cachedColors ??= {
    series: [
      readToken(CHART_TOKEN_NAMES.series[0]),
      readToken(CHART_TOKEN_NAMES.series[1]),
      readToken(CHART_TOKEN_NAMES.series[2]),
      readToken(CHART_TOKEN_NAMES.series[3]),
    ],
    borderDefault: readToken(CHART_TOKEN_NAMES.borderDefault),
    textSubtle: readToken(CHART_TOKEN_NAMES.textSubtle),
  };
  return cachedColors;
}

/** Invalida la caché (tests y cambio de tema en caliente). */
export function resetChartTokenCache(): void {
  cachedColors = null;
}

/** `data.series-1..4` en orden (copia: el consumidor no muta la caché). */
export function getSeriesColors(): string[] {
  return [...getChartTokenColors().series];
}

/** Color cíclico de la serie `index` (`i % 4`, C2 — más de 4 series reusan paleta). */
export function seriesColorAt(index: number): string {
  const series = getChartTokenColors().series;
  const normalized = ((index % series.length) + series.length) % series.length;
  return series[normalized];
}

/**
 * Opciones base de cualquier gráfica del módulo: leyenda arriba con color de
 * token, gridlines `border.default` y ejes `text.subtle` (DESIGN.md §6).
 * El tooltip se deja NATIVO (C2: `DESIGN.md` §9 todavía no tokeniza tooltips).
 * Se especializa con el genérico: `chartBaseOptions<"line">()`.
 */
export function chartBaseOptions<TType extends ChartType = ChartType>(): ChartOptions<TType> {
  const { borderDefault, textSubtle } = getChartTokenColors();

  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "nearest", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: { color: textSubtle, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
      },
    },
    scales: {
      x: {
        grid: { color: borderDefault },
        ticks: { color: textSubtle },
      },
      y: {
        grid: { color: borderDefault },
        ticks: { color: textSubtle },
      },
    },
  } as ChartOptions<TType>;
}
