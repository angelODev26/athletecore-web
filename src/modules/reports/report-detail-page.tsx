import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isApiError, toUserFacingMessage } from "@/lib/api";
import type { ReportDetailResponse } from "@/lib/api/types";
import { hasAnyRole } from "@/lib/auth/jwt";
import { useSessionRoles } from "@/lib/auth/session-store";
import { reportPeriodLabel, reportTargetLabel, reportTypeLabel } from "@/modules/reports/format";
import { ReportStatusBadge } from "@/modules/reports/report-status-badge";
import { ReportsTabs } from "@/modules/reports/reports-tabs";
import { downloadReportExport, useDeleteReport, useReport } from "@/modules/reports/reports-api";
import { ErrorState } from "@/shared/components/states";
import { formatInstantDateTime, humanFileSize } from "@/shared/format/dates";

/*
 * C5/C6: detalle de un reporte persistido (`/reports/:reportId`).
 *
 * - Metadata completa del `ReportDetailResponse` (que YA trae los `exports`: no se
 *   consume `GET /reports/{id}/exports`, sería duplicar la llamada).
 * - El objetivo se muestra como `Atleta #id` (el DTO solo trae `athleteId`) siguiendo el
 *   precedente D4/dashboard: resolver el nombre exigiría traer el listado completo de
 *   deportistas desde el detalle; el nombre se resuelve en la biblioteca, que sí lo carga.
 * - Descarga (C6): el binario se pide por `apiFetchBlob` (un `<a href>` no lleva el JWT),
 *   se crea una Blob URL, se pulsa un `<a download>` y se libera la URL inmediatamente
 *   (también si el click falla). El botón está deshabilitado si el reporte no está
 *   `GENERATED` o no tiene exports, con un texto que lo explica.
 * - Borrado (soft delete, 204) con confirmación explícita y solo ADMIN/COACH. Un fallo
 *   del DELETE (500/red) NO cierra el diálogo: se muestra el error seguro dentro del
 *   mismo (patrón `actionError` de la página de programaciones).
 */

/** Fallback de borrado cuando el error no viene del API (p. ej. red caída). */
const DELETE_FALLBACK_ERROR = "No se pudo borrar el reporte. Inténtalo de nuevo.";

/** Nombre de descarga: el del `Content-Disposition`; si no viene, uno predecible. */
export function reportDownloadFileName(fileName: string | null, reportId: number): string {
  return fileName ?? `reporte-${reportId}.pdf`;
}

/**
 * C6: materializa el blob en una descarga real del navegador. La Blob URL se libera
 * SIEMPRE (incluso si el click lanza) para no filtrar object URLs, así que no se
 * devuelve: la URL ya estaría revocada al salir de la función.
 */
export function saveBlobAsFile(blob: Blob, fileName: string, doc: Document = document): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  doc.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Error seguro de la descarga (nunca texto crudo del back): el 404 del export significa
 * que el reporte no tiene un PDF descargable (p. ej. `FAILED` o sin exports).
 */
export function toDownloadErrorMessage(error: unknown): string {
  if (isApiError(error) && error.status === 404) {
    return "El reporte no tiene un PDF descargable.";
  }
  return "No se pudo descargar el PDF. Inténtalo de nuevo.";
}

/** Motivo por el que la descarga no está disponible (texto que lo explica, C5). */
export function downloadUnavailableReason(report: ReportDetailResponse): string | null {
  if (report.status !== "GENERATED") {
    return "El PDF está disponible cuando el estado del reporte es «Generado».";
  }
  if (report.exports.length === 0) {
    return "Este reporte todavía no tiene archivos generados.";
  }
  return null;
}

export function ReportDetailPage() {
  const { reportId } = useParams();
  const navigate = useNavigate();

  const parsedId = Number(reportId);
  const hasValidId = Number.isInteger(parsedId) && parsedId > 0;
  const id = hasValidId ? parsedId : 0;

  const reportQuery = useReport(id, hasValidId);
  const userRoles = useSessionRoles();
  const canManage = hasAnyRole(userRoles, ["ADMIN", "COACH"]);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const deleteReport = useDeleteReport(id);

  const report = reportQuery.data;

  const handleDownload = async () => {
    if (!report) {
      return;
    }

    setDownloadError(null);
    setDownloadPending(true);

    try {
      const { blob, fileName } = await downloadReportExport(report.id);
      saveBlobAsFile(blob, reportDownloadFileName(fileName, report.id));
    } catch (error) {
      // C6: `apiFetchBlob` rechaza ante JSON de error; aquí nunca se abre un blob.
      setDownloadError(toDownloadErrorMessage(error));
    } finally {
      setDownloadPending(false);
    }
  };

  if (!hasValidId) {
    return <ReportNotFound />;
  }

  if (reportQuery.isPending) {
    return (
      <div className="grid gap-4" data-testid="report-detail-loading">
        <ReportsTabs />
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (reportQuery.isError) {
    if (isApiError(reportQuery.error) && reportQuery.error.status === 404) {
      return <ReportNotFound />;
    }

    return (
      <div className="grid gap-4" data-testid="report-detail-error">
        <ReportsTabs />
        <ErrorState
          title="No se pudo cargar el reporte"
          description="Inténtalo de nuevo en unos segundos."
        />
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => void reportQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  const unavailableReason = downloadUnavailableReason(report);
  const canDownload = unavailableReason === null;

  return (
    <div className="grid gap-4" data-testid="report-detail-page">
      <ReportsTabs />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="h-auto justify-start p-0 text-label">
            <Link to="/reports">← Volver a la biblioteca</Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-heading text-strong font-semibold">{report.title}</p>
            <ReportStatusBadge status={report.status} />
          </div>
          <p className="text-dim text-body">
            {reportTypeLabel(report.reportType)} · {reportTargetLabel(report)}
          </p>
        </div>

        <div className="grid gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!canDownload || downloadPending}
              aria-describedby="report-download-hint"
              onClick={() => void handleDownload()}
              data-testid="report-download-button"
            >
              {downloadPending ? "Descargando…" : "Descargar PDF"}
            </Button>
            {canManage ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  // Reabrir arranca limpio: un error de un intento anterior no sobrevive.
                  setDeleteError(null);
                  setDeleteOpen(true);
                }}
                data-testid="report-delete-button"
              >
                Borrar
              </Button>
            ) : null}
          </div>
          <p id="report-download-hint" className="text-dim text-caption" data-testid="report-download-hint">
            {unavailableReason ?? "Descarga el PDF del último archivo generado."}
          </p>
        </div>
      </header>

      {downloadError ? (
        <Alert variant="destructive" role="alert" data-testid="report-download-error">
          <AlertTitle>No se pudo descargar el PDF</AlertTitle>
          <AlertDescription>{downloadError}</AlertDescription>
        </Alert>
      ) : null}

      {report.status === "FAILED" && report.errorMessage ? (
        <Alert variant="destructive" role="alert" data-testid="report-detail-generation-error">
          <AlertTitle>La generación falló</AlertTitle>
          <AlertDescription>{report.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Datos del reporte</CardTitle>
          <CardDescription>Metadata registrada por el servidor.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
          <MetaItem label="Tipo" value={reportTypeLabel(report.reportType)} />
          <MetaItem label="Objetivo" value={reportTargetLabel(report)} />
          <MetaItem label="Categoría" value={report.category ?? "—"} />
          <MetaItem label="Período" value={reportPeriodLabel(report) ?? "—"} />
          <MetaItem label="Creado" value={formatInstantDateTime(report.createdAt)} />
          <MetaItem label="Actualizado" value={formatInstantDateTime(report.updatedAt)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle>Archivos generados</CardTitle>
          <CardDescription>
            Metadatos de los PDF persistidos (el binario se descarga bajo demanda).
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {report.exports.length === 0 ? (
            <p className="text-dim text-body" data-testid="report-exports-empty">
              Sin archivos generados: todavía no hay un PDF que descargar.
            </p>
          ) : (
            <div className="border-line overflow-hidden rounded-control border">
              <Table data-testid="report-exports-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Archivo</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead>Tamaño</TableHead>
                    <TableHead>Generado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.exports.map((reportExport) => (
                    <TableRow key={reportExport.id} data-testid={`report-export-${reportExport.id}`}>
                      <TableCell className="text-strong text-body">
                        {reportExport.fileName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{reportExport.format}</Badge>
                      </TableCell>
                      <TableCell className="text-body">
                        {humanFileSize(reportExport.fileSizeBytes)}
                      </TableCell>
                      <TableCell className="text-dim text-body">
                        {formatInstantDateTime(reportExport.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteReport.isPending) {
            setDeleteOpen(open);
            // Cancelar/cerrar descarta el error del intento (mismo patrón que los
            // demás forms del módulo).
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent data-testid="report-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar el reporte «{report.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán el reporte y sus archivos PDF (borrado lógico). Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive" role="alert" data-testid="report-delete-error">
              <AlertTitle>No se pudo borrar el reporte</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReport.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteReport.isPending}
              onClick={(event) => {
                // Sin cierre automático: la vista se cierra al confirmar el 204 (o al
                // volver a la biblioteca si el reporte ya no existe).
                event.preventDefault();
                setDeleteError(null);
                deleteReport.mutate(undefined, {
                  onSuccess: () => {
                    setDeleteOpen(false);
                    void navigate("/reports");
                  },
                  onError: (error) => {
                    // 404 = ya no existe (soft delete): la vista vuelve a la biblioteca.
                    if (isApiError(error) && error.status === 404) {
                      setDeleteOpen(false);
                      void navigate("/reports");
                      return;
                    }
                    // Cualquier otro fallo deja el diálogo abierto con el mensaje seguro
                    // (nunca texto crudo del back).
                    setDeleteError(
                      isApiError(error) ? toUserFacingMessage(error) : DELETE_FALLBACK_ERROR,
                    );
                  },
                });
              }}
            >
              {deleteReport.isPending ? "Borrando…" : "Borrar reporte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 404 e id inválido comparten estado (C11: `report-not-found`). */
function ReportNotFound() {
  return (
    <div className="grid gap-4">
      <ReportsTabs />
      <div
        className="border-line bg-panel rounded-card grid place-items-center border p-10 text-center"
        data-testid="report-not-found"
      >
        <div>
          <p className="text-strong text-title font-semibold">Reporte no encontrado</p>
          <p className="text-dim mt-1 text-body">
            Puede que haya sido eliminado o que el enlace sea incorrecto.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/reports">Volver a la biblioteca</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-dim text-caption">{label}</p>
      <p className="text-strong text-body">{value}</p>
    </div>
  );
}
