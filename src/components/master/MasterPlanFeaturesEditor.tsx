import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { masterService } from "@/services/masterService";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type Props = {
  planId: string | null;
  planName?: string;
};

export function MasterPlanFeaturesEditor({ planId, planName }: Props) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

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
      return res.data ?? [];
    },
    staleTime: 10 * 60_000,
  });

  const assigned = useMemo(
    () => (featuresQuery.data ?? []).filter((r) => r.assigned),
    [featuresQuery.data],
  );

  const availableToAdd = useMemo(() => {
    const assignedKeys = new Set(assigned.map((r) => r.feature_key));
    return (catalogQuery.data ?? []).filter((c: { key: string }) => !assignedKeys.has(c.key));
  }, [catalogQuery.data, assigned]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["master", "plan-features", planId] });
    await queryClient.invalidateQueries({ queryKey: ["master", "plans"] });
  };

  const setMutation = useMutation({
    mutationFn: async (input: { feature_key: string; enabled: boolean }) => {
      const res = await masterService.setPlanFeature(planId!, input.feature_key, input.enabled);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: invalidate,
    onError: (err: unknown) => toast.error(formatSupabaseApiError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async (featureKey: string) => {
      const res = await masterService.removePlanFeature(planId!, featureKey);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Recurso removido do plano.");
    },
    onError: (err: unknown) => toast.error(formatSupabaseApiError(err)),
  });

  if (!planId) {
    return (
      <p className="text-sm text-muted-foreground">
        Salve o plano primeiro para configurar recursos com ON/OFF.
      </p>
    );
  }

  if (featuresQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando recursos…</p>;
  }

  if (featuresQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar recursos. {formatSupabaseApiError(featuresQuery.error)}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recursos do plano{planName ? ` · ${planName}` : ""}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-full text-xs"
          disabled={availableToAdd.length === 0}
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-3.5" /> Adicionar recurso
        </Button>
      </div>

      {assigned.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nenhum recurso neste plano. Use &quot;Adicionar recurso&quot; para incluir do catálogo.
        </p>
      ) : (
        <ul className="grid gap-2">
          {assigned.map((row) => (
            <li
              key={row.feature_key}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium">{row.name}</div>
                <div className="text-[11px] text-muted-foreground">{row.feature_key}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  checked={row.enabled}
                  disabled={setMutation.isPending}
                  onCheckedChange={(on) =>
                    setMutation.mutate({ feature_key: row.feature_key, enabled: on })
                  }
                  aria-label={`${row.enabled ? "Desativar" : "Ativar"} ${row.name}`}
                />
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remover ${row.name} do plano`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(row.feature_key)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>Adicionar recurso</DialogTitle>
            <DialogDescription>Escolha um recurso do catálogo global para este plano.</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            {availableToAdd.map((item: { key: string; name: string; category?: string }) => (
              <li key={item.key}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setMutation.mutate(
                      { feature_key: item.key, enabled: true },
                      {
                        onSuccess: async () => {
                          await invalidate();
                          setAddOpen(false);
                          toast.success(`${item.name} adicionado.`);
                        },
                      },
                    );
                  }}
                >
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground">{item.category}</span>
                </button>
              </li>
            ))}
          </ul>
          {availableToAdd.length === 0 && (
            <p className="text-sm text-muted-foreground">Todos os recursos do catálogo já estão neste plano.</p>
          )}
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setAddOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
