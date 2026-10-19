import { useQuery } from "@tanstack/react-query";

import { apiFetch, moduleQueryKey } from "@/lib/api";
import type { UserResponse } from "@/lib/api/types";
import { paginateClientSide } from "@/modules/training/training-api";

/*
 * Capa de datos del módulo usuarios (contrato docs/backend-contract/03 §4).
 * `GET /users` es SOLO ADMIN y NO pagina en el back (doc 08 §3): el hook trae el
 * array completo y la UI pagina en cliente (decisión D2) reutilizando el adapter
 * `paginateClientSide` de training-api con `USERS_PAGE_SIZE`.
 * La respuesta NO trae roles (`UserResponse` no tiene `roles` hasta el
 * prerrequisito P2/D7): la lista no muestra columna de rol en la fase A.
 * No existen otros endpoints de users (sin PUT/DELETE/GET by id): no hay nada
 * sobre lo que construir un toggle de `enabled` — el badge es informativo (C4).
 */

const USERS_RESOURCE = "/users";

const USERS_ROOT_KEY = moduleQueryKey("users");
export const USERS_LIST_KEY = [...USERS_ROOT_KEY, "list"] as const;

/** Tamaño de página de la paginación client-side (D2; el back devuelve todo). */
export const USERS_PAGE_SIZE = 10;

export async function fetchUsers(): Promise<UserResponse[]> {
  return apiFetch<UserResponse[]>(USERS_RESOURCE);
}

export function useUsers() {
  return useQuery({
    queryKey: USERS_LIST_KEY,
    queryFn: fetchUsers,
  });
}

export { paginateClientSide };
