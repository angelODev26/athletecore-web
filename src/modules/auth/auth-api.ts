import { useMutation } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import type { LoginRequest, LoginResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";

/*
 * API de autenticación. El registro público ya NO existe: las cuentas las crea
 * un ADMIN con `useCreateUser` (`src/modules/users/users-api.ts`). Aquí solo
 * queda el login (`POST /auth/login`, único endpoint público junto al refresh).
 */

export function useLoginMutation() {
  const setSession = useSessionStore((state) => state.setSession);

  return useMutation({
    mutationKey: ["auth", "login"],
    mutationFn: (body: LoginRequest) =>
      apiFetch<LoginResponse>("/auth/login", { method: "POST", body, auth: false }),
    onSuccess: (data) => {
      setSession({ access: data.token }, data.expiresIn);
    },
  });
}
