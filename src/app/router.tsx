import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/app/app-shell";
import { RequireAuth, RequireGuest, RequireRoles } from "@/app/guards";
import { AthleteCreatePage } from "@/modules/athletes/athlete-create-page";
import { AthleteDetailPage } from "@/modules/athletes/athlete-detail-page";
import { AthleteEditPage } from "@/modules/athletes/athlete-edit-page";
import { AthletesListPage } from "@/modules/athletes/athletes-list-page";
import { LoginPage } from "@/modules/auth/login-page";
import { RegisterPage } from "@/modules/auth/register-page";
import { CheckupsPage } from "@/modules/checkups/checkups-page";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { ReportsPage } from "@/modules/reports/reports-page";
import { TrainingPage } from "@/modules/training/training-page";
import { ErrorState } from "@/shared/components/states";

export const router = createBrowserRouter([
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
      {
        path: "training",
        element: (
          <RequireRoles roles={["ADMIN", "COACH"]}>
            <TrainingPage />
          </RequireRoles>
        ),
      },
      { path: "checkups", element: <CheckupsPage /> },
      { path: "reports", element: <ReportsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
