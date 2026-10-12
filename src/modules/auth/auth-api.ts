import { useMutation } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import type { LoginRequest, LoginResponse, RegisterRequest, UserResponse } from "@/lib/api/types";
import { useSessionStore } from "@/lib/auth/session-store";

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

export function useRegisterMutation() {
  return useMutation({
    mutationKey: ["auth", "register"],
    mutationFn: (body: RegisterRequest) =>
      apiFetch<UserResponse>("/users", { method: "POST", body, auth: false }),
  });
}
