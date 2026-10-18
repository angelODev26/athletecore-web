import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import type { ChartData, ChartOptions } from "chart.js";

import { Skeleton } from "@/components/ui/skeleton";
import { classificationLabel } from "@/modules/checkups/format";
import "@/modules/reports/chart-registry";
import { chartBaseOptions, seriesColorAt } from "@/modules/reports/chart-theme";
import { EmptyState } from "@/shared/components/states";

/*
 * C3/C10: gráfica de distribución de clasificaciones del dashboard general.
 *
 * Vive en un componente APARTE y con `import "chart-registry"` (efecto lateral) porque el
 * dashboard la carga con `lazy()`: así Chart.js y `react-chartjs-2` salen del chunk de
 * entrada (la ruta `/` es eager) y solo se descargan cuando esta card se monta.
 *
 * La serie sale de `data.series-1` (una sola serie con etiquetas directas por barra:
 * DESIGN.md §6 exige leyenda O etiquetas directas, y la leyenda de una única serie
 * repetiría la misma información).
 */

/** Clasificaciones del contrato, en orden de presentación: Podio → Cercano → Fuera. */
const CLASSIFICATION_ORDER = [
  "POR_ENCIMA_DEL_PODIO",
  "CERCANO_A_MEDALLERIA",
  "FUERA_DE_RANGO",
] as const;

function buildDistributionModel(counts: number[]): {
  data: ChartData<"bar">;
  options: ChartOptions<"bar">;
} {
  const baseOptions = chartBaseOptions<"bar">();

  const data: ChartData<"bar"> = {
    // Etiquetas directas de cada barra (el eje X categórico rotula Podio/Cercano/
    // Fuera): por eso la leyenda de una sola serie se desactiva abajo.
    labels: CLASSIFICATION_ORDER.map((classification) => classificationLabel(classification)),
    datasets: [
      {
        label: "Deportistas",
        data: [...counts],
        backgroundColor: seriesColorAt(0),
        borderColor: seriesColorAt(0),
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    ...baseOptions,
    plugins: {
      ...baseOptions.plugins,
      // Gráfica de una sola serie con etiquetas directas: la leyenda sería repetir
      // la misma información (DESIGN.md exige leyenda O etiquetas directas).
      legend: { display: false },
    },
    scales: {
      ...baseOptions.scales,
      // Conteos enteros: el eje Y no debe mostrar medios deportistas.
      y: {
        ...(baseOptions.scales?.y ?? {}),
        ticks: { ...(baseOptions.scales?.y?.ticks ?? {}), precision: 0 },
      },
    },
  };

  return { data, options };
}

export function ClassificationDistributionChart({
  counts,
  loading,
}: {
  counts: number[];
  loading: boolean;
}) {
  const model = useMemo(() => buildDistributionModel(counts), [counts]);
  const total = counts.reduce((sum, count) => sum + count, 0);

  if (loading) {
    return <Skeleton className="h-64 w-full" data-testid="dashboard-classification-chart-loading" />;
  }

  if (total === 0) {
    return (
      <div data-testid="dashboard-classification-chart-empty">
        <EmptyState
          title="Sin clasificaciones"
          description="Cuando el equipo tenga chequeos registrados verás aquí la distribución."
        />
      </div>
    );
  }

  return (
    <div className="relative h-64" data-testid="dashboard-classification-chart">
      <Bar data={model.data} options={model.options} />
    </div>
  );
}
