import type { ComponentProps } from "react";
import type { Line } from "react-chartjs-2";
import { vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { ApiRequestOptions } from "@/lib/api";

/*
 * Utilidades de test del módulo reportes. Deliberadamente LOCALES al módulo
 * (mismo patrón que `modules/checkups/test-utils.ts`): resuelve `apiFetch` por
 * path+method en vez de por orden de llamada, de modo que las queries puedan
 * dispararse en cualquier orden. Cualquier llamada no enrutada rechaza con un
 * error explícito (el test falla con el veredicto correcto).
 */
export interface ApiRoute {
  match: RegExp;
  method?: string;
  /** Valor resuelto o función que devuelve la promesa (para errores). */
  resolve: unknown | ((path: string, options: unknown) => Promise<unknown>);
}

export function installApiRoutes(routes: ApiRoute[]): void {
  vi.mocked(apiFetch).mockImplementation((path: string, options?: ApiRequestOptions) => {
    const method = options?.method ?? "GET";
    for (const route of routes) {
      if (route.method !== undefined && route.method !== method) {
        continue;
      }
      if (route.match.test(path)) {
        if (typeof route.resolve === "function") {
          return (route.resolve as (path: string, options: unknown) => Promise<unknown>)(path, options);
        }
        return Promise.resolve(route.resolve);
      }
    }
    return Promise.reject(new Error(`Unexpected ${method} ${path} (sin ruta mockeada)`));
  });
}

/**
 * Props que recibe el `<Line/>` de `react-chartjs-2`. jsdom no implementa
 * `<canvas>`, así que los tests mockean `react-chartjs-2` y aseveran estas props.
 */
export type LineChartProps = ComponentProps<typeof Line>;
