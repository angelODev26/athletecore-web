import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import type { FullConfig } from "@playwright/test";

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

/** Leventanta el entorno: comandos de los designs previos (doc 01 §setup). */
function environmentMessage(): string {
  const apiDir = join(homedir(), "athletecore-api");
  const dockerAvailable =
    existsSync("/usr/bin/docker") ||
    existsSync("/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe");

  const lines = [
    "",
    "══════════════════════════════════════════════════════════════════",
    "  La suite E2E exige el backend REAL de AthleteCore en :8080",
    "══════════════════════════════════════════════════════════════════",
    "",
    "1) PostgreSQL (docker athletecore-postgres):",
    dockerAvailable
      ? `   docker.exe start athletecore-postgres   # o: docker start athletecore-postgres`
      : "   Arranca Docker Desktop y activa la integración WSL de esta distro.",
    "",
    "2) API (en ~/athletecore-api, perfil local):",
    existsSync(join(apiDir, "mvnw"))
      ? `   cd ${apiDir} && SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run`
      : "   (No se encontró ~/athletecore-api: clona/ubica el repo del backend.)",
    "",
    "El health-check y el sanity de login fallaron antes de ejecutar un solo test.",
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
      `El backend no responde en ${API_HEALTH_URL}.\n${environmentMessage()}`,
    );
  }

  // 2) Sanity: el perfil local debe tener el seed de usuarios demo.
  try {
    const response = await fetchWithTimeout(API_LOGIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin.demo", password: "secret123" }),
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
      `El backend responde en :8080 pero el sanity de login con admin.demo falló (${detail}).\n` +
        "El perfil local no parece tener el seed de usuarios demo.\n" +
        environmentMessage(),
    );
  }
}
