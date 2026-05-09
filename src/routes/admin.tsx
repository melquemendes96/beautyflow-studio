import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { CompanyAdminRoute, guardCompanyPlanFeatureAccess, guardCompanyTenantBillingAccess } from "@/lib/route-guards";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ location }) => {
    await CompanyAdminRoute();
    await guardCompanyTenantBillingAccess(location.pathname);
    await guardCompanyPlanFeatureAccess(location.pathname);
  },
  component: AdminShell,
});
