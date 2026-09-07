# 07 — Contrato API: Reportes (Report Domain)

> Fuentes: `ReportController`, `ReportScheduleController`, `ReportGenerationService`,
> `AthleteReportingService`, `TeamReportingService`, `ExportService`, DTOs de
> `report/dto/`, enums `ReportType`, `ReportStatus`.
>
> El módulo tiene **dos "caras"** que conviene no confundir:
>
> 1. **Datos estructurados JSON para el front** (dashboards, gráficas):
>    `GET /athletes/{id}/report` y `GET /reports/team`.
> 2. **Artefactos PDF persistidos** (generación, historial, descarga, programación cron):
>    `/api/v1/reports` + `/api/v1/report-schedules`.

---

## 1. Enums

| Enum | Valores | Significado |
|------|---------|-------------|
| `ReportType` | `INDIVIDUAL`, `GENERAL` | INDIVIDUAL requiere `athleteId`; GENERAL filtra por `category` |
| `ReportStatus` | `PENDING`, `GENERATED`, `FAILED` | Ciclo de vida del artefacto; en `FAILED` ver `errorMessage` |

---

## 2. Datos estructurados (pensados para el front, sin PDF)

### `GET /api/v1/athletes/{athleteId}/report` 🔐 Auth → `IndividualReportResponse`

Consolida todo lo relevante de un deportista en UNA llamada (ideal para su dashboard):

```json
{
  "athleteId": 1,
  "athleteFullName": "Michael Phelps",
  "timeEvolution": [
    { "year": 2026, "month": 1, "style": "LIBRE", "distance": 100,
      "timeSeconds": 66.100, "timeFormatted": "01:06.100" },
    { "year": 2026, "month": 2, "style": "LIBRE", "distance": 100,
      "timeSeconds": 65.250, "timeFormatted": "01:05.250" }
  ],
  "attendance": {
    "totalSessions": 40,
    "presentCount": 34,
    "absentCount": 4,
    "justifiedCount": 2,
    "currentAbsenceStreak": 0
  },
  "projections": [ { "style": "LIBRE", "distance": 100, "category": "JUVENIL",
    "classification": "CERCANO_A_MEDALLERIA", "timeSeconds": 65.250,
    "timeFormatted": "01:05.250", "diffVsBronzeSeconds": 0.500,
    "diffVsBronzeFormatted": "+00:00.500" } ]
}
```

- `timeEvolution` = **historia de tiempos por (estilo, distancia) a lo largo de los
  chequeos** — es exactamente la serie para la gráfica de evolución (líneas por
  style+distance; eje Y invertido: menor tiempo = mejor).
- `projections` reutiliza el `MedalProjectionResponse` del módulo checkup (ver `06`).
- Errores: `404` si el atleta no existe o está borrado.

### `GET /api/v1/reports/team?category=` 🔐 Auth → `TeamReportResponse`

Comparativo de equipo, agregado por `(style, distance, category)`:

```json
{
  "category": "JUVENIL",
  "entries": [
    {
      "style": "LIBRE", "distance": 100, "category": "JUVENIL", "athleteCount": 8,
      "athletes": [
        { "athleteId": 1, "athleteFullName": "Michael Phelps",
          "bestTimeSeconds": 65.250, "bestTimeFormatted": "01:05.250",
          "classification": "CERCANO_A_MEDALLERIA",
          "diffVsBronzeSeconds": 0.500, "diffVsBronzeFormatted": "+00:00.500" }
      ]
    }
  ]
}
```

- `category` opcional; sin filtro devuelve todas las combinaciones.
- `bestTime*` = **mejor tiempo histórico** del atleta en esa prueba (el más rápido).
- Uso natural: tabla/ranking por prueba con badge de `classification`.
- ⚠️ Cálculo en vivo con proyección en lote (N+1 resuelto), pero es lectura pesada:
  el front debería cachearlo y no adjuntarlo a polling agresivo.

---

## 3. Reportes PDF persistidos — `/api/v1/reports`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/v1/reports` | ADMIN/COACH | Genera reporte + PDF (**síncrono**) → `201` |
| `GET` | `/api/v1/reports?type=&athleteId=&status=` | Auth | Lista con filtros (⚠️ sin paginar, filtro en memoria) |
| `GET` | `/api/v1/reports/{id}` | Auth | Detalle con metadata de exports |
| `DELETE` | `/api/v1/reports/{id}` | ADMIN/COACH | Soft delete → `204` (sus exports también) |
| `GET` | `/api/v1/reports/{id}/exports` | Auth | Metadata de exports del reporte |
| `GET` | `/api/v1/reports/{id}/export` | Auth | **Descarga el PDF** (último export) |

### `POST /api/v1/reports` — generación SÍNCRONA

```json
{ "reportType": "INDIVIDUAL", "athleteId": 1, "year": 2026, "month": 3, "title": "Informe marzo" }
// o GENERAL:
{ "reportType": "GENERAL", "category": "JUVENIL", "title": "Equipo juvenil Q1" }
```

| Campo | Validación |
|-------|-----------|
| `reportType` | obligatorio (`INDIVIDUAL`/`GENERAL`) |
| `athleteId` | requerido si `INDIVIDUAL` |
| `category` | filtro opcional (útil en `GENERAL`) |
| `year`, `month` | opcionales |
| `title` | obligatorio, máx 200 |

⚠️ **El ciclo PENDING → GENERATED/FAILED ocurre DENTRO de la misma request**
(no hay worker asíncrono todavía — backlog POST-v1.0.0). Implicaciones:

- La respuesta `201` ya viene con `status` final: casi siempre `GENERATED`;
  si el ensamblado falló (p.ej. atleta sin datos) vendrá `FAILED` + `errorMessage`.
- La llamada puede tardar unos segundos con muchos datos → usar spinner, no polling de
  estado. (Si en algún momento el back lo hace async, el patrón sería: POST → `PENDING` →
  poll `GET /reports/{id}` hasta `GENERATED`/`FAILED`. El front puede tolerar ambos
  comportamientos leyendo `status`.)

### `ReportResponse` / `ReportDetailResponse`

```json
// ReportResponse (listado)
{ "id": 9, "reportType": "INDIVIDUAL", "athleteId": 1, "category": null,
  "year": 2026, "month": 3, "title": "Informe marzo", "status": "GENERATED",
  "errorMessage": null, "createdAt": "2026-09-01T10:00:00Z",
  "updatedAt": "2026-09-01T10:00:01Z", "active": true }

// ReportDetailResponse = lo mismo + "exports": [ReportExportResponse...]
```

### `ReportExportResponse` (metadata, SIN binario)

```json
{ "id": 3, "reportId": 9, "format": "PDF", "fileName": "reporte-9.pdf",
  "fileSizeBytes": 48213, "contentType": "application/pdf",
  "createdAt": "..." }
```

### Descarga: `GET /api/v1/reports/{id}/export`

- Respuesta **binaria**: `Content-Type: application/pdf`,
  `Content-Disposition: attachment; filename="reporte-9.pdf"`.
- El PDF del **export más reciente**. Los PDFs se persisten como bytes en DB.
- ⚠️ Front: descargar con `fetch` + `Authorization` header y crear `Blob` URL
  (un simple `<a href>` no lleva el JWT). Ante 401 el body es JSON de error, no PDF —
  comprobar `Content-Type` de la respuesta antes de abrir el blob.
- Errores: `404` si el reporte no existe o no tiene exports (p.ej. estado `FAILED`).

---

## 4. Programación automática — `/api/v1/report-schedules`

| Método | Path | Rol | Descripción |
|--------|------|-----|-------------|
| `POST` | `/api/v1/report-schedules` | ADMIN | Crear programación → `201` |
| `GET` | `/api/v1/report-schedules` | Auth | Lista (⚠️ sin paginar) |
| `GET` | `/api/v1/report-schedules/{id}` | Auth | Detalle |
| `PUT` | `/api/v1/report-schedules/{id}` | ADMIN | Actualización **completa** (todos los campos) |
| `DELETE` | `/api/v1/report-schedules/{id}` | ADMIN | Soft delete → `204` |

### Request (create y update comparten campos; update exige todos)

```json
{
  "reportType": "GENERAL",
  "athleteId": null,
  "category": "JUVENIL",
  "cronExpression": "0 0 6 1 * *",
  "timezone": "America/Bogota",
  "active": true
}
```

- `cronExpression`: **formato Spring de 6 campos** (`seg min hora día-mes mes día-semana`),
  NO el cron clásico de 5 de Unix. Se valida en servidor con `CronExpression` de Spring
  (inválida → `400`).
- `timezone`: nombre IANA (opcional; default del servidor).
- `active`: permite pausar sin borrar.

### `ReportScheduleResponse`

```json
{ "id": 2, "reportType": "GENERAL", "athleteId": null, "category": "JUVENIL",
  "cronExpression": "0 0 6 1 * *", "timezone": "America/Bogota", "active": true,
  "lastRunAt": "2026-09-01T06:00:00Z", "nextRunAt": "2026-10-01T06:00:00Z",
  "createdAt": "...", "updatedAt": "..." }
```

- `lastRunAt`/`nextRunAt` precalculados por el servidor — el front solo los muestra
  ("última ejecución", "próxima ejecución").
- El scheduler hace poll cada 60 s (`report.scheduling.poll-interval-ms`) y ejecuta las
  programaciones cuyo `nextRunAt` venció; los reportes generados aparecen en
  `GET /api/v1/reports`.

### Implicación de UX

Un formulario amigable NO debe pedir cron crudo: opciones tipo "mensual el día 1 a las
6:00" que el front traduzca a cron de 6 campos (y muestre `nextRunAt` como confirmación).

---

## 5. Flujo de UI sugerido

```
Dashboard atleta: GET /athletes/{id}/report  (gráfica + asistencia + proyección)
Vista equipo:     GET /reports/team?category=
Biblioteca PDF:   GET /reports (filtros) → detalle → botón descargar → /{id}/export
Generar ahora:    POST /reports (spinner; leer status de la respuesta)
Automatizar:      CRUD /report-schedules (ADMIN) con nextRunAt visible
```

---

**Anterior:** `06-contrato-api-chequeos.md` · **Siguiente:** `08-convenciones-transversales.md`
