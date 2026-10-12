import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { getRolesFromToken, hasAnyRole } from "@/lib/auth/jwt";
import { useSessionStore } from "@/lib/auth/session-store";
import { ForbiddenState } from "@/shared/components/states";

function useValidSession() {
  const accessToken = useSessionStore((state) => state.tokens?.access ?? null);
  const expiresAt = useSessionStore((state) => state.expiresAt);
  const clearSession = useSessionStore((state) => state.clearSession);

  const isExpired = accessToken !== null && expiresAt !== null && Date.now() >= expiresAt;

  // Expulsión proactiva: sin refresh token la sesión vive hasta `exp` (doc 02 §2).
  useEffect(() => {
    if (accessToken === null || expiresAt === null) {
      return;
    }
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearSession();
      return;
    }
    const timer = window.setTimeout(clearSession, remaining);
    return () => window.clearTimeout(timer);
  }, [accessToken, expiresAt, clearSession]);

  if (accessToken === null || isExpired) {
    return { accessToken: null };
  }
  return { accessToken };
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { accessToken } = useValidSession();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { accessToken } = useValidSession();

  if (accessToken) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export function RequireRoles({ roles, children }: { roles: readonly string[]; children: ReactNode }) {
  const accessToken = useSessionStore((state) => state.tokens?.access ?? null);
  const userRoles = getRolesFromToken(accessToken);

  if (!hasAnyRole(userRoles, roles)) {
    return <ForbiddenState />;
  }

  return <>{children}</>;
}
