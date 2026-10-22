import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, moduleQueryKey } from "@/lib/api";
import type { CreateUserRequest, UserResponse } from "@/lib/api/types";
import { paginateClientSide } from "@/modules/training/training-api";

/*
 * Capa de datos del módulo usuarios (contrato docs/backend-contract/03 §3–§5).
 * `GET /users` es SOLO ADMIN y NO pagina en el back (doc 08 §3): el hook trae el
 * array completo y la UI pagina en cliente (decisión D2) reutilizando el adapter
 * `paginateClientSide` de training-api con `USERS_PAGE_SIZE`.
 *
 * Fase B (`alta-usuarios-admin`): `POST /users` también es SOLO ADMIN y acepta
 * `roles` (ADMIN/COACH/USER). El 201 devuelve `UserResponse` con `roles`; el hook
 * invalida la lista para que el usuario nuevo aparezca sin asumir su posición.
 * No existen otros endpoints de users (sin PUT/DELETE/GET by id): no hay nada
 * sobre lo que construir un toggle de `enabled` — el badge es informativo.
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

/**
 * Alta de usuario (solo ADMIN). El back normaliza los roles a `ROLE_*` y, al
 * crear, invalida la lista para que el refetch traiga el usuario nuevo.
 */
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...USERS_ROOT_KEY, "create"],
    mutationFn: (body: CreateUserRequest) =>
      apiFetch<UserResponse>(USERS_RESOURCE, { method: "POST", body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_LIST_KEY });
    },
  });
}

export { paginateClientSide };
