// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { useSessionStore } from "./session-store";

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    globalThis.btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

describe("session-store", () => {
  beforeEach(() => {
    useSessionStore.getState().clearSession();
    window.localStorage.removeItem("athletecore.session");
  });

  it("guarda el token y calcula expiresAt desde el claim exp", () => {
    const token = fakeJwt({ exp: 4_000_000_000 });
    useSessionStore.getState().setSession({ access: token }, 86_400_000);

    const state = useSessionStore.getState();
    expect(state.tokens?.access).toBe(token);
    expect(state.expiresAt).toBe(4_000_000_000_000);
  });

  it("usa expiresIn (ms) como fallback cuando no hay claim exp", () => {
    const before = Date.now();
    useSessionStore.getState().setSession({ access: fakeJwt({ sub: "x" }) }, 60_000);

    const { expiresAt } = useSessionStore.getState();
    expect(expiresAt).not.toBeNull();
    expect(expiresAt!).toBeGreaterThanOrEqual(before + 60_000);
    expect(expiresAt!).toBeLessThan(Date.now() + 60_000 + 1_000);
  });

  it("persiste la sesión en localStorage", () => {
    const token = fakeJwt({ exp: 4_000_000_000 });
    useSessionStore.getState().setSession({ access: token });

    const raw = window.localStorage.getItem("athletecore.session");
    expect(raw).not.toBeNull();
    expect(raw!).toContain(token);
  });

  it("limpia sesión completa al cerrar o expirar", () => {
    useSessionStore.getState().setSession({ access: fakeJwt({ exp: 4_000_000_000 }) });
    useSessionStore.getState().clearSession();

    const state = useSessionStore.getState();
    expect(state.tokens).toBeNull();
    expect(state.expiresAt).toBeNull();
  });
});
