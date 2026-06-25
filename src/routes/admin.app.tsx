import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { PwaInstallTrigger } from "@/components/pwa/PwaInstallTrigger";
import { PushNotificationSetup } from "@/components/admin/PushNotificationSetup";
import { displayStudioName } from "@/lib/branding-utils";
import { normalizePublicBookingSlug } from "@/lib/public-booking-slug";
import { useCurrentCompany } from "@/lib/current-company";
import { useQuery } from "@tanstack/react-query";
import { brandingService } from "@/services/brandingService";
import { companyService } from "@/services/companyService";
import { useMemo } from "react";

export const Route = createFileRoute("/admin/app")({
  component: AdminAppInstall,
});

function AdminAppInstall() {
  const { companyId, hasCompany, isProvider } = useCurrentCompany();

  const companyQuery = useQuery({
    queryKey: ["admin", "company", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyService.getByIdForAdmin(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const brandingQuery = useQuery({
    queryKey: ["admin", "branding", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await brandingService.getByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const studioName = displayStudioName(companyQuery.data, brandingQuery.data);

  const manifest = useMemo(
    () => ({
      profile: "staff" as const,
      slug: companyQuery.data?.slug
        ? normalizePublicBookingSlug(String(companyQuery.data.slug))
        : undefined,
      appName: `${studioName} — Equipe`,
      shortName: "Equipe",
      iconUrl: (brandingQuery.data as { logo_url?: string } | null)?.logo_url,
      themeColor: (brandingQuery.data as { primary_color?: string } | null)?.primary_color ?? "#1a1a1a",
    }),
    [companyQuery.data?.slug, studioName, brandingQuery.data],
  );

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageTitle
        title="Aplicativo"
        subtitle={
          isProvider
            ? "Instale o app da equipe para agenda e repasses na tela inicial."
            : "Instale o app da equipe no celular dos colaboradores."
        }
      />
      <PwaInstallTrigger manifest={manifest} label="Instalar app da equipe" variant="card" />
      <PushNotificationSetup
        companyId={companyId}
        hasCompany={hasCompany}
        profile="staff"
      />
      <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-4 text-xs leading-relaxed text-muted-foreground">
        Após instalar, abra pelo ícone na home e entre com seu e-mail de colaborador. O app abre direto na agenda e
        repasses.
      </div>
    </div>
  );
}
