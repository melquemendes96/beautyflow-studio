import { createFileRoute } from "@tanstack/react-router";
import { ProviderCommissionDashboard } from "@/components/admin/ProviderCommissionDashboard";
import { AdminOwnerDashboard } from "@/components/admin/AdminOwnerDashboard";
import { useCurrentCompany } from "@/lib/current-company";

export const Route = createFileRoute("/admin/")({
  component: Dashboard,
});

function Dashboard() {
  const { isProvider } = useCurrentCompany();
  if (isProvider) return <ProviderCommissionDashboard />;
  return <AdminOwnerDashboard />;
}
