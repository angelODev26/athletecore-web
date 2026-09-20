function base64UrlToBase64(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  return padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payload = globalThis.atob(base64UrlToBase64(parts[1]));
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getRolesFromToken(token: string | null | undefined): string[] {
  if (!token) {
    return [];
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return [];
  }

  const rawRoles = payload.roles ?? payload.role ?? payload.authorities;
  const roles = Array.isArray(rawRoles) ? rawRoles : typeof rawRoles === "string" ? [rawRoles] : [];
  return roles
    .filter((role): role is string => typeof role === "string")
    .map(normalizeRole);
}

function normalizeRole(role: string): string {
  return role.startsWith("ROLE_") ? role.slice("ROLE_".length) : role;
}

export function hasAnyRole(userRoles: readonly string[], requiredRoles: readonly string[]): boolean {
  return requiredRoles.some((role) => userRoles.includes(role));
}
