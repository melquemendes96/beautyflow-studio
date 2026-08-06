import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { masterService } from "@/services/masterService";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";

export type PlanFeatureRow = {
  feature_key: string;
  name: string;
  description?: string | null;
  category?: string | null;
  enabled: boolean;
  assigned: boolean;
};

type CatalogItem = {
  key: string;
  name: string;
  description?: string | null;
  category?: string | null;
};

type Props = {
  planId: string | null;
  planName?: string;
};

/** Ordem de exibição amigável no Master (o restante vai no fim). */
const FEATURE_ORDER = [
  "agenda",
  "clients",
  "services",
  "public_booking",
  "history",
  "branding",
  "anamnesis",
  "waitlist",
  "reports",
  "whatsapp",
  "automation",
  "finance",
  "team",
  "packages",
  "commissions",
  "inventory",
];

export function MasterPlanFeaturesEditor({ planId, planName }: Props) {
  const queryClient = useQueryClient();

  const featuresQuery = useQuery({
    queryKey: ["master", "plan-features", planId],
    enabled: Boolean(planId),
    queryFn: async () => {
      const res = await masterService.listPlanFeatures(planId!);
      if (res.error) throw res.error;
      return (res.data ?? []) as PlanFeatureRow[];
    },
  });

  const catalogQuery = useQuery({
    queryKey: ["master", "features-catalog"],
    queryFn: async () => {
      const res = await masterService.listFeaturesCatalog();
      if (res.error) throw res.error;
      return (res.data ?? []) as CatalogItem[];
    },
    staleTime: 10 * 60_000,
  });

  const rows = useMemo(() => {
    const assignedMap = new Map(
      (featuresQuery.data ?? []).map((r) => [r.feature_key, r] as const),
    );
    const catalog = catalogQuery.data ?? [];
    const merged = catalog.map((c) => {
      const a = assignedMap.get(c.key);
      return {
        feature_key: c.key,
        name: a?.name || c.name,
        description: a?.description ?? c.description ?? null,
        category: a?.category ?? c.category ?? null,
        enabled: Boolean(a?.assigned && a?.enabled),
        assigned: Boolean(a?.assigned),
      };
    });
    return merged.sort((a, b) => {
      const ia = FEATURE_ORDER.indexOf(a.feature_key);
      const ib = FEATURE_ORDER.indexOf(b.feature_key);
      const oa = ia === -1 ? 999 : ia;
      const ob = ib === -1 ? 999 : ib;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [catalogQuery.data, featuresQuery.data]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["master", "plan-features", planId] });
    await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "features-catalog"] });
  };

  const setMutation = useMutation({
    mutationFn: async (input: { feature_key: string; enabled: boolean }) => {
      if (input.enabled) {
        const res = await masterService.setPlanFeature(planId!, input.feature_key, true);
        if (res.error) throw res.error;
        return res.data;
      }
      // Desligar = remover do plano (empresa deixa de ter o recurso)
      const res = await masterService.removePlanFeature(planId!, input.feature_key);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async (_data, vars) => {
      await invalidate();
      toast.success(
        vars.enabled
          ? `${labelFor(vars.feature_key, rows)} ativado neste plano.`
          : `${labelFor(vars.feature_key, rows)} desativado neste plano.`,
      );
    },
    onError: (err: unknown) => toast.error(formatSupabaseApiError(err)),
  });

  if (!planId) {
    return (
      <p className="text-sm text-muted-foreground">
        Salve o plano primeiro para configurar recursos com ON/OFF (incluindo Anamnese).
      </p>
    );
  }

  if (featuresQuery.isLoading || catalogQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando recursos…</p>;
  }

  if (featuresQuery.isError || catalogQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar recursos.{" "}
        {formatSupabaseApiError(featuresQuery.error ?? catalogQuery.error)}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
        Catálogo de recursos vazio. Aplique as migrations (inclui{" "}
        <code className="text-xs">anamnesis</code>) no Supabase.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recursos do plano{planName ? ` · ${planName}` : ""}
        </span>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Ative o que a empresa desse plano pode usar. Ex.: Anamnese libera o checkbox em Serviços e a ficha da
          cliente.
        </p>
      </div>

      <ul className="grid gap-2">
        {rows.map((row) => (
          <li
            key={row.feature_key}
            className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${
              row.feature_key === "anamnesis"
                ? "border-amber-300/70 bg-amber-50/50 dark:bg-amber-950/20"
                : "border-border bg-background"
            }`}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {row.name}
                {row.feature_key === "anamnesis" ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-900">
                    Novo
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {row.feature_key}
                {row.description ? ` · ${row.description}` : ""}
              </div>
            </div>
            <Switch
              checked={row.enabled}
              disabled={setMutation.isPending}
              onCheckedChange={(on) =>
                setMutation.mutate({ feature_key: row.feature_key, enabled: on })
              }
              aria-label={`${row.enabled ? "Desativar" : "Ativar"} ${row.name}`}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelFor(key: string, rows: { feature_key: string; name: string }[]) {
  return rows.find((r) => r.feature_key === key)?.name ?? key;
}
