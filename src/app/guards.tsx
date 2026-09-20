import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { getRolesFromToken, hasAnyRole } from "@/lib/auth/jwt";
import { useSessionStore } from "@/lib/auth/session-store";
import { ForbiddenState } from "@/shared/components/states";

export function RequireAuth({ children }: { children: ReactNode }) {
  const accessToken = useSessionStore((state) => state.tokens?.access ?? null);

  if (!accessToken) {
    return <Navigate to="/login" replace />;
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
