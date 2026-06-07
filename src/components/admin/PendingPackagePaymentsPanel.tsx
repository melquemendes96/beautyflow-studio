import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { packageService, type PendingClientPackage } from "@/services/packageService";
import { formatAppointmentDateYmd, formatAppointmentTimeHm } from "@/lib/appointment-time";
import { toast } from "sonner";

function formatMoney(value: number) {
  return `R$ ${Number(value ?? 0).toFixed(2).replace(".", ",")}`;
}

function formatApptDate(pkg: PendingClientPackage) {
  const ymd = formatAppointmentDateYmd(pkg.appointment_date);
  if (!ymd) return "—";
  const dt = new Date(`${ymd}T12:00:00`);
  const label = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const time = formatAppointmentTimeHm(pkg.appointment_time);
  return time ? `${label} · ${time}` : label;
}

export function PendingPackagePaymentsPanel({
  companyId,
  packagesEnabled,
}: {
  companyId: string | null;
  packagesEnabled: boolean;
}) {
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ["admin", "packages", "pending", companyId],
    enabled: Boolean(companyId) && packagesEnabled,
    queryFn: async () => {
      const res = await packageService.listPending(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    staleTime: 15_000,
  });

  const confirmMutation = useMutation({
    mutationFn: async (clientPackageId: string) => {
      const res = await packageService.confirmPayment(companyId!, clientPackageId);
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean; error?: string };
      if (!payload?.ok) {
        if (payload?.error === "forbidden") throw new Error("Sem permissão para confirmar este pacote.");
        throw new Error(payload?.error ?? "Não foi possível confirmar o pagamento.");
      }
    },
    onSuccess: async () => {
      toast.success("Pagamento do pacote confirmado.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages", "pending", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const convertMutation = useMutation({
    mutationFn: async (clientPackageId: string) => {
      const res = await packageService.convertToSingle(companyId!, clientPackageId);
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean; error?: string };
      if (!payload?.ok) {
        if (payload?.error === "forbidden") throw new Error("Sem permissão para alterar este pacote.");
        throw new Error(payload?.error ?? "Não foi possível converter em avulso.");
      }
    },
    onSuccess: async () => {
      toast.success("Pacote cancelado — atendimento permanece como avulso.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages", "pending", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = pendingQuery.data ?? [];
  if (!packagesEnabled || pendingQuery.isLoading || list.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-gold/40 bg-gold-soft/20 p-5">
      <div className="flex items-start gap-3">
        <Calendar className="mt-0.5 size-5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Pacotes aguardando pagamento no salão</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirme o pagamento do pacote ou transforme em atendimento avulso se a cliente pagou só uma sessão.
          </p>
          <ul className="mt-4 space-y-3">
            {list.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <div className="font-medium">{pkg.client_name}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    {pkg.service_name} · {pkg.total_sessions} sessões · {formatMoney(pkg.service_price)}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {pkg.provider_name ? `Profissional: ${pkg.provider_name} · ` : ""}
                    Agendamento: {formatApptDate(pkg)}
                    {pkg.client_whatsapp ? ` · ${pkg.client_whatsapp}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={confirmMutation.isPending || convertMutation.isPending}
                    onClick={() => confirmMutation.mutate(pkg.id)}
                  >
                    <Check className="size-3.5" />
                    Confirmar pacote
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={confirmMutation.isPending || convertMutation.isPending}
                    onClick={() => convertMutation.mutate(pkg.id)}
                  >
                    <Scissors className="size-3.5" />
                    Só avulso
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
