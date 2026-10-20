// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

/*
 * Guard anti-drift del envelope de sesión (design.md C3 de e2e-flujos-criticos).
 * Monta el store REAL en jsdom, persiste una sesión y compara el JSON de
 * localStorage con el builder PURO del fixture E2E (e2e/fixtures/session.ts).
 * Si alguien cambia la clave, el partialize o la version del store, este test
 * rompe PRIMERO — no los cinco specs E2E. Este test NO modifica el store.
 */

import { buildSessionStoragePayload, expiresAtMsFromToken } from "../../../e2e/fixtures/session.ts";
import { getExpiresAtMsFromToken } from "./jwt";
import { useSessionStore } from "./session-store";

/** JWT de prueba con claim `exp` fijo (solo se decodifica, nunca se valida firma). */
const FAKE_EXP_SECONDS = 4_102_444_800; // 2100-01-01T00:00:00Z
const fakeJwt = (() => {
  const header = btoa(JSON.stringify({ alg: "HS384", typ: "JWT" })).replace(/=+$/, "");
  const payload = btoa(JSON.stringify({ sub: "e2e-guard", exp: FAKE_EXP_SECONDS })).replace(
    /=+$/,
    "",
  );
  return `${header}.${payload}.firma-falsa`;
})();

describe("session-store shape (guard anti-drift del fixture E2E)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSessionStore.getState().clearSession();
  });

  it("el envelope persistido coincide estructuralmente con buildSessionStoragePayload", () => {
    useSessionStore.getState().setSession({ access: fakeJwt });

    const raw = window.localStorage.getItem("athletecore.session");
    expect(raw, "el store debe persistir en localStorage bajo 'athletecore.session'").not.toBeNull();

    const persisted = JSON.parse(raw as string) as unknown;
    const expected = buildSessionStoragePayload(fakeJwt, getExpiresAtMsFromToken(fakeJwt));
    expect(persisted).toEqual(expected);
  });

  it("la clave y la version persistida son las que el fixture E2E asume", () => {
    useSessionStore.getState().setSession({ access: fakeJwt });

    const persisted = JSON.parse(
      window.localStorage.getItem("athletecore.session") as string,
    ) as { state?: unknown; version?: unknown };

    expect(persisted.version).toBe(buildSessionStoragePayload(fakeJwt, null).version);
    expect(persisted).toHaveProperty("state.tokens.access", fakeJwt);
    expect(persisted).toHaveProperty(
      "state.expiresAt",
      buildSessionStoragePayload(fakeJwt, getExpiresAtMsFromToken(fakeJwt)).state.expiresAt,
    );
  });

  it("el parseo de exp del fixture coincide con el del store real", () => {
    // El fixture replica `getExpiresAtMsFromToken` para no importar el módulo de
    // auth desde Playwright; este assert detecta cualquier drift en esa lógica.
    expect(expiresAtMsFromToken(fakeJwt)).toBe(getExpiresAtMsFromToken(fakeJwt));
    expect(expiresAtMsFromToken("no-es-un-jwt")).toBe(getExpiresAtMsFromToken("no-es-un-jwt"));
  });
});
