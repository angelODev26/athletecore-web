import { create } from "zustand";
import { persist } from "zustand/middleware";

import { getRolesFromToken, hasAnyRole } from "./jwt";
import type { AuthTokens } from "./tokens";

interface SessionState {
  tokens: AuthTokens | null;
  setTokens: (tokens: AuthTokens) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      tokens: null,
      setTokens: (tokens) => set({ tokens }),
      clearSession: () => set({ tokens: null }),
    }),
    {
      name: "athletecore.session",
      partialize: (state) => ({ tokens: state.tokens }),
    },
  ),
);

export function useAccessToken(): string | null {
  return useSessionStore((state) => state.tokens?.access ?? null);
}

export function useSessionRoles(): string[] {
  const accessToken = useAccessToken();
  return getRolesFromToken(accessToken);
}

export function useHasAnyRole(requiredRoles: readonly string[]): boolean {
  const roles = useSessionRoles();
  return hasAnyRole(roles, requiredRoles);
}
