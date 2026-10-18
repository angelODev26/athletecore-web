import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";

import { AppShell } from "@/app/app-shell";
import { RequireAuth, RequireGuest, RequireRoles } from "@/app/guards";
import { AthleteCreatePage } from "@/modules/athletes/athlete-create-page";
import { AthleteDetailPage } from "@/modules/athletes/athlete-detail-page";
import { AthleteEditPage } from "@/modules/athletes/athlete-edit-page";
import { AthletesListPage } from "@/modules/athletes/athletes-list-page";
import { LoginPage } from "@/modules/auth/login-page";
import { RegisterPage } from "@/modules/auth/register-page";
import { AthleteCheckupsPage } from "@/modules/checkups/athlete-checkups-page";
import { CheckupDetailPage } from "@/modules/checkups/checkup-detail-page";
import { NationalReferencePage } from "@/modules/checkups/national-reference-page";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { AthleteReportPage } from "@/modules/reports/athlete-report-page";
import { ReportDetailPage } from "@/modules/reports/report-detail-page";
import { ReportSchedulesPage } from "@/modules/reports/report-schedules-page";
import { ReportsLibraryPage } from "@/modules/reports/reports-library-page";
import { TeamReportPage } from "@/modules/reports/team-report-page";
import { AlertsPage } from "@/modules/training/alerts-page";
import { PlanDetailPage } from "@/modules/training/plan-detail-page";
import { PlansListPage } from "@/modules/training/plans-list-page";
import { SessionDetailPage } from "@/modules/training/session-detail-page";
import { ErrorState } from "@/shared/components/states";

/*
 * Tabla de rutas de la app. Se exporta aparte del `router` de navegador para que los
 * tests puedan montarla con `createMemoryRouter` (mismo grafo, sin `window.history`).
 */
export const appRoutes: RouteObject[] = [
  {
    path: "/login",
    element: (
      <RequireGuest>
        <LoginPage />
      </RequireGuest>
    ),
  },
  {
    path: "/registro",
    element: (
      <RequireGuest>
        <RegisterPage />
      </RequireGuest>
    ),
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <ErrorState />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "athletes", element: <AthletesListPage /> },
      { path: "athletes/nuevo", element: <AthleteCreatePage /> },
      { path: "athletes/:id", element: <AthleteDetailPage /> },
      { path: "athletes/:id/editar", element: <AthleteEditPage /> },
      { path: "athletes/:id/chequeos", element: <AthleteCheckupsPage /> },
      { path: "athletes/:id/chequeos/:checkupId", element: <CheckupDetailPage /> },
      { path: "athletes/:id/report", element: <AthleteReportPage /> },
      {
        path: "training",
        element: (
          <RequireRoles roles={["ADMIN", "COACH"]}>
            <PlansListPage />
          </RequireRoles>
        ),
      },
      {
        path: "training/plans/:planId",
        element: (
          <RequireRoles roles={["ADMIN", "COACH"]}>
            <PlanDetailPage />
          </RequireRoles>
        ),
      },
      {
        path: "training/sessions/:sessionId",
        element: (
          <RequireRoles roles={["ADMIN", "COACH"]}>
            <SessionDetailPage />
          </RequireRoles>
        ),
      },
      {
        path: "training/alerts",
        element: (
          <RequireRoles roles={["ADMIN", "COACH"]}>
            <AlertsPage />
          </RequireRoles>
        ),
      },
      { path: "tabla-nacional", element: <RequireRoles roles={["ADMIN"]}><NationalReferencePage /></RequireRoles> },
      /*
       * Reportes (C1/C9): la sección vive bajo `/reports` con sub-navegación interna.
       * Las rutas ESTÁTICAS (`equipo`, `programaciones`) se declaran ANTES de la
       * dinámica `:reportId` para que se resuelvan de forma inequívoca en cualquier
       * versión del router (React Router v7 además puntúa por especificidad, no por
       * orden). `/reports/programaciones` es la única con guard de rol.
       */
      { path: "reports", element: <ReportsLibraryPage /> },
      { path: "reports/equipo", element: <TeamReportPage /> },
      {
        path: "reports/programaciones",
        element: (
          <RequireRoles roles={["ADMIN"]}>
            <ReportSchedulesPage />
          </RequireRoles>
        ),
      },
      { path: "reports/:reportId", element: <ReportDetailPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
];

export const router = createBrowserRouter(appRoutes);
