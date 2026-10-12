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

export function getUsernameFromToken(token: string | null | undefined): string | null {
  if (!token) {
    return null;
  }
  const sub = decodeJwtPayload(token)?.sub;
  return typeof sub === "string" ? sub : null;
}

/** Expiración en ms epoch desde el claim `exp` (segundos). Null si falta o es inválida. */
export function getExpiresAtMsFromToken(token: string | null | undefined): number | null {
  if (!token) {
    return null;
  }
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp === "number" && Number.isFinite(exp)) {
    return exp * 1000;
  }
  if (typeof exp === "string" && exp.trim() !== "" && Number.isFinite(Number(exp))) {
    return Number(exp) * 1000;
  }
  return null;
}

export function isJwtExpired(token: string | null | undefined, nowMs = Date.now(), skewMs = 0): boolean {
  if (!token) {
    return true;
  }
  const expiresAt = getExpiresAtMsFromToken(token);
  if (expiresAt === null) {
    return false;
  }
  return nowMs >= expiresAt - skewMs;
}
