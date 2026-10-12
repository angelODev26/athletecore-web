import { create } from "zustand";
import { persist } from "zustand/middleware";

import { getRolesFromToken, hasAnyRole, getExpiresAtMsFromToken, isJwtExpired } from "./jwt";
import type { AuthTokens } from "./tokens";

interface SessionState {
  tokens: AuthTokens | null;
  expiresAt: number | null;
  setSession: (tokens: AuthTokens, expiresInMs?: number) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      tokens: null,
      expiresAt: null,
      setSession: (tokens, expiresInMs) =>
        set({
          tokens,
          expiresAt: getExpiresAtMsFromToken(tokens.access) ?? (expiresInMs ? Date.now() + expiresInMs : null),
        }),
      clearSession: () => set({ tokens: null, expiresAt: null }),
    }),
    {
      name: "athletecore.session",
      partialize: (state) => ({ tokens: state.tokens, expiresAt: state.expiresAt }),
    },
  ),
);

export function useAccessToken(): string | null {
  return useSessionStore((state) => state.tokens?.access ?? null);
}

export function useIsSessionExpired(): boolean {
  const accessToken = useAccessToken();
  const expiresAt = useSessionStore((state) => state.expiresAt);
  if (!accessToken) {
    return true;
  }
  if (expiresAt !== null) {
    return Date.now() >= expiresAt;
  }
  return isJwtExpired(accessToken);
}

export function useSessionRoles(): string[] {
  const accessToken = useAccessToken();
  return getRolesFromToken(accessToken);
}

export function useHasAnyRole(requiredRoles: readonly string[]): boolean {
  const roles = useSessionRoles();
  return hasAnyRole(roles, requiredRoles);
}
