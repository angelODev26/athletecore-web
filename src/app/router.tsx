import { createBrowserRouter, Navigate } from "react-router-dom";

import { AppShell } from "@/app/app-shell";
import { RequireAuth, RequireRoles } from "@/app/guards";
import { AthletesPage } from "@/modules/athletes/athletes-page";
import { LoginPage } from "@/modules/auth/login-page";
import { CheckupsPage } from "@/modules/checkups/checkups-page";
import { DashboardPage } from "@/modules/dashboard/dashboard-page";
import { ReportsPage } from "@/modules/reports/reports-page";
import { TrainingPage } from "@/modules/training/training-page";
import { ErrorState } from "@/shared/components/states";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
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
      { path: "athletes", element: <AthletesPage /> },
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
