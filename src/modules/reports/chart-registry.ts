import {
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

/*
 * Registro de los componentes de Chart.js que usan las gráficas del módulo (C2 de
 * `integrar-reportes`).
 *
 * Es un módulo de EFECTO LATERAL: no exporta nada y existe solo por el `Chart.register(...)`
 * de abajo. Lo importan los componentes que pintan gráficas (`evolution-chart.tsx` y
 * `classification-chart.tsx`), que a su vez se cargan con `lazy()` desde sus páginas; por eso
 * Chart.js acaba en un chunk DIFERIDO en vez de en el chunk de entrada (antes entraba por
 * `chart-theme.ts`, que importaba el paquete en runtime y lo registraba en su top level).
 *
 * El registro es MANUAL y tree-shaken: un `import "chart.js/auto"` arrastraría el paquete
 * entero y anularía el propósito del módulo.
 */

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);
