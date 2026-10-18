import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import type { ChartData, ChartOptions, TooltipItem } from "chart.js";

import type { TimeEvolutionEntry } from "@/lib/api/types";
import "@/modules/reports/chart-registry";
import { chartBaseOptions, seriesColorAt } from "@/modules/reports/chart-theme";

/*
 * C2: gráfica de evolución de tiempos del dashboard del atleta.
 *
 * - Una serie (dataset) por `(style, distance)`, etiqueta `${style} ${distance}m`
 *   (literal de la decisión C2 del design.md).
 * - Puntos ordenados por `(year, month)`; el eje X es el período (`mes abrev/year`
 *   con `Intl.DateTimeFormat` es-ES: es presentación de FECHA, no un tiempo de
 *   nado, así que no vulnera la regla "el front nunca formatea tiempos").
 * - Eje Y en `timeSeconds` con `reverse: true`: menor tiempo = mejor.
 * - Colores `data.series-1..4` cíclicos (`i % 4`), leyenda arriba siempre visible.
 * - El tooltip hace lookup del entry y muestra el `timeFormatted` DEL SERVIDOR.
 *
 * `timeSeconds` solo se usa para posicionar el punto en el eje (nunca se muestra).
 * Si un mismo `(style, distance)` trae dos entradas del mismo `(year, month)`
 * (posible: dos chequeos del mes en categorías distintas), el mapa conserva la
 * ÚLTIMA del array del servidor: una categoría del eje X = un punto por serie.
 *
 * El import de `chart-registry` es de EFECTO LATERAL: registra los componentes de Chart.js
 * que necesita esta gráfica. La página del atleta carga este componente con `lazy()`, así
 * que el paquete queda en un chunk diferido.
 */

const MONTH_FORMATTER = new Intl.DateTimeFormat("es-ES", { month: "short" });

interface EvolutionPeriod {
  key: string;
  label: string;
}

interface EvolutionSeries {
  label: string;
  style: string;
  distance: number;
  byPeriod: Map<string, TimeEvolutionEntry>;
}

interface EvolutionModel {
  data: ChartData<"line", (number | null)[], string>;
  options: ChartOptions<"line">;
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function buildModel(entries: TimeEvolutionEntry[]): EvolutionModel {
  const periodByKey = new Map<string, EvolutionPeriod>();
  const seriesByKey = new Map<string, EvolutionSeries>();

  for (const entry of entries) {
    const period = periodKey(entry.year, entry.month);
    if (!periodByKey.has(period)) {
      periodByKey.set(period, {
        key: period,
        label: `${MONTH_FORMATTER.format(new Date(entry.year, entry.month - 1, 1))}/${entry.year}`,
      });
    }

    const seriesKey = `${entry.style}|${entry.distance}`;
    let series = seriesByKey.get(seriesKey);
    if (!series) {
      series = {
        label: `${entry.style} ${entry.distance}m`,
        style: entry.style,
        distance: entry.distance,
        byPeriod: new Map(),
      };
      seriesByKey.set(seriesKey, series);
    }
    series.byPeriod.set(period, entry);
  }

  // Orden determinista de períodos y series (leyenda y colores estables).
  const periods = [...periodByKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const seriesList = [...seriesByKey.values()].sort(
    (a, b) => a.distance - b.distance || a.style.localeCompare(b.style),
  );

  const baseOptions = chartBaseOptions<"line">();
  const baseScales = baseOptions.scales ?? {};

  const data: ChartData<"line", (number | null)[], string> = {
    labels: periods.map((period) => period.label),
    datasets: seriesList.map((series, index) => {
      const color = seriesColorAt(index);
      return {
        label: series.label,
        data: periods.map((period) => series.byPeriod.get(period.key)?.timeSeconds ?? null),
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointBorderColor: color,
        borderWidth: 2,
        pointRadius: 3,
        spanGaps: true,
      };
    }),
  };

  const options: ChartOptions<"line"> = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<"line">[]) => {
            const period = periods[items[0]?.dataIndex ?? -1];
            return period?.label ?? "";
          },
          // Lookup del entry: se muestra el string del SERVIDOR, nunca el número.
          label: (context: TooltipItem<"line">) => {
            const series = seriesList[context.datasetIndex];
            const period = periods[context.dataIndex];
            const entry = series && period ? series.byPeriod.get(period.key) : undefined;
            return entry ? `${series.label}: ${entry.timeFormatted}` : "";
          },
        },
      },
    },
    scales: {
      ...baseScales,
      // Menor tiempo = mejor: eje invertido.
      y: { ...(baseScales.y ?? {}), reverse: true },
    },
  };

  return { data, options };
}

export function EvolutionChart({ entries }: { entries: TimeEvolutionEntry[] }) {
  const model = useMemo(() => buildModel(entries), [entries]);

  if (model.data.datasets.length === 0) {
    return (
      <p className="text-dim text-body" data-testid="evolution-empty">
        Todavía no hay tiempos de prueba: registra un chequeo para ver la evolución.
      </p>
    );
  }

  return (
    <div className="relative h-72" data-testid="evolution-chart">
      <Line data={model.data} options={model.options} />
    </div>
  );
}
