import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { FullConfig } from "@playwright/test";

import { ROLE_CREDENTIALS } from "./fixtures/session";

/*
 * Precondición de la suite (design.md C2 de e2e-flujos-criticos): si el backend
 * real no responde en :8080, se aborta TODA la suite con un mensaje accionable —
 * nunca repartir el fallo en timeouts difusos por test.
 *
 * Nota de implementación: el actuator/health del perfil local exige autenticación
 * (401 sin JWT), así que "servidor arriba" = cualquier respuesta HTTP del backend
 * (200 o 401); la validación real del seed la hace el sanity de login.
 */

const API_HEALTH_URL = "http://localhost:8080/api/v1/actuator/health";
const API_LOGIN_URL = "http://localhost:8080/api/v1/auth/login";

/** Levanta el entorno: comandos de los designs previos (doc 01 §setup). */
function environmentMessage(failure: string): string {
  const apiDir = join(homedir(), "athletecore-api");
  const dockerCommand = existsSync("/usr/bin/docker")
    ? "docker start athletecore-postgres"
    : existsSync("/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe")
      ? "docker.exe start athletecore-postgres   # Docker Desktop (interop WSL)"
      : null;

  const lines = [
    "",
    "══════════════════════════════════════════════════════════════════",
    "  La suite E2E exige el backend REAL de AthleteCore en :8080",
    "══════════════════════════════════════════════════════════════════",
    "",
    failure,
    "",
    "1) PostgreSQL (contenedor athletecore-postgres):",
    dockerCommand !== null
      ? `   ${dockerCommand}`
      : "   Arranca Docker Desktop y activa la integración WSL de esta distro.",
    "",
    "2) API (en ~/athletecore-api, perfil local):",
    existsSync(join(apiDir, "mvnw"))
      ? `   cd ${apiDir} && SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run`
      : "   (No se encontró ~/athletecore-api: clona/ubica el repo del backend.)",
    "",
    "3) Navegador de Playwright (solo la primera vez):",
    "   npx playwright install chromium",
    "",
    "══════════════════════════════════════════════════════════════════",
    "",
  ];
  return lines.join("\n");
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 5_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Lanza el proceso si el backend no está vivo: fail-fast accionable. */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  // 1) Health-check: cualquier respuesta HTTP (200 o 401) = servidor arriba.
  try {
    await fetchWithTimeout(API_HEALTH_URL);
  } catch {
    throw new Error(
      `El backend no responde en ${API_HEALTH_URL}.\n` +
        environmentMessage("Falló el health-check: no hubo respuesta HTTP del backend."),
    );
  }

  // 2) Sanity: el perfil local debe tener el seed de usuarios demo.
  try {
    const response = await fetchWithTimeout(API_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ROLE_CREDENTIALS.ADMIN),
    });
    if (!response.ok) {
      throw new Error(`POST /auth/login respondió ${response.status}`);
    }
    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      throw new Error("la respuesta no contiene token");
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `El backend responde en :8080 pero el sanity de login con ${ROLE_CREDENTIALS.ADMIN.username} falló (${detail}).\n` +
        "El perfil local no parece tener el seed de usuarios demo.\n" +
        environmentMessage("Falló el sanity de login; el health-check sí respondió."),
    );
  }
}
