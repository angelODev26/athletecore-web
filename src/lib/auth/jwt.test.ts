import { describe, expect, it } from "vitest";

import { decodeJwtPayload, getExpiresAtMsFromToken, getRolesFromToken, getUsernameFromToken, hasAnyRole, isJwtExpired } from "./jwt";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    globalThis.btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("getRolesFromToken", () => {
  it("normaliza roles con prefijo ROLE_ tal como los emite el backend", () => {
    const token = fakeJwt({ roles: ["ROLE_ADMIN", "ROLE_COACH"] });
    expect(getRolesFromToken(token)).toEqual(["ADMIN", "COACH"]);
  });

  it("soporta el claim singular 'role'", () => {
    const token = fakeJwt({ role: "ROLE_USER" });
    expect(getRolesFromToken(token)).toEqual(["USER"]);
  });

  it("devuelve [] si el token falta o es inválido", () => {
    expect(getRolesFromToken(null)).toEqual([]);
    expect(getRolesFromToken("no-es-un-jwt")).toEqual([]);
  });

  it("deja intactos roles que ya vienen sin prefijo", () => {
    const token = fakeJwt({ roles: ["ADMIN"] });
    expect(getRolesFromToken(token)).toEqual(["ADMIN"]);
  });
});

describe("hasAnyRole", () => {
  it("matchea roles normalizados contra los requeridos por guards", () => {
    const token = fakeJwt({ roles: ["ROLE_ADMIN"] });
    expect(hasAnyRole(getRolesFromToken(token), ["ADMIN", "COACH"])).toBe(true);
  });

  it("rechaza cuando el usuario no tiene el rol requerido", () => {
    const token = fakeJwt({ roles: ["ROLE_USER"] });
    expect(hasAnyRole(getRolesFromToken(token), ["ADMIN", "COACH"])).toBe(false);
  });
});

describe("decodeJwtPayload", () => {
  it("expone el payload completo (incluido sub)", () => {
    const token = fakeJwt({ sub: "coach.demo", exp: 4_000_000_000 });
    expect(decodeJwtPayload(token)?.sub).toBe("coach.demo");
  });
});

describe("getExpiresAtMsFromToken", () => {
  it("convierte el claim exp de segundos a milisegundos", () => {
    const token = fakeJwt({ exp: 1_757_280_000 });
    expect(getExpiresAtMsFromToken(token)).toBe(1_757_280_000_000);
  });

  it("devuelve null si falta el claim o el token es inválido", () => {
    expect(getExpiresAtMsFromToken(fakeJwt({ sub: "x" }))).toBeNull();
    expect(getExpiresAtMsFromToken("no-es-un-jwt")).toBeNull();
    expect(getExpiresAtMsFromToken(null)).toBeNull();
  });
});

describe("isJwtExpired", () => {
  it("marca expirado un token con exp en el pasado", () => {
    const token = fakeJwt({ exp: 1_000_000 }); // 1970-01-12
    expect(isJwtExpired(token)).toBe(true);
  });

  it("mantiene vigente un token con exp en el futuro", () => {
    const token = fakeJwt({ exp: 4_000_000_000 }); // 2096
    expect(isJwtExpired(token)).toBe(false);
  });

  it("considera sesión ausente como expirada", () => {
    expect(isJwtExpired(null)).toBe(true);
    expect(isJwtExpired(undefined)).toBe(true);
  });
});

describe("getUsernameFromToken", () => {
  it("devuelve el claim sub tal como lo emite el backend", () => {
    const token = fakeJwt({ sub: "coach.demo" });
    expect(getUsernameFromToken(token)).toBe("coach.demo");
  });

  it("devuelve null si el token falta o es inválido", () => {
    expect(getUsernameFromToken(null)).toBeNull();
    expect(getUsernameFromToken("no-es-un-jwt")).toBeNull();
  });
});
