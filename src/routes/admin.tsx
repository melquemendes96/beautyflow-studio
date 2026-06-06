import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CompanyAdminRoute, guardCompanyPlanFeatureAccess, guardCompanyTenantBillingAccess, guardProviderPanelAccess } from "@/lib/route-guards";
import { Loader2 } from "lucide-react";

const AdminShell = lazy(() =>
  import("@/components/admin/AdminShell").then((m) => ({ default: m.AdminShell })),
);

function AdminRoutePending() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30">
      <Loader2 className="size-8 animate-spin text-gold" aria-hidden />
    </div>
  );
}

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    await CompanyAdminRoute();
    await guardCompanyTenantBillingAccess(location.pathname);
    await guardProviderPanelAccess(location.pathname);
    await guardCompanyPlanFeatureAccess(location.pathname);
  },
  component: AdminRoute,
});

function AdminRoute() {
  return (
    <Suspense fallback={<AdminRoutePending />}>
      <AdminShell />
    </Suspense>
  );
}
