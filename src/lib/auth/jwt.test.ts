import { describe, expect, it } from "vitest";

import { decodeJwtPayload, getRolesFromToken, hasAnyRole } from "./jwt";

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
