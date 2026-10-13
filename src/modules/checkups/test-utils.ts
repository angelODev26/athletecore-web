import { vi } from "vitest";

import { apiFetch } from "@/lib/api";
import type { ApiRequestOptions } from "@/lib/api";

/*
 * Router de `apiFetch` para los tests del módulo: resuelve por path+method en vez
 * de por orden de llamada (las queries del módulo pueden dispararse en cualquier
 * orden entre componentes). Cualquier llamada no enrutada rechaza con error
 * explícito — así los tests fallan con el veredicto correcto.
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
